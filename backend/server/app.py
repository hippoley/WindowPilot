"""
WindowPilot 服务层 — FastAPI + WebSocket + Tick Loop + 静态文件
"""
import asyncio
import json
import time
import sys
from pathlib import Path
from typing import Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

sys.path.insert(0, str(Path(__file__).parent.parent))

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


# ═══ 初始化 ═══

app = FastAPI(title="WindowPilot API v3")
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

# WebSocket 连接池
connected: Set[WebSocket] = set()
tick_count = 0

# ── 行为树单例：只建一次，每 tick 只调 tick_once() ──
_bt_tree = None


def _get_tree():
    global _bt_tree
    if _bt_tree is None:
        _bt_tree = build_tree(tm, cap, trace)
    return _bt_tree


def _reset_tree():
    """重置时同步销毁树单例，下次 tick 重建"""
    global _bt_tree
    _bt_tree = None


# ═══ Tick Loop ═══

async def tick_loop():
    """主循环：每 500ms 执行一次完整决策周期"""
    global tick_count
    while True:
        await asyncio.sleep(0.5)
        tick_count += 1
        tm.bt_tick = tick_count

        # 1. 仿真执行器
        simulate_actuator(tm, cap)
        simulate_screen(tm)
        coordinator.tick(tm)

        # 2. 语义快照
        snapshot = ContextSnapshot.from_thing_model(tm, cap)

        # 3. P5 标记需要生成推荐时，调用 AI 链路
        if tm.bt_active_branch == "P5.NeedGenerate" and tm.ai_recommendation is None:
            goal = ai_goal.infer(tm, snapshot)
            trace.record(tm, "AI-2.Goal",
                         f"{goal.get('primary_goal','?')} conflict={goal.get('conflict','none')}",
                         "success")

            candidates = []
            if ai_retriever:
                candidates = ai_retriever.retrieve(snapshot, cap)
            if not candidates:
                fb = rule_fallback.generate(tm, snapshot, cap)
                if fb:
                    candidates = [{"candidate": fb, "similarity": 0.5, "story_id": "fallback"}]

            if candidates:
                ranked = ai_ranker.rank(candidates, tm, snapshot, cap)
                if ranked:
                    best = ranked[0].get("candidate", ranked[0])
                    # 安全裁剪
                    if "CHILD_ROOM_HIGH_SAFETY" in snapshot.tags:
                        best["window_pct"] = min(best.get("window_pct", 10), 10)
                        best["needs_confirm"] = True
                    if any(t in snapshot.tags for t in ("RAIN_LIGHT", "RAIN_MODERATE",
                                                         "RAIN_HEAVY", "RAIN_STORM", "RAIN_NOW")):
                        best["window_pct"] = min(best.get("window_pct", 0), 0)
                    # 解释
                    reason = ""
                    if ai_explainer:
                        reason = ai_explainer.explain(tm, snapshot, best)
                    if not reason:
                        reason = (ai_explainer._rule_explain(tm, snapshot, best)
                                  if ai_explainer
                                  else f"建议开窗{best.get('window_pct', 0)}%")
                    best["title"] = best.get("title", "建议调整窗户")
                    best["reason"] = reason
                    best["needs_confirm"] = best.get("needs_confirm", True)
                    # 偏好微调
                    preferred = ai_learner.get_preferred_pct(tm.room_type, tm.time_hour)
                    if ai_learner.get_confidence() > 0.3:
                        best["window_pct"] = int((best.get("window_pct", 30) + preferred) / 2)
                    tm.ai_recommendation = best
                    trace.record(tm, "AI.Pipeline",
                                 f"retrieve→rank→explain: {best.get('window_pct')}%", "success")

        # 4. 执行行为树（单例，不重建）
        tree = _get_tree()
        tree.tick_once()

        # 5. 到位后清除用户指令
        if tm.user_command and tm.user_command.get("action") == "open_to":
            target = tm.user_command.get("target_pct", 0)
            if tm.actuator_state in ("idle", "holding") and abs(tm.window_open_pct - target) < 3:
                tm.user_command = None

        # 6. 构建树快照并广播
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
        }
        await _broadcast(payload)


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
    for ws in connected:
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
            msg = json.loads(data)
            await handle_command(msg)
    except WebSocketDisconnect:
        connected.discard(websocket)


async def handle_command(msg: dict):
    cmd   = msg.get("cmd")
    value = msg.get("value")
    key   = msg.get("key")

    if cmd == "set_sensor":
        if key and hasattr(tm, key):
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
    tm.__init__()
    _reset_tree()


async def _load_scenario(name: str):
    _reset()
    if name == "bedroom_ventilation":
        tm.room_type = "bedroom"; tm.time_hour = 22
        tm.co2_ppm = 1350.0; tm.humidity_pct = 62.0
        tm.temp_indoor_c = 26.2; tm.temp_outdoor_c = 23.0
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
    elif name == "elderly_cold":
        tm.room_type = "elderly_room"; tm.time_hour = 2
        tm.temp_indoor_c = 16.8; tm.temp_outdoor_c = 3.0
        tm.window_open_pct = 15.0; tm.window_state = "open_partial"
        tm.actuator_stroke_mm = 0.15 * cap.max_stroke_mm
        tm.actuator_state = "holding"; tm.screen_position_pct = 100.0
    elif name == "storm_emergency":
        tm.rain_detected = True; tm.rain_level = "storm"
        tm.wind_speed_ms = 12.0; tm.wind_level = 6
        tm.window_open_pct = 40.0; tm.window_state = "open_partial"
        tm.actuator_stroke_mm = 0.4 * cap.max_stroke_mm
        tm.actuator_state = "holding"; tm.screen_position_pct = 100.0


# ═══ Startup ═══

@app.on_event("startup")
async def startup():
    asyncio.create_task(tick_loop())


@app.get("/health")
def health():
    return {"status": "ok", "tick": tick_count, "branch": tm.bt_active_branch}


@app.get("/", response_class=HTMLResponse)
def index():
    html_path = Path(__file__).parent / "index.html"
    return html_path.read_text(encoding="utf-8")
