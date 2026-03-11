from typing import List, Dict, Any

class DefaultSkills:
    """
    Provides the built-in, un-deletable system skills for TruHandsFree.
    """
    
    DICTATION = {
        "id": "system_dictation",
        "name": "Standard Dictation",
        "description": "Exactly transcribes what you said, adjusting ONLY for the active application context (e.g., formatting as a text message vs a code comment). Do not change the underlying meaning.",
        "prompt": """
You are an expert transcription formatter. 
Your ONLY job is to take the provided STT transcript and format it so it looks mathematically, grammatically, and contextually perfect for the target active window.

RULES:
1. Do NOT add conversational filler (e.g., "Here is the text:", "Sure!").
2. Do NOT answer questions the user asks in the transcript. You are just formatting their speech.
3. If the active window is 'Terminal' or 'iTerm', format it as a valid bash/zsh command.
4. If the active window is a code editor (e.g., 'Code', 'Cursor', 'PyCharm'), format it appropriately based on the window title (e.g., if title ends in .py, format as python code).
5. If the active window is a messaging app (e.g., 'Slack', 'Discord'), format it as a casual message.
6. OUTPUT ONLY THE FINAL TEXT to be typed. Nothing else.
"""
    }

    GRAMMAR_FIX = {
        "id": "system_grammar",
        "name": "Fix Grammar & Tone",
        "description": "Cleans up the text to sound professional and grammatically correct.",
        "prompt": """
You are an expert editor.
Analyze the provided transcript and rewrite it to be perfectly grammatical, professional, and clear.
Fix any obvious STT misinterpretations.

RULES:
1. Do NOT add conversational filler.
2. OUTPUT ONLY THE FINAL REWRITTEN TEXT to be typed. Nothing else.
"""
    }

    @classmethod
    def get_defaults(cls) -> List[Dict[str, Any]]:
        return [cls.DICTATION, cls.GRAMMAR_FIX]
