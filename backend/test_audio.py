import time
from audio.manager import AudioManager
import os

def main():
    manager = AudioManager()
    print("AudioManager Test")
    print("Recording will start for 3 seconds...")
    
    manager.start_recording()
    time.sleep(3)
    
    wav_path = manager.stop_recording()
    print(f"Recording saved to: {wav_path}")
    if os.path.exists(wav_path):
        size = os.path.getsize(wav_path)
        print(f"File Size: {size} bytes")
        if size > 1000:
            print("Audio recording successful!")
        else:
            print("File is too small, recording might have failed.")
    else:
        print("WAV file was not created.")

if __name__ == "__main__":
    main()
