"""LearnerAgent: 习惯学习，定期衰减记忆"""
from typing import Dict

from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot
from ai.learner import HabitLearner
from agents.base import BaseAgent

DECAY_INTERVAL_TICKS = 120


class LearnerAgent(BaseAgent):
    """封装 HabitLearner，每 120 tick 执行记忆衰减"""

    def __init__(self):
        super().__init__("learner")
        self.learner = HabitLearner()
        self._tick_counter = 0

    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        self._tick_counter += 1
        if self._tick_counter >= DECAY_INTERVAL_TICKS:
            self._tick_counter = 0
            self.learner.memory_store.decay_all()

    def on_accept(self, action: Dict, room_type: str, time_hour: int):
        self.learner.on_accept(action, room_type, time_hour)

    def on_reject(self, action: Dict, room_type: str, time_hour: int):
        self.learner.on_reject(action, room_type, time_hour)

    def get_preferred_pct(self, room_type: str, time_hour: int) -> float:
        return self.learner.get_preferred_pct(room_type, time_hour)
