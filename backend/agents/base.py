"""Agent 基类：状态管理、指标采集、安全 tick 包装"""
import time
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot


class AgentStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    DEGRADED = "degraded"
    ERROR = "error"
    DISABLED = "disabled"


@dataclass
class AgentMetrics:
    tick_count: int = 0
    last_tick_ms: float = 0.0
    avg_tick_ms: float = 0.0
    max_tick_ms: float = 0.0
    error_count: int = 0
    last_error: Optional[str] = None


class BaseAgent(ABC):
    """所有 Agent 的抽象基类"""

    def __init__(self, name: str):
        self.name = name
        self.status = AgentStatus.IDLE
        self.metrics = AgentMetrics()
        self.logger = logging.getLogger(f"agent.{name}")

    @abstractmethod
    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        """子类实现具体逻辑"""

    def safe_tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        """带计时和异常捕获的 tick 包装"""
        if self.status == AgentStatus.DISABLED:
            return
        self.status = AgentStatus.RUNNING
        t0 = time.perf_counter()
        try:
            self.tick(tm, snapshot)
            self.status = AgentStatus.IDLE
        except Exception as e:
            self.metrics.error_count += 1
            self.metrics.last_error = str(e)
            self.logger.error("tick error: %s", e, exc_info=True)
            self._on_error(tm)
            self.degrade()
        finally:
            elapsed = (time.perf_counter() - t0) * 1000
            self.metrics.tick_count += 1
            self.metrics.last_tick_ms = elapsed
            self.metrics.max_tick_ms = max(self.metrics.max_tick_ms, elapsed)
            # 滑动平均
            n = self.metrics.tick_count
            self.metrics.avg_tick_ms += (elapsed - self.metrics.avg_tick_ms) / n

    def degrade(self):
        self.status = AgentStatus.DEGRADED

    def recover(self):
        if self.status == AgentStatus.DEGRADED:
            self.status = AgentStatus.IDLE

    def disable(self):
        self.status = AgentStatus.DISABLED

    def enable(self):
        self.status = AgentStatus.IDLE

    @property
    def is_healthy(self) -> bool:
        return self.status in (AgentStatus.IDLE, AgentStatus.RUNNING)

    def _on_error(self, tm: ThingModel):
        """子类可覆盖，执行错误恢复动作"""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status.value,
            "metrics": {
                "tick_count": self.metrics.tick_count,
                "last_tick_ms": round(self.metrics.last_tick_ms, 2),
                "avg_tick_ms": round(self.metrics.avg_tick_ms, 2),
                "max_tick_ms": round(self.metrics.max_tick_ms, 2),
                "error_count": self.metrics.error_count,
                "last_error": self.metrics.last_error,
            },
        }
