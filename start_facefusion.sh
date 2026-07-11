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
conda activate facefusion

# Navigate and run FaceFusion
cd "/Users/jaychauhan/ai-video-tools/facefusion"
echo "=== Starting FaceFusion with CoreML Acceleration ==="
python facefusion.py run --open-browser
