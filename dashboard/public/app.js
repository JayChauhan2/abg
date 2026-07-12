// Simple AI Video Generator App Logic
let sourceFileObj = null;
let swapPollInterval = null;
let swapLogsLength = 0;

document.addEventListener('DOMContentLoaded', () => {
    // Bind dropzone listeners for Source Actor Video/Photo
    setupDropzone('source', 'input-source', 'area-source', 'preview-source');
});

// Dropzone configuration
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
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) {
        alert('Please select an image or a video file.');
        return;
    }
    sourceFileObj = file;
    const img = previewElement.querySelector('img');
    const video = previewElement.querySelector('video');

    if (isImage) {
        if (video) {
            video.classList.add('hidden');
            video.src = '';
        }
        if (img) {
            img.classList.remove('hidden');
            img.src = URL.createObjectURL(file);
        }
    } else {
        if (img) {
            img.classList.add('hidden');
            img.src = '';
        }
        if (video) {
            video.classList.remove('hidden');
            video.src = URL.createObjectURL(file);
            video.play();
        }
    }
    previewElement.classList.remove('hidden');
}

function removeFile(type, event) {
    if (event) event.stopPropagation();
    const preview = document.getElementById(`preview-${type}`);
    const input = document.getElementById(`input-${type}`);
    
    sourceFileObj = null;
    const img = preview.querySelector('img');
    const video = preview.querySelector('video');
    if (img) {
        img.src = '';
        img.classList.add('hidden');
    }
    if (video) {
        video.pause();
        video.src = '';
        video.classList.add('hidden');
    }
    input.value = '';
    preview.classList.add('hidden');
}

// Run generation pipeline
async function startSimpleSwap() {
    const scriptVal = document.getElementById('input-script').value.trim();
    if (!sourceFileObj) {
        alert("Please upload an Actor Reference Video (or Photo) first.");
        return;
    }
    if (!scriptVal) {
        alert("Please enter a speech script.");
        return;
    }

    const btn = document.getElementById('btn-generate-swap');
    const processingPanel = document.getElementById('processing-panel');
    const formStack = document.querySelector('.simple-form-stack');
    const actionBar = document.querySelector('.generate-action-bar');
    const cliLogs = document.getElementById('cli-logs');
    const outputPanel = document.getElementById('output-panel');

    // Hide input form and show loader
    btn.disabled = true;
    formStack.classList.add('hidden');
    actionBar.classList.add('hidden');
    outputPanel.classList.add('hidden');
    processingPanel.classList.remove('hidden');
    cliLogs.innerHTML = `<div class="cli-line">[System] Initializing pipeline execution...</div>`;
    swapLogsLength = 0;

    const formData = new FormData();
    formData.append('source', sourceFileObj);
    formData.append('inputType', 'script');
    formData.append('scriptText', scriptVal);
    formData.append('mode', 'body');
    formData.append('voiceModel', '');
    formData.append('faceEnhance', 'true');
    formData.append('burnSubtitles', 'true');
    formData.append('avatarPrompt', '');
    formData.append('gazeMode', 'steady');

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
        if (task.logs && task.logs.length > swapLogsLength) {
            const newLogs = task.logs.slice(swapLogsLength);
            const cliLogs = document.getElementById('cli-logs');
            newLogs.forEach(log => {
                const line = document.createElement('div');
                line.className = 'cli-line';
                if (log.toLowerCase().includes('error') || log.toLowerCase().includes('failed')) {
                    line.className = 'cli-line error';
                } else if (log.toLowerCase().includes('success') || log.toLowerCase().includes('completed')) {
                    line.className = 'cli-line success';
                }
                line.textContent = log;
                cliLogs.appendChild(line);
            });
            swapLogsLength = task.logs.length;
            cliLogs.scrollTop = cliLogs.scrollHeight;
        }

        if (task.status === 'success') {
            clearInterval(swapPollInterval);
            showSwapSuccess(task.outputUrl);
        } else if (task.status === 'failed') {
            clearInterval(swapPollInterval);
            showSwapFailure(task.error || "Generation pipeline failed.");
        }
    } catch (err) {
        console.error("Polling error:", err);
    }
}

function showSwapSuccess(videoUrl) {
    const btn = document.getElementById('btn-generate-swap');
    const processingPanel = document.getElementById('processing-panel');
    const outputPanel = document.getElementById('output-panel');
    const videoPlayer = document.getElementById('output-video-player');
    const downloadBtn = document.getElementById('btn-download-video');

    btn.disabled = false;
    processingPanel.classList.add('hidden');
    outputPanel.classList.remove('hidden');

    videoPlayer.src = videoUrl;
    downloadBtn.href = videoUrl;
    videoPlayer.play();
}

function showSwapFailure(errorMsg) {
    const btn = document.getElementById('btn-generate-swap');
    const processingPanel = document.getElementById('processing-panel');
    const formStack = document.querySelector('.simple-form-stack');
    const actionBar = document.querySelector('.generate-action-bar');

    btn.disabled = false;
    processingPanel.classList.add('hidden');
    formStack.classList.remove('hidden');
    actionBar.classList.remove('hidden');

    alert(`Error: ${errorMsg}`);
}

function resetSwapForm() {
    const formStack = document.querySelector('.simple-form-stack');
    const actionBar = document.querySelector('.generate-action-bar');
    const outputPanel = document.getElementById('output-panel');
    const videoPlayer = document.getElementById('output-video-player');

    videoPlayer.pause();
    videoPlayer.src = '';
    
    removeFile('source');
    document.getElementById('input-script').value = '';

    outputPanel.classList.add('hidden');
    formStack.classList.remove('hidden');
    actionBar.classList.remove('hidden');
}
