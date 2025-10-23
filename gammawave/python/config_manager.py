"""
Configuration management for Gammawave
"""
import json
import os
from pathlib import Path
from typing import Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)

class ConfigManager:
    def __init__(self):
        self.config_dir = Path.home() / ".gammawave"
        self.config_file = self.config_dir / "config.json"
        self.recordings_dir = self.config_dir / "recordings"
        self.config = self._load_config()
        
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from file or create default"""
        default_config = {
            "openaiApiKey": "",
            "geminiApiKey": "",
            "defaultProvider": "openai",
            "maxRecordings": 100,
            "audioFormat": "wav",
            "geminiModel": "gemini-2.5-pro",
            "preserveOriginalLanguage": True
        }
        
        try:
            if self.config_file.exists():
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                    # Merge with defaults to ensure all keys exist
                    default_config.update(config)
            else:
                # Create default config file
                self._save_config(default_config)
        except Exception as e:
            logger.error(f"Error loading config: {e}")
            
        return default_config
    
    def _save_config(self, config: Dict[str, Any] = None) -> bool:
        """Save configuration to file"""
        if config is None:
            config = self.config
            
        try:
            # Ensure config directory exists
            self.config_dir.mkdir(exist_ok=True)
            
            with open(self.config_file, 'w') as f:
                json.dump(config, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Error saving config: {e}")
            return False
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value"""
        return self.config.get(key, default)
    
    def set(self, key: str, value: Any) -> bool:
        """Set configuration value"""
        self.config[key] = value
        return self._save_config()
    
    def update(self, updates: Dict[str, Any]) -> bool:
        """Update multiple configuration values"""
        self.config.update(updates)
        return self._save_config()
    
    def get_api_key(self, provider: str) -> Optional[str]:
        """Get API key for a provider"""
        key_map = {
            "openai": "openaiApiKey",
            "gemini": "geminiApiKey"
        }
        return self.config.get(key_map.get(provider, ""))
    
    def set_api_key(self, provider: str, key: str) -> bool:
        """Set API key for a provider"""
        key_map = {
            "openai": "openaiApiKey",
            "gemini": "geminiApiKey"
        }
        if provider in key_map:
            return self.set(key_map[provider], key)
        return False
    
    def ensure_directories(self) -> None:
        """Ensure all required directories exist"""
        self.config_dir.mkdir(exist_ok=True)
        self.recordings_dir.mkdir(exist_ok=True)
        
    def create_recording_directory(self, timestamp: str = None) -> Path:
        """Create a new recording directory with timestamp"""
        if timestamp is None:
            from datetime import datetime
            timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
            
        recording_dir = self.recordings_dir / timestamp
        recording_dir.mkdir(parents=True, exist_ok=True)
        return recording_dir
    
    def cleanup_old_recordings(self, max_keep: int = None) -> None:
        """Remove old recording directories, keeping only the most recent ones"""
        if max_keep is None:
            max_keep = self.get("maxRecordings", 100)
            
        try:
            recordings = sorted(self.recordings_dir.iterdir(), key=lambda x: x.stat().st_mtime, reverse=True)
            for old_dir in recordings[max_keep:]:
                import shutil
                shutil.rmtree(old_dir)
                logger.info(f"Removed old recording directory: {old_dir}")
        except Exception as e:
            logger.error(f"Error cleaning up old recordings: {e}")

# Global config instance
config = ConfigManager()
