let activeTab = 'comfyui';
const logsCache = {
    comfyui: [],
    facefusion: [],
    rvc: []
};

// Files State for simple face swap
let sourceFileObj = null;
let targetFileObj = null;
let swapPollInterval = null;
let swapLogsLength = 0;
let swapMode = 'face'; // Default mode is face swap
let inputType = 'video'; // 'video' or 'script'

// Start polling status, logs, and RVC models
document.addEventListener('DOMContentLoaded', () => {
    pollStatus();
    pollLogs();
    loadVoiceModels();
    
    // Poll status every 2 seconds
    setInterval(pollStatus, 2000);
    // Poll logs every 2 seconds
    setInterval(pollLogs, 2000);

    // Bind Dropzone Event Listeners
    setupDropzone('source', 'input-source', 'area-source', 'preview-source');
    setupDropzone('target', 'input-target', 'area-target', 'preview-target');

    // Bind Face Enhancement Switch listener
    const toggleEnhance = document.getElementById('toggle-face-enhance');
    const statusText = document.getElementById('face-enhance-status');
    if (toggleEnhance && statusText) {
        toggleEnhance.addEventListener('change', () => {
            if (toggleEnhance.checked) {
                statusText.textContent = "Enabled (GFPGAN)";
                statusText.style.color = "var(--text-main)";
            } else {
                statusText.textContent = "Disabled";
                statusText.style.color = "var(--text-muted)";
            }
        });
    }
});

// Switch view mode (Dashboard vs Face Swap)
function switchMode(mode) {
    const dashboardBtn = document.getElementById('mode-dashboard-btn');
    const swapBtn = document.getElementById('mode-swap-btn');
    const dashboardView = document.getElementById('view-dashboard');
    const swapView = document.getElementById('view-swap');

    if (mode === 'dashboard') {
        dashboardBtn.classList.add('active');
        swapBtn.classList.remove('active');
        dashboardView.classList.remove('hidden');
        swapView.classList.add('hidden');
    } else {
        dashboardBtn.classList.remove('active');
        swapBtn.classList.add('active');
        dashboardView.classList.add('hidden');
        swapView.classList.remove('hidden');
        // Refresh models when entering swap view
        loadVoiceModels();
    }
}

// ==========================================
// Dashboard Logic
// ==========================================

// Switch log viewer tabs
function switchLogTab(tool) {
    activeTab = tool;
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        if (btn.textContent.toLowerCase().includes(tool)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    const output = document.getElementById('log-output');
    output.innerHTML = '';
    
    if (logsCache[tool].length === 0) {
        output.innerHTML = `<div class="log-line system">[System] No logs for ${tool} yet.</div>`;
    } else {
        logsCache[tool].forEach(log => appendLogToTerminal(log.timestamp, log.text));
    }
    
    scrollToBottom();
}

function clearTerminal() {
    logsCache[activeTab] = [];
    const output = document.getElementById('log-output');
    output.innerHTML = `<div class="log-line system">[System] Log cleared.</div>`;
}

function appendLogToTerminal(timestamp, text) {
    const output = document.getElementById('log-output');
    const lineDiv = document.createElement('div');
    
    if (text.toLowerCase().includes('error') || text.toLowerCase().includes('failed')) {
        lineDiv.className = 'log-line error';
    } else if (text.startsWith('[System]') || text.startsWith('===') || text.toLowerCase().includes('starting') || text.toLowerCase().includes('stopping')) {
        lineDiv.className = 'log-line system';
    } else {
        lineDiv.className = 'log-line';
    }
    
    lineDiv.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${escapeHtml(text)}`;
    output.appendChild(lineDiv);
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function scrollToBottom() {
    const output = document.getElementById('log-output');
    output.scrollTop = output.scrollHeight;
}

async function startService(tool) {
    try {
        addSystemLog(tool, `Sending launch command...`);
        const response = await fetch(`/api/start/${tool}`, { method: 'POST' });
        const data = await response.json();
        addSystemLog(tool, data.message || `Service launch command sent.`);
        pollStatus();
    } catch (error) {
        addSystemLog(tool, `Error starting service: ${error.message}`);
    }
}

async function stopService(tool) {
    try {
        addSystemLog(tool, `Sending shutdown signal...`);
        const response = await fetch(`/api/stop/${tool}`, { method: 'POST' });
        const data = await response.json();
        addSystemLog(tool, data.message || `Service shutdown command sent.`);
        pollStatus();
    } catch (error) {
        addSystemLog(tool, `Error stopping service: ${error.message}`);
    }
}

function addSystemLog(tool, text) {
    const timestamp = new Date().toLocaleTimeString();
    const systemLog = { timestamp, text: `[System] ${text}` };
    logsCache[tool].push(systemLog);
    
    if (activeTab === tool) {
        const output = document.getElementById('log-output');
        if (output.innerHTML.includes('Select a service or start one')) {
            output.innerHTML = '';
        }
        appendLogToTerminal(timestamp, systemLog.text);
        scrollToBottom();
    }
}

async function pollStatus() {
    try {
        const response = await fetch('/api/status');
        const statusData = await response.json();
        
        for (const tool of Object.keys(statusData)) {
            const data = statusData[tool];
            const card = document.getElementById(`card-${tool}`);
            if (!card) continue;
            
            const dot = card.querySelector('.status-dot');
            const text = card.querySelector('.status-text');
            const startBtn = card.querySelector('.start-btn');
            const stopBtn = card.querySelector('.stop-btn');
            const openBtn = card.querySelector(`#open-${tool}`);
            
            if (data.status === 'running') {
                if (data.portActive) {
                    dot.className = 'status-dot online';
                    text.textContent = 'Online';
                    startBtn.classList.add('hidden');
                    stopBtn.classList.remove('hidden');
                    openBtn.classList.remove('hidden');
                } else {
                    dot.className = 'status-dot running';
                    text.textContent = 'Booting...';
                    startBtn.classList.add('hidden');
                    stopBtn.classList.remove('hidden');
                    openBtn.classList.add('hidden');
                }
            } else if (data.status === 'starting') {
                dot.className = 'status-dot running';
                text.textContent = 'Starting...';
                startBtn.classList.add('hidden');
                stopBtn.classList.remove('hidden');
                openBtn.classList.add('hidden');
            } else if (data.status === 'stopping') {
                dot.className = 'status-dot running';
                text.textContent = 'Stopping...';
                startBtn.classList.add('hidden');
                stopBtn.classList.add('hidden');
                openBtn.classList.add('hidden');
            } else {
                dot.className = 'status-dot stopped';
                text.textContent = 'Offline';
                startBtn.classList.remove('hidden');
                stopBtn.classList.add('hidden');
                openBtn.classList.add('hidden');
            }
        }
    } catch (error) {
        console.error("Error polling status:", error);
    }
}

