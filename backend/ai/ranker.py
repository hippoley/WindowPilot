"""
AI-3 候选排序 (Candidate Ranking)
给多个候选方案打分排序
位置：候选生成之后
输入：候选动作 + 环境收益 + 用户偏好 + 房间风险
输出：Utility Score 排序列表
不能做：硬安全仍由 Policy Gate 控制
"""
from typing import List, Dict
from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot
from domain.capability import DeviceCapability


class CandidateRanker:
    """AI-3: 候选排序（基于 Utility Score）"""

    def rank(self, candidates: List[Dict], tm: ThingModel, snapshot: ContextSnapshot, cap: DeviceCapability) -> List[Dict]:
        """
        给候选方案打分排序
        每个 candidate: {window_pct, screen_pct, duration_min, needs_confirm}
        返回带 score 的排序列表
        """
        if not candidates:
            return []

        scored = []
        for item in candidates:
            cand = item.get("candidate", item)
            score = self._compute_utility(cand, tm, snapshot, cap)
            scored.append({**item, "score": round(score, 3)})

        scored.sort(key=lambda x: -x["score"])
        return scored

    def _compute_utility(self, cand: Dict, tm: ThingModel, snapshot: ContextSnapshot, cap: DeviceCapability) -> float:
        """
        多目标打分：
        score = benefit + user_fit + feasibility - risk - disturbance - complexity
        """
        tags = snapshot.tags
        window_pct = cand.get("window_pct", 0)

        # 收益分（解决当前需求的程度）
        benefit = 0.0
        if "CO2_HIGH" in tags or "CO2_VERY_HIGH" in tags:
            # CO₂ 高时，开窗越大收益越高（但有上限）
            benefit += min(0.4, window_pct / 100 * 0.5)
        if "HUMIDITY_HIGH" in tags:
            benefit += min(0.3, window_pct / 100 * 0.4)
        if "INDOOR_HOT_OUTDOOR_COOL" in tags:
            benefit += min(0.3, window_pct / 100 * 0.4)
        if window_pct == 0 and ("RAIN" in str(tags) or "STRONG_WIND" in tags):
            benefit += 0.5  # 关窗在危险时收益高

        # 用户适配分（基于模式偏好）
        user_fit = 0.0
        if tm.mode == "ventilation_first":
            user_fit += window_pct / 100 * 0.3  # 通风优先偏好大开
        elif tm.mode == "safety_first":
            user_fit += (100 - window_pct) / 100 * 0.3  # 安全优先偏好小开
        elif tm.mode == "wind_protect":
            user_fit += 0.2 if window_pct <= 30 else 0.0

        # 可行性分
        feasibility = 0.3 if window_pct <= 50 else 0.1  # 小开度更容易执行

        # 风险扣分
        risk = 0.0
        if "CHILD_ROOM_HIGH_SAFETY" in tags and window_pct > 10:
            risk += 0.4
        if "ELDERLY_ROOM_PROTECTION" in tags and window_pct > 30:
            risk += 0.3
        if "RAIN" in str(tags) and window_pct > 15:
            risk += 0.3
        if "STRONG_WIND" in tags and window_pct > 0:
            risk += 0.5

        # 打扰扣分
        disturbance = 0.0
        if "NIGHT_TIME" in tags and window_pct > 20:
            disturbance += 0.2
        if cand.get("needs_confirm", False):
            disturbance += 0.1  # 需要确认稍微扣分

        # 复杂度扣分
        complexity = 0.05 if cand.get("duration_min") else 0.0

        score = benefit + user_fit + feasibility - risk - disturbance - complexity
        return max(0.0, min(1.0, score))
