"""
行为树动作节点
每个动作执行具体操作，返回 SUCCESS/RUNNING/FAILURE

trace 通过构造参数注入，不再使用模块级全局变量，
避免多实例场景下的竞态问题。
"""
import py_trees
import yaml
from pathlib import Path
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.decision_trace import DecisionTraceLog

# Cache room strategies config (loaded once at import time)
_room_cfg_path = Path(__file__).parent.parent / "config" / "room_strategies.yaml"
with open(_room_cfg_path) as _f:
    _ROOM_CFG = yaml.safe_load(_f).get("rooms", {})


def _action(name, fn):
    """
    动作节点工厂。
    fn 签名：fn(tm, cap, trace) -> 'success'|'running'|'failure'
    trace 可为 None（不记录日志）。
    """
    class _ActionNode(py_trees.behaviour.Behaviour):
        def __init__(self, tm: ThingModel, cap: DeviceCapability,
                     trace: DecisionTraceLog = None):
            super().__init__(name)
            self.tm = tm
            self.cap = cap
            self.trace = trace

        def update(self):
            r = fn(self.tm, self.cap, self.trace)
            if r == "running":
                return py_trees.common.Status.RUNNING
            if r == "failure":
                return py_trees.common.Status.FAILURE
            return py_trees.common.Status.SUCCESS

    _ActionNode.__name__ = f"Act_{name}"
    return _ActionNode


def _cond(name, fn):
    """条件节点工厂。fn(tm, cap) -> bool"""
    class _CondNode(py_trees.behaviour.Behaviour):
        def __init__(self, tm: ThingModel, cap: DeviceCapability,
                     trace: DecisionTraceLog = None):
            super().__init__(name)
            self.tm = tm
            self.cap = cap

        def update(self):
            return (py_trees.common.Status.SUCCESS
                    if fn(self.tm, self.cap)
                    else py_trees.common.Status.FAILURE)

    _CondNode.__name__ = f"Cond_{name}"
    return _CondNode


# ═══ P0 动作 ═══

def _stop_and_reverse(tm, cap, trace):
    before = tm.window_open_pct
    tm.actuator_state = "idle"
    tm.actuator_current_ma = 120
    reverse_mm = cap.max_stroke_mm * 0.02
    tm.actuator_stroke_mm = max(0, tm.actuator_stroke_mm - reverse_mm)
    tm.window_open_pct = (tm.actuator_stroke_mm / cap.max_stroke_mm) * 100
    tm.window_motion = "stopped"
    tm.window_state = "blocked"
    tm.bt_active_branch = "P0.AntiPinch"
    if trace:
        trace.record(tm, "P0.AntiPinch", "stop_reverse_2%", "success", before)
    return "success"


def _stop_all(tm, cap, trace):
    tm.actuator_state = "idle"
    tm.actuator_current_ma = 120
    tm.screen_motion = "stopped"
    tm.window_motion = "stopped"
    tm.window_state = "stopped"
    return "success"


def _close_window(tm, cap, trace):
    tm.window_target_pct = 0
    tm.actuator_target_mm = 0
    if tm.actuator_stroke_mm > 1:
        tm.actuator_state = "retracting"
        return "running"
    tm.window_state = "closed"
    tm.window_open_pct = 0
    return "success"


def _ensure_screen_down(tm, cap, trace):
    """确保纱窗放下（窗纱干涉时先降纱窗）"""
    if tm.screen_position_pct >= 95:
        return "success"
    tm.screen_target_pct = 100
    tm.screen_motion = "rolling_down"
    tm.bt_active_branch = "P3.ScreenFirst"
    if trace:
        trace.record(tm, "P3.ScreenFirst", "ensure_screen_down", "running")
    return "running"


def _wait_device(tm, cap, trace):
    tm.bt_active_branch = "P3.WaitDevice"
    return "running"


def _respect_user(tm, cap, trace):
    tm.bt_active_branch = "P4.RespectUser"
    if trace:
        trace.record(tm, "P4.RespectUser", "silent_respect", "success")
    return "success"


def _execute_user_command(tm, cap, trace):
    cmd = tm.user_command
    if not cmd:
        return "failure"
    action = cmd.get("action", "")

    if action == "stop":
        tm.actuator_state = "idle"
        tm.screen_motion = "stopped"
        tm.window_motion = "stopped"
        tm.user_command = None
        tm.bt_active_branch = "P4.UserStop"
        if trace:
            trace.record(tm, "P4.UserStop", "stop_all", "success")
        return "success"

    if action == "open_to":
        target = cmd.get("target_pct", 0)
        tm.window_target_pct = target
        target_mm = (target / 100.0) * cap.max_stroke_mm
        tm.actuator_target_mm = target_mm
        # 窗纱联动：开窗前先确保纱窗放下
        if cap.has_screen_interference and target > 0 and tm.screen_position_pct < 95:
            tm.screen_target_pct = 100
            tm.screen_motion = "rolling_down"
            tm.bt_active_branch = "P4.ScreenFirst"
            return "running"
        if target_mm > tm.actuator_stroke_mm + 3:
            tm.actuator_state = "extending"
        elif target_mm < tm.actuator_stroke_mm - 3:
            tm.actuator_state = "retracting"
        else:
            return "success"
        tm.bt_active_branch = f"P4.OpenTo{int(target)}%"
        if trace:
            trace.record(tm, "P4.UserCommand", f"open_to_{int(target)}%", "running")
        return "running"

    if action == "screen_to":
        target = cmd.get("target_pct", 0)
        tm.screen_target_pct = target
        if target > tm.screen_position_pct:
            tm.screen_motion = "rolling_down"
        elif target < tm.screen_position_pct:
            tm.screen_motion = "rolling_up"
        tm.bt_active_branch = "P4.Screen"
        tm.user_command = None
        return "success"

    tm.user_command = None
    return "failure"


