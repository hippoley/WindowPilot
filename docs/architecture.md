# WindowPilot 系统架构

> **版本**: v1.3.0 | **最后更新**: 2025-05 | **状态**: 开发中

---

## 1. 系统概述

WindowPilot 是智能窗纱一体控制系统的决策引擎，基于多 Agent 协作架构，实现：
- **500ms 实时安全决策**（纯本地，零网络依赖）
- **异步 AI 推荐**（可降级，不阻塞安全循环）
- **用户记忆学习**（sigmoid 衰减，个性化推荐）
- **多传感器融合 + 语义标签生成**

## 2. 架构图

~~~
┌─────────────────────────────────────────────────────────────┐
│  app.py（薄编排层 / Orchestrator）                           │
│  tick_loop: 500ms 节拍                                       │
└─────────────────────────────────────────────────────────────┘
         │           │            │           │          │         │          │
    ExecutionAgent  EnvAgent  SafetyAgent  RecommendAgent  LearnerAgent  SecurityAgent  SchedulerAgent
    (仿真+联动)   (语义快照)  (行为树BT)   (异步AI)       (记忆衰减)    (安防报警)     (定时场景)
         │           │            │           │          │         │          │
         └───────────┴────────────┴───────────┴──────────┴─────────┴──────────┘
                              ThingModel (Blackboard / 唯一真相源)
~~~

## 3. Agent 层设计

### 3.1 BaseAgent 抽象

所有 Agent 继承自 agents.base.BaseAgent：

- **AgentStatus**: IDLE / RUNNING / DEGRADED / ERROR / DISABLED
- **AgentMetrics**: tick_count / last_tick_ms / avg_tick_ms / max_tick_ms / error_count
- **safe_tick()**: 自动计时 + 异常保护 + 降级（捕获异常后标记 DEGRADED，不杀死循环）
- **_on_error()**: 子类覆写实现安全回退

### 3.2 各 Agent 职责

| Agent | 职责 | 延迟要求 | 降级策略 |
|-------|------|---------|---------|
| ExecutionAgent | 仿真器 + 窗纱联动协调 + 到位检测 | <1ms | 停止所有电机 |
| EnvironmentAgent | 传感器融合 → ContextSnapshot | <1ms | 使用上一帧快照 |
| SafetyAgent | 行为树 P0-P7 tick | <5ms | fail-safe 停止电机 |
| RecommendAgent | 异步 AI pipeline | 不限（异步） | 规则兜底 |
| LearnerAgent | 记忆衰减（每120 tick ≈ 60s） | <1ms | 跳过衰减 |
| SecurityAgent | 夜间防撬 + 入侵检测 + 报警 | <1ms | 保持当前状态 |
| SchedulerAgent | 定时场景触发 | <1ms | 跳过本次 |

### 3.3 tick_loop 编排顺序

~~~
每 500ms:
  1. ExecutionAgent.safe_tick()   → 物理仿真（推窗器/纱窗位移）
  2. EnvironmentAgent.safe_tick() → 生成 ContextSnapshot
  3. SafetyAgent.safe_tick()      → 行为树 P0-P7 决策
  4. SecurityAgent.safe_tick()    → 安防检测
  5. [条件] asyncio.create_task(AI pipeline)  → 异步推荐（不阻塞）
  6. LearnerAgent.safe_tick()     → 记忆衰减
  7. SchedulerAgent.safe_tick()   → 定时场景
  8. _broadcast(payload)          → WebSocket 推送
~~~

## 4. 行为树结构

详见 [behavior_tree.md](./behavior_tree.md)

~~~
Root Selector (memory=False, 反应式)
├── P0 紧急保护 [遇阻/过热/堵转]
├── P1 传感器安全 [雨天/斜风雨/VOC]
├── P2 天气预报 [预判关窗/强风/AQI/极端湿度]
├── P3 设备前置 [窗纱干涉/设备未就绪]
├── P4 用户控制 [尊重手动/执行指令(台风拦截)]
├── P5 环境自动 [CO₂/湿度/降温/噪声/无人节能]
├── P6 房间策略 [老人防寒/儿童限制/宠物/纱窗/夜间/噪声/西晒]
├── P7 AI推荐 [有推荐→显示卡片]
└── 待机
~~~

## 5. 物模型 (ThingModel)

### 5.1 字段分层

**物理执行层：**
- window_open_pct / window_target_pct / window_state / window_motion
- actuator_state / actuator_stroke_mm / actuator_target_mm / actuator_current_ma / actuator_temp_c
- screen_position_pct / screen_target_pct / screen_motion / screen_blocked

**感知层（每个配时间戳 *_ts）：**
- rain_detected / rain_level / rain_ts
- co2_ppm / co2_ts
- temp_indoor_c / temp_outdoor_c / temp_ts
- humidity_pct / humidity_ts
- wind_speed_ms / wind_level / wind_direction / wind_ts
- lux / lux_ts / noise_db / noise_ts / aqi / aqi_ts
- voc_mg / voc_ts / human_detected / human_ts

