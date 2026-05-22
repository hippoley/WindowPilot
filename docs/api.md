# WindowPilot WebSocket & HTTP API

## 1. WebSocket 连接

端点: `ws://host:8000/ws`

连接后自动接收 500ms 一次的 tick 广播。发送 JSON 命令控制设备。

## 2. 命令列表 (cmd 类型)

### 传感器设置
```json
{"cmd": "set_sensor", "key": "rain_detected", "value": true}
{"cmd": "set_sensor", "key": "co2_ppm", "value": 1200}
{"cmd": "set_sensor", "key": "temp_indoor_c", "value": 32.5}
```
支持的 key: rain_detected, rain_level, voc_mg, co2_ppm, temp_indoor_c, temp_outdoor_c, humidity_pct, wind_speed_ms, wind_level, wind_direction, lux, human_detected, noise_db, aqi, room_type, time_hour, orientation, forecast_rain_prob, pressure_hpa, pressure_trend, user_profile, has_pets, has_allergy

### 窗户控制
```json
{"cmd": "user_open_to", "value": 50}
{"cmd": "user_screen_to", "value": 100}
{"cmd": "user_stop"}
```

### AI 推荐交互
```json
{"cmd": "accept_recommendation"}
{"cmd": "reject_recommendation"}
```

### 自然语言意图
```json
{"cmd": "user_intent", "value": "有点闷，开窗通通风"}
```

### 定时任务
```json
{"cmd": "add_schedule", "value": {"name": "晨起通风", "hour": 7, "minute": 0, "action": "open_to", "target_pct": 40, "duration_min": 30, "enabled": true}}
{"cmd": "remove_schedule", "value": "schedule_id"}
```

### 安防
```json
{"cmd": "arm_security"}
{"cmd": "disarm_security"}
```

### 模式/场景
```json
{"cmd": "set_mode", "value": "ventilation_first"}
{"cmd": "load_scenario", "value": "storm"}
{"cmd": "reset"}
```

模式值: ventilation_first | wind_protect | safety_first

## 3. Tick 广播 Payload

每 500ms 推送一次:

```json
{
  "type": "tick",
  "tick": 42,
  "ts": 1700000000.123,
  "thing_model": {
    "window_open_pct": 30.0,
    "actuator_state": "idle",
    "screen_position_pct": 100.0,
    "rain_detected": false,
    "co2_ppm": 800,
    "mode": "ventilation_first",
    "bt_active_branch": "P5.CO₂通风"
  },
  "semantic": {
    "tags": ["CO2_HIGH", "INDOOR_WARM"],
    "summary": "室内CO₂偏高，建议通风",
    "risk": "low"
  },
  "tree": {
    "name": "WindowPilot",
    "status": "success",
    "children": ["...行为树快照"]
  },
  "decision_log": [
    {"tick": 41, "source": "SafetyAgent", "action": "P5.CO₂通风", "result": "success"}
  ],
  "bt_branch": "P5.CO₂通风",
  "ai_status": "idle",
  "agents_status": {
    "execution": {"state": "ok", "last_tick_ms": 2},
    "safety": {"state": "ok", "last_tick_ms": 8}
  }
}
```

## 4. HTTP 端点

### GET /health
```json
{"status": "ok", "tick": 42, "branch": "P5.CO₂通风", "ai_status": "idle"}
```

### GET /agents
```json
{
  "execution": {"state": "ok", "last_tick_ms": 2, "errors": 0},
  "environment": {"state": "ok", "last_tick_ms": 5, "errors": 0},
  "safety": {"state": "ok", "last_tick_ms": 8, "errors": 0},
  "recommend": {"state": "ok", "last_tick_ms": 0, "errors": 0},
  "learner": {"state": "ok", "last_tick_ms": 1, "errors": 0},
  "security": {"state": "ok", "last_tick_ms": 1, "errors": 0},
  "scheduler": {"state": "ok", "last_tick_ms": 1, "errors": 0}
}
```

### GET /schedules
```json
[
  {"id": "morning_vent", "name": "晨起通风", "hour": 7, "minute": 0, "action": "open_to", "target_pct": 40, "enabled": true}
]
```
