"""
WindowPilot 服务层 — FastAPI + WebSocket + Agent Orchestrator

架构：5 Agent 协作
┌─────────────────────────────────────────────────────┐
│  ExecutionAgent  → 物理仿真 (推窗器/纱窗)          │
│  EnvironmentAgent → 语义快照生成                    │
│  SafetyAgent     → 行为树 tick (P0-P7)             │
│  RecommendAgent  → 异步 AI 推荐管线                │
│  LearnerAgent    → 习惯学习 & 记忆衰减             │
└─────────────────────────────────────────────────────┘
"""
import asyncio
import json
import logging
import time
import traceback
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

# Ensure parent dir is on sys.path for flat package imports
_backend_dir = str(Path(__file__).parent.parent)
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.context_snapshot import ContextSnapshot
from domain.decision_trace import DecisionTraceLog
from agents import SafetyAgent, EnvironmentAgent, RecommendAgent, ExecutionAgent, LearnerAgent, SecurityAgent, SchedulerAgent
from agents.scheduler_agent import ScheduleEntry
from ai.client import MiniMaxClient
from ai.intent import IntentParser
from ai.goal_inference import GoalInference
from ai.retriever import SceneRetriever
from ai.ranker import CandidateRanker
from ai.explainer import Explainer
from ai.recommender import RuleFallback

logger = logging.getLogger("windowpilot")


# ═══ Lifespan ═══

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(tick_loop())
    yield
    task.cancel()


# ═══ 初始化 ═══