async function pollLogs() {
    try {
        const response = await fetch(`/api/logs/${activeTab}`);
        const data = await response.json();
        
        const cachedLogs = logsCache[activeTab];
        const newLogs = data.logs;
        
        if (newLogs.length > cachedLogs.length) {
            const difference = newLogs.slice(cachedLogs.length);
            const output = document.getElementById('log-output');
            
            if (output.innerHTML.includes('Select a service or start one')) {
                output.innerHTML = '';
            }
            
            difference.forEach(log => {
                appendLogToTerminal(log.timestamp, log.text);
                cachedLogs.push(log);
            });
            scrollToBottom();
        } else if (newLogs.length < cachedLogs.length) {
            logsCache[activeTab] = [...newLogs];
            switchLogTab(activeTab);
        }
    } catch (error) {
        console.error("Error polling logs:", error);
    }
}

// ==========================================
// One-Click Generator Logic (Drag & Drop)
// ==========================================

// Switch Swap Input Type (Video vs Script)
function setInputType(type) {
    inputType = type;
    const videoBtn = document.getElementById('btn-input-video');
    const scriptBtn = document.getElementById('btn-input-script');
    const targetCard = document.getElementById('dropzone-target');
    const scriptCard = document.getElementById('card-script');

    const sourceTitle = document.getElementById('source-card-title');
    const sourceDesc = document.getElementById('source-card-desc');

    if (type === 'video') {
        videoBtn.classList.add('active');
        scriptBtn.classList.remove('active');
        targetCard.classList.remove('hidden');
        scriptCard.classList.add('hidden');

        // Adjust Source card labeling
        sourceTitle.textContent = swapMode === 'face' ? "Source Face (Girl Image)" : "Source Portrait (Static Girl Photo)";
        sourceDesc.textContent = "Upload the picture of the girl you want to use";
    } else {
        videoBtn.classList.remove('active');
        scriptBtn.classList.add('active');
        targetCard.classList.add('hidden');
        scriptCard.classList.remove('hidden');

        // Adjust Source card labeling to show optionality
        sourceTitle.textContent = "Target Avatar Photo (Optional)";
        sourceDesc.textContent = "Upload a picture of the girl you want (or leave blank to use default cute AI girl)";
    }
}

