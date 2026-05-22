# WindowPilot 行为树文档

## 1. 概述

行为树采用 py_trees 库实现，根节点为 Selector（memory=False），每 500ms tick 一次。
memory=False 表示反应式语义：每次 tick 从根节点重新评估，高优先级分支随时抢占低优先级。

## 2. 完整树结构

```
Root Selector (WindowPilot)
│
├── P0 紧急保护 [Selector]
│   ├── 遇阻保护 [Seq]: IsObstacle → ActStopReverse → ActLogObstacle
│   ├── 过热保护 [Seq]: IsMotorOverheat → ActStopAll → ActLogOverheat
│   └── 堵转保护 [Seq]: IsStalled → ActStopAll
│
├── P1 传感器安全 [Selector]
│   ├── 雨天关窗 [Seq]: IsRainDetected → IsWindowOpen → ActCloseWindow → ActLogRain
│   ├── 斜风雨关窗 [Seq]: IsObliqueRain → IsWindowOpen → ActCloseWindow → ActLogRain
│   └── VOC关窗 [Seq]: IsVOCSpike → ActCloseWindow → ActLogVOC
│
├── P2 天气预报 [Selector]
│   ├── 预判关窗 [Seq]: IsPreemptiveCloseNeeded → ActCloseWindow
│   ├── 强风关窗 [Seq]: IsStormWind → ActCloseWindow → ActLogWind
│   ├── AQI关窗 [Seq]: IsAQIDangerous → ActCloseWindow → ActLogAQI
│   └── 极端湿度 [Seq]: IsHumidityExtreme → ActCloseWindow
│
├── P3 设备前置 [Selector]
│   ├── 窗纱干涉检查 [Seq]: IsScreenInterference → ActEnsureScreenDown
│   └── 设备未就绪 [Seq]: IsDeviceNotReady → ActWaitDevice
│
├── P4 用户控制 [Selector]
│   ├── 尊重用户意图 [Seq]: IsUserRecentManual → ActRespectUser
│   └── 执行指令 [Seq]: HasUserCommand → NoStormWarning → NoRain → NoObstacle → ActExecuteUser
│
├── P5 环境自动 [Selector]
│   ├── CO₂通风 [Seq]: IsCO2High → IsModeAuto → NoRain → NoExistingRec → ActGenRec
│   ├── 除湿通风 [Seq]: IsHumidityHigh → IsModeAuto → NoExistingRec → ActGenRec
│   ├── 自然降温 [Seq]: IsIndoorHot → IsModeAuto → NoExistingRec → ActGenRec
│   ├── 书房降噪 [Seq]: IsNoisyStudy → IsModeAuto → NoExistingRec → ActGenRec
│   └── 无人节能 [Seq]: IsHumanAbsent → IsModeAuto → ActCloseNoHuman
│
├── P6 房间策略 [Selector]
│   ├── 老人房防寒 [Seq]: IsElderlyRoomCold → ActCloseWindow
│   ├── 儿童房超限关窗 [Seq]: IsChildRoomAutoLimit → ActCloseWindow
│   ├── 儿童房纱窗放下 [Seq]: IsChildRoomScreenUp → ActEnforceScreenDown
│   ├── 宠物防坠落 [Seq]: IsPetOwnerWindowOpen → ActEnforceScreenDown
│   ├── 卧室夜间限速 [Seq]: IsBedroomNight → ActLimitNightOpen
│   ├── 书房噪声关窗 [Seq]: IsNoisyStudyOpen → ActCloseWindow
│   └── 西晒遮光 [Seq]: IsWestSunGlare → IsScreenUp → ActLowerScreenSun
│
├── P7 AI推荐 [Sequence]
│   └── HasAIRecommendation → ActShowRec
│
└── 待机: ActIdle
```

## 3. 优先级说明

| 优先级 | 分支 | 说明 | 本地/云端 |
|--------|------|------|-----------|
| P0 | 紧急保护 | 电机物理安全，最高优先 | 纯本地 |
| P1 | 传感器安全 | 实时传感器驱动的安全动作 | 纯本地 |
| P2 | 天气预报 | 基于预报数据的预防性关窗 | 纯本地 |
| P3 | 设备前置 | 设备就绪检查/干涉处理 | 纯本地 |
| P4 | 用户控制 | 响应用户指令（安全前提下） | 纯本地 |
| P5 | 环境自动 | 环境触发的自动通风/节能 | 触发AI |
| P6 | 房间策略 | 房间类型特化规则 | 纯本地 |
| P7 | AI推荐 | 显示AI生成的推荐卡片 | 依赖AI |

## 4. memory=False 反应式语义

- 每次 tick，Selector 从**第一个子节点**重新评估
- 如果 P0 条件满足 → 立即执行 P0，不管之前在执行 P5 还是 P7
- 保证安全分支**始终有机会抢占**低优先级操作
- Sequence 中任一条件节点返回 FAILURE → 整个序列失败，Selector 尝试下一个分支
- 只有当所有高优先级分支都 FAILURE 时，才会轮到低优先级执行

## 5. 节点类型

- **Condition 节点**: 检查 ThingModel 状态，返回 SUCCESS/FAILURE，无副作用
- **Action 节点**: 修改 ThingModel 状态（设置 target_pct、记录日志等），返回 SUCCESS/RUNNING
- **Sequence**: 按顺序执行子节点，任一 FAILURE 则整体 FAILURE
- **Selector**: 按顺序尝试子节点，任一 SUCCESS 则整体 SUCCESS
