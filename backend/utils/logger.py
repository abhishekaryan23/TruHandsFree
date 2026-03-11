import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import os

class LoggerSetup:
    """
    Configures a structured rotated file logger.
    Logs are saved to ~/.truhandsfree/logs/ to ensure they are easily accessible
    but don't clutter the main application directory.
    
    In the future, we can add a custom WebSocketHandler to stream these to the UI.
    """
    
    LOG_DIR = Path.home() / ".truhandsfree" / "logs"
    LOG_FILE = LOG_DIR / "app.log"
    
    _is_setup = False
    
    @classmethod
    def setup(cls) -> logging.Logger:
        if cls._is_setup:
            return logging.getLogger("TruHandsFree")
            
        cls.LOG_DIR.mkdir(parents=True, exist_ok=True)
        
        logger = logging.getLogger("TruHandsFree")
        logger.setLevel(logging.DEBUG)
        
        # Format: [2024-03-01 12:00:00] [INFO] [module]: message
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # File Handler (Max 5MB per file, keep 3 backups)
        file_handler = RotatingFileHandler(
            cls.LOG_FILE, maxBytes=5*1024*1024, backupCount=3
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(logging.DEBUG)
        
        # Console Handler for local CLI debugging
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        console_handler.setLevel(logging.INFO)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
        cls._is_setup = True
        return logger

# Global instance getter
def get_logger() -> logging.Logger:
    return LoggerSetup.setup()
