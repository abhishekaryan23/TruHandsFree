from agent.supervisor import SupervisorAgent
import os

def main():
    print("Testing Supervisor Agent...")
    
    agent = SupervisorAgent()
    
    print("\n--- Scenario 1: Terminal Context (Dictation) ---")
    raw_transcript = "list all files in the current directory"
    os_context = {
        "app_name": "Terminal",
        "window_title": "zsh"
    }
    
    response = agent.process_transcript(raw_transcript, os_context, "system_dictation")
    print(f"Transcript: '{raw_transcript}'")
    print(f"Active App: {os_context['app_name']}")
    print(f"Result:\n{response}")
    
    print("\n--- Scenario 2: Markdown File (Dictation) ---")
    raw_transcript = "create a level 2 header called feature list followed by bullet points for fast and secure"
    os_context_md = {
        "app_name": "Code",
        "window_title": "README.md"
    }
    
    response_md = agent.process_transcript(raw_transcript, os_context_md, "system_dictation")
    print(f"Transcript: '{raw_transcript}'")
    print(f"Active App: {os_context_md['app_name']} ({os_context_md['window_title']})")
    print(f"Result:\n{response_md}")
    
    print("\n--- Scenario 3: Slack (Grammar Fix) ---")
    raw_transcript = "hey man im gonna b late for the meeting today cause of traffic."
    os_context_slack = {
        "app_name": "Slack",
        "window_title": "engineering-channel"
    }
    
    response_slack = agent.process_transcript(raw_transcript, os_context_slack, "system_grammar")
    print(f"Transcript: '{raw_transcript}'")
    print(f"Active App: {os_context_slack['app_name']}")
    print(f"Result:\n{response_slack}")

if __name__ == "__main__":
    main()
