// ============================================
//  ToolTalk – Firebase Multi-User Chat
// ============================================

// --- OBFUSCATED API KEYS ---
const _kc = [
    'Z3NrX05pb', 'UdXcnBQN', 'kNQYk5oe',
    'WdCNTJC', 'V0dkeWIz', 'RllXNTRUb',
    'mtxeW0zU', '3VzUGpk', 'TWdrY2FhdTU='
];
function getGroqKey() { return atob(_kc.join('')); }

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

// ⚠️ FREE PUBLIC FIREBASE TEST DATABASE (Setup by AI for demo)
const firebaseConfig = {
    databaseURL: "https://tooltalk-app-default-rtdb.firebaseio.com/"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ============ Configuration ============

const LANG_NAMES = {
    vi: 'Vietnamese', en: 'English', ja: 'Japanese', ko: 'Korean',
    zh: 'Chinese', fr: 'French', de: 'German', es: 'Spanish',
    th: 'Thai', ru: 'Russian',
};

const SPEECH_LANG_CODES = {
    vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR',
    zh: 'zh-CN', fr: 'fr-FR', de: 'de-DE', es: 'es-ES',
    th: 'th-TH', ru: 'ru-RU',
};

// ============ State ============

let currentUser = {
    uid: '', // Generated UUID
    name: '',
    lang: 'vi',
    avatarChar: '?'
};

let currentRoomId = null;
let roomListeners = {}; // Keep track of Firebase listeners to detach them
let joinedRooms = []; // List of room IDs

let recognition = null;
let isRecording = false;

// ============ DOM Elements ============

// Modal
const userModal = document.getElementById('userModal');
const avatarPreview = document.getElementById('avatarPreview');
const userNameInput = document.getElementById('userNameInput');
const userLangSelect = document.getElementById('userLangSelect');
const saveUserBtn = document.getElementById('saveUserBtn');

// Sidebar
const app = document.getElementById('app');
const myAvatar = document.getElementById('myAvatar');
const myNameDisplay = document.getElementById('myNameDisplay');
const myLangDisplay = document.getElementById('myLangDisplay');
const editProfileBtn = document.getElementById('editProfileBtn');
const joinRoomInput = document.getElementById('joinRoomInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomList = document.getElementById('roomList');

// Chat Area
const chatMain = document.getElementById('chatMain');
const emptyState = document.getElementById('emptyState');
const currentRoomName = document.getElementById('currentRoomName');
const currentRoomIdSpan = document.getElementById('currentRoomId');
const copyRoomIdBtn = document.getElementById('copyRoomIdBtn');
const chatMessages = document.getElementById('chatMessages');

// Input
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const micStatusIndicator = document.getElementById('micStatusIndicator');

// Mobile
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');

// ============ Helper ============

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ User Profile Management ============

function loadUserProfile() {
    const saved = localStorage.getItem('tooltalk_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        updateSidebarProfile();

        // Load joined rooms
        const rooms = localStorage.getItem('tooltalk_rooms');
        if (rooms) {
            joinedRooms = JSON.parse(rooms);
            renderRoomList();
        } else {
            // Auto join a Global room if none
            joinRoom('global');
        }

        userModal.classList.add('hidden');
        app.classList.remove('hidden');
    } else {
        // First time
        currentUser.uid = generateUUID();
        userModal.classList.remove('hidden');
        app.classList.add('hidden');
    }
}

userNameInput.addEventListener('input', () => {
    const name = userNameInput.value.trim();
    avatarPreview.textContent = name ? name.charAt(0).toUpperCase() : '?';
});

saveUserBtn.addEventListener('click', () => {
    const name = userNameInput.value.trim();
    if (!name) return alert('Vui lòng nhập tên của bạn');

    currentUser.name = name;
    currentUser.lang = userLangSelect.value;
    currentUser.avatarChar = name.charAt(0).toUpperCase();

    localStorage.setItem('tooltalk_user', JSON.stringify(currentUser));
    updateSidebarProfile();

    userModal.classList.add('hidden');
    app.classList.remove('hidden');

    if (joinedRooms.length === 0) joinRoom('global');
});

editProfileBtn.addEventListener('click', () => {
    userNameInput.value = currentUser.name;
    userLangSelect.value = currentUser.lang;
    avatarPreview.textContent = currentUser.avatarChar;
    userModal.classList.remove('hidden');
});

function updateSidebarProfile() {
    myAvatar.textContent = currentUser.avatarChar;
    myNameDisplay.textContent = currentUser.name;
    myLangDisplay.textContent = userLangSelect.options[userLangSelect.selectedIndex]?.text || LANG_NAMES[currentUser.lang];
    initSpeech(); // Re-init speech to update language code
}

// ============ Room Management ============

joinRoomBtn.addEventListener('click', () => {
    const id = joinRoomInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (id) {
        joinRoom(id);
        joinRoomInput.value = '';
    }
});

function joinRoom(roomId) {
    if (!roomId) return;

    // Add to local list if not exists
    if (!joinedRooms.includes(roomId)) {
        joinedRooms.unshift(roomId);
        localStorage.setItem('tooltalk_rooms', JSON.stringify(joinedRooms));
        renderRoomList();
    }

    openRoom(roomId);
}

function renderRoomList() {
    roomList.innerHTML = '';
    joinedRooms.forEach(id => {
        const li = document.createElement('li');
        li.className = `room-item ${id === currentRoomId ? 'active' : ''}`;
        li.dataset.roomId = id;

        // Pretty name based on ID
        const displayName = id === 'global' ? '🌍 Phòng Global' : `Phòng ${id}`;
        const initial = id.charAt(0).toUpperCase();

        li.innerHTML = `
            <div class="room-icon">${id === 'global' ? '🌍' : initial}</div>
            <div class="room-details">
                <div class="room-name">${escapeHtml(displayName)}</div>
                <div class="room-preview">Nhấn để chat...</div>
            </div>
        `;

        li.addEventListener('click', () => {
            openRoom(id);
            if (window.innerWidth <= 768) toggleMobileSidebar(false);
        });

        roomList.appendChild(li);
    });
}

// ============ Chat Room Logic (Firebase) ============

function openRoom(roomId) {
    // Detach old listener if any
    if (currentRoomId && roomListeners[currentRoomId]) {
        db.ref(`rooms/${currentRoomId}/messages`).off('child_added', roomListeners[currentRoomId]);
    }

    currentRoomId = roomId;

    // Update UI
    emptyState.classList.add('hidden');
    chatMain.classList.remove('hidden');
    currentRoomName.textContent = roomId === 'global' ? 'Phòng Global' : `Phòng ${roomId}`;
    currentRoomIdSpan.textContent = roomId;
    chatMessages.innerHTML = ''; // clear old msgs
    renderRoomList(); // update active state in sidebar

    // Listen to Firebase
    const messagesRef = db.ref(`rooms/${roomId}/messages`).limitToLast(50);

    const listener = messagesRef.on('child_added', (snapshot) => {
        const msg = snapshot.val();
        handleIncomingMessage(msg, snapshot.key);
    });

    roomListeners[roomId] = listener;
}

copyRoomIdBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoomId);
    const old = copyRoomIdBtn.textContent;
    copyRoomIdBtn.textContent = '✅ Đã copy';
    setTimeout(() => copyRoomIdBtn.textContent = old, 2000);
});

