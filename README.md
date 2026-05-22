# WindowPilot 智能窗纱一体控制系统

> 旧窗新脑 — 无损升级，让窗户学会优雅呼吸

## 项目简介

WindowPilot 是智能窗纱一体产品的决策引擎，基于行为树 + 多 Agent 协作架构，实现窗户和纱窗的智能自动控制。系统通过多传感器融合、AI 场景推荐、用户记忆学习，在保障安全的前提下为用户提供最优的通风/遮光/防护方案。

## 核心能力

- 🛡️ **安全优先**：500ms 实时安全决策，防夹/防雨/防风/防撬，零延迟响应
- 🧠 **AI 推荐**：基于场景模板 + 用户记忆的个性化推荐，支持 6 条并行建议
- ⏰ **定时场景**：cron 定时触发，早晨通风/睡前关窗自动执行
- 🌧️ **预判关窗**：基于天气预报和气压变化，提前关窗保护室内资产
- 🐱 **用户画像**：过敏/养宠/有娃等差异化策略
- 🔒 **安防报警**：夜间自动布防，防撬检测，异常入侵报警

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Python 3.11+ / FastAPI / py-trees / asyncio |
| 前端 | React 18 / Vite / WebSocket |
| AI | MiniMax API / RAG 场景检索 / Sigmoid 记忆衰减 |
| 架构 | 多 Agent 协作 / 行为树 / Blackboard 模式 |

## 项目结构

```
WindowPilot/
├── backend/
│   ├── agents/          # Agent 层（7 个独立 Agent）
│   ├── ai/             # AI 模块（意图/检索/排序/解释/学习）
│   ├── config/         # YAML 配置（安全规则/房间策略/模板库）
│   ├── domain/         # 领域模型（ThingModel/Capability/Snapshot）
│   ├── engine/         # 行为树引擎（条件/动作/构建器）
│   ├── execution/      # 执行层（仿真器/联动协调）
│   └── server/         # 服务层（FastAPI + WebSocket）
├── frontend/
│   └── src/            # React 前端（实时仪表盘）
└── docs/               # 架构文档
```

## 快速启动

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn server.app:app --host 0.0.0.0 --port 8001

# 前端
cd frontend
npm install
npm run dev
```

## 版本历史

### v1.3.0 (当前)
- 多 Agent 协作架构（7 个独立 Agent）
- 安防报警模式（SecurityAgent）
- 定时场景系统（SchedulerAgent）
- 天气预报预判性关窗
- 场景模板库 YAML 配置化（15 个预置模板）
- 多条推荐 + 来源标签 + 置信度
- 斜风雨联合判断 + 用户画像 + 宠物防坠落

### v1.2.0
- 安全循环与 AI 链路解耦（asyncio.create_task）
- 前端性能优化（单 state / rAF 节流 / 无障碍）
- AI 模块健壮性修复（日志/环境变量/溢出保护）
- 深度扫描修复（安全白名单/tick容错/前端数据对齐）

### v1.1.0
- 行为树增强（台风拦截/纱窗独立决策/老人房慢速）
- 记忆强度衰减系统（Sigmoid 公式）
- 物模型补全（光照/朝向/传感器时间戳）
- ContextSnapshot 增强（西晒/回南天/光照标签）

### v1.0.0
- 初始版本：行为树 P0-P7 + 物模型 + 仿真器
- py_trees 反应式行为树
- WebSocket 实时推送
- 基础 AI 推荐链路

## 文档

- [系统架构](docs/architecture.md)
- [行为树结构](docs/behavior_tree.md)
- [API 接口](docs/api.md)

## 许可证

MIT
