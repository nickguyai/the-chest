// Global state
let ws, audioContext, processor, source, stream;
let isRecording = false;
let timerInterval;
let startTime;
let audioBuffer = new Int16Array(0);
let wsConnected = false;
let streamInitialized = false;
let isAutoStarted = false;
let currentProvider = 'gemini';
let sampleRate = 24000;
let enhanceMode = 'readability';
let hasAutoEnhanced = false;
let latestGeminiResult = null;
let currentJobId = null;
let readabilityAbortController = null;
let toastNode = null;
let toastTimer = null;
const defaultHotkey = {
    code: 'Space',
    key: ' ',
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false
};
let configuredHotkey = { ...defaultHotkey };
let isCapturingHotkey = false;
let hotkeyPressed = false;
let notificationPermissionRequested = false;

// DOM elements
const recordButton = document.getElementById('recordButton');
const transcript = document.getElementById('transcript');
const enhancedTranscript = document.getElementById('enhancedTranscript');
const copyButton = document.getElementById('copyButton');
const copyEnhancedButton = document.getElementById('copyEnhancedButton');
const readabilityButton = document.getElementById('readabilityButton');
const askAIButton = document.getElementById('askAIButton');
const correctnessButton = document.getElementById('correctnessButton');

// New elements
const providerToggle = document.getElementById('providerToggle');
const enhanceModeControl = document.getElementById('enhanceMode');
const audioFile = document.getElementById('audioFile');
const dropzone = document.getElementById('dropzone');
const uploadStatus = document.getElementById('uploadStatus');
const progressBar = document.getElementById('progressBar');
const progressFill = progressBar ? progressBar.querySelector('.progress-fill') : null;
const geminiResults = document.getElementById('geminiResults');
const conversationThread = document.getElementById('conversationThread');
const copyConversationButton = document.getElementById('copyConversationButton');
const hotkeyDisplay = document.getElementById('hotkeyDisplay');
const captureHotkeyButton = document.getElementById('captureHotkey');
const resetHotkeyButton = document.getElementById('resetHotkey');
const hotkeyHint = document.getElementById('hotkeyHint');
// Jobs & Search Panels
const menuToggle = document.getElementById('menuToggle');
const searchToggle = document.getElementById('searchToggle');
const jobsPanel = document.getElementById('jobsPanel');
const searchPanel = document.getElementById('searchPanel');
const closeJobs = document.getElementById('closeJobs');
const closeSearch = document.getElementById('closeSearch');
const jobsList = document.getElementById('jobsList');
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const searchResults = document.getElementById('searchResults');

clearGeminiResults();

// Configuration
const targetSeconds = 5;
const urlParams = new URLSearchParams(window.location.search);
const autoStart = urlParams.get('start') === '1';

// Utility functions
const isMobileDevice = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const modifierCodes = new Set([
    'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
    'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'
]);

function cloneHotkey(hotkey = defaultHotkey) {
    return {
        code: hotkey.code || defaultHotkey.code,
        key: typeof hotkey.key === 'string' ? hotkey.key : defaultHotkey.key,
        ctrlKey: Boolean(hotkey.ctrlKey),
        shiftKey: Boolean(hotkey.shiftKey),
        altKey: Boolean(hotkey.altKey),
        metaKey: Boolean(hotkey.metaKey)
    };
}

function sanitizeHotkey(value) {
    if (!value) return cloneHotkey();
    return cloneHotkey(value);
}

function formatHotkey(hotkey = configuredHotkey) {
    if (!hotkey) return 'Space';
    const segments = [];
    if (hotkey.ctrlKey) segments.push('Ctrl');
    if (hotkey.altKey) segments.push('Alt');
    if (hotkey.shiftKey) segments.push('Shift');
    if (hotkey.metaKey) segments.push('Meta');
    let keyLabel = hotkey.code || hotkey.key || 'Key';
    if (keyLabel.startsWith('Key')) keyLabel = keyLabel.replace('Key', '');
    if (keyLabel.startsWith('Digit')) keyLabel = keyLabel.replace('Digit', '');
    if (keyLabel === 'Space') keyLabel = 'Space';
    if (!keyLabel.trim() && hotkey.key) keyLabel = hotkey.key.toUpperCase();
    const normalizedKey = keyLabel.trim() ? keyLabel.toUpperCase() : 'KEY';
    segments.push(normalizedKey === ' ' ? 'SPACE' : normalizedKey);
    return segments.join(' + ');
}

function matchesHotkey(event, hotkey = configuredHotkey) {
    if (!hotkey || !hotkey.code) return false;
    const codeMatch = (event.code && event.code === hotkey.code) || (event.key && event.key === hotkey.key);
    return Boolean(
        codeMatch &&
        event.ctrlKey === !!hotkey.ctrlKey &&
        event.shiftKey === !!hotkey.shiftKey &&
        event.altKey === !!hotkey.altKey &&
        event.metaKey === !!hotkey.metaKey
    );
}

