"""
MiniMax API 客户端
统一封装，支持 chat 和 VLM
"""
import json
import logging
import os
import urllib.request
from typing import Optional
import yaml
from pathlib import Path

logger = logging.getLogger(__name__)


class MiniMaxClient:
    def __init__(self, config_path: str = None):
        if config_path is None:
            config_path = str(Path(__file__).parent.parent / "config" / "ai_config.yaml")
        with open(config_path, 'r') as f:
            cfg = yaml.safe_load(f)
        mm = cfg["minimax"]
        self.api_key = os.environ.get("MINIMAX_API_KEY", mm["api_key"])
        self.chat_url = mm["chat_url"]
        self.vlm_url = mm["vlm_url"]
        self.model = mm["model"]
        self.timeout = mm.get("timeout_s", 8)
        self.temperature = mm.get("temperature", 0.3)
        self.max_tokens = mm.get("max_tokens", 300)

    def chat(self, system: str, user: str, temperature: float = None) -> Optional[str]:
        """同步调用 chat completions"""
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature if temperature is not None else self.temperature,
            "max_tokens": self.max_tokens,
        }
        try:
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                self.chat_url, data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                }
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                result = json.loads(resp.read())
            return result["choices"][0]["message"]["content"]
        except Exception as e:
            logger.warning("MiniMax API call failed: %s", e)
            return None

    def vlm(self, prompt: str, image_b64: str) -> Optional[str]:
        """调用 VLM 图片理解"""
        payload = {
            "prompt": prompt,
            "image_url": f"data:image/jpeg;base64,{image_b64}",
        }
        try:
            data = json.dumps(payload).encode()
            req = urllib.request.Request(
                self.vlm_url, data=data,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {self.api_key}",
                }
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                result = json.loads(resp.read())
            for key in ("content", "text", "answer", "output"):
                if key in result and isinstance(result[key], str) and result[key]:
                    return result[key]
            return None
        except Exception as e:
            logger.warning("MiniMax API call failed: %s", e)
            return None
