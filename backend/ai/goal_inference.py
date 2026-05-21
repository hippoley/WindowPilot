"""
AI-2 室内需求识别 (Goal / Need Inference)
把世界状态转换为结构化的需求目标
位置：P4 室内需求识别
输入：world_state 摘要 (VOC/温湿度/时段/房间/天气边界)
输出：{primary_goal, secondary_goal, conflict, recommendation_intent, confidence}
不能做：只识别目标和冲突，不决定最终动作
"""
import json
from typing import Optional, Dict
from ai.client import MiniMaxClient
from domain.thing_model import ThingModel
from domain.context_snapshot import ContextSnapshot

GOAL_SYSTEM_PROMPT = """你是智能门窗室内需求识别器。
根据当前世界状态，识别室内的主要需求、次要需求和冲突条件。

只输出 JSON，不要其他文字：
{"primary_goal": "目标", "secondary_goal": "目标或null", "conflict": "冲突描述或null", "recommendation_intent": "受控通风/大开通风/关窗保护/密闭净化/无需操作", "confidence": 0.0-1.0}

可选的 goal 值：
- improve_air_quality (改善空气)
- reduce_humidity (除湿)
- cool_down (降温)
- keep_warm (保暖)
- reduce_noise (降噪)
- child_comfort (儿童舒适)
- elderly_comfort (老人舒适)
- none (无需求)"""


class GoalInference:
    """AI-2: 室内需求识别"""

    def __init__(self, client: MiniMaxClient = None):
        self.client = client

    def infer(self, tm: ThingModel, snapshot: ContextSnapshot) -> Dict:
        """从世界状态推断当前需求目标"""
        # 尝试 LLM
        if self.client:
            result = self._llm_infer(tm, snapshot)
            if result:
                return result
        # 规则兜底
        return self._rule_infer(tm, snapshot)

    def _llm_infer(self, tm: ThingModel, snapshot: ContextSnapshot) -> Optional[Dict]:
        user_msg = (
            f"语义标签: {', '.join(snapshot.tags)}\n"
            f"房间: {tm.room_type}, 时间: {tm.time_hour}:00\n"
            f"CO₂: {tm.co2_ppm}ppm, VOC: {tm.voc_mg}mg\n"
            f"温度: 室内{tm.temp_indoor_c}°C / 室外{tm.temp_outdoor_c}°C\n"
            f"湿度: {tm.humidity_pct}%, 风速: {tm.wind_speed_ms}m/s\n"
            f"降雨: {tm.rain_detected} ({tm.rain_level})\n"
            f"风险等级: {snapshot.risk_level}"
        )
        content = self.client.chat(GOAL_SYSTEM_PROMPT, user_msg)
        if content:
            try:
                if "```" in content:
                    content = content.split("```")[1].lstrip("json")
                return json.loads(content.strip())
            except (json.JSONDecodeError, IndexError):
                pass
        return None

    def _rule_infer(self, tm: ThingModel, snapshot: ContextSnapshot) -> Dict:
        """规则兜底推断"""
        tags = snapshot.tags
        primary = "none"
        secondary = None
        conflict = None
        intent = "无需操作"

        # 空气质量
        if "CO2_VERY_HIGH" in tags or "CO2_HIGH" in tags or "VOC_SPIKE" in tags:
            primary = "improve_air_quality"
            intent = "受控通风"
            if "RAIN" in str(tags) or "STRONG_WIND" in tags:
                conflict = "need_ventilation_but_rain_or_wind"
                intent = "受控通风"
            if "CHILD_ROOM_HIGH_SAFETY" in tags:
                secondary = "child_comfort"
                conflict = (conflict or "") + "_and_child_safety"

        # 湿度
        elif "HUMIDITY_HIGH" in tags:
            primary = "reduce_humidity"
            intent = "受控通风"

        # 温度
        elif "INDOOR_HOT_OUTDOOR_COOL" in tags:
            primary = "cool_down"
            intent = "大开通风"
            if "NIGHT_TIME" in tags:
                intent = "受控通风"

        # 低温
        elif "INDOOR_COLD" in tags or "OUTDOOR_FREEZING" in tags:
            primary = "keep_warm"
            intent = "关窗保护"

        # 噪声
        elif "NOISE_HIGH" in tags:
            primary = "reduce_noise"
            intent = "关窗保护"

        # 房间特殊
        if "ELDERLY_ROOM_PROTECTION" in tags and primary == "none":
            secondary = "elderly_comfort"

        confidence = 0.7 if primary != "none" else 0.3

        return {
            "primary_goal": primary,
            "secondary_goal": secondary,
            "conflict": conflict,
            "recommendation_intent": intent,
            "confidence": confidence,
        }
