const express = require('express');
const path = require('path');
const { spawn } = require('child_process');
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

const upload = multer({ dest: uploadsDir });

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

app.post('/api/start/:tool', (req, res) => {
  const { tool } = req.params;
  if (!toolConfigs[tool]) {
    return res.status(404).json({ error: "Tool not found" });
  }

  if (processes[tool].status === 'running' || processes[tool].status === 'starting') {
    return res.json({ message: `${toolConfigs[tool].name} is already active.` });
  }

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

// Simple Drag & Drop Headless Face Swap API
app.post('/api/simple-swap', upload.fields([
  { name: 'source', maxCount: 1 },
  { name: 'target', maxCount: 1 }
]), (req, res) => {
  const sourceFile = req.files['source']?.[0];
  const targetFile = req.files['target']?.[0];
  
  if (!sourceFile || !targetFile) {
    return res.status(400).json({ error: "Missing source image or target video file." });
  }

  const taskId = 'task_' + Date.now();
  const sourcePath = sourceFile.path;
  const targetPath = targetFile.path;
  
  const ext = path.extname(targetFile.originalname) || '.mp4';
  const outputFilename = `swap_${Date.now()}${ext}`;
  const outputPath = path.join(outputsDir, outputFilename);

  swapTasks[taskId] = {
    status: 'processing',
    logs: [`Initializing headless FaceFusion...`, `Source file size: ${sourceFile.size} bytes`, `Target file size: ${targetFile.size} bytes`],
    outputUrl: null,
    error: null
  };

  const command = `source /opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh && conda activate facefusion && cd /Users/jaychauhan/ai-video-tools/facefusion && python facefusion.py headless-run -s "${sourcePath}" -t "${targetPath}" -o "${outputPath}" --execution-providers coreml`;

  const child = spawn('bash', ['-c', command], {
    detached: true,
    stdio: 'pipe'
  });

  child.stdout.on('data', (data) => {
    swapTasks[taskId].logs.push(data.toString().trim());
  });

  child.stderr.on('data', (data) => {
    swapTasks[taskId].logs.push(data.toString().trim());
  });

  child.on('close', (code) => {
    // Delete temp uploads
    try {
      fs.unlinkSync(sourcePath);
      fs.unlinkSync(targetPath);
    } catch (e) {
      console.error("Error deleting temp files:", e);
    }

    if (code === 0) {
      swapTasks[taskId].status = 'completed';
      swapTasks[taskId].outputUrl = `/outputs/${outputFilename}`;
      swapTasks[taskId].logs.push(`Face swap completed successfully! Saved as ${outputFilename}`);
    } else {
      swapTasks[taskId].status = 'failed';
      swapTasks[taskId].error = `FaceFusion exited with error code ${code}`;
      swapTasks[taskId].logs.push(`Failed! Process exited with code ${code}`);
    }
  });

  res.json({ taskId });
});

app.get('/api/simple-swap/status/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = swapTasks[taskId];
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }
  res.json(task);
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`AI Control Center running at http://127.0.0.1:${PORT}`);
});
