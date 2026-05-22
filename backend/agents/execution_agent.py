"""ExecutionAgent: 物理执行仿真 + 窗纱联动"""
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.context_snapshot import ContextSnapshot
from execution.simulator import simulate_actuator, simulate_screen, WindowScreenCoordinator
from agents.base import BaseAgent


class ExecutionAgent(BaseAgent):
    """每 tick 驱动推窗器/纱窗仿真，检查指令完成"""

    def __init__(self, cap: DeviceCapability):
        super().__init__("execution")
        self.cap = cap
        self.coordinator = WindowScreenCoordinator(cap)

    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        # 联动协调
        self.coordinator.tick(tm)
        # 推窗器仿真
        simulate_actuator(tm, self.cap)
        # 纱窗仿真
        simulate_screen(tm)
        # 检查指令完成
        self._check_completion(tm)

    def _check_completion(self, tm: ThingModel):
        """指令到位后清除 user_command"""
        if tm.user_command is None:
            return
        actuator_done = tm.actuator_state in ("idle", "holding")
        screen_done = tm.screen_motion == "stopped"
        if actuator_done and screen_done:
            tm.user_command = None
