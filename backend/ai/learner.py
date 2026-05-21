"""
AI-5 习惯学习 (Habit Learning)
从用户反馈中学习偏好
位置：用户反馈之后
输入：采纳/拒绝/改参/执行结果
输出：用户偏好记忆强度更新
不能做：不能覆盖安全规则

记忆强度衰减公式：
  memory_strength = 1/(1 + exp(-0.3 * opt_var)) + strength_init - 0.5
  opt_var = opt_strength - (opt_strength + 1)/(1 + exp(-0.2 * (delta_day - 10)))
"""
from typing import Dict, List, Optional
from dataclasses import dataclass, field
import math
import time


@dataclass
class MemoryEntry:
    """单条记忆条目"""
    scene_key: str
    window_pct: float
    screen_pct: float
    room_type: str
    time_hour: int
    opt_strength: float = 1.0
    last_used_ts: float = field(default_factory=time.time)
    created_ts: float = field(default_factory=time.time)

    def calc_memory_strength(self, now_ts: Optional[float] = None) -> float:
        """
        计算当前记忆强度（sigmoid衰减）

        memory_strength = 1/(1 + exp(-0.3 * opt_var)) + strength_init - 0.5
        opt_var = opt_strength - (opt_strength + 1)/(1 + exp(-0.2 * (delta_day - 10)))
        """
        if now_ts is None:
            now_ts = time.time()
        delta_day = (now_ts - self.last_used_ts) / 86400.0
        delta_day = max(0, min(delta_day, 365))
        strength_init = 0.5  # 初始强度基线

        opt_strength = self.opt_strength
        denominator = 1 + math.exp(-0.2 * (delta_day - 10))
        opt_var = opt_strength - (opt_strength + 1) / denominator

        memory_strength = 1.0 / (1.0 + math.exp(-0.3 * opt_var)) + strength_init - 0.5
        return max(0.0, min(1.0, memory_strength))


class MemoryStore:
    """记忆存储，管理记忆条目的增删与衰减"""

    MAX_ENTRIES = 100

    def __init__(self):
        self.entries: List[MemoryEntry] = []

    def add_memory(self, entry: MemoryEntry):
        """
        添加记忆条目。如果存在相似条目（同房间+同时段，window_pct差异<=5%），
        则合并（更新opt_strength和last_used_ts），否则新增。
        """
        existing = self._find_similar(entry)
        if existing is not None:
            # 合并：增强opt_strength，更新时间戳和窗户百分比
            existing.opt_strength = min(existing.opt_strength + 0.3, 5.0)
            existing.last_used_ts = entry.last_used_ts
            existing.window_pct = entry.window_pct
            existing.screen_pct = entry.screen_pct
        else:
            self.entries.append(entry)
            # 超出容量时移除最弱的记忆
            if len(self.entries) > self.MAX_ENTRIES:
                self._evict_weakest()

    def decay_all(self, now_ts: Optional[float] = None):
        """
        对所有记忆条目计算衰减强度，移除强度 < 0.1 的条目。
        """
        if now_ts is None:
            now_ts = time.time()
        self.entries = [
            e for e in self.entries
            if e.calc_memory_strength(now_ts) >= 0.1
        ]

    def get_relevant(self, room_type: str, time_hour: int, now_ts: Optional[float] = None) -> List[MemoryEntry]:
        """
        获取与当前房间和时段相关的记忆条目，按强度降序排列。
        时段匹配规则：同一时段区间内（夜间/早晨/白天/傍晚）。
        """
        if now_ts is None:
            now_ts = time.time()
        period = self._get_time_period(time_hour)
        relevant = [
            e for e in self.entries
            if e.room_type == room_type and self._get_time_period(e.time_hour) == period
        ]
        relevant.sort(key=lambda e: e.calc_memory_strength(now_ts), reverse=True)
        return relevant

    def _find_similar(self, entry: MemoryEntry) -> Optional[MemoryEntry]:
        """查找相似条目：同房间+同时段+window_pct差异<=5%"""
        period = self._get_time_period(entry.time_hour)
        for e in self.entries:
            if (e.room_type == entry.room_type
                    and self._get_time_period(e.time_hour) == period
                    and abs(e.window_pct - entry.window_pct) <= 5.0):
                return e
        return None

    def _evict_weakest(self):
        """移除强度最低的条目"""
        if not self.entries:
            return
        now_ts = time.time()
        weakest = min(self.entries, key=lambda e: e.calc_memory_strength(now_ts))
        self.entries.remove(weakest)

    @staticmethod
    def _get_time_period(hour: int) -> str:
        """将小时映射到时段区间"""
        if 22 <= hour or hour < 6:
            return "night"
        elif 6 <= hour < 10:
            return "morning"
        elif 10 <= hour < 17:
            return "daytime"
        else:
            return "evening"

    def to_list(self) -> List[Dict]:
        """序列化所有记忆条目"""
        now_ts = time.time()
        return [
            {
                "scene_key": e.scene_key,
                "window_pct": e.window_pct,
                "screen_pct": e.screen_pct,
                "room_type": e.room_type,
                "time_hour": e.time_hour,
                "opt_strength": e.opt_strength,
                "memory_strength": round(e.calc_memory_strength(now_ts), 3),
                "last_used_ts": e.last_used_ts,
                "created_ts": e.created_ts,
            }
            for e in self.entries
        ]


