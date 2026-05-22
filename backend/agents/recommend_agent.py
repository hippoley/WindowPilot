"""RecommendAgent: 异步 AI 推荐管线"""
import asyncio
import logging

from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot
from agents.base import BaseAgent

logger = logging.getLogger("agent.recommend")


class RecommendAgent(BaseAgent):
    """P5 触发时异步生成 AI 推荐"""

    def __init__(self):
        super().__init__("recommend")
        self._running = False
        self._task: asyncio.Task | None = None

    @property
    def is_running(self) -> bool:
        return self._running

    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        # 仅在 P5 生成推荐条件满足且无正在运行的管线时触发
        if self._running:
            return
        need_generate = (
            tm.ai_recommendation is None
            and tm.mode != "manual"
            and snapshot.risk_level == "safe"
        )
        if need_generate and self._has_trigger(snapshot):
            self._running = True
            try:
                loop = asyncio.get_event_loop()
                self._task = loop.create_task(self._run_pipeline(tm, snapshot))
            except RuntimeError:
                # 没有事件循环时降级
                self._running = False

    def _has_trigger(self, snapshot: ContextSnapshot) -> bool:
        """检查是否有环境触发条件（CO2/湿度/温度/噪声）"""
        triggers = {"CO2_HIGH", "HUMIDITY_HIGH", "INDOOR_HOT", "NOISE_HIGH"}
        return bool(triggers & set(snapshot.tags))

    async def _run_pipeline(self, tm: ThingModel, snapshot: ContextSnapshot):
        """异步 AI 推荐管线（由外部注入具体实现）"""
        try:
            # 占位：实际管线由 server 层注入回调
            logger.info("recommend pipeline triggered: %s", snapshot.summary)
            await asyncio.sleep(0)  # yield control
        except Exception as e:
            logger.error("recommend pipeline error: %s", e)
        finally:
            self._running = False
