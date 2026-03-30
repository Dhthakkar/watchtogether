// popup.js
// Handles all UI interactions in the extension popup

const SERVER_URL = 'http://localhost:3001'; // swap to Render URL in Phase 7

// --- STATE ---
let selectedMode = 'together';

// --- DOM REFS ---
const modeBtns = document.querySelectorAll('.mode-btn');
const displayNameInput = document.getElementById('displayName');
const roomIdInput = document.getElementById('roomIdInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const statusEl = document.getElementById('status');
const inviteBox = document.getElementById('inviteBox');
const inviteCode = document.getElementById('inviteCode');

// --- MODE SELECTION ---
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedMode = btn.dataset.mode;
  });
});

// --- HELPERS ---
function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status ' + type;
}

function getDisplayName() {
  return displayNameInput.value.trim();
}

// --- CREATE ROOM ---
createBtn.addEventListener('click', async () => {
  const name = getDisplayName();
  if (!name) return setStatus('Enter your name first', 'error');

  setStatus('Creating room...');
  createBtn.disabled = true;

  try {
    // Ask background.js to create room via signaling server
    const response = await chrome.runtime.sendMessage({
      type: 'CREATE_ROOM',
      mode: selectedMode,
      displayName: name
    });

    if (response.error) return setStatus(response.error, 'error');

    // Show invite code to share with friend
    inviteCode.textContent = response.roomId;
    inviteBox.style.display = 'block';
    setStatus('Room created! Share the code.', 'success');

    // Save session to chrome.storage for content script to pick up
    await chrome.storage.local.set({
      session: {
        roomId: response.roomId,
        roomSecret: response.roomSecret,
        displayName: name,
        mode: selectedMode,
        isHost: true
      }
    });

  } catch (err) {
    setStatus('Failed to create room', 'error');
  } finally {
    createBtn.disabled = false;
  }
});

// --- JOIN ROOM ---
joinBtn.addEventListener('click', async () => {
  const name = getDisplayName();
  const roomId = roomIdInput.value.trim().toLowerCase();

  if (!name) return setStatus('Enter your name first', 'error');
  if (!roomId) return setStatus('Enter a room code', 'error');

  setStatus('Joining room...');
  joinBtn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'JOIN_ROOM',
      roomId,
      displayName: name
    });

    if (response.error) return setStatus(response.error, 'error');

    setStatus('Joined! Start watching.', 'success');

    // Save session for content script
    await chrome.storage.local.set({
      session: {
        roomId: response.roomId,
        roomSecret: response.roomSecret,
        displayName: name,
        mode: response.mode,
        isHost: false
      }
    });

  } catch (err) {
    setStatus('Failed to join room', 'error');
  } finally {
    joinBtn.disabled = false;
  }
});
