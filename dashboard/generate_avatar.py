import sys
import os
import torch

def generate_avatar(prompt, output_jpg_path):
    print(f"Generating AI Avatar portrait for prompt: {prompt}")
    
    # Check if diffusers is installed
    try:
        from diffusers import AutoPipelineForText2Image
    except ImportError:
        print("Installing diffusers, transformers, and accelerate...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "diffusers", "transformers", "accelerate"], check=True)
        from diffusers import AutoPipelineForText2Image
        
    print("Loading SD-Turbo model (local cache or downloading ~2GB model if first time)...")
    try:
        # Use mps on macOS Apple Silicon
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        dtype = torch.float16 if device == "mps" else torch.float32
        
        # Load SD-Turbo pipeline
        pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sd-turbo", 
            torch_dtype=dtype, 
            variant="fp16" if device == "mps" else None
        )
        pipe.to(device)
        
        print("Generating image...")
        # SD-Turbo only needs 1 step and guidance_scale=0.0 to generate a high quality image!
        image = pipe(prompt=prompt, num_inference_steps=1, guidance_scale=0.0).images[0]
        
        # Save to output path
        image.save(output_jpg_path)
        print(f"AI Avatar generated successfully and saved to {output_jpg_path}")
        return True
    except Exception as e:
        print(f"Stable Diffusion generation failed: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_avatar.py <prompt> <output_jpg_path>")
        sys.exit(1)
        
    prompt = sys.argv[1]
    output_path = sys.argv[2]
    
    success = generate_avatar(prompt, output_path)
    if not success:
        sys.exit(1)
