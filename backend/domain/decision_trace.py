"""
决策追踪 (Decision Trace)
每一次判断和动作都留下证据
"""
import time
from dataclasses import dataclass, field
from typing import List, Dict, Any
from domain.thing_model import ThingModel


@dataclass
class DecisionEntry:
    tick: int
    timestamp: float
    branch: str
    action: str
    result: str
    before_state: Dict[str, Any]
    after_state: Dict[str, Any]
    safety_flags: Dict[str, bool]

    def to_dict(self) -> dict:
        return {
            "tick": self.tick,
            "ts": self.timestamp,
            "branch": self.branch,
            "action": self.action,
            "result": self.result,
            "before": self.before_state,
            "after": self.after_state,
            "safety": self.safety_flags,
        }


class DecisionTraceLog:
    """决策日志管理器"""

    def __init__(self, max_entries: int = 50):
        self.entries: List[DecisionEntry] = []
        self.max_entries = max_entries

    def record(self, tm: ThingModel, branch: str, action: str, result: str,
               before_pct: float = None, after_pct: float = None):
        entry = DecisionEntry(
            tick=tm.bt_tick,
            timestamp=time.time(),
            branch=branch,
            action=action,
            result=result,
            before_state={
                "window_pct": before_pct if before_pct is not None else tm.window_open_pct,
                "actuator": tm.actuator_state,
                "screen_pct": tm.screen_position_pct,
            },
            after_state={
                "window_pct": after_pct if after_pct is not None else tm.window_open_pct,
                "target_pct": tm.window_target_pct,
                "actuator": tm.actuator_state,
            },
            safety_flags={
                "rain": tm.rain_detected,
                "obstacle": tm.actuator_current_ma > 800,
                "overheat": tm.actuator_temp_c > 55,
                "wind": tm.wind_level >= 6,
            },
        )
        self.entries.insert(0, entry)
        if len(self.entries) > self.max_entries:
            self.entries.pop()

    def recent(self, n: int = 10) -> List[dict]:
        return [e.to_dict() for e in self.entries[:n]]
