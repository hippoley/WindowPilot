"""
AI-4 解释生成 (Explanation Generation)
生成用户能看懂的推荐理由（1-2句）
位置：P7 推荐解释节点
输入：状态 / 限制 / 最终动作
输出：推荐理由文案
不能做：不改动作边界
"""
from typing import Optional
from ai.client import MiniMaxClient
from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot

EXPLAIN_SYSTEM_PROMPT = """你是智能门窗解释器。
根据当前环境状态和最终推荐动作，生成一句简洁的推荐理由。

要求：
1. 只输出1-2句话，不超过40字
2. 用口语化中文，像管家一样温和
3. 说明"为什么"和"做什么"
4. 不要技术术语
5. 不要额外推测

示例：
- "室内有点闷，建议微开窗通风10分钟。"
- "外面下雨了，已帮您关好窗户。"
- "儿童房空气不太好，建议开一点窗，需要您确认。"
"""


class Explainer:
    """AI-4: 解释生成"""

    def __init__(self, client: MiniMaxClient):
        self.client = client

    def explain(self, tm: ThingModel, snapshot: ContextSnapshot, action: dict) -> str:
        """生成推荐理由"""
        user_msg = (
            f"当前状态: {', '.join(snapshot.tags[:6])}\n"
            f"房间: {tm.room_type}, 时间: {tm.time_hour}:00\n"
            f"推荐动作: 窗户→{action.get('window_pct', 0)}%, 纱窗→{action.get('screen_pct', 100)}%"
            f"{', 通风' + str(action.get('duration_min')) + '分钟' if action.get('duration_min') else ''}\n"
            f"需要确认: {'是' if action.get('needs_confirm') else '否'}\n"
            f"请生成推荐理由（1句话）:"
        )

        content = self.client.chat(EXPLAIN_SYSTEM_PROMPT, user_msg)
        if content and len(content) < 100:
            return content.strip().strip('"').strip("'")

        # LLM 失败，规则兜底
        return self._rule_explain(tm, snapshot, action)

    def _rule_explain(self, tm: ThingModel, snapshot: ContextSnapshot, action: dict) -> str:
        """规则兜底解释"""
        tags = snapshot.tags
        pct = action.get("window_pct", 0)

        if "RAIN" in str(tags) and pct == 0:
            return "检测到降雨，已关窗保护。"
        if "STRONG_WIND" in tags and pct == 0:
            return "风力较大，已关窗保护。"
        if "CO2_VERY_HIGH" in tags or "CO2_HIGH" in tags:
            return f"室内空气偏闷，建议开窗{pct}%通风换气。"
        if "HUMIDITY_HIGH" in tags:
            return f"湿度偏高，建议开窗{pct}%通风除湿。"
        if "INDOOR_HOT_OUTDOOR_COOL" in tags:
            return f"室内偏热，室外凉爽，建议开窗{pct}%自然降温。"
        if "CHILD_ROOM_HIGH_SAFETY" in tags:
            return f"儿童房安全限制，建议微开{pct}%，需您确认。"
        if pct == 0:
            return "当前环境建议关窗。"
        return f"建议开窗{pct}%通风。"
