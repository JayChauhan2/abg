const express = require('express');
const path = require('path');
const { spawn, exec } = require('child_process');
const net = require('net');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Multer Upload Configuration
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'public/outputs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
if (!fs.existsSync(outputsDir)) fs.mkdirSync(outputsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

const toolConfigs = {
  comfyui: {
    name: "ComfyUI (LivePortrait)",
    script: "/Users/jaychauhan/ai-video-tools/start_comfyui.sh",
    port: 8188,
    url: "http://127.0.0.1:8188"
  },
  facefusion: {
    name: "FaceFusion",
    script: "/Users/jaychauhan/ai-video-tools/start_facefusion.sh",
    port: 7860,
    url: "http://127.0.0.1:7860"
  },
  rvc: {
    name: "RVC WebUI",
    script: "/Users/jaychauhan/ai-video-tools/start_rvc.sh",
    port: 7865,
    url: "http://127.0.0.1:7865"
  }
};

const processes = {
  comfyui: { child: null, logs: [], status: 'stopped', portActive: false },
  facefusion: { child: null, logs: [], status: 'stopped', portActive: false },
  rvc: { child: null, logs: [], status: 'stopped', portActive: false }
};

const swapTasks = {};

// Helper to run a command shell promise
function runShellCommand(cmd, logCallback) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', cmd], { detached: true });
    
    child.stdout.on('data', (data) => {
      if (logCallback) logCallback(data.toString().trim());
    });
    
    child.stderr.on('data', (data) => {
      if (logCallback) logCallback(data.toString().trim());
    });
    
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command exited with code ${code}`));
    });
  });
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    exec(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, (err, stdout, stderr) => {
      if (err) return reject(err);
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) return reject(new Error("Failed to parse duration"));
      resolve(duration);
    });
  });
}

// Check if a port is open
function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onError = () => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(500);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, '127.0.0.1', () => {
      socket.end();
      resolve(true);
    });
  });
}

function addLog(tool, data) {
  const lines = data.toString().split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      processes[tool].logs.push({
        timestamp: new Date().toLocaleTimeString(),
        text: line
      });
    }
  });
  if (processes[tool].logs.length > 500) {
    processes[tool].logs.shift();
  }
}

// Background loop to monitor ports
setInterval(async () => {
  for (const tool of Object.keys(toolConfigs)) {
    const config = toolConfigs[tool];
    const proc = processes[tool];
    if (proc.status === 'running') {
      proc.portActive = await checkPort(config.port);
    } else {
      proc.portActive = false;
    }
  }
}, 1000);

// API Endpoints
app.get('/api/status', (req, res) => {
  const statusData = {};
  for (const tool of Object.keys(toolConfigs)) {
    statusData[tool] = {
      name: toolConfigs[tool].name,
      status: processes[tool].status,
      port: toolConfigs[tool].port,
      url: toolConfigs[tool].url,
      portActive: processes[tool].portActive,
      logCount: processes[tool].logs.length
    };
  }
  res.json(statusData);
});

function startTool(tool) {
  if (!toolConfigs[tool]) return;
  if (processes[tool].status === 'running' || processes[tool].status === 'starting') return;

  console.log(`Starting ${toolConfigs[tool].name}...`);
  processes[tool].status = 'starting';
  processes[tool].logs = [{ timestamp: new Date().toLocaleTimeString(), text: `Starting server...` }];

  const child = spawn('bash', [toolConfigs[tool].script], {
    detached: true,
    stdio: 'pipe',
    env: { ...process.env, PAGER: 'cat' }
  });

  processes[tool].child = child;
  processes[tool].status = 'running';

  child.stdout.on('data', (data) => addLog(tool, data));
  child.stderr.on('data', (data) => addLog(tool, data));

  child.on('close', (code) => {
    console.log(`${toolConfigs[tool].name} exited with code ${code}`);
    processes[tool].status = 'stopped';
    processes[tool].portActive = false;
    processes[tool].child = null;
    processes[tool].logs.push({
      timestamp: new Date().toLocaleTimeString(),
      text: `Process stopped (exit code ${code})`
    });
  });
}

app.post('/api/start/:tool', (req, res) => {
  const { tool } = req.params;
  if (!toolConfigs[tool]) {
    return res.status(404).json({ error: "Tool not found" });
  }
  startTool(tool);
  res.json({ status: "started", message: `${toolConfigs[tool].name} has been launched.` });
});

app.post('/api/stop/:tool', (req, res) => {
  const { tool } = req.params;
  if (!toolConfigs[tool]) {
    return res.status(404).json({ error: "Tool not found" });
  }

  const proc = processes[tool];
  if (!proc.child) {
    return res.json({ message: `${toolConfigs[tool].name} is not running.` });
  }

  console.log(`Stopping ${toolConfigs[tool].name}...`);
  proc.status = 'stopping';
  proc.logs.push({ timestamp: new Date().toLocaleTimeString(), text: "Sending termination signal..." });

  try {
    process.kill(-proc.child.pid, 'SIGINT');
  } catch (e) {
    console.warn(`Failed to kill process group ${proc.child.pid} for ${tool}. Trying single process kill.`, e);
    try {
      proc.child.kill('SIGKILL');
    } catch (err) {
      console.error(`Failed to kill single process for ${tool}:`, err);
    }
  }

  res.json({ status: "stopping", message: `${toolConfigs[tool].name} is shutting down.` });
});

app.get('/api/logs/:tool', (req, res) => {
  const { tool } = req.params;
  if (!processes[tool]) {
    return res.status(404).json({ error: "Tool not found" });
  }
  res.json({ logs: processes[tool].logs });
});

// Scan RVC Weights folder for model .pth files
app.get('/api/voice-models', (req, res) => {
  const weightsDir = "/Users/jaychauhan/ai-video-tools/RVC-WebUI-MacOS/assets/weights";
  if (!fs.existsSync(weightsDir)) {
    return res.json({ models: [] });
  }
  try {
    const files = fs.readdirSync(weightsDir);
    const models = files.filter(f => f.endsWith('.pth') && f !== 'README.md' && !f.startsWith('.'));
    res.json({ models });
  } catch (err) {
    console.error("Error reading RVC weights directory:", err);
    res.status(500).json({ error: "Failed to read RVC weights" });
  }
});

// Unified One-Click Generator API
app.post('/api/simple-swap', upload.fields([
  { name: 'source', maxCount: 1 },
  { name: 'target', maxCount: 1 }
]), async (req, res) => {
  const sourceFile = req.files['source']?.[0];
  const targetFile = req.files['target']?.[0];
  const mode = req.body.mode || 'face'; // 'face' or 'body'
  const voiceModel = req.body.voiceModel || '';
  
  const inputType = req.body.inputType || 'video'; // 'video' or 'script'
  const scriptText = req.body.scriptText || '';

  if (inputType === 'video' && !targetFile) {
    return res.status(400).json({ error: "Missing target video file for Video Reference mode." });
  }
  if (inputType === 'script' && !scriptText.trim()) {
    return res.status(400).json({ error: "Script text is required for Text Script mode." });
  }

  const taskId = 'task_' + Date.now();
  const finalOutputFilename = `final_${Date.now()}.mp4`;
  const finalOutputPath = path.join(outputsDir, finalOutputFilename);

  swapTasks[taskId] = {
    status: 'processing',
    logs: [
      `[System] Initializing Pipeline...`,
      `[System] Task ID: ${taskId}`,
      `[System] Input Type: ${inputType === 'video' ? 'Video Reference' : 'Text Script'}`,
      `[System] Voice Cloning Model: ${voiceModel || 'None'}`
    ],
    outputUrl: null,
    error: null
  };

  res.json({ taskId });

  // Run generation pipeline asynchronously
  (async () => {
    const pushLog = (text) => {
      console.log(`[${taskId}] ${text}`);
      swapTasks[taskId].logs.push(text);
    };

    let sourcePath = sourceFile ? sourceFile.path : '';
    let targetPath = targetFile ? targetFile.path : '';

    try {
      if (inputType === 'script') {
        // ==========================================
        // PIPELINE B: TEXT SCRIPT INPUT
        // ==========================================
        
        // Step 1: Text-to-Speech (TTS)
        pushLog(`[TTS] Generating speech audio from script...`);
        const ttsWav = path.join(uploadsDir, `tts_${taskId}.wav`);
        
        // Execute generate_tts.py under facefusion environment
        const ttsCmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate facefusion && python "${path.join(__dirname, 'generate_tts.py')}" "${scriptText.replace(/"/g, '\\"')}" "${ttsWav}"`;
        await runShellCommand(ttsCmd, pushLog);
        
        let speechAudioPath = ttsWav;

        // Step 2: Voice Conversion (RVC)
        if (voiceModel) {
          pushLog(`[RVC] Applying voice model: ${voiceModel}...`);
          const convertedWav = path.join(uploadsDir, `converted_${taskId}.wav`);
          const rvcCmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate rvc && cd /Users/jaychauhan/ai-video-tools/RVC-WebUI-MacOS && python tools/infer_cli.py --f0method rmvpe --input_path "${ttsWav}" --opt_path "${convertedWav}" --model_name "${voiceModel}" --device mps`;
          await runShellCommand(rvcCmd, pushLog);
          
          speechAudioPath = convertedWav;
          pushLog(`[RVC] Voice cloning completed.`);
        }

        // Step 3: Base Target Video Resolution
        let baseTargetVideoPath = '';
        if (sourcePath) {
          // A. Custom girl image uploaded: Run LivePortrait to animate her head first
          pushLog(`[LivePortrait] Custom portrait uploaded. Animating custom portrait to create base talking video...`);
          const lpTempDir = path.join(uploadsDir, `lp_base_${taskId}`);
          fs.mkdirSync(lpTempDir, { recursive: true });
          
          const lpCmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate comfyui && cd /Users/jaychauhan/ai-video-tools/LivePortrait && python inference.py -s "${sourcePath}" -d assets/examples/driving/d0.mp4 -o "${lpTempDir}"`;
          await runShellCommand(lpCmd, pushLog);
          
          const lpFiles = fs.readdirSync(lpTempDir);
          const cleanVideo = lpFiles.find(f => f.endsWith('.mp4') && !f.includes('concat'));
          if (!cleanVideo) {
            throw new Error("LivePortrait failed to generate custom base template.");
          }
          baseTargetVideoPath = path.join(lpTempDir, cleanVideo);
          pushLog(`[LivePortrait] Animated base video generated successfully.`);
        } else {
          // B. No image uploaded: Use pre-generated high-quality cute girl loop
          baseTargetVideoPath = path.join(__dirname, 'public/templates/default_girl_talking.mp4');
          if (!fs.existsSync(baseTargetVideoPath)) {
            throw new Error("Default AI avatar template default_girl_talking.mp4 is missing.");
          }
          pushLog(`[System] Using default cute AI girl talking template...`);
        }

        // Step 4: Loop/Trim Video to Audio Length
        pushLog(`[FFmpeg] Analyzing speech audio duration...`);
        const duration = await getAudioDuration(speechAudioPath);
        pushLog(`[System] Speech audio duration: ${duration} seconds.`);
        
        pushLog(`[FFmpeg] Looping template video to exact speech length...`);
        const loopedVideoPath = path.join(uploadsDir, `loop_${taskId}.mp4`);
        const loopCmd = `ffmpeg -y -stream_loop -1 -i "${baseTargetVideoPath}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -an "${loopedVideoPath}"`;
        await runShellCommand(loopCmd, pushLog);

        // Step 5: FaceFusion Lip Syncer (Lip Sync looped video to speech audio)
        pushLog(`[FaceFusion] Starting lip sync CLI...`);
        const ffCmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate facefusion && cd /Users/jaychauhan/ai-video-tools/facefusion && python facefusion.py headless-run -t "${loopedVideoPath}" -s "${speechAudioPath}" -o "${finalOutputPath}" --processors lip_syncer --execution-providers coreml`;
        await runShellCommand(ffCmd, pushLog);
        pushLog(`[FaceFusion] Lip sync completed successfully.`);

        // Clean up uploads
        try {
          if (fs.existsSync(ttsWav)) fs.unlinkSync(ttsWav);
          const convertedWav = path.join(uploadsDir, `converted_${taskId}.wav`);
          if (fs.existsSync(convertedWav)) fs.unlinkSync(convertedWav);
          if (fs.existsSync(loopedVideoPath)) fs.unlinkSync(loopedVideoPath);
          if (sourcePath && fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
          if (sourcePath) {
            const lpTempDir = path.join(uploadsDir, `lp_base_${taskId}`);
            fs.rmSync(lpTempDir, { recursive: true, force: true });
          }
        } catch (e) {
          console.warn("Cleanup warning:", e);
        }

      } else {
        // ==========================================
        // PIPELINE A: VIDEO REFERENCE INPUT
        // ==========================================
        let videoSilentPath = '';

        if (mode === 'face') {
          // --- FaceFusion Face Swap ---
          videoSilentPath = path.join(uploadsDir, `ff_out_${taskId}.mp4`);
          pushLog(`[FaceFusion] Starting face swap CLI...`);
          const cmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate facefusion && cd /Users/jaychauhan/ai-video-tools/facefusion && python facefusion.py headless-run -s "${sourcePath}" -t "${targetPath}" -o "${videoSilentPath}" --processors face_swapper --execution-providers coreml`;
          await runShellCommand(cmd, pushLog);
          pushLog(`[FaceFusion] Face swap completed.`);
        } else {
          // --- LivePortrait Animation ---
          const lpTempDir = path.join(uploadsDir, `lp_out_${taskId}`);
          fs.mkdirSync(lpTempDir, { recursive: true });
          pushLog(`[LivePortrait] Animating portrait with driving video...`);
          
          const cmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate comfyui && cd /Users/jaychauhan/ai-video-tools/LivePortrait && python inference.py -s "${sourcePath}" -d "${targetPath}" -o "${lpTempDir}"`;
          await runShellCommand(cmd, pushLog);
          
          const lpFiles = fs.readdirSync(lpTempDir);
          const cleanVideo = lpFiles.find(f => f.endsWith('.mp4') && !f.includes('concat'));
          if (!cleanVideo) {
            throw new Error("LivePortrait finished but output video file was not found.");
          }
          
          videoSilentPath = path.join(lpTempDir, cleanVideo);
          pushLog(`[LivePortrait] Animation completed. Found clean video: ${cleanVideo}`);
        }

        // Voice Conversion (RVC)
        let audioPath = '';
        if (voiceModel) {
          pushLog(`[RVC] Extracting audio track from reference video...`);
          const targetWav = path.join(uploadsDir, `target_${taskId}.wav`);
          const extractCmd = `ffmpeg -y -i "${targetPath}" -q:a 0 -map a "${targetWav}"`;
          
          try {
            await runShellCommand(extractCmd);
            pushLog(`[RVC] Voice cloning using model: ${voiceModel}...`);
            
            const convertedWav = path.join(uploadsDir, `converted_${taskId}.wav`);
            const rvcCmd = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate rvc && cd /Users/jaychauhan/ai-video-tools/RVC-WebUI-MacOS && python tools/infer_cli.py --f0method rmvpe --input_path "${targetWav}" --opt_path "${convertedWav}" --model_name "${voiceModel}" --device mps`;
            await runShellCommand(rvcCmd, pushLog);
            
            audioPath = convertedWav;
            pushLog(`[RVC] Voice cloning finished successfully.`);
          } catch (e) {
            pushLog(`[RVC Warning] Audio extraction or RVC conversion failed. Original target audio will be kept. Error: ${e.message}`);
          }
        }

        // Merge Video and Audio
        pushLog(`[System] Merging video and audio tracks...`);
        if (audioPath && fs.existsSync(audioPath)) {
          const mergeCmd = `ffmpeg -y -i "${videoSilentPath}" -i "${audioPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${finalOutputPath}"`;
          await runShellCommand(mergeCmd, pushLog);
        } else {
          const mergeCmd = `ffmpeg -y -i "${videoSilentPath}" -i "${targetPath}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 "${finalOutputPath}"`;
          try {
            await runShellCommand(mergeCmd);
          } catch (err) {
            pushLog(`[System Warning] Merging original audio failed (video might be silent). Exporting video as silent.`);
            fs.copyFileSync(videoSilentPath, finalOutputPath);
          }
        }

        // Cleanup
        try {
          if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
          if (mode === 'face' && fs.existsSync(videoSilentPath)) fs.unlinkSync(videoSilentPath);
          if (mode === 'body') {
            const lpTempDir = path.join(uploadsDir, `lp_out_${taskId}`);
            fs.rmSync(lpTempDir, { recursive: true, force: true });
          }
          const targetWav = path.join(uploadsDir, `target_${taskId}.wav`);
          const convertedWav = path.join(uploadsDir, `converted_${taskId}.wav`);
          if (fs.existsSync(targetWav)) fs.unlinkSync(targetWav);
          if (fs.existsSync(convertedWav)) fs.unlinkSync(convertedWav);
        } catch (cleanupErr) {
          console.error("Cleanup warning:", cleanupErr);
        }
      }

      swapTasks[taskId].status = 'completed';
      swapTasks[taskId].outputUrl = `/outputs/${finalOutputFilename}`;
      pushLog(`[System] Success! Final output generated.`);

    } catch (err) {
      console.error(`Pipeline error for ${taskId}:`, err);
      swapTasks[taskId].status = 'failed';
      swapTasks[taskId].error = err.message;
      pushLog(`[System Error] Pipeline failed: ${err.message}`);
      
      try {
        if (sourcePath && fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath);
        if (targetPath && fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      } catch (e) {}
    }
  })();
});

app.get('/api/simple-swap/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = swapTasks[taskId];
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(task);
});

function killPort(port) {
  return new Promise((resolve) => {
    exec(`lsof -t -i:${port} | xargs kill -9`, (err) => {
      resolve();
    });
  });
}

app.listen(PORT, '127.0.0.1', async () => {
  console.log(`AI Control Center running at http://127.0.0.1:${PORT}`);
  
  // Clean up orphaned processes on ports first
  console.log("Cleaning up orphaned AI service processes...");
  await killPort(8188);
  await killPort(7860);
  await killPort(7865);
  
  // Auto-start all background services on boot
  console.log("Auto-booting background AI services...");
  Object.keys(toolConfigs).forEach(tool => {
    startTool(tool);
  });
});
