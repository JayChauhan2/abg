import sys
import os
import subprocess

def split_text_into_segments(text, words_per_segment=4):
    words = text.split()
    segments = []
    for i in range(0, len(words), words_per_segment):
        segment_words = words[i:i + words_per_segment]
        segments.append(" ".join(segment_words))
    return segments

def generate_srt(segments, duration, srt_path):
    # Calculate character lengths
    total_chars = sum(len(s) for s in segments)
    if total_chars == 0:
        return
        
    current_time = 0.0
    with open(srt_path, 'w', encoding='utf-8') as f:
        for idx, seg in enumerate(segments):
            seg_len = len(seg)
            # Share of duration proportional to character count
            seg_duration = (seg_len / total_chars) * duration
            end_time = current_time + seg_duration
            
            # Formatting timestamp
            start_str = format_timestamp(current_time)
            end_str = format_timestamp(end_time)
            
            f.write(f"{idx + 1}\n")
            f.write(f"{start_str} --> {end_str}\n")
            f.write(f"{seg}\n\n")
            
            current_time = end_time

def format_timestamp(seconds):
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

def burn_subtitles(video_path, srt_path, output_path):
    print(f"Burning subtitles from {srt_path} onto {video_path}...")
    
    # Styled subtitles: Bottom-Center, Font Size 18, White text, Black background box (BorderStyle=3)
    style = "Alignment=2,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=1,Shadow=1"
    
    # We must escape the srt path for the subtitles filter
    # On macOS/Unix, we replace backslashes and single quotes
    escaped_srt = srt_path.replace("'", "'\\\\''").replace(":", "\\:")
    
    cmd = [
        'ffmpeg', '-y',
        '-i', video_path,
        '-vf', f"subtitles='{escaped_srt}':force_style='{style}'",
        '-c:a', 'copy',
        output_path
    ]
    
    subprocess.run(cmd, check=True)
    print("Subtitles burned successfully.")

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python burn_subtitles.py <video_path> <text_script_or_file> <duration_sec> <output_path>")
        sys.exit(1)
        
    video_path = sys.argv[1]
    text_or_file = sys.argv[2]
    duration = float(sys.argv[3])
    output_path = sys.argv[4]
    
    if os.path.exists(text_or_file):
        with open(text_or_file, 'r', encoding='utf-8') as f:
            text_script = f.read()
    else:
        text_script = text_or_file
        
    srt_path = video_path.replace('.mp4', '.srt')
    
    segments = split_text_into_segments(text_script)
    generate_srt(segments, duration, srt_path)
    
    try:
        burn_subtitles(video_path, srt_path, output_path)
    finally:
        # Clean up srt file
        if os.path.exists(srt_path):
            os.remove(srt_path)