function isTypingIntoField() {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    if (activeElement.isContentEditable) return true;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
}

function setHotkeyHint(message) {
    if (hotkeyHint) hotkeyHint.textContent = message;
}

function updateHotkeyDisplay(hotkey = configuredHotkey) {
    if (hotkeyDisplay) {
        hotkeyDisplay.value = formatHotkey(hotkey);
    }
}

function handleHotkeyCapture(event) {
    event.preventDefault();
    if (modifierCodes.has(event.code)) {
        setHotkeyHint('Press a non-modifier key (letters, numbers, function keys).');
        return;
    }
    configuredHotkey = cloneHotkey({
        code: event.code || event.key || defaultHotkey.code,
        key: event.key || event.code || defaultHotkey.key,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey
    });
    isCapturingHotkey = false;
    setHotkeyHint('Shortcut captured. Remember to save your settings.');
    updateHotkeyDisplay();
}

function beginHotkeyCapture() {
    if (!hotkeyDisplay) return;
    isCapturingHotkey = true;
    hotkeyDisplay.value = 'Waiting for key...';
    setHotkeyHint('Press the key combination you want to use.');
}

function cancelHotkeyCapture() {
    isCapturingHotkey = false;
    setHotkeyHint('Press "Capture" and type the shortcut you want to use.');
    updateHotkeyDisplay();
}

async function copyToClipboard(text, button) {
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        showCopiedFeedback(button, 'Copied!');
    } catch (err) {
        console.error('Clipboard copy failed:', err);
        // alert('Clipboard copy failed: ' + err.message);
        // We don't show this message because it's not accurate. We could still write to the clipboard in this case.
    }
}

function showCopiedFeedback(button, message) {
    if (!button) return;
    const originalText = button.textContent;
    button.textContent = message;
    setTimeout(() => {
        button.textContent = originalText;
    }, 2000);
}

function showToast(message) {
    if (!message) return;
    if (!toastNode) {
        toastNode = document.createElement('div');
        toastNode.className = 'completion-toast';
        document.body.appendChild(toastNode);
    }
    toastNode.textContent = message;
    toastNode.classList.add('visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        if (toastNode) toastNode.classList.remove('visible');
    }, 2500);
}

function showCompletionNotification(message) {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
        showToast(message);
        return;
    }
    if (Notification.permission === 'granted') {
        new Notification(message);
        return;
    }
    if (Notification.permission !== 'denied' && !notificationPermissionRequested) {
        notificationPermissionRequested = true;
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                new Notification(message);
            } else {
                showToast(message);
            }
        }).catch(() => showToast(message));
    } else {
        showToast(message);
    }
}

async function handleTranscriptionComplete({ source = currentProvider, text = '' } = {}) {
    const finalText = (text || transcript.value || '').trim();
    if (finalText && !isMobileDevice()) {
        await copyToClipboard(finalText);
    }
    const sourceLabel = source === 'gemini' ? 'Gemini transcription ready' : 'Recording transcribed';
    showCompletionNotification(sourceLabel);
}

