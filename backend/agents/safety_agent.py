"""SafetyAgent: 行为树驱动的安全决策"""
import py_trees

from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.context_snapshot import ContextSnapshot
from domain.decision_trace import DecisionTraceLog
from engine.tree_builder import build_tree
from agents.base import BaseAgent


class SafetyAgent(BaseAgent):
    """P0-P7 行为树 tick，保障设备安全"""

    def __init__(self, cap: DeviceCapability, trace: DecisionTraceLog):
        super().__init__("safety")
        self.cap = cap
        self.trace = trace
        self._tree: py_trees.behaviour.Behaviour | None = None

    def _get_tree(self, tm: ThingModel) -> py_trees.behaviour.Behaviour:
        if self._tree is None:
            self._tree = build_tree(tm, self.cap, self.trace)
        return self._tree

    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        tree = self._get_tree(tm)
        tree.tick_once()
        tm.bt_tick += 1
        tm.bt_active_branch = tree.tip().name if tree.tip() else "Idle"
        tm.bt_result = tree.status.name.lower()

    def reset_tree(self):
        """重建行为树（配置变更时调用）"""
        self._tree = None

    def _on_error(self, tm: ThingModel):
        """安全兜底：出错时停止所有电机"""
        tm.actuator_state = "idle"
        tm.actuator_current_ma = 120
        tm.window_motion = "stopped"
        tm.screen_motion = "stopped"
        self.logger.warning("safety fallback: all motors stopped")