def _show_recommendation(tm, cap, trace):
    rec = tm.ai_recommendation
    if not rec:
        return "failure"
    tm.recommendation_card = {
        "title":        rec.get("title", "建议调整"),
        "reason":       rec.get("reason", "AI建议"),
        "window_pct":   rec.get("window_pct", 30),
        "screen_pct":   rec.get("screen_pct", 100),
        "needs_confirm": rec.get("needs_confirm", True),
        "duration_min": rec.get("duration_min"),
    }
    tm.bt_active_branch = "P7.Recommendation"
    return "running"


def _generate_recommendation(tm, cap, trace):
    """标记需要生成推荐，由 tick_loop 在下一 tick 调用 AI 链路"""
    tm.bt_active_branch = "P5.NeedGenerate"
    return "success"


def _idle(tm, cap, trace):
    if tm.actuator_state in ("idle", "holding") and tm.screen_motion == "stopped":
        tm.bt_active_branch = "Idle"
    return "success"


def _log_safety(branch_name):
    def fn(tm, cap, trace):
        tm.bt_active_branch = f"Safety.{branch_name}"
        if trace:
            trace.record(tm, f"Safety.{branch_name}", "triggered", "success")
        return "success"
    return fn


# ── P6 房间策略动作 ──

def _enforce_screen_down(tm, cap, trace):
    """强制纱窗放下（儿童房 screen_always_down 策略）"""
    if tm.screen_position_pct >= 95:
        return "success"
    tm.screen_target_pct = 100
    tm.screen_motion = "rolling_down"
    tm.bt_active_branch = "P6.ChildScreenDown"
    if trace:
        trace.record(tm, "P6.ChildScreenDown", "enforce_screen_down", "running")
    return "running"


def _limit_night_open(tm, cap, trace):
    """夜间限制最大开度（卧室 sleep_max_open_pct 策略）"""
    sleep_max = _ROOM_CFG.get("bedroom", {}).get("sleep_max_open_pct", 15)
    if tm.window_open_pct > sleep_max:
        tm.window_target_pct = sleep_max
        target_mm = (sleep_max / 100.0) * cap.max_stroke_mm
        tm.actuator_target_mm = target_mm
        tm.actuator_state = "retracting"
        tm.bt_active_branch = "P6.NightLimit"
        if trace:
            trace.record(tm, "P6.NightLimit", f"limit_to_{sleep_max}%", "running")
        return "running"
    return "success"


# ═══ 动作节点类（供 tree_builder 使用）═══
ActStopReverse      = _action("停止+回退2%",    _stop_and_reverse)
ActStopAll          = _action("停止所有电机",    _stop_all)
ActCloseWindow      = _action("关闭窗户",        _close_window)
ActEnsureScreenDown = _action("先降纱窗",        _ensure_screen_down)
ActWaitDevice       = _action("等待设备就绪",    _wait_device)
ActRespectUser      = _action("尊重用户意图",    _respect_user)
ActExecuteUser      = _action("执行用户指令",    _execute_user_command)
ActShowRec          = _action("显示推荐卡片",    _show_recommendation)
ActGenRec           = _action("生成推荐",        _generate_recommendation)
ActIdle             = _action("待机",            _idle)
ActEnforceScreenDown = _action("强制纱窗放下",   _enforce_screen_down)
ActLimitNightOpen   = _action("夜间限制开度",    _limit_night_open)

def _lower_screen_for_sun(tm, cap, trace):
    """西晒遮光：降下纱窗"""
    if tm.screen_position_pct >= 95:
        return "success"
    tm.screen_target_pct = 100
    tm.screen_motion = "rolling_down"
    tm.bt_active_branch = "P6.SunScreen"
    if trace:
        trace.record(tm, "P6.SunScreen", "lower_screen_for_sun", "running")
    return "running"

def _close_for_no_human(tm, cap, trace):
    """无人节能：关窗"""
    tm.window_target_pct = 0
    tm.actuator_target_mm = 0
    if tm.actuator_stroke_mm > 1:
        tm.actuator_state = "retracting"
        tm.bt_active_branch = "P5.NoHumanClose"
        if trace:
            trace.record(tm, "P5.NoHumanClose", "close_for_energy_save", "running")
        return "running"
    tm.window_state = "closed"
    tm.window_open_pct = 0
    tm.bt_active_branch = "P5.NoHumanClose"
    return "success"

ActLowerScreenSun = _action("西晒降纱窗", _lower_screen_for_sun)
ActCloseNoHuman = _action("无人关窗节能", _close_for_no_human)

ActLogObstacle = _action("记录:遇阻",     _log_safety("Obstacle"))
ActLogOverheat = _action("记录:过热",     _log_safety("Overheat"))
ActLogRain     = _action("记录:雨天关窗", _log_safety("RainClose"))
ActLogWind     = _action("记录:强风关窗", _log_safety("HighWind"))
ActLogVOC      = _action("记录:VOC关窗",  _log_safety("VOCSpike"))
ActLogAQI      = _action("记录:AQI关窗",  _log_safety("AQIDanger"))