// WAV file creation utility
function createWavBlob(audioBuffer, sampleRate) {
    const bufferLength = audioBuffer.length;
    const arrayBuffer = new ArrayBuffer(44 + bufferLength * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + bufferLength * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, bufferLength * 2, true);
    
    // Convert Int16Array to Int16
    let offset = 44;
    for (let i = 0; i < bufferLength; i++) {
        view.setInt16(offset, audioBuffer[i], true);
        offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Timer functions
function startTimer() {
    clearInterval(timerInterval);
    document.getElementById('timer').textContent = '00:00';
    startTime = Date.now();
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        document.getElementById('timer').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

// Audio processing
function createAudioProcessor() {
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
        if (!isRecording) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        
        for (let i = 0; i < inputData.length; i++) {
            pcmData[i] = Math.max(-32768, Math.min(32767, Math.floor(inputData[i] * 32767)));
        }
        
        const combinedBuffer = new Int16Array(audioBuffer.length + pcmData.length);
        combinedBuffer.set(audioBuffer);
        combinedBuffer.set(pcmData, audioBuffer.length);
        audioBuffer = combinedBuffer;
        
        if (currentProvider !== 'openai') return;

        while (audioBuffer.length >= 24000) {
            const sendBuffer = audioBuffer.slice(0, 24000);
            audioBuffer = audioBuffer.slice(24000);
            
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(sendBuffer.buffer);
            }
        }
    };
    return processor;
}

async function initAudio(stream) {
    audioContext = new AudioContext();
    sampleRate = audioContext.sampleRate;
    source = audioContext.createMediaStreamSource(stream);
    processor = createAudioProcessor();
    source.connect(processor);
    processor.connect(audioContext.destination);
}

// WebSocket handling
function updateConnectionStatus(status) {
    const statusDot = document.getElementById('connectionStatus');
    statusDot.classList.remove('connected', 'connecting', 'idle');
    
    switch (status) {
        case 'connected':  // OpenAI is connected and ready
            statusDot.classList.add('connected');
            statusDot.style.backgroundColor = '#34C759';  // Green
            break;
        case 'connecting':  // Establishing OpenAI connection
            statusDot.classList.add('connecting');
            statusDot.style.backgroundColor = '#FF9500';  // Orange
            break;
        case 'idle':  // Client connected, OpenAI not connected
            statusDot.classList.add('idle');
            statusDot.style.backgroundColor = '#007AFF';  // Blue
            break;
        default:  // Disconnected
            statusDot.style.backgroundColor = '#FF3B30';  // Red
    }
}

function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${protocol}://${window.location.host}/api/v1/ws`);
    
    ws.onopen = () => {
        wsConnected = true;
        updateConnectionStatus(true);
        if (autoStart && !isRecording && !isAutoStarted) startRecording();
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'status':
                updateConnectionStatus(data.status);
                if (data.status === 'idle') {
                    // Auto-enhance once per session end
                    if (!hasAutoEnhanced && transcript.value.trim()) {
                        hasAutoEnhanced = true;
                        triggerEnhancement(enhanceMode, { auto: true });
                    }
                }
                break;
            case 'structured_result':
                // Display structured JSON results (title, segments, summary)
                if (data.result) {
                    displayGeminiResults(data.result);
                }
                break;
            case 'text':
                if (data.isNewResponse) {
                    transcript.value = data.content;
                    stopTimer();
                    if ((data.content || '').trim()) {
                        handleTranscriptionComplete({ source: currentProvider, text: data.content });
                    }
                } else {
                    transcript.value += data.content;
                }
                transcript.scrollTop = transcript.scrollHeight;
                break;
            case 'model_response':
                if (data.isNewResponse) {
                    enhancedTranscript.value = data.content;
                } else {
                    enhancedTranscript.value += data.content;
                }
                enhancedTranscript.scrollTop = enhancedTranscript.scrollHeight;
                break;
            case 'error':
                alert(data.content);
                updateConnectionStatus('idle');
                break;
        }
    };
    
    ws.onclose = () => {
        wsConnected = false;
        updateConnectionStatus(false);
        setTimeout(initializeWebSocket, 1000);
    };
}

// Recording control
async function startRecording() {
    if (isRecording) return;
    
    try {
        transcript.value = '';
        enhancedTranscript.value = '';
        currentJobId = null;
        hasAutoEnhanced = false;
        audioBuffer = new Int16Array(0);
        if (currentProvider === 'gemini') clearGeminiResults();

        if (!streamInitialized) {
            // Check if mediaDevices API is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Microphone access is not available. Please ensure:\n' +
                    '1. You are using a modern browser (Chrome, Firefox, Edge, Safari)\n' +
                    '2. The site is served over HTTPS or localhost\n' +
                    '3. Your browser supports WebRTC');
            }
            
            stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } 
            });
            streamInitialized = true;
        }

        if (!stream) throw new Error('Failed to initialize audio stream');
        if (!audioContext) await initAudio(stream);

        isRecording = true;
        
        if (currentProvider === 'openai') {
            // Real-time mode for OpenAI
            await ws.send(JSON.stringify({ 
                type: 'start_recording',
                provider: currentProvider 
            }));
        }
        // For file upload Gemini mode, we just start recording audio data
        
        startTimer();
        recordButton.textContent = 'Stop';
        recordButton.classList.add('recording');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        alert('Error accessing microphone: ' + error.message);
    }
}