app = FastAPI(title="WindowPilot API v3", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 领域对象
tm = ThingModel()
cap = DeviceCapability.from_yaml()
trace = DecisionTraceLog()

# AI 模块（各自可降级）
try:
    ai_client = MiniMaxClient()
except Exception:
    ai_client = None

ai_intent    = IntentParser(ai_client) if ai_client else None
ai_goal      = GoalInference(ai_client)
ai_retriever = SceneRetriever(ai_client) if ai_client else None
ai_ranker    = CandidateRanker()
ai_explainer = Explainer(ai_client) if ai_client else None
rule_fallback = RuleFallback()

# ═══ 7 Agents ═══
execution_agent = ExecutionAgent(cap)
env_agent = EnvironmentAgent(cap)
safety_agent = SafetyAgent(cap, trace)
security_agent = SecurityAgent(trace)
recommend_agent = RecommendAgent()
learner_agent = LearnerAgent()
scheduler_agent = SchedulerAgent(trace)

ALL_AGENTS = [execution_agent, env_agent, safety_agent, security_agent, recommend_agent, learner_agent, scheduler_agent]

# 传感器白名单
ALLOWED_SENSOR_KEYS = {
    "rain_detected", "rain_level", "voc_mg", "co2_ppm",
    "temp_indoor_c", "temp_outdoor_c", "humidity_pct",
    "wind_speed_ms", "wind_level", "lux", "human_detected",
    "noise_db", "aqi", "room_type", "time_hour", "orientation",
}

# WebSocket 连接池
connected: Set[WebSocket] = set()
tick_count = 0

# AI 异步任务状态
_ai_task: asyncio.Task = None
_ai_running = False


# ═══ AI Pipeline（异步，不阻塞安全循环）═══

async def _run_ai_pipeline(snapshot: ContextSnapshot):
    """
    异步 AI 推荐链路。
    在独立 task 中运行，完成后写回 tm.ai_recommendation。
    """
    global _ai_running
    _ai_running = True
    t0 = time.time()

    try:
        goal = ai_goal.infer(tm, snapshot)
        trace.record(tm, "AI-2.Goal",
                     f"{goal.get('primary_goal', '?')} conflict={goal.get('conflict', 'none')}",
                     "success")

        candidates = []
        if ai_retriever:
            candidates = await asyncio.to_thread(ai_retriever.retrieve, snapshot, cap)
        if not candidates:
            fb = rule_fallback.generate(tm, snapshot, cap)
            if fb:
                candidates = [{"candidate": fb, "similarity": 0.5, "story_id": "fallback"}]

        if not candidates:
            trace.record(tm, "AI.Pipeline", "no_candidates", "failure")
            return

        ranked = ai_ranker.rank(candidates, tm, snapshot, cap)
        if not ranked:
            return

        best = ranked[0].get("candidate", ranked[0])

        # Policy Gate: 安全裁剪
        if "CHILD_ROOM_HIGH_SAFETY" in snapshot.tags:
            best["window_pct"] = min(best.get("window_pct", 10), 10)
            best["needs_confirm"] = True
        if any(t.startswith("RAIN") for t in snapshot.tags):
            best["window_pct"] = 0

        # AI-4: 解释生成
        reason = ""
        if ai_explainer:
            reason = await asyncio.to_thread(ai_explainer.explain, tm, snapshot, best)
        if not reason:
            reason = (ai_explainer._rule_explain(tm, snapshot, best)
                      if ai_explainer
                      else f"建议开窗{best.get('window_pct', 0)}%")

        best["title"] = best.get("title", "建议调整窗户")
        best["reason"] = reason
        best["needs_confirm"] = best.get("needs_confirm", True)

        # AI-5: 偏好微调
        preferred = learner_agent.get_preferred_pct(tm.room_type, tm.time_hour)
        if learner_agent.learner.get_confidence() > 0.3:
            best["window_pct"] = int((best.get("window_pct", 30) + preferred) / 2)

        tm.ai_recommendation = best
        elapsed = (time.time() - t0) * 1000
        trace.record(tm, "AI.Pipeline",
                     f"retrieve→rank→explain: {best.get('window_pct')}% ({elapsed:.0f}ms)",
                     "success")
        logger.info(f"AI pipeline completed in {elapsed:.0f}ms → {best.get('window_pct')}%")

    except Exception as e:
        logger.warning(f"AI pipeline failed: {e}")
        trace.record(tm, "AI.Pipeline", f"error: {e}", "failure")
    finally:
        _ai_running = False


# ═══ Safety Tick Loop（500ms 严格节拍）═══

async def tick_loop():
    """
    主循环：每 500ms 执行一次。
    编排 5 个 Agent，只做本地计算，绝不等待网络。
    AI 链路通过 asyncio.create_task 异步触发。
    """
    global tick_count, _ai_task
    while True:
        await asyncio.sleep(0.5)
        try:
            tick_count += 1
            tm.bt_tick = tick_count

            # 1. 物理执行仿真
            execution_agent.safe_tick(tm, None)

            # 2. 环境感知 → 语义快照
            env_agent.safe_tick(tm, None)
            snapshot = env_agent.snapshot

            # 3. 行为树安全决策
            safety_agent.safe_tick(tm, snapshot)

            # 3.5 安防检测
            security_agent.safe_tick(tm, snapshot)

            # 4. 异步 AI 推荐（不阻塞）
            if (tm.bt_active_branch == "P5.NeedGenerate"
                    and tm.ai_recommendation is None
                    and not _ai_running):
                _ai_task = asyncio.create_task(_run_ai_pipeline(snapshot))

            # 5. 习惯学习（定期衰减）
            learner_agent.safe_tick(tm, snapshot)

            # 5.5 定时场景
            scheduler_agent.safe_tick(tm, snapshot)

            # 6. 广播
            tree_snapshot = _build_tree_snapshot(safety_agent._get_tree(tm))
            agents_status = {a.name: a.to_dict() for a in ALL_AGENTS}
            payload = {
                "type": "tick",
                "tick": tick_count,
                "ts": time.time(),
                "thing_model": tm.to_dict(),
                "semantic": {
                    "tags": snapshot.tags,
                    "summary": snapshot.summary,
                    "risk": snapshot.risk_level,
                },
                "tree": tree_snapshot,
                "decision_log": trace.recent(10),
                "bt_branch": tm.bt_active_branch,
                "ai_status": "running" if _ai_running else "idle",
                "agents_status": agents_status,
            }
            await _broadcast(payload)

        except Exception as e:
            logger.error(f"[tick_loop] tick={tick_count}: {e}")
            traceback.print_exc()


def _build_tree_snapshot(node, path="") -> dict:
    name = node.name
    full_path = f"{path}/{name}" if path else name
    status = node.status.value if hasattr(node, "status") and node.status else "invalid"
    children = []
    if hasattr(node, "children"):
        for child in node.children:
            children.append(_build_tree_snapshot(child, full_path))
    return {
        "id": full_path,
        "name": name,
        "status": status,
        "type": type(node).__name__,
        "children": children,
    }


async def _broadcast(data: dict):
    if not connected:
        return
    msg = json.dumps(data, ensure_ascii=False)
    dead = set()
    for ws in list(connected):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    connected.difference_update(dead)


# ═══ WebSocket ═══

@app.websocket("/ws")
async def ws_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected.add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except (json.JSONDecodeError, ValueError) as e:
                logger.warning(f"Invalid JSON from client: {e}")
                continue
            await handle_command(msg)
    except WebSocketDisconnect:
        connected.discard(websocket)


async def handle_command(msg: dict):
    cmd   = msg.get("cmd")
    value = msg.get("value")
    key   = msg.get("key")

    if cmd == "set_sensor":
        if key in ALLOWED_SENSOR_KEYS and hasattr(tm, key):
            field_type = type(getattr(tm, key))
            if field_type == bool:
                setattr(tm, key, bool(value))
            elif field_type == float:
                setattr(tm, key, float(value))
            elif field_type == int:
                setattr(tm, key, int(value))
            elif field_type == str:
                setattr(tm, key, str(value))
            tm.ai_recommendation = None
            tm.recommendation_card = None

    elif cmd == "user_open_to":
        tm.user_command = {"source": "app", "action": "open_to", "target_pct": float(value)}

    elif cmd == "user_screen_to":
        tm.user_command = {"source": "app", "action": "screen_to", "target_pct": float(value)}

    elif cmd == "user_stop":
        tm.user_command = {"source": "app", "action": "stop"}

    elif cmd == "accept_recommendation":
        if tm.recommendation_card:
            target = tm.recommendation_card.get("window_pct", 0)
            screen = tm.recommendation_card.get("screen_pct", 100)
            learner_agent.on_accept(tm.recommendation_card, tm.room_type, tm.time_hour)
            execution_agent.coordinator.request_screen(tm, screen)
            execution_agent.coordinator.request_open_window(tm, target)
            tm.user_command = {"source": "ai_confirmed", "action": "open_to", "target_pct": target}
            trace.record(tm, "User.Accept", f"confirmed_{target}%", "success")
            tm.ai_recommendation = None
            tm.recommendation_card = None

    elif cmd == "reject_recommendation":
        if tm.recommendation_card:
            learner_agent.on_reject(tm.recommendation_card, tm.room_type, tm.time_hour)
        tm.ai_recommendation = None
        tm.recommendation_card = None
        trace.record(tm, "User.Reject", "rejected", "success")

    elif cmd == "user_intent":
        text = str(value)
        intent = ai_intent.parse_fallback(text) if ai_intent else {"intent": "unknown"}
        if intent.get("room") and intent["room"] != tm.room_type:
            tm.room_type = intent["room"]
        parsed_intent = intent.get("intent", "unknown")
        target = intent.get("target_percent")
        if parsed_intent in ("open", "ventilate", "ventilation"):
            target = target if target is not None else 30
            tm.user_command = {"source": "voice", "action": "open_to", "target_pct": target}
            trace.record(tm, "AI-1.Intent", f"'{text}' → open {target}%", "success")
        elif parsed_intent == "close":
            tm.user_command = {"source": "voice", "action": "open_to", "target_pct": 0}
            trace.record(tm, "AI-1.Intent", f"'{text}' → close", "success")
        elif parsed_intent == "stop":
            tm.user_command = {"source": "voice", "action": "stop"}
            trace.record(tm, "AI-1.Intent", f"'{text}' → stop", "success")
        else:
            if any(kw in text for kw in ("开", "通风", "闷", "热")):
                tm.user_command = {"source": "voice", "action": "open_to", "target_pct": 30}
                trace.record(tm, "AI-1.Intent", f"'{text}' → keyword open 30%", "success")
            elif any(kw in text for kw in ("关", "停")):
                tm.user_command = {"source": "voice", "action": "open_to", "target_pct": 0}
                trace.record(tm, "AI-1.Intent", f"'{text}' → keyword close", "success")
            else:
                trace.record(tm, "AI-1.Intent", f"'{text}' → unknown", "failure")

    elif cmd == "add_schedule":
        if isinstance(value, dict):
            entry = ScheduleEntry(
                id=value.get("id", f"custom_{int(time.time())}"),
                name=value.get("name", "自定义定时"),
                hour=int(value.get("hour", 0)),
                minute=int(value.get("minute", 0)),
                weekdays=value.get("weekdays", [0,1,2,3,4,5,6]),
                action=value.get("action", "open_to"),
                target_pct=float(value.get("target_pct", 30)),
                screen_pct=value.get("screen_pct"),
                enabled=value.get("enabled", True),
                room_type=value.get("room_type"),
            )
            scheduler_agent.add_schedule(entry)
            trace.record(tm, "Scheduler.Add", f"{entry.name} @{entry.hour}:{entry.minute:02d}", "success")

    elif cmd == "remove_schedule":
        scheduler_agent.remove_schedule(str(value))
        trace.record(tm, "Scheduler.Remove", f"id={value}", "success")

    elif cmd == "arm_security":
        security_agent.arm(tm)

    elif cmd == "disarm_security":
        security_agent.disarm(tm)

    elif cmd == "set_mode":
        tm.mode = str(value)

    elif cmd == "load_scenario":
        await _load_scenario(str(value))

    elif cmd == "reset":
        _reset()


def _reset():
    global _ai_running
    tm.__init__()
    safety_agent.reset_tree()
    _ai_running = False


async def _load_scenario(name: str):
    _reset()
    if name == "bedroom_ventilation":
        tm.room_type = "bedroom"; tm.time_hour = 22
        tm.co2_ppm = 1350.0; tm.humidity_pct = 62.0
        tm.temp_indoor_c = 26.2; tm.temp_outdoor_c = 23.0
        tm.human_detected = True
    elif name == "child_room":
        tm.room_type = "child_room"; tm.time_hour = 13
        tm.co2_ppm = 1280.0; tm.humidity_pct = 68.0
        tm.temp_indoor_c = 27.0; tm.human_detected = True
    elif name == "study_meeting":
        tm.room_type = "study"; tm.time_hour = 10
        tm.noise_db = 68.0; tm.co2_ppm = 780.0
        tm.window_open_pct = 30.0; tm.window_state = "open_partial"
        tm.actuator_stroke_mm = 0.3 * cap.max_stroke_mm
        tm.actuator_state = "holding"; tm.screen_position_pct = 100.0
        tm.user_command = {"source": "app", "action": "open_to", "target_pct": 0}
        tm.human_detected = True
    elif name == "elderly_cold":
        tm.room_type = "elderly_room"; tm.time_hour = 2
        tm.temp_indoor_c = 16.8; tm.temp_outdoor_c = 3.0
        tm.window_open_pct = 15.0; tm.window_state = "open_partial"
        tm.actuator_stroke_mm = 0.15 * cap.max_stroke_mm
        tm.actuator_state = "holding"; tm.screen_position_pct = 100.0
        tm.human_detected = True
    elif name == "storm_emergency":
        tm.rain_detected = True; tm.rain_level = "storm"
        tm.wind_speed_ms = 12.0; tm.wind_level = 6
        tm.window_open_pct = 40.0; tm.window_state = "open_partial"
        tm.actuator_stroke_mm = 0.4 * cap.max_stroke_mm
        tm.actuator_state = "holding"; tm.screen_position_pct = 100.0
        tm.human_detected = True


# ═══ HTTP Routes ═══

@app.get("/health")
def health():
    return {
        "status": "ok",
        "tick": tick_count,
        "branch": tm.bt_active_branch,
        "ai_status": "running" if _ai_running else "idle",
    }


@app.get("/agents")
def agents_endpoint():
    """返回所有 Agent 状态"""
    return {a.name: a.to_dict() for a in ALL_AGENTS}


@app.get("/schedules")
def get_schedules():
    """返回所有定时任务"""
    return scheduler_agent.list_schedules()


@app.get("/", response_class=HTMLResponse)
def index():
    html_path = Path(__file__).parent / "index.html"
    return html_path.read_text(encoding="utf-8")
