"""
AI-2 场景检索 (Scene Retrieval / RAG)
从用户故事库中找相似场景，生成候选策略
位置：P6 场景检索节点
输入：当前状态向量 + 设备画像 + 用户故事库
输出：相似场景列表 + 候选策略集
不能做：不是最终裁判，只提供参考
"""
import json
from typing import List, Dict, Optional
from ai.client import MiniMaxClient
from domain.context_snapshot import ContextSnapshot
from domain.capability import DeviceCapability

# 内置用户故事库（实际产品中应该是向量数据库）
USER_STORIES = [
    {"id": "s001", "tags": ["CO2_HIGH", "BEDROOM", "NIGHT_TIME"], "action": "open_10_screen_down_15min", "desc": "卧室夜间CO₂高，微开10%通风15分钟"},
    {"id": "s002", "tags": ["CO2_VERY_HIGH", "BEDROOM"], "action": "open_30_screen_down_20min", "desc": "卧室CO₂很高，开窗30%通风20分钟"},
    {"id": "s003", "tags": ["RAIN_NOW", "CO2_HIGH", "CHILD_ROOM_HIGH_SAFETY"], "action": "open_10_screen_down_10min_confirm", "desc": "儿童房下雨+CO₂高，微开10%需确认"},
    {"id": "s004", "tags": ["HUMIDITY_HIGH", "BEDROOM"], "action": "open_20_screen_down_15min", "desc": "卧室湿度高，开窗20%除湿"},
    {"id": "s005", "tags": ["INDOOR_HOT_OUTDOOR_COOL"], "action": "open_40_screen_down_30min", "desc": "室内热室外凉，开窗40%自然降温"},
    {"id": "s006", "tags": ["NOISE_HIGH", "STUDY_ROOM"], "action": "close_window", "desc": "书房噪声高，关窗降噪"},
    {"id": "s007", "tags": ["STRONG_WIND"], "action": "close_window", "desc": "强风天气，关窗保护"},
    {"id": "s008", "tags": ["ELDERLY_ROOM_PROTECTION", "INDOOR_COLD"], "action": "close_window", "desc": "老人房低温，关窗防寒"},
    {"id": "s009", "tags": ["CHILD_ROOM_HIGH_SAFETY", "HUMAN_PRESENT"], "action": "open_10_screen_down_confirm", "desc": "儿童房有人，最大10%需确认"},
    {"id": "s010", "tags": ["VOC_SPIKE"], "action": "close_window_immediately", "desc": "VOC突变，立即关窗"},
]

RETRIEVER_PROMPT = """你是智能门窗场景检索器。
根据当前环境语义标签，从候选场景中选出最相似的1-3个，并生成候选动作方案。

当前语义标签: {tags}
候选场景库: {stories}

请输出 JSON 数组，每个元素包含:
{{"story_id": "s001", "similarity": 0.85, "candidate": {{"window_pct": 10, "screen_pct": 100, "duration_min": 15, "needs_confirm": false}}}}

只输出 JSON 数组，不要其他文字。"""


class SceneRetriever:
    """AI-2: 场景检索"""

    def __init__(self, client: MiniMaxClient):
        self.client = client

    def retrieve(self, snapshot: ContextSnapshot, cap: DeviceCapability) -> List[Dict]:
        """检索相似场景，返回候选策略列表"""
        # 先用简单标签匹配做初筛
        scored = []
        for story in USER_STORIES:
            overlap = len(set(story["tags"]) & set(snapshot.tags))
            if overlap > 0:
                scored.append((overlap / max(len(story["tags"]), 1), story))
        scored.sort(key=lambda x: -x[0])
        top_stories = scored[:5]

        if not top_stories:
            return []

        # 尝试用 LLM 精排（如果有 client）
        content = None
        if self.client:
            stories_text = json.dumps([{"id": s["id"], "tags": s["tags"], "desc": s["desc"]} for _, s in top_stories], ensure_ascii=False)
            prompt = RETRIEVER_PROMPT.format(tags=", ".join(snapshot.tags), stories=stories_text)
            content = self.client.chat("你是场景检索器，只输出JSON", prompt)
        if content:
            try:
                if "```" in content:
                    content = content.split("```")[1]
                    if content.startswith("json"):
                        content = content[4:]
                results = json.loads(content.strip())
                if isinstance(results, list):
                    return results[:3]
            except (json.JSONDecodeError, TypeError):
                pass

        # LLM 失败，用规则兜底
        return self._rule_retrieve(snapshot, top_stories)

    def _rule_retrieve(self, snapshot: ContextSnapshot, top_stories: list) -> List[Dict]:
        """规则兜底检索 — 输出符合图4/5的 candidate_plan 格式"""
        candidates = []
        tags = snapshot.tags
        for score, story in top_stories[:3]:
            action = story["action"]
            cand = {"story_id": story["id"], "similarity": round(score, 2)}
            # 构建符合 schema 的 candidate_plan
            if "open_10" in action:
                cand["candidate"] = {
                    "plan_id": "micro_ventilation_10",
                    "window_pct": 10, "screen_pct": 100, "duration_min": 10,
                    "needs_confirm": "confirm" in action or "CHILD_ROOM" in str(tags),
                    "guards": ["rain_level<=moderate", "wind_speed<=10"],
                    "expected_benefit": 0.6,
                    "main_risk": "通风效果有限",
                }
            elif "open_20" in action:
                cand["candidate"] = {
                    "plan_id": "ventilation_20",
                    "window_pct": 20, "screen_pct": 100, "duration_min": 15,
                    "needs_confirm": False,
                    "guards": ["rain_level<=light", "wind_speed<=8"],
                    "expected_benefit": 0.75,
                    "main_risk": "湿气进入",
                }
            elif "open_30" in action:
                cand["candidate"] = {
                    "plan_id": "ventilation_30",
                    "window_pct": 30, "screen_pct": 100, "duration_min": 20,
                    "needs_confirm": False,
                    "guards": ["rain=false", "wind_speed<=6", "aqi<=100"],
                    "expected_benefit": 0.82,
                    "main_risk": "PM2.5短时反弹",
                }
            elif "open_40" in action:
                cand["candidate"] = {
                    "plan_id": "full_ventilation_40",
                    "window_pct": 40, "screen_pct": 100, "duration_min": 30,
                    "needs_confirm": False,
                    "guards": ["rain=false", "wind_speed<=5", "aqi<=75"],
                    "expected_benefit": 0.88,
                    "main_risk": "噪声增加",
                }
            elif "close" in action:
                cand["candidate"] = {
                    "plan_id": "close_protect",
                    "window_pct": 0, "screen_pct": 0, "duration_min": None,
                    "needs_confirm": False,
                    "guards": [],
                    "expected_benefit": 0.4,
                    "main_risk": "室内闷热",
                }
            else:
                continue
            candidates.append(cand)
        return candidates
