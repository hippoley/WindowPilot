"""
设备物模型 (Thing Model)
所有可观测/可控制的字段，纯数据，不含业务逻辑
"""
import time as _time
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List


@dataclass
class ThingModel:
    """完整设备状态 — 唯一真相源"""

    # ── 窗户物理状态 ──
    window_open_pct: float = 0.0
    window_target_pct: float = 0.0
    # closed/opening/open_partial/open_full/closing/stopped/blocked/locked/calibrating/error
    window_state: str = "closed"
    window_motion: str = "stopped"        # stopped/opening/closing

    # ── 推窗器 ──
    # idle/extending/retracting/holding/stalled/overheated/error
    actuator_state: str = "idle"
    actuator_stroke_mm: float = 0.0
    actuator_target_mm: float = 0.0
    actuator_current_ma: float = 120.0    # mA
    actuator_temp_c: float = 36.0
    actuator_runtime_ms: float = 0.0

    # ── 纱窗 ──
    screen_position_pct: float = 0.0      # 0=收起, 100=全放下
    screen_target_pct: float = 0.0
    screen_motion: str = "stopped"        # stopped/rolling_down/rolling_up/blocked
    screen_blocked: bool = False

    # ── 传感器（每个字段配对时间戳，防止陈旧数据驱动决策）──
    rain_detected: bool = False
    rain_level: str = "dry"               # dry/light/moderate/heavy/storm
    rain_ts: float = 0.0

    voc_mg: float = 0.0
    voc_ts: float = 0.0

    co2_ppm: float = 400.0
    co2_ts: float = 0.0

    temp_indoor_c: float = 26.0
    temp_outdoor_c: float = 20.0
    temp_ts: float = 0.0

    humidity_pct: float = 50.0
    humidity_ts: float = 0.0

    wind_speed_ms: float = 0.0
    wind_level: int = 0
    wind_ts: float = 0.0
    wind_direction: str = ""              # N/S/E/W/NE/NW/SE/SW（风向，风从哪里来）

    lux: float = 0.0                      # 光照强度（勒克斯）
    lux_ts: float = 0.0

    human_detected: bool = False
    human_ts: float = 0.0

    noise_db: float = 40.0
    noise_ts: float = 0.0

    aqi: float = 50.0
    aqi_ts: float = 0.0

    # ── 天气预报（云端推送，非本地传感器）──
    forecast_rain_prob: float = 0.0       # 未来1小时降水概率 0-1
    forecast_rain_prob_ts: float = 0.0
    pressure_hpa: float = 1013.0          # 当前气压 hPa
    pressure_trend: str = "stable"        # rising/stable/falling/plunging
    pressure_ts: float = 0.0

    # ── 设备配置/状态 ──
    room_type: str = "bedroom"
    orientation: str = "S"                # 窗朝向：N/S/E/W/NE/NW/SE/SW

    # ── 用户画像 ──
    user_profile: str = "default"         # default/allergy/pet_owner/has_baby/elderly_solo/smoker
    has_pets: bool = False                 # 养宠物（猫/狗防坠落）
    has_allergy: bool = False             # 过敏体质（花粉/粉尘敏感）

    time_hour: int = 12
    mode: str = "ventilation_first"       # ventilation_first/wind_protect/safety_first
    calibrated: bool = True
    clutch_locked: bool = False
    power_stable: bool = True

    # ── 控制 ──
    user_command: Optional[Dict[str, Any]] = None
    # source: app | voice | button | manual_override | ai_confirmed
    # action: open_to | stop | screen_to
    # target_pct: 0-100

    # ── AI ──
    ai_recommendation: Optional[Dict[str, Any]] = None
    ai_recommendations: Optional[List[Dict[str, Any]]] = None  # 多条推荐列表（最多6条）
    recommendation_card: Optional[Dict[str, Any]] = None

    # ── 安防系统 ──
    security_mode: bool = False           # 安防模式开启
    auto_security_night: bool = True      # 夜间自动布防
    security_armed_ts: float = 0.0        # 布防时间戳
    alarm_triggered: bool = False         # 报警触发
    alarm_reason: str = ""                # 报警原因: tamper/forced_open
    alarm_ts: float = 0.0                 # 报警时间戳

    # ── 行为树运行时元数据（不属于设备状态，仅用于推送和调试）──
    bt_active_branch: str = "Idle"
    bt_result: str = "success"
    bt_tick: int = 0

    # 传感器数据有效期（秒），超时视为陈旧
    SENSOR_STALE_SEC: float = field(default=120.0, init=False, repr=False, compare=False)

    def is_sensor_fresh(self, ts: float) -> bool:
        """判断传感器数据是否在有效期内（ts=0 表示未设置，视为有效）"""
        if ts == 0.0:
            return True
        return (_time.time() - ts) < self.SENSOR_STALE_SEC

    def to_dict(self) -> dict:
        """序列化为 dict（用于 WebSocket 推送）"""
        return {
            "window": {
                "open_pct": round(self.window_open_pct, 1),
                "target_pct": round(self.window_target_pct, 1),
                "state": self.window_state,
                "motion": self.window_motion,
            },
            "actuator": {
                "state": self.actuator_state,
                "stroke_mm": round(self.actuator_stroke_mm, 1),
                "target_mm": round(self.actuator_target_mm, 1),
                "current_ma": round(self.actuator_current_ma),
                "temp_c": round(self.actuator_temp_c, 1),
            },
            "screen": {
                "position_pct": round(self.screen_position_pct, 1),
                "target_pct": round(self.screen_target_pct, 1),
                "motion": self.screen_motion,
            },
            "sensors": {
                "rain": self.rain_detected,
                "rain_level": self.rain_level,
                "voc_mg": self.voc_mg,
                "co2_ppm": self.co2_ppm,
                "temp_indoor": self.temp_indoor_c,
                "temp_outdoor": self.temp_outdoor_c,
                "humidity": self.humidity_pct,
                "wind_speed": self.wind_speed_ms,
                "wind_level": self.wind_level,
                "lux": self.lux,
                "human": self.human_detected,
                "noise_db": self.noise_db,
                "aqi": self.aqi,
                "forecast_rain_prob": self.forecast_rain_prob,
                "pressure_hpa": self.pressure_hpa,
            },
            "config": {
                "room_type": self.room_type,
                "orientation": self.orientation,
                "time_hour": self.time_hour,
                "mode": self.mode,
                "calibrated": self.calibrated,
                "user_profile": self.user_profile,
                "has_pets": self.has_pets,
                "has_allergy": self.has_allergy,
            },
            "control": {
                "user_command": self.user_command,
                "bt_branch": self.bt_active_branch,
                "bt_result": self.bt_result,
            },
            "security": {
                "mode": self.security_mode,
                "auto_night": self.auto_security_night,
                "alarm": self.alarm_triggered,
                "alarm_reason": self.alarm_reason,
            },
            "ai": {
                "recommendation": self.ai_recommendation,
                "recommendations": self.ai_recommendations or [],
                "card": self.recommendation_card,
            },
        }
