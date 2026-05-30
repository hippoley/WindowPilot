"""
AI-2 场景检索 (Scene Retrieval / RAG)
从用户故事库中找相似场景，生成候选策略
位置：P6 场景检索节点
输入：当前状态向量 + 设备画像 + 用户故事库
输出：相似场景列表 + 候选策略集
不能做：不是最终裁判，只提供参考
"""
import json
import yaml
from pathlib import Path
from typing import List, Dict, Optional
from ai.client import MiniMaxClient
from domain.context_snapshot import ContextSnapshot
from domain.capability import DeviceCapability

# 从 YAML 配置加载场景模板库（运营可维护，无需改代码）
_TEMPLATES_PATH = Path(__file__).parent.parent / "config" / "scene_templates.yaml"
try:
    with open(_TEMPLATES_PATH, encoding="utf-8") as f:
        _TEMPLATES_CFG = yaml.safe_load(f)
    SCENE_TEMPLATES = _TEMPLATES_CFG.get("templates", [])
except FileNotFoundError:
    SCENE_TEMPLATES = []

# 兼容旧接口
USER_STORIES = [
    {"id": t["id"], "template_key": t.get("template_key", ""),
     "tags": t["tags"], "action": t["action"], "desc": t["description"]}
    for t in SCENE_TEMPLATES
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
                scored.append((overlap / max(len(story["tags"]), len(snapshot.tags)), story))
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
        """规则兜底检索 — 直接使用 YAML 模板中的 action 字段"""
        candidates = []
        for score, story in top_stories[:3]:
            action = story["action"]
            cand = {
                "story_id": story["id"],
                "template_key": story.get("template_key", ""),
                "similarity": round(score, 2),
                "candidate": {
                    "window_pct": action["window_pct"],
                    "screen_pct": action["screen_pct"],
                    "duration_min": action.get("duration_min"),
                    "needs_confirm": action.get("needs_confirm", False),
                },
            }
            candidates.append(cand)
        return candidates