async function stopRecording() {
    if (!isRecording) return;
    
    isRecording = false;
    hotkeyPressed = false;
    stopTimer();
    
    if (currentProvider === 'openai') {
        // Real-time mode for OpenAI
        if (audioBuffer.length > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(audioBuffer.buffer);
            audioBuffer = new Int16Array(0);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        await ws.send(JSON.stringify({ type: 'stop_recording' }));
    } else if (currentProvider === 'gemini') {
        // Gemini mode - process recorded audio
        if (audioBuffer.length > 0) {
            // Convert Int16Array to WAV blob
            const wavBlob = createWavBlob(audioBuffer, sampleRate);
            
            // Create file object for upload
            const audioFile = new File([wavBlob], 'recording.wav', { type: 'audio/wav' });
            
            // Show upload status
            const uploadStatus = document.getElementById('uploadStatus');
            if (uploadStatus) uploadStatus.textContent = 'Processing recorded audio...';
            
            // Upload to Gemini
            await uploadAudioFile(audioFile);
        }
        audioBuffer = new Int16Array(0);
    }
    
    recordButton.textContent = 'Start';
    recordButton.classList.remove('recording');
}

// Event listeners
recordButton.onclick = () => isRecording ? stopRecording() : startRecording();
copyButton && (copyButton.onclick = () => handleTranscriptCopy());
copyEnhancedButton && (copyEnhancedButton.onclick = () => copyToClipboard(enhancedTranscript.value, copyEnhancedButton));
copyConversationButton && (copyConversationButton.onclick = () => handleConversationCopy());

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    initializeTheme();
    loadSettings();
    setupProviderToggle();
    setupEnhanceMode();
    setupDropzone();
    setupSettings();
    updateHotkeyDisplay();

    // Jobs & search panel actions
    if (menuToggle) menuToggle.onclick = () => jobsPanel && jobsPanel.classList.toggle('open');
    if (closeJobs) closeJobs.onclick = () => jobsPanel && jobsPanel.classList.remove('open');
    if (searchToggle) searchToggle.onclick = () => searchPanel && searchPanel.classList.toggle('open');
    if (closeSearch) closeSearch.onclick = () => searchPanel && searchPanel.classList.remove('open');
    if (searchButton) searchButton.onclick = () => runSearch();
    if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });

    // Preload jobs list
    loadJobs();

    // Always show recording controls
    const recordingControls = document.getElementById('recordingControls');
    if (recordingControls) recordingControls.style.display = 'block';

    // Sticky topbar behavior
    const topbar = document.getElementById('topbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 10) topbar.classList.add('scrolled');
        else topbar.classList.remove('scrolled');
    });
});
// Readability and AI handlers
async function runReadability(options = {}) {
    const { auto = false, jobId = currentJobId, textOverride = null } = options;
    const inputText = (textOverride ?? transcript.value).trim();
    if (!inputText) {
        if (!auto) alert('Please enter text to enhance readability.');
        return;
    }

    if (readabilityAbortController) {
        readabilityAbortController.abort();
    }
    readabilityAbortController = new AbortController();
    const { signal } = readabilityAbortController;

    if (!auto) startTimer();

    try {
        const response = await fetch('/api/v1/readability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: inputText }),
            signal
        });

        if (!response.ok) throw new Error('Readability enhancement failed');
        if (!response.body) throw new Error('No readability response body');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
            enhancedTranscript.value = fullText;
            enhancedTranscript.scrollTop = enhancedTranscript.scrollHeight;
        }

        if (!auto && !isMobileDevice()) copyToClipboard(fullText, copyEnhancedButton);
        if (jobId && fullText.trim()) await persistReadability(jobId, fullText, auto);

    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error:', error);
        if (!auto) alert('Error enhancing readability');
    } finally {
        if (!auto) stopTimer();
        if (readabilityAbortController && readabilityAbortController.signal === signal) {
            readabilityAbortController = null;
        }
    }
}

async function persistReadability(jobId, text, auto = false) {
    if (!jobId || !text) return;
    try {
        const response = await fetch(`/api/v1/transcription_jobs/${jobId}/readability`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        if (!response.ok) throw new Error('Failed to save readability');
        const data = await response.json();
        if (latestGeminiResult && currentJobId === jobId) {
            latestGeminiResult.readability = data.readability || {
                text,
                updated_at: new Date().toISOString()
            };
        }
    } catch (error) {
        console.error('Failed to save readability result', error);
        if (!auto) alert('Failed to save readability result');
    }
}

async function runAskAI() {
    startTimer();
    const inputText = transcript.value.trim();
    if (!inputText) {
        alert('Please enter text to ask AI about.');
        stopTimer();
        return;
    }

    try {
        const response = await fetch('/api/v1/ask_ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: inputText })
        });

        if (!response.ok) throw new Error('AI request failed');

        const result = await response.json();
        enhancedTranscript.value = result.answer;
        if (!isMobileDevice()) copyToClipboard(result.answer, copyEnhancedButton);
        stopTimer();

    } catch (error) {
        console.error('Error:', error);
        alert('Error asking AI');
        stopTimer();
    }
}

async function runCorrectness() {
    startTimer();
    const inputText = transcript.value.trim();
    if (!inputText) {
        alert('Please enter text to check for correctness.');
        stopTimer();
        return;
    }

    try {
        const response = await fetch('/api/v1/correctness', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: inputText })
        });

        if (!response.ok) throw new Error('Correctness check failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
            enhancedTranscript.value = fullText;
            enhancedTranscript.scrollTop = enhancedTranscript.scrollHeight;
        }

        if (!isMobileDevice()) copyToClipboard(fullText, copyEnhancedButton);
        stopTimer();

    } catch (error) {
        console.error('Error:', error);
        alert('Error checking correctness');
        stopTimer();
    }
}

// Bind buttons only if present (legacy support)
if (readabilityButton) readabilityButton.onclick = () => runReadability();
if (askAIButton) askAIButton.onclick = runAskAI;
if (correctnessButton) correctnessButton.onclick = runCorrectness;

// Theme handling
function toggleTheme() {
    const body = document.body;
    const themeToggle = document.getElementById('themeToggle');
    const isDarkTheme = body.classList.toggle('dark-theme');
    
    // Update button text
    themeToggle.textContent = isDarkTheme ? '☀️' : '🌙';
    
    // Save preference to localStorage
    localStorage.setItem('darkTheme', isDarkTheme);
}

