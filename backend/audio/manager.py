import sounddevice as sd
import numpy as np
import wave
import queue
from datetime import datetime
from pathlib import Path
from utils.logger import get_logger

logger = get_logger()

class AudioManager:
    """
    Manages audio capture from the default microphone.
    Records to memory, then saves both a temp file and a timestamped debug copy.
    """
    def __init__(self, sample_rate=16000, channels=1):
        self.sample_rate = sample_rate
        self.channels = channels
        self._audio_queue = queue.Queue()
        self._recording = False
        self._stream = None
        self._current_amplitude: float = 0.0  # Live VU meter value (0.0–1.0)
        
        # Temp save path for the WAV (always overwritten each recording)
        self.TEMP_DIR = Path.home() / ".truhandsfree" / "temp"
        self.TEMP_DIR.mkdir(parents=True, exist_ok=True)
        self.TEMP_WAV_FILE = self.TEMP_DIR / "recording.wav"

        # Debug recordings directory (timestamped copies kept for debugging)
        self.RECORDINGS_DIR = Path.home() / ".truhandsfree" / "recordings"
        self.RECORDINGS_DIR.mkdir(parents=True, exist_ok=True)

    @property
    def is_recording(self) -> bool:
        return self._recording

    def _audio_callback(self, indata, frames, time, status):
        """Called for each audio block from the microphone."""
        if status:
            logger.warning(f"Audio stream status: {status}")
        if self._recording:
            self._audio_queue.put(indata.copy())
            # Compute live amplitude for VU meter (0.0 = silence, 1.0 = clipping)
            self._current_amplitude = float(np.max(np.abs(indata)))

    @property
    def current_amplitude(self) -> float:
        """Returns the current audio amplitude (0.0–1.0) for live VU meter display."""
        return self._current_amplitude if self._recording else 0.0

    @staticmethod
    def get_input_devices(refresh: bool = False) -> list[dict]:
        """Returns a list of available input devices from sounddevice.
        
        Args:
            refresh: If True, forces PortAudio to rescan hardware.
                     This picks up newly connected/disconnected microphones.
                     Only safe when NOT actively recording (a stream reset would break it).
        """
        try:
            if refresh:
                # Force PortAudio to rescan hardware — picks up hot-plugged devices
                sd._terminate()
                sd._initialize()
                logger.info("[AudioManager] PortAudio rescanned for device changes.")

            devices = sd.query_devices()
            inputs = []
            for i, dev in enumerate(devices):
                if dev['max_input_channels'] > 0:
                    inputs.append({
                        "id": i,
                        "name": dev['name'],
                        "channels": dev['max_input_channels']
                    })
            return inputs
        except Exception as e:
            logger.error(f"Failed to list audio devices: {e}")
            return []

    def start_recording(self, device_name: str = None):
        """Starts listening to the microphone in a non-blocking stream."""
        if self._recording:
            logger.warning("Already recording — ignoring duplicate start.")
            return

        # Clear the queue from any previous run
        while not self._audio_queue.empty():
            self._audio_queue.get()

        self._recording = True
        self._current_amplitude = 0.0
        
        # Resolve device
        device_id = None
        if device_name:
            devices = self.get_input_devices()
            for d in devices:
                if d['name'] == device_name:
                    device_id = d['id']
                    break
            if device_id is None:
                logger.warning(f"[AudioManager] Could not find device '{device_name}'. Falling back to system default.")
        
        logger.info(f"[AudioManager] Opening microphone stream (device={device_id or 'default'}, rate={self.sample_rate}, channels={self.channels})")
        
        try:
            self._stream = sd.InputStream(
                device=device_id,
                samplerate=self.sample_rate,
                channels=self.channels,
                callback=self._audio_callback
            )
            self._stream.start()
            logger.info("[AudioManager] ✓ Microphone recording started. Speak now...")
        except Exception as e:
            self._recording = False
            logger.error(f"[AudioManager] ✗ Failed to start microphone: {e}")

    def stop_recording(self) -> str:
        """
        Stops listening, concatenates audio chunks, saves to WAV.
        Also saves a timestamped debug copy.
        Returns the absolute path to the saved WAV file.
        """
        if not self._recording:
            logger.warning("[AudioManager] Not currently recording — nothing to stop.")
            return ""

        self._recording = False
        self._current_amplitude = 0.0
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None
            
        logger.info("[AudioManager] Microphone stopped. Processing audio buffer...")

        # Drain the queue
        audio_data = []
        while not self._audio_queue.empty():
            audio_data.append(self._audio_queue.get())
            
        if not audio_data:
            logger.warning("[AudioManager] ✗ No audio data captured — queue was empty.")
            return ""

        # Concatenate all chunks
        recording = np.concatenate(audio_data, axis=0)
        duration = len(recording) / self.sample_rate
        
        logger.info(f"[AudioManager] Captured {len(audio_data)} chunks, {len(recording)} samples, {duration:.2f}s duration")

        # Check if audio has any meaningful signal
        peak = np.max(np.abs(recording))
        rms = np.sqrt(np.mean(recording ** 2))
        logger.info(f"[AudioManager] Audio stats — Peak: {peak:.4f}, RMS: {rms:.6f}")
        
        if peak < 0.001:
            logger.warning("[AudioManager] ⚠ Very low audio signal — microphone might not be picking up sound.")

        # Convert float32 [-1.0, 1.0] → Int16 for STT APIs
        recording_int16 = np.int16(recording * 32767)
        
        # Save temp file (always overwritten)
        with wave.open(str(self.TEMP_WAV_FILE), 'w') as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(2) # 16-bit
            wf.setframerate(self.sample_rate)
            wf.writeframes(recording_int16.tobytes())
        logger.info(f"[AudioManager] ✓ Saved temp WAV: {self.TEMP_WAV_FILE}")
        
        # Save timestamped debug copy
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        debug_file = self.RECORDINGS_DIR / f"recording_{timestamp}.wav"
        with wave.open(str(debug_file), 'w') as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(recording_int16.tobytes())
        logger.info(f"[AudioManager] ✓ Saved debug WAV: {debug_file}")

        # Cleanup: keep only the last 50 debug recordings
        self._cleanup_old_recordings(max_keep=50)
        
        return str(self.TEMP_WAV_FILE)

    def _cleanup_old_recordings(self, max_keep: int = 50):
        """Remove oldest debug recordings beyond the max_keep limit."""
        try:
            recordings = sorted(
                self.RECORDINGS_DIR.glob("recording_*.wav"),
                key=lambda f: f.stat().st_mtime
            )
            if len(recordings) > max_keep:
                for old_file in recordings[:-max_keep]:
                    old_file.unlink()
                    logger.debug(f"[AudioManager] Cleaned up old recording: {old_file.name}")
        except Exception as e:
            logger.warning(f"[AudioManager] Failed to clean up old recordings: {e}")
