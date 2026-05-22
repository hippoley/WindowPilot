"""
行为树构建器
树只建一次（单例），每 tick 只调 tick_once()，避免重复分配节点对象。
所有节点通过 (tm, cap, trace) 构造，trace 依赖注入，无全局变量。

Root Selector (memory=False, 反应式)
├── P0 紧急保护 [Selector]
│   ├── 遇阻保护 [Seq: 遇阻? → 停止回退 → 记录]
│   ├── 过热保护 [Seq: 过热? → 停止 → 记录]
│   └── 堵转保护 [Seq: 堵转? → 停止]
├── P1 本地传感器 [Selector]
│   ├── 雨天关窗 [Seq: 雨水? → 窗开? → 关窗 → 记录]
│   └── VOC关窗  [Seq: VOC突变? → 关窗 → 记录]
├── P2 天气预报 [Selector]
│   ├── 强风关窗
│   ├── AQI关窗
│   └── 极端湿度关窗
├── P3 设备前置 [Selector]
│   ├── 窗纱干涉检查 [Seq: 干涉? → 先降纱窗(RUNNING)]
│   └── 设备未就绪   [Seq: 未就绪? → 等待(RUNNING)]
├── P4 用户控制 [Selector]
│   ├── 尊重用户意图 [Seq: 刚手动? → 静默]
│   └── 执行指令     [Seq: 有指令? → 无雨? → 无阻? → 执行]
├── P5 环境自动 [Selector]
│   ├── CO₂通风
│   ├── 除湿通风
│   ├── 自然降温
│   └── 书房降噪关窗
├── P6 房间策略 [Selector]
│   ├── 老人房防寒
│   ├── 儿童房超限关窗
│   ├── 儿童房纱窗强制放下
│   ├── 卧室夜间限速
│   └── 书房噪声关窗
├── P7 AI推荐 [Seq: 有推荐? → 显示卡片(RUNNING)]
└── 待机 [ActIdle]
"""
import py_trees
from domain.thing_model import ThingModel
from domain.capability import DeviceCapability
from domain.decision_trace import DecisionTraceLog
from engine.conditions import (
    IsObstacle, IsMotorOverheat, IsStalled,
    IsRainDetected, IsVOCSpike, IsObliqueRain,
    IsStormWind, IsAQIDangerous, IsHumidityExtreme,
    IsStormWarning, NoStormWarning,
    IsDeviceNotReady, IsWindowOpen, IsScreenInterference,
    HasUserCommand, NoRain, NoObstacle, IsUserRecentManual,
    IsCO2High, IsHumidityHigh, IsIndoorHot, IsModeAuto, NoExistingRec,
    IsNoisyStudy,
    IsHumanAbsent, IsHumanPresent,
    IsWestSunGlare, IsScreenUp,
    IsElderlyRoomCold, IsChildRoomAutoLimit,
    IsChildRoomScreenUp, IsBedroomNight, IsNoisyStudyOpen,
    IsPreemptiveCloseNeeded,
    IsPetOwnerWindowOpen,
    HasAIRecommendation,
)
from engine.actions import (
    ActStopReverse, ActStopAll, ActCloseWindow,
    ActEnsureScreenDown, ActWaitDevice,
    ActRespectUser, ActExecuteUser,
    ActGenRec, ActShowRec, ActIdle,
    ActEnforceScreenDown, ActLimitNightOpen,
    ActLowerScreenSun, ActCloseNoHuman,
    ActLogObstacle, ActLogOverheat,
    ActLogRain, ActLogWind, ActLogVOC, ActLogAQI,
)


def _seq(name, *nodes):
    s = py_trees.composites.Sequence(name, memory=False)
    s.add_children(list(nodes))
    return s


def _sel(name, *nodes):
    s = py_trees.composites.Selector(name, memory=False)
    s.add_children(list(nodes))
    return s


def _n(cls, tm, cap, trace):
    """统一节点实例化，传入 trace"""
    return cls(tm, cap, trace)