// Initialize theme from saved preference
function initializeTheme() {
    const darkTheme = localStorage.getItem('darkTheme') === 'true';
    const themeToggle = document.getElementById('themeToggle');
    
    // Default to dark theme if not set
    if (localStorage.getItem('darkTheme') === null) {
        localStorage.setItem('darkTheme', 'true');
    }
    const shouldBeDark = localStorage.getItem('darkTheme') === 'true';
    if (shouldBeDark) {
        document.body.classList.add('dark-theme');
        themeToggle.textContent = '☀️';
    } else {
        document.body.classList.remove('dark-theme');
        themeToggle.textContent = '🌙';
    }
}

// Add to your existing event listeners
document.getElementById('themeToggle').onclick = toggleTheme;

// Provider selection handling (segmented)
function setupProviderToggle() {
    if (!providerToggle) return;
    providerToggle.querySelectorAll('input[name="provider"]').forEach((input) => {
        input.addEventListener('change', (e) => {
            currentProvider = e.target.value;
            clearGeminiResults();
            if (isRecording) stopRecording();
        });
    });
}

// Enhance mode selection
function setupEnhanceMode() {
    if (!enhanceModeControl) return;
    const runIfTextPresent = (mode) => {
        if (!transcript.value.trim()) return;
        triggerEnhancement(mode);
    };
    enhanceModeControl.querySelectorAll('input[name="enhance"]').forEach((input) => {
        input.addEventListener('change', (e) => {
            enhanceMode = e.target.value;
            runIfTextPresent(enhanceMode);
        });

        input.addEventListener('click', () => {
            if (!input.checked) return;
            runIfTextPresent(input.value);
        });

        const label = enhanceModeControl.querySelector(`label[for="${input.id}"]`);
        if (label) {
            label.addEventListener('click', () => {
                if (!input.checked) return;
                runIfTextPresent(input.value);
            });
        }
    });
}

// Dropzone handling (click or drop)
function setupDropzone() {
    if (!dropzone || !audioFile) return;

    dropzone.addEventListener('click', () => audioFile.click());
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) handleAudioFile(file);
    });

    audioFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) handleAudioFile(file);
    });
}

async function handleAudioFile(file) {
    const validTypes = [
        'audio/wav', 'audio/wave', 'audio/x-wav',
        'audio/mpeg', 'audio/mp3',
        'audio/ogg',
        'audio/flac',
        'audio/mp4', 'audio/x-m4a'
    ];
    // Some browsers leave type empty; fallback to extension check
    const lowerName = (file.name || '').toLowerCase();
    const looksLikeM4A = lowerName.endsWith('.m4a');
    if (!validTypes.includes(file.type) && !looksLikeM4A) {
        if (uploadStatus) uploadStatus.textContent = 'Please select a valid audio file (WAV, MP3, OGG, FLAC, or M4A)';
        return;
    }
    if (file.size > 25 * 1024 * 1024) {
        if (uploadStatus) uploadStatus.textContent = 'File size must be less than 25MB';
        return;
    }
    await uploadAudioFile(file);
}

async function uploadAudioFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    const uploadStatus = document.getElementById('uploadStatus');
    const progressBar = document.getElementById('progressBar');
    const progressFill = progressBar ? progressBar.querySelector('.progress-fill') : null;
    if (uploadStatus) uploadStatus.style.color = '';
    // Do not keep a long blocking progress display; show brief feedback only
    // Non-blocking UX: brief sending message, no persistent progress bar
    if (uploadStatus) uploadStatus.textContent = 'Sending...';
    setTimeout(() => { if (uploadStatus && uploadStatus.textContent === 'Sending...') uploadStatus.textContent = ''; }, 500);

    try {
        // Enqueue job, do not block UI
        const response = await fetch('/api/v1/transcription_jobs', {
            method: 'POST',
            body: formData
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || 'Job enqueue failed');
        }
        const { job } = await response.json();
        if (uploadStatus) uploadStatus.textContent = `Job ${job.id} pending`;
        // Immediately reflect job in UI as PENDING without waiting for list fetch
        if (jobsList) {
            const div = document.createElement('div');
            div.className = 'job-item';
            div.innerHTML = `
                <div class="status">PENDING • ${job.id}</div>
                <div class="title">${job.title || ''}</div>
                <div class="meta">${new Date(job.created_at).toLocaleString()}</div>
            `;
            div.onclick = async () => {
                const detail = await fetch(`/api/v1/transcription_jobs/${job.id}`).then(r => r.json());
                if (detail.result) displayGeminiResults(detail.result);
            };
            jobsList.prepend(div);
        }
        setTimeout(() => { if (uploadStatus) uploadStatus.textContent = ''; }, 1200);
        // Refresh jobs list soon and open panel for visibility
        setTimeout(() => loadJobs(false), 500);
        if (jobsPanel) jobsPanel.classList.add('open');

        // Poll for completion in background, do not block UI
        pollJobUntilDone(job.id, () => { /* no-op UI blocking */ });

        // Result will be fetched when user clicks job, or we could auto-refresh when polling detects completion
    } catch (error) {
        console.error('Upload error:', error);
        if (uploadStatus) {
            uploadStatus.textContent = `Error: ${error.message}`;
            uploadStatus.style.color = '#FF3B30';
        }
    } finally {
        if (progressBar) progressBar.style.display = 'none';
        if (progressFill) progressFill.style.width = '0%';
    }
}

