import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from .defaults import DefaultSkills
from utils.logger import get_logger

logger = get_logger()

class SkillManager:
    """
    Manages loading, retrieving, and saving user-defined skills.
    User skills are saved to ~/.truhandsfree/skills.json.
    """
    
    SKILLS_FILE = Path.home() / ".truhandsfree" / "skills.json"
    
    def __init__(self):
        self._skills: List[Dict[str, Any]] = []
        self._ensure_file_exists()
        self.load_skills()

    def _ensure_file_exists(self):
        self.SKILLS_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not self.SKILLS_FILE.exists():
            # Seed with an empty custom list; defaults are injected at runtime
            with open(self.SKILLS_FILE, 'w') as f:
                json.dump([], f)

    def load_skills(self):
        try:
            with open(self.SKILLS_FILE, 'r') as f:
                custom_skills = json.load(f)
            # Always prepend system defaults
            self._skills = DefaultSkills.get_defaults() + custom_skills
            logger.info(f"Loaded {len(self._skills)} skills.")
        except Exception as e:
            logger.error(f"Error loading skills: {e}")
            self._skills = DefaultSkills.get_defaults()

    def get_all_skills(self) -> List[Dict[str, Any]]:
        return self._skills

    def get_skill(self, skill_id: str) -> Optional[Dict[str, Any]]:
        for skill in self._skills:
            if skill.get("id") == skill_id:
                return skill
        return None

    def add_custom_skill(self, skill: Dict[str, Any]) -> bool:
        if skill.get("id", "").startswith("system_"):
            logger.error("Cannot use 'system_' prefix for custom skills.")
            return False
            
        custom_skills = [s for s in self._skills if not s.get("id", "").startswith("system_")]
        custom_skills.append(skill)
        
        try:
            with open(self.SKILLS_FILE, 'w') as f:
                json.dump(custom_skills, f, indent=4)
            self.load_skills() # Reload to include defaults
            return True
        except Exception as e:
            logger.error(f"Failed to save custom skill: {e}")
            return False

    def delete_custom_skill(self, skill_id: str) -> bool:
        """Deletes a custom skill by ID. Cannot delete system skills."""
        if skill_id.startswith("system_"):
            logger.error("Cannot delete system skills.")
            return False

        custom_skills = [s for s in self._skills if not s.get("id", "").startswith("system_")]
        new_custom = [s for s in custom_skills if s.get("id") != skill_id]

        if len(new_custom) == len(custom_skills):
            logger.warning(f"Skill '{skill_id}' not found for deletion.")
            return False

        try:
            with open(self.SKILLS_FILE, 'w') as f:
                json.dump(new_custom, f, indent=4)
            self.load_skills()
            return True
        except Exception as e:
            logger.error(f"Failed to delete skill '{skill_id}': {e}")
            return False
