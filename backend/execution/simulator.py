"""
执行层：推窗器仿真 + 纱窗仿真 + 窗纱联动协调
仿真器和真实硬件实现同一接口，可替换
"""
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability


# ═══ 推窗器仿真 ═══

ACTUATOR_MM_PER_TICK = 25.0  # 500ms tick, 约 50mm/s

def simulate_actuator(tm: ThingModel, cap: DeviceCapability):
    """每 tick 更新推窗器状态（仿真硬件反馈）"""
    if tm.actuator_state == "extending":
        tm.actuator_stroke_mm = min(tm.actuator_target_mm, tm.actuator_stroke_mm + ACTUATOR_MM_PER_TICK)
        tm.actuator_current_ma = 350
        tm.actuator_runtime_ms += 500
        tm.window_open_pct = (tm.actuator_stroke_mm / cap.max_stroke_mm) * 100
        tm.window_motion = "opening"
        tm.window_state = "opening"
        # 到位检测
        if abs(tm.actuator_stroke_mm - tm.actuator_target_mm) < 3:
            tm.actuator_stroke_mm = tm.actuator_target_mm
            tm.actuator_state = "holding"
            tm.actuator_current_ma = 130
            tm.window_open_pct = (tm.actuator_stroke_mm / cap.max_stroke_mm) * 100
            tm.window_motion = "stopped"
            tm.window_state = "open_full" if tm.window_open_pct >= 99 else (
                "open_partial" if tm.window_open_pct > 0.5 else "closed")

    elif tm.actuator_state == "retracting":
        tm.actuator_stroke_mm = max(0, tm.actuator_stroke_mm - ACTUATOR_MM_PER_TICK)
        tm.actuator_current_ma = 320
        tm.actuator_runtime_ms += 500
        tm.window_open_pct = (tm.actuator_stroke_mm / cap.max_stroke_mm) * 100
        tm.window_motion = "closing"
        tm.window_state = "closing"
        if tm.actuator_stroke_mm <= 1:
            tm.actuator_stroke_mm = 0
            tm.actuator_state = "idle"
            tm.actuator_current_ma = 120
            tm.window_open_pct = 0
            tm.window_motion = "stopped"
            tm.window_state = "closed"

    else:
        tm.actuator_runtime_ms = 0
        if tm.actuator_state == "idle":
            tm.actuator_current_ma = 120


# ═══ 纱窗仿真 ═══

SCREEN_PCT_PER_TICK = 12.0  # 500ms tick

def simulate_screen(tm: ThingModel):
    """每 tick 更新纱窗状态"""
    if tm.screen_motion == "rolling_down":
        tm.screen_position_pct = min(tm.screen_target_pct, tm.screen_position_pct + SCREEN_PCT_PER_TICK)
        if abs(tm.screen_position_pct - tm.screen_target_pct) < 2:
            tm.screen_position_pct = tm.screen_target_pct
            tm.screen_motion = "stopped"
    elif tm.screen_motion == "rolling_up":
        tm.screen_position_pct = max(tm.screen_target_pct, tm.screen_position_pct - SCREEN_PCT_PER_TICK)
        if abs(tm.screen_position_pct - tm.screen_target_pct) < 2:
            tm.screen_position_pct = tm.screen_target_pct
            tm.screen_motion = "stopped"


# ═══ 窗纱联动协调器 ═══

class WindowScreenCoordinator:
    """协调窗户和纱窗的联动关系"""

    def __init__(self, cap: DeviceCapability):
        self.cap = cap
        self._waiting_for_screen = False

    def request_open_window(self, tm: ThingModel, target_pct: float):
        """请求开窗：如果有干涉，先降纱窗"""
        tm.window_target_pct = target_pct
        target_mm = (target_pct / 100.0) * self.cap.max_stroke_mm
        tm.actuator_target_mm = target_mm

        if self.cap.has_screen_interference and self.cap.open_window_requires_screen_down:
            if tm.screen_position_pct < 95:
                # 先降纱窗
                tm.screen_target_pct = 100
                tm.screen_motion = "rolling_down"
                self._waiting_for_screen = True
                return "screen_first"

        # 直接开窗
        tm.actuator_state = "extending"
        return "opening"

    def request_close_window(self, tm: ThingModel):
        """请求关窗"""
        tm.window_target_pct = 0
        tm.actuator_target_mm = 0
        tm.actuator_state = "retracting"
        return "closing"

    def tick(self, tm: ThingModel):
        """每 tick 检查联动状态"""
        if self._waiting_for_screen:
            if tm.screen_motion == "stopped" and tm.screen_position_pct >= 95:
                # 纱窗到位，开始开窗
                self._waiting_for_screen = False
                tm.actuator_state = "extending"

    def request_screen(self, tm: ThingModel, target_pct: float):
        """请求纱窗移动"""
        tm.screen_target_pct = target_pct
        if target_pct > tm.screen_position_pct:
            tm.screen_motion = "rolling_down"
        elif target_pct < tm.screen_position_pct:
            tm.screen_motion = "rolling_up"
