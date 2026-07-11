import sys
import subprocess
import os

def generate_tts(text, output_wav_path):
    print(f"Generating TTS for text: {text}")
    
    # 1. Try to use Kokoro-ONNX (Pro-grade local offline TTS)
    try:
        from kokoro_onnx import Kokoro
        import soundfile as sf
        
        script_dir = os.path.dirname(__file__)
        model_path = os.path.join(script_dir, "models", "kokoro", "kokoro-v1.0.onnx")
        voices_path = os.path.join(script_dir, "models", "kokoro", "voices-v1.0.bin")
        
        if os.path.exists(model_path) and os.path.exists(voices_path):
            print("Using Kokoro-ONNX local studio-grade TTS...")
            kokoro = Kokoro(model_path, voices_path)
            # af_sarah is a beautiful female speaker voice
            samples, sample_rate = kokoro.create(text, voice="af_sarah", speed=1.0, lang="en-us")
            sf.write(output_wav_path, samples, sample_rate)
            print("TTS generated successfully using local Kokoro-ONNX.")
            return True
        else:
            print("Kokoro model files not found. Falling back to online/offline alternatives...")
    except Exception as e:
        print(f"Kokoro-ONNX failed or not installed (Error: {e}). Trying other paths...")

    # 2. Try to use gtts (requires internet but high quality)
    try:
        from gtts import gTTS
        tts = gTTS(text=text, lang='en')
        temp_mp3 = output_wav_path.replace('.wav', '.mp3')
        tts.save(temp_mp3)
        subprocess.run(['ffmpeg', '-y', '-i', temp_mp3, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', output_wav_path], check=True)
        if os.path.exists(temp_mp3):
            os.remove(temp_mp3)
        print("TTS generated successfully using gTTS.")
        return True
    except Exception as e:
        print(f"gTTS failed or not installed (Error: {e}). Falling back to local macOS 'say'...")
        
    # 3. Fallback: macOS native 'say' command (100% offline, local)
    try:
        temp_aiff = output_wav_path.replace('.wav', '.aiff')
        subprocess.run(['say', '-v', 'Samantha', '-o', temp_aiff, text], check=True)
        subprocess.run(['ffmpeg', '-y', '-i', temp_aiff, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', output_wav_path], check=True)
        if os.path.exists(temp_aiff):
            os.remove(temp_aiff)
        print("TTS generated successfully using local macOS 'say'.")
        return True
    except Exception as e:
        print(f"macOS 'say' fallback failed: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_tts.py <text> <output_wav_path>")
        sys.exit(1)
    text = sys.argv[1]
    output_path = sys.argv[2]
    success = generate_tts(text, output_path)
    if not success:
        sys.exit(1)