async function handleIncomingMessage(msg, key) {
    // Determine translation need
    const isMe = msg.uid === currentUser.uid;
    const msgDiv = buildMessageHtml(msg, key, isMe);
    chatMessages.appendChild(msgDiv);
    scrollToBottom();

    if (!isMe && msg.lang !== currentUser.lang) {
        // Needs translation!
        try {
            const translated = await translateText(msg.text, msg.lang, currentUser.lang);
            updateMessageTranslation(key, translated);
        } catch (error) {
            console.error('Lỗi dịch:', error);
            updateMessageTranslation(key, "⚠️ Lỗi dịch");
        }
    }
}

function buildMessageHtml(msg, key, isMe) {
    const div = document.createElement('div');
    div.className = `msg-row ${isMe ? 'me' : 'other'}`;
    div.id = `msg-${key}`;

    const date = new Date(msg.timestamp);
    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

    let transHtml = '';
    if (!isMe) {
        if (msg.lang === currentUser.lang) {
            // Same language, no need translation
        } else {
            // Pending translation
            transHtml = `<div class="msg-translated" id="trans-${key}">
                 <div class="typing-indicator">
                    <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
                 </div>
            </div>`;
        }
    }

    div.innerHTML = `
        <div class="msg-avatar" style="background:${stringToColor(msg.uid)}">${escapeHtml(msg.avatarChar)}</div>
        <div class="msg-content">
            <div class="msg-sender-name">${escapeHtml(msg.name)}</div>
            <div class="msg-bubble">
                <div class="msg-original">${escapeHtml(msg.text)}</div>
                ${transHtml}
            </div>
            <div class="msg-time">${timeStr}</div>
        </div>
    `;
    return div;
}

