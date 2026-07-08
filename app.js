// app.js
import { db } from './config.js';
import { 
    doc, getDoc, setDoc, collection, addDoc, getDocs, 
    query, orderBy, serverTimestamp, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- State Management ---
let state = {
    userId: localStorage.getItem('chat_user_id') || null,
    apiKey: null,
    currentChatId: null,
    messages: [],
    availableModels: [],
    selectedModel: null,
    isProcessing: false,
    uploadedImageBase64: null
};

// --- DOM Elements ---
const DOM = {
    // Settings
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeSettingsBtn: document.getElementById('close-settings-btn'),
    cancelSettingsBtn: document.getElementById('cancel-settings-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    userIdInput: document.getElementById('user-id-input'),
    apiKeyInput: document.getElementById('nvidia-api-key-input'),
    
    // Sidebar & Status
    displayUserId: document.getElementById('display-user-id'),
    connectionStatus: document.getElementById('connection-status'),
    chatHistoryList: document.getElementById('chat-history-list'),
    newChatBtn: document.getElementById('new-chat-btn'),
    
    // Header & Input
    modelSelect: document.getElementById('model-select'),
    promptInput: document.getElementById('prompt-input'),
    sendBtn: document.getElementById('send-btn'),
    uploadLabel: document.getElementById('upload-label'),
    imageUpload: document.getElementById('image-upload'),
    
    // Chat Area
    chatContainer: document.getElementById('chat-container'),
    emptyState: document.getElementById('empty-state')
};

// --- Initialization ---
async function init() {
    setupEventListeners();
    
    if (state.userId) {
        await loadUserConfig(state.userId);
    } else {
        openSettings();
    }
}

// --- Event Listeners ---
function setupEventListeners() {
    // Settings Modal
    DOM.settingsBtn.addEventListener('click', openSettings);
    DOM.closeSettingsBtn.addEventListener('click', closeSettings);
    DOM.cancelSettingsBtn.addEventListener('click', closeSettings);
    DOM.saveSettingsBtn.addEventListener('click', saveSettings);

    // Chat Interface
    DOM.sendBtn.addEventListener('click', handleSend);
    DOM.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });
    DOM.newChatBtn.addEventListener('click', startNewChat);
    DOM.modelSelect.addEventListener('change', (e) => {
        state.selectedModel = e.target.value;
        checkVisionCapabilities();
    });

    // Image Upload
    DOM.imageUpload.addEventListener('change', handleImageUpload);
}

// --- User Configuration (Firestore) ---
async function loadUserConfig(userId) {
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            state.apiKey = userSnap.data().nvidiaApiKey;
            updateConnectionStatus(true);
            await fetchModels();
            await loadChatHistory();
        } else {
            updateConnectionStatus(false, "User not found in Firestore");
            openSettings();
        }
    } catch (error) {
        console.error("Error loading user config:", error);
        updateConnectionStatus(false, "Firestore Error");
    }
}

async function saveSettings() {
    const newUserId = DOM.userIdInput.value.trim();
    const newApiKey = DOM.apiKeyInput.value.trim();

    if (!newUserId || !newApiKey) {
        alert("Both User ID and API Key are required.");
        return;
    }

    try {
        const userRef = doc(db, 'users', newUserId);
        await setDoc(userRef, {
            nvidiaApiKey: newApiKey,
            updatedAt: serverTimestamp()
        }, { merge: true });

        state.userId = newUserId;
        state.apiKey = newApiKey;
        localStorage.setItem('chat_user_id', newUserId);
        
        closeSettings();
        await loadUserConfig(newUserId);
    } catch (error) {
        console.error("Error saving settings:", error);
        alert("Failed to save settings to Firestore.");
    }
}

// --- UI Updates ---
function updateConnectionStatus(isConnected, message = "") {
    DOM.displayUserId.textContent = state.userId || "No User Configured";
    if (isConnected && state.apiKey) {
        DOM.connectionStatus.textContent = "Online / Ready";
        DOM.connectionStatus.className = "text-xs text-green-400";
    } else {
        DOM.connectionStatus.textContent = message || "Offline / No API Key";
        DOM.connectionStatus.className = "text-xs text-red-400";
    }
}