def build_tree(tm: ThingModel, cap: DeviceCapability,
               trace: DecisionTraceLog) -> py_trees.behaviour.Behaviour:
    """
    构建完整行为树（每次调用返回新树实例）。
    调用方应缓存此树，每 tick 只调 tick_once()，不要每 tick 重建。
    """
    def n(cls):
        return _n(cls, tm, cap, trace)

    # ── P0 紧急保护 ──
    p0 = _sel("P0 紧急保护",
        _seq("遇阻保护",  n(IsObstacle),      n(ActStopReverse), n(ActLogObstacle)),
        _seq("过热保护",  n(IsMotorOverheat),  n(ActStopAll),     n(ActLogOverheat)),
        _seq("堵转保护",  n(IsStalled),        n(ActStopAll)),
    )

    # ── P1 本地传感器安全 ──
    p1 = _sel("P1 传感器安全",
        _seq("雨天关窗", n(IsRainDetected), n(IsWindowOpen), n(ActCloseWindow), n(ActLogRain)),
        _seq("斜风雨关窗", n(IsObliqueRain), n(IsWindowOpen), n(ActCloseWindow), n(ActLogRain)),
        _seq("VOC关窗",  n(IsVOCSpike),     n(ActCloseWindow), n(ActLogVOC)),
    )

    # ── P2 天气预报 ──
    p2 = _sel("P2 天气预报",
        _seq("预判关窗",  n(IsPreemptiveCloseNeeded), n(ActCloseWindow)),
        _seq("强风关窗",  n(IsStormWind),       n(ActCloseWindow), n(ActLogWind)),
        _seq("AQI关窗",   n(IsAQIDangerous),    n(ActCloseWindow), n(ActLogAQI)),
        _seq("极端湿度",  n(IsHumidityExtreme), n(ActCloseWindow)),
    )

    # ── P3 设备前置 ──
    p3 = _sel("P3 设备前置",
        _seq("窗纱干涉检查", n(IsScreenInterference), n(ActEnsureScreenDown)),
        _seq("设备未就绪",   n(IsDeviceNotReady),     n(ActWaitDevice)),
    )

    # ── P4 用户控制 ──
    p4 = _sel("P4 用户控制",
        _seq("尊重用户意图", n(IsUserRecentManual), n(ActRespectUser)),
        _seq("执行指令",     n(HasUserCommand), n(NoStormWarning), n(NoRain), n(NoObstacle), n(ActExecuteUser)),
    )

    # ── P5 环境自动 ──
    p5 = _sel("P5 环境自动",
        _seq("CO₂通风",   n(IsCO2High),      n(IsModeAuto), n(NoRain), n(NoExistingRec), n(ActGenRec)),
        _seq("除湿通风",  n(IsHumidityHigh), n(IsModeAuto), n(NoExistingRec), n(ActGenRec)),
        _seq("自然降温",  n(IsIndoorHot),    n(IsModeAuto), n(NoExistingRec), n(ActGenRec)),
        _seq("书房降噪",  n(IsNoisyStudy),   n(IsModeAuto), n(NoExistingRec), n(ActGenRec)),
        _seq("无人节能",  n(IsHumanAbsent),  n(IsModeAuto), n(ActCloseNoHuman)),
    )

    # ── P6 房间策略 ──
    p6 = _sel("P6 房间策略",
        _seq("老人房防寒",       n(IsElderlyRoomCold),    n(ActCloseWindow)),
        _seq("儿童房超限关窗",   n(IsChildRoomAutoLimit), n(ActCloseWindow)),
        _seq("儿童房纱窗放下",   n(IsChildRoomScreenUp),  n(ActEnforceScreenDown)),
        _seq("宠物防坠落",       n(IsPetOwnerWindowOpen), n(ActEnforceScreenDown)),
        _seq("卧室夜间限速",     n(IsBedroomNight),       n(ActLimitNightOpen)),
        _seq("书房噪声关窗",     n(IsNoisyStudyOpen),     n(ActCloseWindow)),
        _seq("西晒遮光",         n(IsWestSunGlare),       n(IsScreenUp), n(ActLowerScreenSun)),
    )

    # ── P7 AI推荐 ──
    p7 = _seq("P7 AI推荐", n(HasAIRecommendation), n(ActShowRec))

    root = _sel("WindowPilot", p0, p1, p2, p3, p4, p5, p6, p7, n(ActIdle))
    return root
