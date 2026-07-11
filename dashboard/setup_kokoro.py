import os
import sys
import urllib.request

def download_file(url, filepath):
    if os.path.exists(filepath):
        print(f"File {filepath} already exists. Skipping download.")
        return
    print(f"Downloading {url} to {filepath}...")
    try:
        urllib.request.urlretrieve(url, filepath)
        print("Download completed successfully.")
    except Exception as e:
        print(f"Failed to download: {e}")
        sys.exit(1)

def main():
    models_dir = os.path.join(os.path.dirname(__file__), 'models', 'kokoro')
    os.makedirs(models_dir, exist_ok=True)
    
    # URLs
    model_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
    voices_url = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"
    
    model_path = os.path.join(models_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(models_dir, "voices-v1.0.bin")
    
    # Download
    download_file(model_url, model_path)
    download_file(voices_url, voices_path)
    print("Kokoro-82M model files are ready.")

if __name__ == "__main__":
    main()
