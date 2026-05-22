"""
行为树条件节点
每个条件只做判断，返回 SUCCESS(条件成立) 或 FAILURE(不成立)
所有阈值从配置文件读取，不写死在代码里
"""
import py_trees
import yaml
from pathlib import Path
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.decision_trace import DecisionTraceLog

_rules_path = Path(__file__).parent.parent / "config" / "safety_rules.yaml"
with open(_rules_path) as f:
    RULES = yaml.safe_load(f)

_room_path = Path(__file__).parent.parent / "config" / "room_strategies.yaml"
with open(_room_path) as f:
    ROOMS = yaml.safe_load(f)


def _cond(name, fn):
    """条件节点工厂：fn(tm, cap) -> bool，trace 参数接收但不使用"""
    class _C(py_trees.behaviour.Behaviour):
        def __init__(self, tm: ThingModel, cap: DeviceCapability,
                     trace: DecisionTraceLog = None):
            super().__init__(name)
            self.tm = tm
            self.cap = cap
        def update(self):
            return (py_trees.common.Status.SUCCESS
                    if fn(self.tm, self.cap)
                    else py_trees.common.Status.FAILURE)
    _C.__name__ = f"Cond_{name}"
    return _C


# ═══ P0 紧急保护 ═══
p0 = RULES["safety"]["p0_emergency"]
IsObstacle     = _cond("遇阻/防夹?",  lambda tm, _: tm.actuator_current_ma > p0["obstacle_current_ma"])
IsMotorOverheat = _cond("电机过热?",  lambda tm, _: tm.actuator_temp_c > p0["motor_max_temp_c"])
IsStalled      = _cond("电机堵转?",   lambda tm, _: tm.actuator_state == "stalled")

# ═══ P1 本地传感器安全 ═══
p1 = RULES["safety"]["p1_local_sensor"]
IsRainDetected = _cond("雨水检测?",
    lambda tm, _: tm.rain_detected and tm.is_sensor_fresh(tm.rain_ts))
IsVOCSpike     = _cond("VOC突变?",
    lambda tm, _: tm.voc_mg >= float(p1["voc_threshold_mg"]) and tm.is_sensor_fresh(tm.voc_ts))

# ═══ P2 天气预报 ═══
p2 = RULES["safety"]["p2_weather"]
IsStormWind    = _cond("暴风>=6级?",
    lambda tm, _: (tm.wind_level >= p2["storm_wind_level"]
                   or tm.wind_speed_ms >= p2["storm_wind_speed_ms"])
                  and tm.is_sensor_fresh(tm.wind_ts))
IsAQIDangerous = _cond("AQI>200?",
    lambda tm, _: tm.aqi > p2["aqi_threshold"] and tm.is_sensor_fresh(tm.aqi_ts))
IsHumidityExtreme = _cond("湿度>90%?",
    lambda tm, _: tm.humidity_pct > p2["humidity_threshold"] and tm.is_sensor_fresh(tm.humidity_ts))

# ═══ P3 设备前置 ═══
IsDeviceReady    = _cond("设备就绪?",    lambda tm, _: tm.calibrated and not tm.clutch_locked)
IsDeviceNotReady = _cond("设备未就绪?",  lambda tm, _: not tm.calibrated or tm.clutch_locked)
IsWindowOpen     = _cond("窗户开着?",    lambda tm, _: tm.window_open_pct > 1)
IsScreenInterference = _cond("窗纱干涉+纱窗未到位?",
    lambda tm, cap: (cap.has_screen_interference
                     and tm.screen_position_pct < 95
                     and tm.window_open_pct < 1
                     and tm.user_command is not None))

# ═══ P4 用户指令 ═══
HasUserCommand    = _cond("有用户指令?",    lambda tm, _: tm.user_command is not None)
NoRain            = _cond("无降雨?",        lambda tm, _: not tm.rain_detected)
NoObstacle        = _cond("无遇阻?",        lambda tm, _: tm.actuator_current_ma <= p0["obstacle_current_ma"])
IsUserRecentManual = _cond("用户刚手动操作?",
    lambda tm, _: (tm.user_command is not None
                   and tm.user_command.get("source") == "manual_override"))
NoStormWarning     = _cond("无台风预警?",
    lambda tm, _: not (tm.wind_level >= 8
                       or (tm.wind_level >= 6 and tm.rain_level in ("heavy", "storm"))))

# ═══ P5 环境自动 ═══
def _mode_cfg(tm):
    return RULES["modes"].get(tm.mode, RULES["modes"]["ventilation_first"])