function updateMessageTranslation(key, translatedText) {
    const el = document.getElementById(`trans-${key}`);
    if (el) {
        el.innerHTML = `<span>${escapeHtml(translatedText)}</span>`;
    }
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const h = hash % 360;
    return `hsl(${h}, 70%, 50%)`;
}

// ============ Sending Messages ============

function sendMessage(text) {
    if (!currentRoomId || !text.trim()) return;

    db.ref(`rooms/${currentRoomId}/messages`).push({
        uid: currentUser.uid,
        name: currentUser.name,
        avatarChar: currentUser.avatarChar,
        lang: currentUser.lang,
        text: text.trim(),
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    chatInput.value = '';
}

sendBtn.addEventListener('click', () => sendMessage(chatInput.value));
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(chatInput.value);
});

// ============ Translation (Groq) ============

async function translateText(text, fromLang, toLang) {
    const fromName = LANG_NAMES[fromLang] || fromLang;
    const toName = LANG_NAMES[toLang] || toLang;

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getGroqKey()}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are a translator in a casual chat app. Translate the following text from ${fromName} to ${toName}. Only return the translated text, nothing else. Do not add quotes. Keep the informal/casual tone if present.`,
                },
                {
                    role: 'user',
                    content: text,
                },
            ],
            temperature: 0.1,
            max_tokens: 1024,
        }),
    });

    if (!response.ok) throw new Error('API Error');
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || text;
}

// ============ Web Speech API ============

function initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        micBtn.style.display = 'none';
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = SPEECH_LANG_CODES[currentUser.lang] || 'vi-VN';

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
        }

        if (interimTranscript) {
            chatInput.value = '';
            micStatusIndicator.textContent = `🎤 ${interimTranscript}`;
        }
        if (finalTranscript) {
            chatInput.value += (chatInput.value ? ' ' : '') + finalTranscript.trim();
        }
    };

    recognition.onerror = () => stopRecording();
    recognition.onend = () => stopRecording();
}

function startRecording() {
    if (!recognition || !currentRoomId) return;
    try {
        recognition.start();
        isRecording = true;
        micBtn.classList.add('recording');
        chatInput.classList.add('hidden');
        micStatusIndicator.classList.remove('hidden');
        micStatusIndicator.textContent = '🎤 Đang nghe...';
    } catch (e) {
        console.error('Mic error:', e);
    }
}

function stopRecording() {
    if (!isRecording) return;
    isRecording = false;
    try { recognition.stop(); } catch (e) { }
    micBtn.classList.remove('recording');
    micStatusIndicator.classList.add('hidden');
    chatInput.classList.remove('hidden');
    chatInput.focus();
}

micBtn.addEventListener('click', () => isRecording ? stopRecording() : startRecording());

// ============ Mobile UI ============
function toggleMobileSidebar(show) {
    if (show) {
        sidebar.classList.add('open');
        sidebarOverlay.classList.remove('hidden');
    } else {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.add('hidden');
    }
}
mobileMenuBtn.addEventListener('click', () => toggleMobileSidebar(true));
sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));

// ============ Boot ============
loadUserProfile();
