"""
语义状态快照 (Context Snapshot)
把零散 IoT 字段变成 AI 能理解的"当前局面"
"""
from dataclasses import dataclass, field
from typing import List
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability

# 西晒朝向：下午阳光直射
_WEST_FACING = {"W", "SW", "NW"}
# 南风/东南风/西南风（回南天关窗相关）
_SOUTH_WINDS = {"S", "SE", "SW"}


@dataclass
class ContextSnapshot:
    """语义状态"""
    tags: List[str] = field(default_factory=list)
    summary: str = ""
    risk_level: str = "safe"  # safe/caution/danger

    @classmethod
    def from_thing_model(cls, tm: ThingModel, cap: DeviceCapability) -> "ContextSnapshot":
        tags = []
        risk = "safe"

        # ── 天气/降雨 ──
        if tm.rain_detected and tm.is_sensor_fresh(tm.rain_ts):
            level_map = {"light": "RAIN_LIGHT", "moderate": "RAIN_MODERATE",
                         "heavy": "RAIN_HEAVY", "storm": "RAIN_STORM"}
            tags.append(level_map.get(tm.rain_level, "RAIN_NOW"))
            risk = "danger" if tm.rain_level in ("heavy", "storm") else "caution"

        # ── 风 ──
        if tm.is_sensor_fresh(tm.wind_ts):
            if tm.wind_level >= 6 or tm.wind_speed_ms >= 10.8:
                tags.append("STRONG_WIND")
                risk = "danger"
            elif tm.wind_speed_ms >= 5:
                tags.append("MODERATE_WIND")

        # ── 回南天：高湿 + 南向风 ──
        if (tm.humidity_pct > 80
                and tm.orientation.upper() in _SOUTH_WINDS
                and tm.is_sensor_fresh(tm.humidity_ts)):
            tags.append("BACK_SOUTH_WIND")
            risk = max(risk, "caution", key=["safe", "caution", "danger"].index)

        # ── 空气质量 ──
        if tm.is_sensor_fresh(tm.aqi_ts):
            if tm.aqi > 200:
                tags.append("AQI_DANGEROUS")
                risk = "danger"
            elif tm.aqi > 100:
                tags.append("AQI_POOR")

        if tm.is_sensor_fresh(tm.co2_ts):
            if tm.co2_ppm > 1200:
                tags.append("CO2_VERY_HIGH")
            elif tm.co2_ppm > 800:
                tags.append("CO2_HIGH")

        if tm.voc_mg >= 0.6 and tm.is_sensor_fresh(tm.voc_ts):
            tags.append("VOC_SPIKE")
            risk = max(risk, "caution", key=["safe", "caution", "danger"].index)

        # ── 温湿度 ──
        if tm.is_sensor_fresh(tm.humidity_ts):
            if tm.humidity_pct > 70:
                tags.append("HUMIDITY_HIGH")
        if tm.is_sensor_fresh(tm.temp_ts):
            if tm.temp_indoor_c > 28 and tm.temp_outdoor_c < tm.temp_indoor_c - 3:
                tags.append("INDOOR_HOT_OUTDOOR_COOL")
            if tm.temp_indoor_c < 18:
                tags.append("INDOOR_COLD")
            if tm.temp_outdoor_c < 5:
                tags.append("OUTDOOR_FREEZING")

        # ── 光照 ──
        if tm.is_sensor_fresh(tm.lux_ts):
            if tm.lux > 50000:
                tags.append("STRONG_SUNLIGHT")
            elif tm.lux > 10000:
                tags.append("BRIGHT_LIGHT")
        # 西晒：下午 + 西向窗 + 有光照
        if (tm.orientation.upper() in _WEST_FACING
                and 13 <= tm.time_hour <= 18
                and tm.lux > 10000):
            tags.append("WEST_SUN_GLARE")

        # ── 人员 ──
        if tm.human_detected and tm.is_sensor_fresh(tm.human_ts):
            tags.append("HUMAN_PRESENT")

        # ── 噪声 ──
        if tm.noise_db > 65 and tm.is_sensor_fresh(tm.noise_ts):
            tags.append("NOISE_HIGH")

        # ── 安全 ──
        if tm.actuator_current_ma > 800:
            tags.append("MOTOR_OVERLOAD")
            risk = "danger"
        if tm.actuator_temp_c > 55:
            tags.append("MOTOR_HOT")

        # ── 房间 ──
        room_map = {
            "child_room":   "CHILD_ROOM_HIGH_SAFETY",
            "elderly_room": "ELDERLY_ROOM_PROTECTION",
            "bedroom":      "BEDROOM",
            "study":        "STUDY_ROOM",
            "living_room":  "LIVING_ROOM",
        }
        if tm.room_type in room_map:
            tags.append(room_map[tm.room_type])

        # ── 时段 ──
        if 22 <= tm.time_hour or tm.time_hour < 6:
            tags.append("NIGHT_TIME")
        elif 6 <= tm.time_hour < 9:
            tags.append("MORNING")
        elif 13 <= tm.time_hour <= 18:
            tags.append("AFTERNOON")

        # ── 设备 ──
        if tm.calibrated and not tm.clutch_locked:
            tags.append("DEVICE_READY")
        else:
            tags.append("DEVICE_NOT_READY")

        # ── 模式 ──
        tags.append(f"MODE_{tm.mode.upper()}")

        # ── 窗纱干涉 ──
        if cap.has_screen_interference:
            tags.append("SCREEN_INTERFERENCE")

        # ── 需要确认 ──
        if tm.room_type == "child_room":
            tags.append("CONFIRM_REQUIRED")

        summary = f"{tm.room_type}({tm.orientation}) {tm.time_hour}:00 | " + ", ".join(tags[:6])
        return cls(tags=tags, summary=summary, risk_level=risk)