@dataclass
class UserPreference:
    """用户偏好记忆"""
    # 开窗偏好（历史平均）
    preferred_open_pct: float = 30.0
    # 接受率
    accept_count: int = 0
    reject_count: int = 0
    modify_count: int = 0
    # 房间偏好
    room_preferences: Dict[str, float] = field(default_factory=lambda: {
        "bedroom": 25.0,
        "child_room": 8.0,
        "elderly_room": 15.0,
        "study": 20.0,
        "living_room": 35.0,
    })
    # 时段偏好
    night_max_pct: float = 15.0
    morning_preferred_pct: float = 40.0
    # 最近反馈
    recent_feedback: List[Dict] = field(default_factory=list)


class HabitLearner:
    """AI-5: 习惯学习"""

    def __init__(self):
        self.preference = UserPreference()
        self.memory_store = MemoryStore()

    def on_accept(self, action: Dict, room_type: str, time_hour: int):
        """用户接受推荐"""
        self.preference.accept_count += 1
        pct = action.get("window_pct", 30)
        screen_pct = action.get("screen_pct", 0)
        # 更新房间偏好（指数移动平均）
        alpha = 0.2
        if room_type in self.preference.room_preferences:
            old = self.preference.room_preferences[room_type]
            self.preference.room_preferences[room_type] = old * (1 - alpha) + pct * alpha
        # 更新时段偏好
        if 22 <= time_hour or time_hour < 6:
            self.preference.night_max_pct = self.preference.night_max_pct * 0.8 + pct * 0.2
        # 添加/更新记忆条目
        now_ts = time.time()
        scene_key = f"{room_type}_{MemoryStore._get_time_period(time_hour)}"
        entry = MemoryEntry(
            scene_key=scene_key,
            window_pct=float(pct),
            screen_pct=float(screen_pct),
            room_type=room_type,
            time_hour=time_hour,
            opt_strength=1.0,
            last_used_ts=now_ts,
            created_ts=now_ts,
        )
        self.memory_store.add_memory(entry)
        # 定期衰减
        self.memory_store.decay_all(now_ts)
        # 记录
        self._record_feedback("accept", action, room_type, time_hour)

    def on_reject(self, action: Dict, room_type: str, time_hour: int):
        """用户拒绝推荐"""
        self.preference.reject_count += 1
        pct = action.get("window_pct", 30)
        # 拒绝意味着用户不想要这个开度，下次推荐更保守
        if room_type in self.preference.room_preferences:
            old = self.preference.room_preferences[room_type]
            self.preference.room_preferences[room_type] = old * 0.9  # 缩小 10%
        self._record_feedback("reject", action, room_type, time_hour)

    def on_modify(self, original_action: Dict, modified_pct: float, room_type: str, time_hour: int):
        """用户修改了推荐参数"""
        self.preference.modify_count += 1
        alpha = 0.3  # 修改权重更高
        if room_type in self.preference.room_preferences:
            old = self.preference.room_preferences[room_type]
            self.preference.room_preferences[room_type] = old * (1 - alpha) + modified_pct * alpha
        self._record_feedback("modify", {"original": original_action, "modified_pct": modified_pct}, room_type, time_hour)

    def get_preferred_pct(self, room_type: str, time_hour: int) -> float:
        """
        获取当前偏好开窗百分比。
        优先使用记忆条目（如果有相关且强度足够的记忆），否则回退到EMA房间偏好。
        """
        # 尝试从记忆中获取
        relevant_memories = self.memory_store.get_relevant(room_type, time_hour)
        if relevant_memories:
            # 使用强度加权平均
            total_weight = 0.0
            weighted_pct = 0.0
            for entry in relevant_memories:
                strength = entry.calc_memory_strength()
                if strength >= 0.1:
                    weighted_pct += entry.window_pct * strength
                    total_weight += strength
            if total_weight > 0:
                memory_pct = weighted_pct / total_weight
                # 夜间限制仍然生效
                if 22 <= time_hour or time_hour < 6:
                    memory_pct = min(memory_pct, self.preference.night_max_pct)
                return round(memory_pct, 1)

        # 回退到EMA房间偏好
        base = self.preference.room_preferences.get(room_type, 30.0)
        if 22 <= time_hour or time_hour < 6:
            base = min(base, self.preference.night_max_pct)
        return round(base, 1)

    def get_confidence(self) -> float:
        """获取偏好置信度（数据越多越高）"""
        total = self.preference.accept_count + self.preference.reject_count + self.preference.modify_count
        if total == 0:
            return 0.0
        return min(1.0, total / 20)  # 20次反馈达到满置信

    def to_dict(self) -> Dict:
        """序列化偏好（用于前端展示）"""
        return {
            "preferred_pct": self.preference.preferred_open_pct,
            "accept_rate": self.preference.accept_count / max(1, self.preference.accept_count + self.preference.reject_count),
            "room_prefs": self.preference.room_preferences,
            "night_max": self.preference.night_max_pct,
            "confidence": self.get_confidence(),
            "total_feedback": self.preference.accept_count + self.preference.reject_count + self.preference.modify_count,
            "memories": self.memory_store.to_list(),
        }

    def _record_feedback(self, action_type: str, action: Dict, room_type: str, time_hour: int):
        self.preference.recent_feedback.insert(0, {
            "type": action_type,
            "action": action,
            "room": room_type,
            "hour": time_hour,
            "ts": time.time(),
        })
        if len(self.preference.recent_feedback) > 50:
            self.preference.recent_feedback.pop()
