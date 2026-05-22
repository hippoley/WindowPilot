"""SecurityAgent: 安防报警模式"""
import time
from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot
from domain.decision_trace import DecisionTraceLog
from agents.base import BaseAgent


class SecurityAgent(BaseAgent):
    """
    安防 Agent：夜间防撬 + 入侵检测 + 报警管理
    
    触发条件：
    1. security_mode=True（用户开启安防模式）
    2. 窗户被外力打开（actuator_current_ma 异常 + window_state 变化）
    3. 夜间（22:00-06:00）自动进入安防模式
    """
    
    # 防撬检测：窗户关闭状态下电流异常升高
    TAMPER_CURRENT_THRESHOLD = 500  # mA
    # 报警冷却时间（避免重复报警）
    ALARM_COOLDOWN_SEC = 60
    
    def __init__(self, trace: DecisionTraceLog):
        super().__init__("security")
        self.trace = trace
        self._last_alarm_ts = 0.0
        self._alarm_count = 0
    
    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        # 自动夜间安防
        if not tm.security_mode and self._is_night(tm):
            if tm.auto_security_night:
                tm.security_mode = True
                tm.security_armed_ts = time.time()
        
        # 安防模式下的检测
        if not tm.security_mode:
            tm.alarm_triggered = False
            return
        
        # 防撬检测：窗户应该关闭，但检测到异常力
        tamper_detected = (
            tm.window_state == "closed"
            and tm.actuator_state == "idle"
            and tm.actuator_current_ma > self.TAMPER_CURRENT_THRESHOLD
        )
        
        # 异常开窗检测：安防模式下窗户被打开
        forced_open = (
            tm.security_mode
            and tm.window_open_pct > 3
            and tm.user_command is None  # 不是用户主动操作
        )
        
        if (tamper_detected or forced_open) and self._can_alarm():
            self._trigger_alarm(tm, "tamper" if tamper_detected else "forced_open")
    
    def _is_night(self, tm: ThingModel) -> bool:
        return tm.time_hour >= 22 or tm.time_hour < 6
    
    def _can_alarm(self) -> bool:
        return (time.time() - self._last_alarm_ts) > self.ALARM_COOLDOWN_SEC
    
    def _trigger_alarm(self, tm: ThingModel, reason: str):
        tm.alarm_triggered = True
        tm.alarm_reason = reason
        tm.alarm_ts = time.time()
        self._last_alarm_ts = time.time()
        self._alarm_count += 1
        
        # 记录到决策日志（可用于推送通知）
        self.trace.record(tm, "Security.Alarm", 
                         f"ALARM: {reason} | window={tm.window_open_pct:.0f}% current={tm.actuator_current_ma}mA",
                         "success")
        self.logger.warning(f"SECURITY ALARM: {reason}")
        
        # 安防响应：锁定窗户
        tm.window_state = "locked"
        tm.bt_active_branch = "Security.Alarm"
    
    def arm(self, tm: ThingModel):
        """手动布防"""
        tm.security_mode = True
        tm.security_armed_ts = time.time()
        self.trace.record(tm, "Security.Arm", "armed", "success")
    
    def disarm(self, tm: ThingModel):
        """手动撤防"""
        tm.security_mode = False
        tm.alarm_triggered = False
        tm.alarm_reason = ""
        self.trace.record(tm, "Security.Disarm", "disarmed", "success")
    
    def to_dict(self) -> dict:
        base = super().to_dict()
        base["alarm_count"] = self._alarm_count
        return base