**天气预报层：**
- forecast_rain_prob / forecast_rain_prob_ts
- pressure_hpa / pressure_trend (rising/stable/falling/plunging) / pressure_ts

**上下文层：**
- room_type (bedroom/child_room/elderly_room/study/living_room)
- orientation (N/S/E/W/NE/NW/SE/SW)
- time_hour / mode (ventilation_first/wind_protect/safety_first)

**用户画像层：**
- user_profile (default/allergy/pet_owner/has_baby/elderly_solo/smoker)
- has_pets / has_allergy

**控制层：**
- user_command — {source, action, target_pct}
- ai_recommendation / ai_recommendations / recommendation_card

**安防层：**
- security_mode / auto_security_night / security_armed_ts
- alarm_triggered / alarm_reason (tamper/forced_open) / alarm_ts

**行为树元数据：**
- bt_active_branch / bt_result / bt_tick

### 5.2 传感器时间戳机制

每个传感器字段配对 *_ts 时间戳，is_sensor_fresh(ts) 判断数据是否在有效期（**120秒**）内。
防止离线/断线时陈旧数据驱动错误决策。ts=0 表示未设置，视为有效（兼容初始化）。

## 6. AI 推荐链路

~~~
触发: P5.NeedGenerate (bt_active_branch == "P5.NeedGenerate")
  ↓ asyncio.create_task (不阻塞安全循环)
  ↓
Goal Inference → Scene Retrieval (YAML模板库) → Candidate Ranking → Explanation → Preference Tuning
  ↓
结果: tm.ai_recommendations = [top 6 candidates]
  ↓
下一 tick: P7 检测到推荐 → 显示卡片
~~~

### 6.1 场景模板库
- 15 个预置模板（config/scene_templates.yaml）
- 每个模板包含 template_key（用于与用户记忆去重）
- 运营可直接编辑 YAML，无需改代码

### 6.2 记忆强度衰减
- Sigmoid 公式:
  - memory_strength = 1/(1 + exp(-0.3 * opt_var)) + strength_init - 0.5
  - opt_var = opt_strength - (opt_strength + 1)/(1 + exp(-0.2 * (delta_day - 10)))
- 使用越频繁 opt_strength 越高（每次 accept +0.3，上限 5.0）
- 强度 < 0.1 的记忆自动删除
- 相近开度（±5%）+ 同房间 + 同时段 → 自动合并为一条记忆

### 6.3 多条推荐
- 输出最多 6 条推荐
- 每条包含: source (template/memory/rule_fallback/ai_generated) + confidence
- 主推荐（第一条）附带 reason 解释文案

## 7. 安全设计

### 7.1 优先级保证
P0 > P1 > P2 > ... > P7，高优先级永远抢占低优先级。
memory=False 的反应式 Selector 保证每 tick 从头扫描。

### 7.2 安全拦截
- 台风预警时禁止用户开窗（NoStormWarning 条件：风力≥8级，或风力≥6+暴雨）
- 儿童房最大开度 10%，需家长确认
- 老人房室温<18°C 自动关窗
- 宠物家庭开窗时强制放下纱窗

### 7.3 安防报警
- 夜间自动布防（22:00-06:00，auto_security_night=True）
- 防撬检测：关窗+idle 状态下电流>500mA
- 异常开窗检测：安防模式下非用户操作开窗>3%
- 报警时锁定窗户（window_state="locked"）
- 报警冷却 60 秒（避免重复报警）

### 7.4 Fail-safe
- SafetyAgent._on_error() → 停止所有电机
- tick_loop try/except → 单次异常不杀死循环
- Agent DEGRADED 状态下继续运行，不影响其他 Agent

## 8. 前端架构

- React + Vite
- 单一 state 对象（避免多次 re-render）
- requestAnimationFrame 节流
- WebSocket 实时推送（500ms/tick）
- 响应式布局（<900px 单列）
- 无障碍：aria-label + keyboard accessible toggles

## 9. 配置文件

| 文件 | 用途 |
|------|------|
| config/safety_rules.yaml | 安全阈值（P0-P2）+ 模式配置 |
| config/room_strategies.yaml | 房间策略（儿童/老人/卧室/书房/客厅） |
| config/device_profile.yaml | 设备能力画像（推窗器行程/电机参数） |
| config/scene_templates.yaml | 场景模板库（15个预置） |
| config/behavior_tree.yaml | 行为树声明式定义（文档用，实际由 tree_builder.py 构建） |

## 10. API 接口

详见 [api.md](./api.md)

| 端点 | 方法 | 说明 |
|------|------|------|
| /ws | WebSocket | 实时双向通信（命令+tick广播） |
| /health | GET | 健康检查 |
| /agents | GET | 所有 Agent 状态 |
| /schedules | GET | 定时任务列表 |
| / | GET | 前端页面（HTML） |