function openSettings() {
    DOM.userIdInput.value = state.userId || '';
    DOM.apiKeyInput.value = state.apiKey || '';
    DOM.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    if (!state.userId || !state.apiKey) {
        alert("You must configure your credentials to use the app.");
        return;
    }
    DOM.settingsModal.classList.add('hidden');
}

// --- NVIDIA NIM Orchestration ---
async function fetchModels() {
    try {
        const response = await fetch('/api/nvidia/models', {
    headers: {
        'Authorization': `Bearer ${currentApiKey}`
    }
});
        
        if (!response.ok) throw new Error("Failed to fetch models");
        
        const data = await response.json();
        state.availableModels = data.data.filter(m => m.id); // Basic filtering
        
        DOM.modelSelect.innerHTML = '';
        state.availableModels.forEach((model, index) => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            if (index === 0) {
                option.selected = true;
                state.selectedModel = model.id;
            }
            DOM.modelSelect.appendChild(option);
        });
        
        checkVisionCapabilities();
    } catch (error) {
        console.error("Model fetch error:", error);
        DOM.modelSelect.innerHTML = '<option disabled selected>Error loading models</option>';
    }
}

function checkVisionCapabilities() {
    // Dynamic routing: Show upload button if model supports vision.
    // Note: NVIDIA endpoints usually denote vision models explicitly in the ID.
    const isVision = state.selectedModel && state.selectedModel.toLowerCase().includes('vision');
    if (isVision) {
        DOM.uploadLabel.classList.remove('hidden');
    } else {
        DOM.uploadLabel.classList.add('hidden');
        state.uploadedImageBase64 = null; 
    }
}

// --- Chat Logic & History (Firestore) ---
async function loadChatHistory() {
    if (!state.userId) return;
    
    DOM.chatHistoryList.innerHTML = '<li class="text-xs text-gray-500 px-2">Loading...</li>';
    
    try {
        const convRef = collection(db, `users/${state.userId}/conversations`);
        const q = query(convRef, orderBy('lastUpdated', 'desc'));
        const querySnapshot = await getDocs(q);
        
        DOM.chatHistoryList.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const chat = doc.data();
            const li = document.createElement('li');
            li.className = 'px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg cursor-pointer truncate transition-colors';
            
            // Derive a title from the first message, or use a default
            const title = chat.messages && chat.messages.length > 0 
                ? (typeof chat.messages[0].content === 'string' ? chat.messages[0].content.substring(0, 25) : "Vision Chat") 
                : "New Conversation";
                
            li.textContent = title + "...";
            li.onclick = () => loadSpecificChat(doc.id, chat.messages);
            DOM.chatHistoryList.appendChild(li);
        });
    } catch (error) {
        console.error("Error loading history:", error);
        DOM.chatHistoryList.innerHTML = '<li class="text-xs text-red-400 px-2">Failed to load</li>';
    }
}

function startNewChat() {
    state.currentChatId = null;
    state.messages = [];
    state.uploadedImageBase64 = null;
    DOM.chatContainer.innerHTML = '';
    DOM.chatContainer.appendChild(DOM.emptyState);
    DOM.emptyState.classList.remove('hidden');
}

function loadSpecificChat(chatId, messages) {
    state.currentChatId = chatId;
    state.messages = messages || [];
    DOM.emptyState.classList.add('hidden');
    DOM.chatContainer.innerHTML = '';
    
    state.messages.forEach(msg => {
        renderMessage(msg.role, msg.content);
    });
}

// --- Message Sending & API Integration ---
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        state.uploadedImageBase64 = event.target.result;
        DOM.promptInput.placeholder = "Image attached. Add a message...";
    };
    reader.readAsDataURL(file);
}