async function pollJobUntilDone(jobId, onStatus) {
    let status = 'pending';
    let latestDetail = null;
    while (status === 'pending' || status === 'processing') {
        try {
            const data = await fetch(`/api/v1/transcription_jobs/${jobId}`).then(r => r.json());
            latestDetail = data;
            status = data.status;
            if (typeof onStatus === 'function') onStatus(status);
            await loadJobs(false);
            if (status === 'completed' || status === 'failed') break;
        } catch (e) {
            console.warn('Polling error:', e);
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    if (status === 'completed' && latestDetail?.result) {
        currentJobId = jobId;
        displayGeminiResults(latestDetail.result, { autoComplete: true });
    }
    return status;
}

async function loadJobs(openOnLoad = false) {
    if (!jobsList) return;
    try {
        const jobs = await fetch('/api/v1/transcription_jobs').then(r => r.json());
        jobsList.innerHTML = '';
        jobs.forEach(job => {
            const div = document.createElement('div');
            div.className = 'job-item';
            const isFailed = (job.status || '').toLowerCase() === 'failed';
            const errorDisplay = isFailed && job.error ? `<div class="job-error">${escapeHtml(job.error)}</div>` : '';
            const retryButton = isFailed ? '<button class="job-retry">Retry</button>' : '';
            div.innerHTML = `
                <div class="status ${isFailed ? 'status-failed' : ''}">${(job.status || '').toUpperCase()} • ${job.id}</div>
                <div class="title">${job.title || ''}</div>
                ${errorDisplay}
                <div class="meta">${new Date(job.created_at).toLocaleString()}</div>
                <div class="job-actions">
                    ${retryButton}
                    <button class="job-open">Open</button>
                    <button class="job-delete">Delete</button>
                </div>
            `;
            div.onclick = () => openJob(job.id);
            const openBtn = div.querySelector('.job-open');
            const delBtn = div.querySelector('.job-delete');
            const retryBtn = div.querySelector('.job-retry');
            
            if (retryBtn) {
                retryBtn.onclick = async (e) => {
                    e.stopPropagation();
                    retryBtn.disabled = true;
                    retryBtn.textContent = 'Retrying...';
                    try {
                        const res = await fetch(`/api/v1/transcription_jobs/${job.id}/retry`, { method: 'POST' });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(err.detail || 'Failed to retry job');
                        }
                        // Reload jobs list to show updated status
                        await loadJobs(false);
                        // Start polling for completion
                        const data = await res.json();
                        if (data.job) {
                            pollJobUntilDone(data.job.id, () => {});
                        }
                    } catch (err) {
                        alert(err.message || 'Failed to retry job');
                        retryBtn.disabled = false;
                        retryBtn.textContent = 'Retry';
                    }
                };
            }
            
            if (openBtn) openBtn.onclick = async (e) => {
                e.stopPropagation();
                try {
                    const res = await fetch(`/api/v1/transcription_jobs/${job.id}/open`, { method: 'POST' });
                    if (!res.ok) throw new Error('Failed to open folder');
                } catch (err) {
                    alert(err.message || 'Failed to open folder');
                }
            };
            if (delBtn) delBtn.onclick = async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this job? This cannot be undone.')) return;
                try {
                    const res = await fetch(`/api/v1/transcription_jobs/${job.id}`, { method: 'DELETE' });
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}));
                        throw new Error(err.detail || 'Failed to delete job');
                    }
                    div.remove();
                } catch (err) {
                    alert(err.message || 'Failed to delete job');
                }
            };
            jobsList.appendChild(div);
        });
        if (openOnLoad && jobs.length) if (jobsPanel) jobsPanel.classList.add('open');
    } catch (e) {
        console.warn('Failed to load jobs', e);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function openJob(jobId) {
    if (!jobId) return;
    try {
        const response = await fetch(`/api/v1/transcription_jobs/${jobId}`);
        const detail = await response.json();
        if (!response.ok) {
            throw new Error(detail.detail || 'Failed to load job');
        }
        currentJobId = jobId;
        if (detail.result) {
            displayGeminiResults(detail.result);
            await ensureReadabilityForJob(jobId, detail.result);
        } else {
            clearGeminiResults();
            transcript.value = '';
            enhancedTranscript.value = '';
        }
    } catch (error) {
        console.error('Failed to load job', error);
        alert(error.message || 'Failed to load job');
    }
}

async function ensureReadabilityForJob(jobId, result) {
    if (!jobId || !result) return;
    const storedText = (result.readability && result.readability.text) ? result.readability.text.trim() : '';
    if (storedText) {
        enhancedTranscript.value = storedText;
        return;
    }
    const baseText = (transcript.value || buildReadableTranscript(result.speech_segments || []) || result.summary || '').trim();
    if (!baseText) return;
    await runReadability({ auto: true, jobId, textOverride: baseText });
}

async function runSearch() {
    if (!searchInput || !searchResults) return;
    const q = (searchInput.value || '').trim();
    if (!q) return;
    try {
        const data = await fetch(`/api/v1/transcriptions/search?q=${encodeURIComponent(q)}`).then(r => r.json());
        const results = data.results || [];
        searchResults.innerHTML = '';
        results.forEach(item => {
            const div = document.createElement('div');
            div.className = 'result-item';
            div.innerHTML = `
                <div class="title">${item.title || 'Untitled'}</div>
                <div class="meta">Job: ${item.job_id}</div>
                <div class="summary">${item.summary || ''}</div>
            `;
            div.onclick = async () => {
                await openJob(item.job_id);
                if (searchPanel) searchPanel.classList.remove('open');
            };
            searchResults.appendChild(div);
        });
    } catch (e) {
        console.warn('Search failed', e);
    }
}

function buildConversationString(segments = []) {
    if (!segments.length) return '';
    return segments.map(segment => {
        const speaker = segment.speaker || 'Speaker';
        const start = segment.start_time || '';
        const end = segment.end_time || '';
        const timeRange = [start, end].filter(Boolean).join(' - ');
        const header = timeRange ? `${speaker} [${timeRange}]` : speaker;
        const content = segment.content || '';
        return `${header}: ${content}`.trim();
    }).join('\n');
}

function buildReadableTranscript(segments = []) {
    if (!segments.length) return '';
    return segments
        .map(segment => (segment.content || '').trim())
        .filter(Boolean)
        .join('\n');
}

function renderConversationBubbles(segments = []) {
    if (!conversationThread) return;
    conversationThread.innerHTML = '';
    if (!segments.length) {
        const emptyState = document.createElement('div');
        emptyState.className = 'conversation-empty';
        emptyState.textContent = 'No speakers detected yet.';
        conversationThread.appendChild(emptyState);
        return;
    }

    const alignmentMap = new Map();
    const alignments = ['left', 'right'];
    let nextIndex = 0;

    segments.forEach(segment => {
        const speaker = segment.speaker || 'Speaker';
        if (!alignmentMap.has(speaker)) {
            alignmentMap.set(speaker, alignments[nextIndex % alignments.length]);
            nextIndex += 1;
        }
        const alignment = alignmentMap.get(speaker);

        const bubble = document.createElement('div');
        bubble.classList.add('chat-bubble', alignment);

        const speakerEl = document.createElement('div');
        speakerEl.classList.add('speaker-name');
        speakerEl.textContent = speaker;
        bubble.appendChild(speakerEl);

        if (segment.content) {
            const textEl = document.createElement('div');
            textEl.classList.add('bubble-text');
            textEl.textContent = segment.content;
            bubble.appendChild(textEl);
        }

        const timeRange = [segment.start_time, segment.end_time].filter(Boolean).join(' - ');
        if (timeRange) {
            const metaEl = document.createElement('div');
            metaEl.classList.add('bubble-meta');
            metaEl.textContent = timeRange;
            bubble.appendChild(metaEl);
        }

        conversationThread.appendChild(bubble);
    });
}

function clearGeminiResults() {
    latestGeminiResult = null;
    currentJobId = null;
    if (geminiResults) geminiResults.style.display = 'none';
    if (conversationThread) conversationThread.innerHTML = '';
    const title = document.getElementById('resultTitle');
    const summary = document.getElementById('resultSummary');
    const segments = document.getElementById('resultSegments');
    if (title) title.textContent = '';
    if (summary) summary.textContent = '';
    if (segments) segments.innerHTML = '';
    if (copyConversationButton) copyConversationButton.disabled = true;
}

async function handleTranscriptCopy() {
    if (!copyButton) return;
    await copyToClipboard(transcript.value, copyButton);
}

async function handleConversationCopy() {
    if (!copyConversationButton) return;
    if (!latestGeminiResult?.speech_segments?.length) {
        showCopiedFeedback(copyConversationButton, 'No conversation');
        return;
    }
    const conversationText = buildConversationString(latestGeminiResult.speech_segments);
    await copyToClipboard(conversationText, copyConversationButton);
}

function displayGeminiResults(result, options = {}) {
    latestGeminiResult = result;

    if (geminiResults) geminiResults.style.display = 'block';
    if (copyConversationButton) copyConversationButton.disabled = !(result.speech_segments && result.speech_segments.length);
    if (result.readability?.text && enhancedTranscript) {
        enhancedTranscript.value = result.readability.text;
    }

    const titleNode = document.getElementById('resultTitle');
    if (titleNode) titleNode.textContent = result.title || 'No title';

    const segmentsContainer = document.getElementById('resultSegments');
    if (segmentsContainer) {
        segmentsContainer.innerHTML = '';
        (result.speech_segments || []).forEach(segment => {
            const segmentDiv = document.createElement('div');
            segmentDiv.className = 'segment-item';
            segmentDiv.innerHTML = `
                <div class="segment-header">${segment.speaker || 'Speaker'} • ${segment.start_time || ''} - ${segment.end_time || ''}</div>
                <div>${segment.content || ''}</div>
            `;
            segmentsContainer.appendChild(segmentDiv);
        });
    }

    const summaryNode = document.getElementById('resultSummary');
    if (summaryNode) summaryNode.textContent = result.summary || 'No summary';

    renderConversationBubbles(result.speech_segments || []);

    try {
        const readable = buildReadableTranscript(result.speech_segments || []);
        transcript.value = readable || result.summary || '';
    } catch (e) {
        console.warn('Failed to build combined segments text:', e);
    }

    if (options.autoComplete) {
        handleTranscriptionComplete({ source: 'gemini', text: transcript.value });
    }
}

function handleGlobalKeyDown(event) {
    if (isCapturingHotkey) {
        handleHotkeyCapture(event);
        return;
    }
    if (event.repeat || isTypingIntoField()) return;
    if (!matchesHotkey(event)) return;
    event.preventDefault();
    hotkeyPressed = true;
    if (!isRecording) startRecording();
}

function handleGlobalKeyUp(event) {
    if (!hotkeyPressed) return;
    if (!matchesHotkey(event)) return;
    event.preventDefault();
    hotkeyPressed = false;
    if (isRecording) stopRecording();
}

window.addEventListener('blur', () => {
    hotkeyPressed = false;
    if (isCapturingHotkey) cancelHotkeyCapture();
});

document.addEventListener('keydown', handleGlobalKeyDown);
document.addEventListener('keyup', handleGlobalKeyUp);

// Settings handling
function setupSettings() {
    // Get settings DOM elements
    const settingsButton = document.getElementById('settingsButton');
    const settingsModal = document.getElementById('settingsModal');
    const closeModal = document.getElementById('closeModal');
    const saveSettings = document.getElementById('saveSettings');
    const openaiKey = document.getElementById('openaiKey');
    const geminiKey = document.getElementById('geminiKey');
    
    // Check if elements exist before setting up event listeners
    if (!settingsButton || !settingsModal || !closeModal || !saveSettings || !openaiKey || !geminiKey) {
        console.warn('Settings modal elements not found, skipping setup');
        return;
    }
    
    settingsButton.addEventListener('click', () => {
        settingsModal.style.display = 'block';
    });
    
    closeModal.addEventListener('click', () => {
        settingsModal.style.display = 'none';
        cancelHotkeyCapture();
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.style.display = 'none';
            cancelHotkeyCapture();
        }
    });
    
    if (captureHotkeyButton) {
        captureHotkeyButton.addEventListener('click', () => {
            beginHotkeyCapture();
        });
    }

    if (resetHotkeyButton) {
        resetHotkeyButton.addEventListener('click', () => {
            configuredHotkey = cloneHotkey();
            cancelHotkeyCapture();
            setHotkeyHint('Reset to default Space shortcut.');
        });
    }

    saveSettings.addEventListener('click', async () => {
        const settings = {
            openaiApiKey: openaiKey.value,
            geminiApiKey: geminiKey.value,
            hotkey: configuredHotkey
        };
        
        try {
            const response = await fetch('/api/v1/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                alert('Settings saved successfully!');
                settingsModal.style.display = 'none';
                // Reload page to apply new API keys
                window.location.reload();
            } else {
                alert('Failed to save settings');
            }
        } catch (error) {
            console.error('Settings save error:', error);
            alert('Error saving settings');
        }
    });
}

async function loadSettings() {
    try {
        const response = await fetch('/api/v1/settings');
        if (response.ok) {
            const settings = await response.json();
            const openaiKey = document.getElementById('openaiKey');
            const geminiKey = document.getElementById('geminiKey');
            
            if (openaiKey) openaiKey.value = settings.openaiApiKey || '';
            if (geminiKey) geminiKey.value = settings.geminiApiKey || '';
            configuredHotkey = sanitizeHotkey(settings.hotkey);
            updateHotkeyDisplay();
            cancelHotkeyCapture();
        }
    } catch (error) {
        console.error('Settings load error:', error);
    }
}

// Trigger enhancement by mode
function triggerEnhancement(mode, options = {}) {
    if (mode === 'readability') return runReadability(options);
    if (mode === 'correctness') return runCorrectness();
    if (mode === 'ask') return runAskAI();
}

