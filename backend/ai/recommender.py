"""
AI 推荐器 + 解释器
可降级：AI 不可用时使用规则兜底
"""
import json
from typing import Optional, Dict, Any
from ai.client import MiniMaxClient
from domain.context_snapshot import ContextSnapshot
from domain.capability import DeviceCapability
from domain.thing_model import ThingModel


RECOMMENDER_SYSTEM = """你是智能窗纱系统的AI决策助手。根据当前环境语义状态，生成窗户控制建议。

规则约束（不可违反）：
1. 有 RAIN_HEAVY/RAIN_STORM/STRONG_WIND → 必须建议关窗(0%)
2. CHILD_ROOM_HIGH_SAFETY → 最大开窗不超过10%，必须 needs_confirm=true
3. ELDERLY_ROOM_PROTECTION + INDOOR_COLD/OUTDOOR_FREEZING → 建议关窗
4. VOC_SPIKE → 建议关窗
5. CO2_HIGH/CO2_VERY_HIGH → 建议通风（开窗+纱窗）
6. NOISE_HIGH + STUDY_ROOM → 建议关窗

输出严格 JSON：
{"window_pct": 0-100, "screen_pct": 0-100, "title": "4-8字标题", "reason": "一句话理由20字内", "needs_confirm": bool, "duration_min": 数字或null}"""


class AIRecommender:
    def __init__(self, client: MiniMaxClient):
        self.client = client

    def generate(self, tm: ThingModel, snapshot: ContextSnapshot, cap: DeviceCapability) -> Optional[Dict[str, Any]]:
        """生成 AI 推荐，失败时返回 None（由 fallback 处理）"""
        user_msg = (
            f"语义标签: {', '.join(snapshot.tags)}\n"
            f"风险等级: {snapshot.risk_level}\n"
            f"房间: {tm.room_type}, 时间: {tm.time_hour}:00, 模式: {tm.mode}\n"
            f"CO₂: {tm.co2_ppm}ppm, 温度: {tm.temp_indoor_c}°C(室内)/{tm.temp_outdoor_c}°C(室外)\n"
            f"湿度: {tm.humidity_pct}%, 风速: {tm.wind_speed_ms}m/s, 噪声: {tm.noise_db}dB\n"
            f"窗户当前: {tm.window_open_pct:.0f}%, 纱窗: {tm.screen_position_pct:.0f}%\n"
            f"设备能力: 最大行程{cap.max_stroke_mm}mm, 窗纱干涉={cap.has_screen_interference}\n"
            f"请给出建议："
        )
        content = self.client.chat(RECOMMENDER_SYSTEM, user_msg)
        if not content:
            return None
        try:
            # 提取 JSON
            if "```" in content:
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            rec = json.loads(content.strip())
            # 安全校验
            rec["window_pct"] = max(0, min(100, int(rec.get("window_pct", 30))))
            rec["screen_pct"] = max(0, min(100, int(rec.get("screen_pct", 100))))
            rec["needs_confirm"] = rec.get("needs_confirm", True)
            # 房间约束
            if "CHILD_ROOM_HIGH_SAFETY" in snapshot.tags:
                rec["window_pct"] = min(rec["window_pct"], 10)
                rec["needs_confirm"] = True
            return rec
        except (json.JSONDecodeError, KeyError, TypeError):
            return None


class RuleFallback:
    """规则兜底推荐器"""

    def generate(self, tm: ThingModel, snapshot: ContextSnapshot, cap: DeviceCapability) -> Optional[Dict[str, Any]]:
        tags = snapshot.tags
        # 危险 → 关窗
        if snapshot.risk_level == "danger":
            return {"window_pct": 0, "screen_pct": tm.screen_position_pct,
                    "title": "安全关窗", "reason": "检测到危险条件，建议关窗",
                    "needs_confirm": False, "duration_min": None}
        # CO₂ 高
        if "CO2_VERY_HIGH" in tags or "CO2_HIGH" in tags:
            pct = max(10, min(50, int((tm.co2_ppm - 800) / 15)))  # 800→10%, 1550→50%
            if "CHILD_ROOM_HIGH_SAFETY" in tags:
                pct = min(pct, 10)
            return {"window_pct": pct, "screen_pct": 100,
                    "title": "建议通风", "reason": f"CO₂ {tm.co2_ppm:.0f}ppm，建议开窗{pct}%",
                    "needs_confirm": "CHILD_ROOM_HIGH_SAFETY" in tags,
                    "duration_min": 15}
        # 湿度高
        if "HUMIDITY_HIGH" in tags:
            return {"window_pct": 20, "screen_pct": 100,
                    "title": "除湿通风", "reason": f"湿度{tm.humidity_pct:.0f}%偏高",
                    "needs_confirm": False, "duration_min": 10}
        # 室内热
        if "INDOOR_HOT_OUTDOOR_COOL" in tags:
            return {"window_pct": 40, "screen_pct": 100,
                    "title": "自然降温", "reason": f"室内{tm.temp_indoor_c}°C，室外凉爽",
                    "needs_confirm": False, "duration_min": 20}
        return None