// Switch Swap Processing Mode (Face swap vs Whole Body)
function setSwapMode(mode) {
    swapMode = mode;
    const faceBtn = document.getElementById('segment-mode-face');
    const bodyBtn = document.getElementById('segment-mode-body');
    const sourceTitle = document.getElementById('source-card-title');
    const sourceDesc = document.getElementById('source-card-desc');

    if (mode === 'face') {
        faceBtn.classList.add('active');
        bodyBtn.classList.remove('active');
        if (inputType === 'video') {
            sourceTitle.textContent = "Source Face (Girl Image)";
            sourceDesc.textContent = "Upload the picture of the girl you want to use";
        }
    } else {
        faceBtn.classList.remove('active');
        bodyBtn.classList.add('active');
        if (inputType === 'video') {
            sourceTitle.textContent = "Source Portrait (Static Girl Photo)";
            sourceDesc.textContent = "Upload the static photo of the girl (contains her hair & body)";
        }
    }
}

// Load RVC voice models from backend weights folder
async function loadVoiceModels() {
    const select = document.getElementById('select-voice-model');
    const refreshBtn = document.querySelector('.btn-refresh i');
    if (refreshBtn) refreshBtn.classList.add('fa-spin');
    
    try {
        const response = await fetch('/api/voice-models');
        const data = await response.json();
        
        select.innerHTML = '<option value="">-- Keep Original Audio --</option>';
        
        if (data.models && data.models.length > 0) {
            data.models.forEach(model => {
                const opt = document.createElement('option');
                opt.value = model;
                opt.textContent = model.replace('.pth', '');
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Failed to load voice models:", err);
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('fa-spin');
    }
}

// Configure drag and drop listeners for a specific input
function setupDropzone(type, inputId, areaId, previewId) {
    const input = document.getElementById(inputId);
    const area = document.getElementById(areaId);
    const preview = document.getElementById(previewId);

    area.addEventListener('click', () => input.click());

    ['dragenter', 'dragover'].forEach(eventName => {
        area.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            area.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        area.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            area.classList.remove('dragover');
        }, false);
    });

    area.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileSelect(type, files[0], input, preview);
        }
    }, false);

    input.addEventListener('change', () => {
        if (input.files.length > 0) {
            handleFileSelect(type, input.files[0], input, preview);
        }
    });
}

function handleFileSelect(type, file, inputElement, previewElement) {
    if (type === 'source') {
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file for the Portrait.');
            return;
        }
        sourceFileObj = file;
        const img = previewElement.querySelector('img');
        img.src = URL.createObjectURL(file);
        previewElement.classList.remove('hidden');
    } else {
        if (!file.type.startsWith('video/')) {
            alert('Please select a video file for the Reference Video.');
            return;
        }
        targetFileObj = file;
        const video = previewElement.querySelector('video');
        video.src = URL.createObjectURL(file);
        previewElement.classList.remove('hidden');
        video.play();
    }
}

function removeFile(type, event) {
    event.stopPropagation();
    const preview = document.getElementById(`preview-${type}`);
    const input = document.getElementById(`input-${type}`);
    
    if (type === 'source') {
        sourceFileObj = null;
        preview.querySelector('img').src = '';
    } else {
        targetFileObj = null;
        const video = preview.querySelector('video');
        video.pause();
        video.src = '';
    }
    input.value = '';
    preview.classList.add('hidden');
}

