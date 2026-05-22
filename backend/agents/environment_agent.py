"""EnvironmentAgent: 环境感知，生成 ContextSnapshot"""
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.context_snapshot import ContextSnapshot
from agents.base import BaseAgent


class EnvironmentAgent(BaseAgent):
    """每 tick 从 ThingModel 生成语义快照"""

    def __init__(self, cap: DeviceCapability):
        super().__init__("environment")
        self.cap = cap
        self._snapshot: ContextSnapshot = ContextSnapshot()

    @property
    def snapshot(self) -> ContextSnapshot:
        return self._snapshot

    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        self._snapshot = ContextSnapshot.from_thing_model(tm, self.cap)
