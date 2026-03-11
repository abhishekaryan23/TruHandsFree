from typing import Dict, Any, Optional
from langchain_core.prompts import ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate
from providers.llm_factory import LLMFactory
from agent.skills.manager import SkillManager
from utils.logger import get_logger

logger = get_logger()

class SupervisorAgent:
    """
    The core Langchain implementation that takes in the raw transcript,
    active window context, and the selected skill prompt to generate
    final formatted output.
    """
    
    def __init__(self, provider: str = "groq", model: str = "llama3-70b-8192", temperature: float = 0.0):
        self.provider = provider
        self.model_name = model
        self.temperature = temperature
        self.skill_manager = SkillManager()
        
        # We hold off on instantiating the LLM until execution time
        # to ensure it uses the most up-to-date API keys and configs.

    def process_transcript(self, raw_transcript: str, os_context: Dict[str, Any], skill_id: str = "system_dictation") -> Optional[str]:
        if not raw_transcript or not raw_transcript.strip():
            logger.warning("Empty transcript provided to supervisor.")
            return None
            
        skill_data = self.skill_manager.get_skill(skill_id)
        if not skill_data:
            logger.warning(f"Skill '{skill_id}' not found. Falling back to system_dictation.")
            skill_data = self.skill_manager.get_skill("system_dictation")

        try:
            llm = LLMFactory.get_llm(self.provider, self.model_name, self.temperature)
        except Exception as e:
            logger.error(f"Failed to initialize LLM for agent processing: {e}")
            return None

        system_instruction = skill_data.get("prompt", "")
        
        system_template = """{system_instruction}

--- CURRENT ACTIVE WINDOW CONTEXT ---
App Name: {app_name}
Window Title: {window_title}
-------------------------------------
"""
        
        human_template = """Raw STT Transcript to Process:
{transcript}
"""

        prompt = ChatPromptTemplate.from_messages([
            SystemMessagePromptTemplate.from_template(system_template),
            HumanMessagePromptTemplate.from_template(human_template)
        ])

        chain = prompt | llm

        logger.info(f"Invoking Supervisor Agent (Model: {self.model_name}, Skill: {skill_data.get('name')})")
        
        try:
            response = chain.invoke({
                "system_instruction": system_instruction,
                "app_name": os_context.get("app_name", "Unknown"),
                "window_title": os_context.get("window_title", "Unknown"),
                "transcript": raw_transcript
            })
            
            final_text = response.content.strip()
            # Failsafe: Remove markdown blocks if the LLM wraps it unnecessarily, 
            # though the prompt usually handles this.
            if final_text.startswith("```") and final_text.endswith("```"):
                lines = final_text.split('\n')
                if len(lines) >= 3:
                     final_text = '\n'.join(lines[1:-1])

            return final_text
            
        except Exception as e:
            logger.error(f"Supervisor Agent execution failed: {e}")
            return None
