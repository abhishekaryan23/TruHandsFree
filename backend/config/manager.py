import json
import os
from pathlib import Path
from .models import AppConfig

class ConfigManager:
    """
    Singleton manager for loading, validating, and saving application configuration.
    """
    _instance = None
    _config: AppConfig = None
    
    # Store config in the user's home directory under .truhandsfree
    CONFIG_DIR = Path.home() / ".truhandsfree"
    CONFIG_FILE = CONFIG_DIR / "config.json"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
            cls._instance._ensure_config_exists()
            cls._instance.load_config()
        return cls._instance

    def _ensure_config_exists(self):
        self.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        if not self.CONFIG_FILE.exists():
            default_config = AppConfig()
            self._save_raw(default_config.model_dump())

    def _save_raw(self, data: dict):
        try:
            with open(self.CONFIG_FILE, 'w') as f:
                json.dump(data, f, indent=4)
        except Exception as e:
            print(f"[ConfigManager] Failed to save config to disk: {e}")

    def load_config(self) -> AppConfig:
        try:
            with open(self.CONFIG_FILE, 'r') as f:
                data = json.load(f)
            self._config = AppConfig(**data)
        except Exception as e:
            print(f"Error loading config, falling back to defaults: {e}")
            self._config = AppConfig()
        return self._config

    def get_config(self) -> AppConfig:
        if not self._config:
            return self.load_config()
        return self._config

    def update_config(self, new_data: dict) -> AppConfig:
        """
        Updates the current configuration with new partial data,
        validates it via Pydantic, and saves it to disk.
        """
        # Convert current config to dict, update it, and revalidate
        current_data = self._config.model_dump()
        
        # Deep update helper
        def pretty_deep_update(d, u):
            for k, v in u.items():
                if isinstance(v, dict):
                    d[k] = pretty_deep_update(d.get(k, {}), v)
                else:
                    d[k] = v
            return d
            
        updated_data = pretty_deep_update(current_data, new_data)
        
        try:
            # Validate through Pydantic
            self._config = AppConfig(**updated_data)
        except Exception as e:
            print(f"[ConfigManager] Config validation failed: {e}")
            return None
        
        # Save to disk
        self._save_raw(self._config.model_dump())
        return self._config
