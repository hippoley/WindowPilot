"""
WindowPilot 服务层 — FastAPI + WebSocket + Tick Loop

架构（借鉴 Marvis 多 Agent 分层思路）：
┌─────────────────────────────────────────────────────┐
│  Safety Loop (500ms, 本地, 零网络依赖)              │
│  simulate → snapshot → BT.tick_once → broadcast     │
└──────────────────────────┬──────────────────────────┘
                           │ 触发信号: P5.NeedGenerate
┌──────────────────────────▼──────────────────────────┐
│  AI Pipeline (异步, 可降级, 不阻塞安全循环)         │
│  goal_inference → retrieve → rank → explain         │
│  完成后写回 tm.ai_recommendation                    │
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
from engine.tree_builder import build_tree
from execution.simulator import simulate_actuator, simulate_screen, WindowScreenCoordinator
from ai.client import MiniMaxClient
from ai.intent import IntentParser
from ai.goal_inference import GoalInference
from ai.retriever import SceneRetriever
from ai.ranker import CandidateRanker
from ai.explainer import Explainer
from ai.learner import HabitLearner
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
coordinator = WindowScreenCoordinator(cap)

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
ai_learner   = HabitLearner()
rule_fallback = RuleFallback()

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

# 行为树单例
_bt_tree = None

# AI 异步任务状态
_ai_task: asyncio.Task = None
_ai_running = False


def _get_tree():
    global _bt_tree
    if _bt_tree is None:
        _bt_tree = build_tree(tm, cap, trace)
    return _bt_tree


def _reset_tree():
    global _bt_tree
    _bt_tree = None


# ═══ AI Pipeline（异步，不阻塞安全循环）═══

async def _run_ai_pipeline(snapshot: ContextSnapshot):
    """
    异步 AI 推荐链路。
    在独立 task 中运行，完成后写回 tm.ai_recommendation。
    即使耗时 5 秒也不影响 500ms 安全 tick。
    """
    global _ai_running
    _ai_running = True
    t0 = time.time()

    try:
        # AI-2: 目标推理
        goal = ai_goal.infer(tm, snapshot)
        trace.record(tm, "AI-2.Goal",
                     f"{goal.get('primary_goal', '?')} conflict={goal.get('conflict', 'none')}",
                     "success")

        # AI-3: 场景检索（可并行化，当前串行足够）
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

        # AI-3: 排序
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
        preferred = ai_learner.get_preferred_pct(tm.room_type, tm.time_hour)
        if ai_learner.get_confidence() > 0.3:
            best["window_pct"] = int((best.get("window_pct", 30) + preferred) / 2)

        # 写回结果
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


# ═══ Safety Tick Loop（500ms 严格节拍，纯本地）═══

async def tick_loop():
    """
    主安全循环：每 500ms 执行一次。
    只做本地计算（仿真 + 行为树），绝不等待网络。
    AI 链路通过 asyncio.create_task 异步触发。
    """
    global tick_count, _ai_task
    while True:
        await asyncio.sleep(0.5)
        try:
            tick_count += 1
            tm.bt_tick = tick_count

            # ── 本地安全层（零延迟）──
            # 1. 仿真执行器
            simulate_actuator(tm, cap)
            simulate_screen(tm)
            coordinator.tick(tm)

            # 2. 语义快照
            snapshot = ContextSnapshot.from_thing_model(tm, cap)

            # 3. 行为树 tick（纯本地规则判断）
            tree = _get_tree()
            tree.tick_once()

            # ── 异步 AI 层（不阻塞）──
            # 4. 如果行为树标记需要 AI 推荐，且当前没有 AI 任务在跑
            if (tm.bt_active_branch == "P5.NeedGenerate"
                    and tm.ai_recommendation is None
                    and not _ai_running):
                _ai_task = asyncio.create_task(_run_ai_pipeline(snapshot))

            # 5. 到位后清除用户指令
            if tm.user_command and tm.user_command.get("action") == "open_to":
                target = tm.user_command.get("target_pct", 0)
                if tm.actuator_state in ("idle", "holding") and abs(tm.window_open_pct - target) < 3:
                    tm.user_command = None

            # 6. 广播
            tree_snapshot = _build_tree_snapshot(tree)
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
            ai_learner.on_accept(tm.recommendation_card, tm.room_type, tm.time_hour)
            coordinator.request_screen(tm, screen)
            coordinator.request_open_window(tm, target)
            tm.user_command = {"source": "ai_confirmed", "action": "open_to", "target_pct": target}
            trace.record(tm, "User.Accept", f"confirmed_{target}%", "success")
            tm.ai_recommendation = None
            tm.recommendation_card = None

    elif cmd == "reject_recommendation":
        if tm.recommendation_card:
            ai_learner.on_reject(tm.recommendation_card, tm.room_type, tm.time_hour)
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

    elif cmd == "set_mode":
        tm.mode = str(value)

    elif cmd == "load_scenario":
        await _load_scenario(str(value))

    elif cmd == "reset":
        _reset()


def _reset():
    global _ai_running
    tm.__init__()
    _reset_tree()
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


@app.get("/", response_class=HTMLResponse)
def index():
    html_path = Path(__file__).parent / "index.html"
    return html_path.read_text(encoding="utf-8")
