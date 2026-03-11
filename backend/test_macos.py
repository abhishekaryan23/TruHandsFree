from os_interfaces.macos import MacOSAdapter
import time

def main():
    print("Testing MacOSAdapter...")
    adapter = MacOSAdapter()
    
    print("\n--- Active Window Context ---")
    context = adapter.get_active_window_context()
    print(f"App Name: {context.get('app_name')}")
    print(f"Process ID: {context.get('process_id')}")
    
    # We will test pasting conditionally or manually.
    print("\nNote: To test pasting, keep focus on an input field after running the script.")
    time.sleep(2)
    print("Pasting 'Hello World' via Cmd+V simulation...")
    adapter.paste_text("Hello World from TruHandsFree Test!")
    
if __name__ == "__main__":
    main()
