"""SchedulerAgent: 定时场景触发"""
import time
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot
from domain.decision_trace import DecisionTraceLog
from agents.base import BaseAgent


@dataclass
class ScheduleEntry:
    """定时任务条目"""
    id: str
    name: str                    # "早晨通风" / "睡前关窗"
    hour: int                    # 0-23
    minute: int = 0              # 0-59
    weekdays: List[int] = field(default_factory=lambda: [0,1,2,3,4,5,6])  # 0=Mon..6=Sun
    action: str = "open_to"      # open_to / close / screen_to
    target_pct: float = 30.0
    screen_pct: Optional[float] = None
    enabled: bool = True
    room_type: Optional[str] = None  # 只在特定房间触发
    last_fired_date: str = ""    # "2025-01-20" 防止同一天重复触发


class SchedulerAgent(BaseAgent):
    """
    定时场景 Agent：基于时间触发窗户动作。
    每 tick 检查是否有到期的定时任务。
    """

    def __init__(self, trace: DecisionTraceLog):
        super().__init__("scheduler")
        self.trace = trace
        self.schedules: List[ScheduleEntry] = []
        self._load_default_schedules()

    def _load_default_schedules(self):
        """加载默认定时场景（可从配置文件读取）"""
        self.schedules = [
            ScheduleEntry(id="morning_vent", name="早晨通风",
                         hour=8, minute=0, action="open_to", target_pct=30),
            ScheduleEntry(id="night_close", name="睡前关窗",
                         hour=22, minute=30, action="open_to", target_pct=0),
            ScheduleEntry(id="lunch_vent", name="午间换气",
                         hour=12, minute=0, action="open_to", target_pct=20,
                         weekdays=[0,1,2,3,4]),  # 工作日
        ]

    def tick(self, tm: ThingModel, snapshot: ContextSnapshot):
        """检查是否有定时任务需要触发"""
        import datetime
        now = datetime.datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        current_weekday = now.weekday()  # 0=Monday

        for sched in self.schedules:
            if not sched.enabled:
                continue
            # 房间过滤
            if sched.room_type and sched.room_type != tm.room_type:
                continue
            # 时间匹配
            if sched.hour != now.hour or sched.minute != now.minute:
                continue
            # 星期匹配
            if current_weekday not in sched.weekdays:
                continue
            # 防重复（同一天只触发一次）
            if sched.last_fired_date == today_str:
                continue
            # 安全检查：安防模式下不触发开窗
            if tm.security_mode and sched.action == "open_to" and sched.target_pct > 0:
                continue

            # 触发！
            self._fire(tm, sched, today_str)

    def _fire(self, tm: ThingModel, sched: ScheduleEntry, today_str: str):
        """执行定时任务"""
        sched.last_fired_date = today_str

        if sched.action == "open_to":
            tm.user_command = {
                "source": "scheduler",
                "action": "open_to",
                "target_pct": sched.target_pct
            }
        elif sched.action == "close":
            tm.user_command = {
                "source": "scheduler",
                "action": "open_to",
                "target_pct": 0
            }
        elif sched.action == "screen_to" and sched.screen_pct is not None:
            tm.user_command = {
                "source": "scheduler",
                "action": "screen_to",
                "target_pct": sched.screen_pct
            }

        self.trace.record(tm, "Scheduler.Fire",
                         f"{sched.name}: {sched.action} {sched.target_pct}%",
                         "success")
        self.logger.info(f"Schedule fired: {sched.name}")

    def add_schedule(self, entry: ScheduleEntry):
        """添加定时任务"""
        # 去重
        self.schedules = [s for s in self.schedules if s.id != entry.id]
        self.schedules.append(entry)

    def remove_schedule(self, schedule_id: str):
        """删除定时任务"""
        self.schedules = [s for s in self.schedules if s.id != schedule_id]

    def list_schedules(self) -> List[Dict]:
        """列出所有定时任务"""
        return [
            {"id": s.id, "name": s.name, "hour": s.hour, "minute": s.minute,
             "weekdays": s.weekdays, "action": s.action, "target_pct": s.target_pct,
             "enabled": s.enabled}
            for s in self.schedules
        ]

    def to_dict(self) -> dict:
        base = super().to_dict()
        base["schedules_count"] = len(self.schedules)
        base["active_schedules"] = len([s for s in self.schedules if s.enabled])
        return base
