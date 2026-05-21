"""
AI-1 意图理解 (Intent Understanding)
把用户自然语言变成结构化意图
位置：行为树之前
输入：用户语音/文本
输出：{intent, room, target_percent, screen_action, confidence}
不能做：不能越过规则直接控硬件
"""
import json
from typing import Optional, Dict
from ai.client import MiniMaxClient

INTENT_SYSTEM_PROMPT = """你是智能门窗 NLP 解析器。
用户会用自然语言表达对窗户/纱窗的控制意图。
你需要解析出结构化 JSON。

可能的 intent：
- open: 开窗
- close: 关窗
- stop: 停止
- ventilate: 通风（开窗+纱窗）
- screen_down: 放下纱窗
- screen_up: 收起纱窗
- query: 查询状态
- unknown: 无法识别

输出严格 JSON，不要多余文字：
{"intent": "open", "room": "bedroom", "target_percent": 50, "screen_action": "down", "confidence": 0.9}

如果用户没有明确说百分比，根据语义推断：
- "开一点/微开" → 10-15%
- "开窗通风" → 30%
- "大开" → 70-80%
- "全开" → 100%
- 没说具体 → null（由系统决定）"""


class IntentParser:
    """AI-1: 意图理解"""

    def __init__(self, client: MiniMaxClient):
        self.client = client

    def parse(self, user_text: str, room_list: list = None) -> Optional[Dict]:
        """
        解析用户自然语言为结构化意图
        返回: {intent, room, target_percent, screen_action, confidence}
        """
        context = f"可用房间: {', '.join(room_list)}" if room_list else ""
        user_msg = f"{context}\n用户说: \"{user_text}\""

        content = self.client.chat(INTENT_SYSTEM_PROMPT, user_msg)
        if not content:
            return None
        try:
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            result = json.loads(content.strip())
            # 校验
            result["confidence"] = min(1.0, max(0.0, float(result.get("confidence", 0.5))))
            if result.get("target_percent") is not None:
                result["target_percent"] = max(0, min(100, int(result["target_percent"])))
            return result
        except (json.JSONDecodeError, KeyError, TypeError):
            return None

    def parse_fallback(self, user_text: str) -> Dict:
        """规则兜底解析 — 支持数字提取和丰富语义"""
        import re
        text = user_text
        intent = "unknown"
        target = None
        room = None

        # 提取数字百分比（"开窗70%" "开到50" "30%"）
        num_match = re.search(r'(\d+)\s*[%％]?', text)
        extracted_num = int(num_match.group(1)) if num_match else None
        if extracted_num and extracted_num > 100:
            extracted_num = None  # 排除非百分比数字如CO₂值

        # 房间识别
        room_map = {"卧室": "bedroom", "儿童房": "child_room", "小孩": "child_room",
                    "老人": "elderly_room", "书房": "study", "客厅": "living_room"}
        for keyword, room_id in room_map.items():
            if keyword in text:
                room = room_id
                break

        # 意图识别
        if "关" in text and "窗" in text:
            intent = "close"
            target = 0
        elif "停" in text or "别动" in text:
            intent = "stop"
        elif "开" in text or "通风" in text or "透气" in text or "闷" in text or "热" in text:
            intent = "open"
            if extracted_num and 0 < extracted_num <= 100:
                target = extracted_num
            elif "大" in text or "全开" in text or "最大" in text:
                target = 80
            elif "一点" in text or "微" in text or "小" in text or "别开太大" in text:
                target = 10
            elif "一半" in text or "半" in text:
                target = 50
            else:
                target = 30  # 默认
        elif "纱窗" in text and ("放" in text or "下" in text):
            intent = "screen_down"
        elif "纱窗" in text and ("收" in text or "上" in text):
            intent = "screen_up"
        elif "关" in text:
            intent = "close"
            target = 0

        confidence = 0.8 if extracted_num else (0.6 if intent != "unknown" else 0.2)
        return {"intent": intent, "room": room, "target_percent": target, "screen_action": None, "confidence": confidence}
