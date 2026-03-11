from providers.stt_factory import STTFactory
from security.secrets_manager import SecretsManager
import sys
import os

def main():
    print("STT Factory Test (Groq)")
    
    # We require a recorded WAV file to test
    wav_path = os.path.expanduser("~/.truhandsfree/temp/recording.wav")
    
    if not os.path.exists(wav_path):
        print("Please run `python test_audio.py` first to generate a test recording.")
        sys.exit(1)
        
    stt = STTFactory.get_client("groq")
    
    print("Transcribing... (ensure your API key is set via `test_secrets.py`)")
    transcript = stt.transcribe(wav_path, model="whisper-large-v3")
    
    if transcript:
        print("\n--- Result ---")
        print(transcript)
    else:
        print("\nTranscription failed. Check your API key or logs.")

if __name__ == "__main__":
    main()
