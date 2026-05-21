"""
AI-5 习惯学习 (Habit Learning)
从用户反馈中学习偏好
位置：用户反馈之后
输入：采纳/拒绝/改参/执行结果
输出：用户偏好记忆强度更新
不能做：不能覆盖安全规则
"""
from typing import Dict, List, Optional
from dataclasses import dataclass, field
import time


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

    def on_accept(self, action: Dict, room_type: str, time_hour: int):
        """用户接受推荐"""
        self.preference.accept_count += 1
        pct = action.get("window_pct", 30)
        # 更新房间偏好（指数移动平均）
        alpha = 0.2
        if room_type in self.preference.room_preferences:
            old = self.preference.room_preferences[room_type]
            self.preference.room_preferences[room_type] = old * (1 - alpha) + pct * alpha
        # 更新时段偏好
        if 22 <= time_hour or time_hour < 6:
            self.preference.night_max_pct = self.preference.night_max_pct * 0.8 + pct * 0.2
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
        """获取当前偏好开窗百分比"""
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