// Run AI Video Generation
async function startSimpleSwap() {
    // Validations based on Input Type
    if (inputType === 'video') {
        if (!sourceFileObj || !targetFileObj) {
            alert("Please upload both a Source Portrait image and a Target Video.");
            return;
        }
    } else {
        const scriptVal = document.getElementById('input-script').value.trim();
        if (!scriptVal) {
            alert("Please enter a speech script for the AI girl to speak.");
            return;
        }
    }

    const btn = document.getElementById('btn-generate-swap');
    const processingPanel = document.getElementById('processing-panel');
    const dropzoneGrid = document.querySelector('.dropzone-grid');
    const settingsPanel = document.querySelector('.settings-panel');
    const inputModePanel = document.querySelector('.input-mode-panel');
    const actionBar = document.querySelector('.generate-action-bar');
    const cliLogs = document.getElementById('cli-logs');
    const statusTitle = document.getElementById('processing-status-title');
    const voiceModelSelect = document.getElementById('select-voice-model');
    const scriptVal = document.getElementById('input-script').value;

    // Lock UI and show processing state
    btn.disabled = true;
    dropzoneGrid.classList.add('hidden');
    settingsPanel.classList.add('hidden');
    inputModePanel.classList.add('hidden');
    actionBar.classList.add('hidden');
    processingPanel.classList.remove('hidden');
    statusTitle.textContent = inputType === 'video' ? "Processing AI Video..." : "Generating AI Script Video...";
    cliLogs.innerHTML = `<div class="cli-line">[System] Initializing backend request...</div>`;
    swapLogsLength = 0;

    const formData = new FormData();
    if (sourceFileObj) formData.append('source', sourceFileObj);
    if (targetFileObj) formData.append('target', targetFileObj);
    
    const faceEnhanceToggle = document.getElementById('toggle-face-enhance');
    const faceEnhanceVal = faceEnhanceToggle ? faceEnhanceToggle.checked : false;

    formData.append('inputType', inputType);
    formData.append('scriptText', scriptVal);
    formData.append('mode', swapMode);
    formData.append('voiceModel', voiceModelSelect.value);
    formData.append('faceEnhance', faceEnhanceVal);

    try {
        const response = await fetch('/api/simple-swap', {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }

        const taskId = data.taskId;
        swapPollInterval = setInterval(() => pollSwapTask(taskId), 1000);

    } catch (err) {
        console.error("Pipeline request error:", err);
        showSwapFailure(err.message || "Failed to trigger generation pipeline.");
    }
}

// Poll pipeline task
async function pollSwapTask(taskId) {
    try {
        const response = await fetch(`/api/simple-swap/status/${taskId}`);
        const task = await response.json();

        // Print new logs
        const cliLogs = document.getElementById('cli-logs');
        if (task.logs.length > swapLogsLength) {
            const newLines = task.logs.slice(swapLogsLength);
            newLines.forEach(line => {
                const div = document.createElement('div');
                div.className = 'cli-line';
                div.textContent = line;
                cliLogs.appendChild(div);
            });
            swapLogsLength = task.logs.length;
            cliLogs.scrollTop = cliLogs.scrollHeight;
        }

        // Check completion status
        if (task.status === 'completed') {
            clearInterval(swapPollInterval);
            showSwapSuccess(task.outputUrl);
        } else if (task.status === 'failed') {
            clearInterval(swapPollInterval);
            showSwapFailure(task.error || "The generation task crashed.");
        }
    } catch (e) {
        console.error("Error polling swap task status:", e);
    }
}

function showSwapSuccess(outputUrl) {
    const processingPanel = document.getElementById('processing-panel');
    const outputPanel = document.getElementById('output-panel');
    const video = document.getElementById('output-video-player');
    const downloadBtn = document.getElementById('btn-download-video');

    processingPanel.classList.add('hidden');
    outputPanel.classList.remove('hidden');
    
    video.src = outputUrl;
    video.load();
    video.play();
    
    downloadBtn.href = outputUrl;
}

function showSwapFailure(errorText) {
    clearInterval(swapPollInterval);
    const title = document.getElementById('processing-status-title');
    const spinner = document.querySelector('.processing-spinner');
    
    title.textContent = "Processing Failed";
    title.style.color = "var(--danger)";
    if (spinner) spinner.style.borderTopColor = "var(--danger)";
    
    const cliLogs = document.getElementById('cli-logs');
    const errDiv = document.createElement('div');
    errDiv.className = 'cli-line';
    errDiv.style.color = "var(--danger)";
    errDiv.style.fontWeight = "bold";
    errDiv.textContent = `[Error] ${errorText}`;
    cliLogs.appendChild(errDiv);
    
    const resetBtn = document.createElement('button');
    resetBtn.className = "btn btn-outline";
    resetBtn.style.marginTop = "16px";
    resetBtn.innerHTML = `<i class="fa-solid fa-arrow-left"></i> Go Back`;
    resetBtn.onclick = resetSwapForm;
    document.getElementById('processing-panel').appendChild(resetBtn);
}

// Reset form
function resetSwapForm() {
    clearInterval(swapPollInterval);
    sourceFileObj = null;
    targetFileObj = null;
    swapLogsLength = 0;
    
    // Hide panels
    document.getElementById('processing-panel').classList.add('hidden');
    document.getElementById('output-panel').classList.add('hidden');
    
    // Reset inputs & previews
    removeFile('source', { stopPropagation: () => {} });
    removeFile('target', { stopPropagation: () => {} });
    document.getElementById('input-script').value = '';
    
    // Reset titles/spinners
    const title = document.getElementById('processing-status-title');
    const spinner = document.querySelector('.processing-spinner');
    title.textContent = "Processing AI Video...";
    title.style.color = "var(--text-main)";
    if (spinner) spinner.style.borderTopColor = "var(--primary)";
    
    const addedButtons = document.getElementById('processing-panel').querySelectorAll('button');
    addedButtons.forEach(btn => btn.remove());

    // Show panels
    document.querySelector('.dropzone-grid').classList.remove('hidden');
    document.querySelector('.settings-panel').classList.remove('hidden');
    document.querySelector('.input-mode-panel').classList.remove('hidden');
    document.querySelector('.generate-action-bar').classList.remove('hidden');
    document.getElementById('btn-generate-swap').disabled = false;
}
