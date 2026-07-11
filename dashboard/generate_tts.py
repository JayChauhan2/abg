import sys
import subprocess
import os

def generate_tts(text, output_wav_path):
    print(f"Generating TTS for text: {text}")
    try:
        # Try to use gtts (requires internet but high quality)
        from gtts import gTTS
        tts = gTTS(text=text, lang='en')
        temp_mp3 = output_wav_path.replace('.wav', '.mp3')
        tts.save(temp_mp3)
        # Convert mp3 to wav via ffmpeg
        subprocess.run(['ffmpeg', '-y', '-i', temp_mp3, '-acodec', 'pcm_s16le', '-ar', '24000', '-ac', '1', output_wav_path], check=True)
        if os.path.exists(temp_mp3):
            os.remove(temp_mp3)
        print("TTS generated successfully using gTTS.")
        return True
    except Exception as e:
        print(f"gTTS failed or not installed (Error: {e}). Falling back to local macOS 'say'...")
        
    try:
        # Fallback: macOS native 'say' command (100% offline, local)
        temp_aiff = output_wav_path.replace('.wav', '.aiff')
        # Use a nice female voice like 'Samantha' or 'Ava' if available, otherwise default
        subprocess.run(['say', '-v', 'Samantha', '-o', temp_aiff, text], check=True)
        # Convert aiff to wav via ffmpeg
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