async function handleSend() {
    const text = DOM.promptInput.value.trim();
    if ((!text && !state.uploadedImageBase64) || state.isProcessing || !state.apiKey) return;

    DOM.promptInput.value = '';
    DOM.promptInput.placeholder = "Send a message...";
    state.isProcessing = true;
    DOM.sendBtn.disabled = true;
    DOM.emptyState.classList.add('hidden');

    // Construct User Message based on OpenAI multimodal spec
    let userMessageContent = text;
    if (state.uploadedImageBase64) {
        userMessageContent = [
            { type: "text", text: text || "Describe this image." },
            { type: "image_url", image_url: { url: state.uploadedImageBase64 } }
        ];
        state.uploadedImageBase64 = null; // Reset after sending
    }

    const userMessage = { role: 'user', content: userMessageContent };
    state.messages.push(userMessage);
    
    // Render text representation in UI
    const displayText = typeof userMessageContent === 'string' ? userMessageContent : (text || "[Image Uploaded]");
    renderMessage('user', displayText);

    try {
        // Save to Firestore before API call (optimistic save)
        await syncConversationToFirestore();

        // Add loading indicator
        const loadingId = 'loading-' + Date.now();
        renderMessage('assistant', '<div class="animate-pulse flex space-x-2"><div class="w-2 h-2 bg-gray-400 rounded-full"></div><div class="w-2 h-2 bg-gray-400 rounded-full"></div><div class="w-2 h-2 bg-gray-400 rounded-full"></div></div>', loadingId);

        // Standard OpenAI-compatible API POST
        const response = await fetch('/api/nvidia/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentApiKey}`
    },
    body: JSON.stringify({
        model: modelToUse,
        messages: currentMessages,
        max_tokens: 1024
    })
});

        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) loadingElement.remove();

        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

        const data = await response.json();
        const aiResponseText = data.choices[0].message.content;

        const aiMessage = { role: 'assistant', content: aiResponseText };
        state.messages.push(aiMessage);
        renderMessage('assistant', aiResponseText);

        // Final sync to Firestore
        await syncConversationToFirestore();
        await loadChatHistory(); // Refresh sidebar

    } catch (error) {
        console.error("Chat error:", error);
        renderMessage('assistant', `<span class="text-red-400">Error: ${error.message}. Please check your API key and connection.</span>`);
    } finally {
        state.isProcessing = false;
        DOM.sendBtn.disabled = false;
    }
}

async function syncConversationToFirestore() {
    if (!state.userId) return;

    try {
        const convRef = state.currentChatId 
            ? doc(db, `users/${state.userId}/conversations`, state.currentChatId)
            : doc(collection(db, `users/${state.userId}/conversations`));

        if (!state.currentChatId) {
            state.currentChatId = convRef.id;
        }

        const payload = {
            modelUsed: state.selectedModel,
            messages: state.messages,
            lastUpdated: serverTimestamp()
        };

        await setDoc(convRef, payload, { merge: true });
    } catch (error) {
        console.error("Error syncing conversation:", error);
    }
}

// --- DOM Rendering ---
function renderMessage(role, content, id = null) {
    const wrapper = document.createElement('div');
    if (id) wrapper.id = id;
    
    const isUser = role === 'user';
    wrapper.className = `w-full py-6 px-4 md:px-8 flex ${isUser ? 'bg-transparent' : 'bg-gray-900 border-y border-gray-800'}`;
    
    // Convert newlines to breaks safely for basic Markdown-like display
    const formattedContent = typeof content === 'string' ? content.replace(/\n/g, '<br>') : content;

    wrapper.innerHTML = `
        <div class="max-w-3xl mx-auto flex gap-4 w-full">
            <div class="w-8 h-8 rounded-full flex shrink-0 items-center justify-center font-bold text-sm ${isUser ? 'bg-blue-600' : 'bg-emerald-600'}">
                ${isUser ? 'U' : 'AI'}
            </div>
            <div class="flex-1 text-gray-200 leading-relaxed text-sm md:text-base mt-1 overflow-x-auto">
                ${formattedContent}
            </div>
        </div>
    `;
    
    DOM.chatContainer.appendChild(wrapper);
    DOM.chatContainer.scrollTop = DOM.chatContainer.scrollHeight;
}

// Boot application
init();
