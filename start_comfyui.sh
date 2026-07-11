#!/bin/bash

# Load Conda
CONDA_SH="/opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh"
if [ -f "$CONDA_SH" ]; then
    source "$CONDA_SH"
else
    echo "Error: Conda not found at $CONDA_SH"
    exit 1
fi

# Activate environment
conda activate comfyui

# Navigate and run ComfyUI
cd "/Users/jaychauhan/ai-video-tools/ComfyUI"
echo "=== Starting ComfyUI on Apple Silicon (MPS) ==="
python main.py
