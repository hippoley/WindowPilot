"""
设备能力画像 (Device Capability Profile)
从配置文件加载，回答"这台设备能做什么、不能做什么"
"""
import yaml
from dataclasses import dataclass
from pathlib import Path


@dataclass
class DeviceCapability:
    """设备能力边界"""
    model: str = "CWDS-CA01"
    window_type: str = "外平开窗"
    screen_type: str = "motorized"
    has_screen_interference: bool = True
    supports_percent_control: bool = True
    supports_linkage: bool = True
    max_stroke_mm: float = 530.0
    actuator_speed_mm_per_s: float = 50.0
    screen_speed_pct_per_s: float = 20.0
    power_type: str = "adapter"
    # 联动规则
    open_window_requires_screen_down: bool = True
    close_window_allows_screen_up: bool = True

    @classmethod
    def from_yaml(cls, path: str = None) -> 'DeviceCapability':
        if path is None:
            path = str(Path(__file__).parent.parent / "config" / "device_profile.yaml")
        with open(path, 'r') as f:
            cfg = yaml.safe_load(f)
        dev = cfg.get("device", {})
        link = cfg.get("linkage", {})
        return cls(
            model=dev.get("model", "CWDS-CA01"),
            window_type=dev.get("window_type", "外平开窗"),
            screen_type=dev.get("screen_type", "motorized"),
            has_screen_interference=dev.get("has_screen_interference", True),
            supports_percent_control=dev.get("supports_percent_control", True),
            supports_linkage=dev.get("supports_linkage", True),
            max_stroke_mm=dev.get("max_stroke_mm", 530.0),
            actuator_speed_mm_per_s=dev.get("actuator_speed_mm_per_s", 50.0),
            screen_speed_pct_per_s=dev.get("screen_speed_pct_per_s", 20.0),
            power_type=dev.get("power_type", "adapter"),
            open_window_requires_screen_down=link.get("open_window_requires_screen_down", True),
            close_window_allows_screen_up=link.get("close_window_allows_screen_up", True),
        )