IsCO2High      = _cond("CO₂超标?",
    lambda tm, _: tm.co2_ppm > _mode_cfg(tm).get("co2_threshold", 800)
                  and tm.is_sensor_fresh(tm.co2_ts))
IsHumidityHigh = _cond("湿度偏高?",
    lambda tm, _: tm.humidity_pct > _mode_cfg(tm).get("humidity_threshold", 70)
                  and tm.is_sensor_fresh(tm.humidity_ts))
IsIndoorHot    = _cond("室内过热?",
    lambda tm, _: tm.temp_indoor_c > 28
                  and tm.temp_outdoor_c < tm.temp_indoor_c - 3
                  and tm.is_sensor_fresh(tm.temp_ts))
IsNoisyStudy   = _cond("书房噪声超标?",
    lambda tm, _: (tm.room_type == "study"
                   and tm.noise_db > ROOMS["rooms"]["study"].get("noise_threshold_db", 60)
                   and tm.is_sensor_fresh(tm.noise_ts)))
IsModeAuto     = _cond("非手动模式?",   lambda tm, _: tm.mode != "manual")
NoExistingRec  = _cond("无现有推荐?",   lambda tm, _: tm.ai_recommendation is None)

# ═══ P6 房间策略 ═══
IsElderlyRoomCold = _cond("老人房+低温?",
    lambda tm, _: (tm.room_type == "elderly_room"
                   and tm.temp_indoor_c < ROOMS["rooms"]["elderly_room"]["cold_protection_temp_c"]))
IsChildRoomAutoLimit = _cond("儿童房超限?",
    lambda tm, cap: (tm.room_type == "child_room"
                     and tm.window_open_pct > ROOMS["rooms"]["child_room"]["max_auto_open_pct"]))
IsChildRoomScreenUp = _cond("儿童房纱窗未放下?",
    lambda tm, _: (tm.room_type == "child_room"
                   and ROOMS["rooms"]["child_room"].get("screen_always_down", False)
                   and tm.screen_position_pct < 95))
IsBedroomNight = _cond("卧室夜间超限?",
    lambda tm, _: (tm.room_type == "bedroom"
                   and (tm.time_hour >= ROOMS["rooms"]["bedroom"].get("night_mode_start", 22)
                        or tm.time_hour < ROOMS["rooms"]["bedroom"].get("night_mode_end", 7))
                   and tm.window_open_pct > ROOMS["rooms"]["bedroom"].get("sleep_max_open_pct", 15)))
IsNoisyStudyOpen = _cond("书房噪声+窗开?",
    lambda tm, _: (tm.room_type == "study"
                   and tm.noise_db > ROOMS["rooms"]["study"].get("noise_threshold_db", 60)
                   and tm.window_open_pct > 0
                   and tm.is_sensor_fresh(tm.noise_ts)))

IsStormWarning = _cond("台风/暴风预警?",
    lambda tm, _: (tm.wind_level >= 8
                   or (tm.wind_level >= 6 and tm.rain_level in ("heavy", "storm"))))
IsHumanAbsent  = _cond("无人在场?",
    lambda tm, _: not tm.human_detected and tm.is_sensor_fresh(tm.human_ts))
IsHumanPresent = _cond("有人在场?",
    lambda tm, _: tm.human_detected and tm.is_sensor_fresh(tm.human_ts))
IsWestSunGlare = _cond("西晒眩光?",
    lambda tm, _: (tm.orientation in ("W", "SW", "NW")
                   and 13 <= tm.time_hour <= 18
                   and tm.lux > 10000))
IsScreenUp     = _cond("纱窗收起?",
    lambda tm, _: tm.screen_position_pct < 50)

# ═══ 天气预报预判 ═══
IsRainForecast = _cond("降水概率高?",
    lambda tm, _: tm.forecast_rain_prob > 0.7 and tm.is_sensor_fresh(tm.forecast_rain_prob_ts))
IsPressurePlunging = _cond("气压骤降?",
    lambda tm, _: tm.pressure_trend == "plunging" and tm.is_sensor_fresh(tm.pressure_ts))
IsPreemptiveCloseNeeded = _cond("需要预判关窗?",
    lambda tm, _: (
        (tm.forecast_rain_prob > 0.7 or tm.pressure_trend == "plunging")
        and tm.window_open_pct > 5
        and not tm.rain_detected  # 还没下雨（如果已下雨，P1会处理）
    ))

# ═══ P7 AI推荐 ═══
HasAIRecommendation = _cond("有AI推荐?", lambda tm, _: tm.ai_recommendation is not None)
