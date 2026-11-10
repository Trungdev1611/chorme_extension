// Toggle the disguise on the active tab (hotkey or toolbar button), optionally entering fullscreen.

const PREV_KEY = 'prevWindowState';

async function getConfig() {
  const { config } = await chrome.storage.sync.get('config');
  return config || {};
}

async function setFullscreen(windowId, on) {
  const store = (await chrome.storage.session.get(PREV_KEY))[PREV_KEY] || {};
  if (on) {
    const win = await chrome.windows.get(windowId);
    if (win.state !== 'fullscreen') {
      store[windowId] = win.state;
      await chrome.storage.session.set({ [PREV_KEY]: store });
      await chrome.windows.update(windowId, { state: 'fullscreen' });
    }
  } else if (store[windowId]) {
    const prev = store[windowId];
    delete store[windowId];
    await chrome.storage.session.set({ [PREV_KEY]: store });
    await chrome.windows.update(windowId, { state: prev });
  }
}

function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}

async function sendToggle(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE' });
  } catch (e) {
    // Tab was opened before the extension loaded: inject the content script, then retry once.
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
    return await chrome.tabs.sendMessage(tabId, { type: 'TOGGLE' });
  }
}

async function toggle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return;

  let res;
  try {
    res = await sendToggle(tab.id);
  } catch (e) {
    // chrome://, Web Store, or another page where extensions are not allowed to run
    flashBadge('X', '#c62828');
    return;
  }
  if (!res) {
    flashBadge('X', '#c62828');
    return;
  }
  flashBadge(res.active ? 'ON' : 'OFF', res.active ? '#2e7d32' : '#666');

  const cfg = await getConfig();
  if (cfg.fullscreen) {
    try {
      await setFullscreen(tab.windowId, res.active);
    } catch (e) {
      /* ignore */
    }
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-disguise') toggle();
});

// Popup asks for fullscreen on/off (only if the user enabled it in options).
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'FULLSCREEN') return;
  getConfig().then((cfg) => {
    if (cfg.fullscreen) setFullscreen(msg.windowId, msg.on).catch(() => {});
  });
});

// Quick way back to the real VS Code: minimise this Chrome window (VS Code is usually right behind it).
// Optionally also fire vscode:// so the OS raises VS Code (Chrome may ask to confirm the first time).
async function switchToVSCode(windowId) {
  const cfg = await getConfig();
  if (cfg.openVscode !== false) {
    try {
      // Ask the OS to open/raise VS Code. The tab is only a carrier for the vscode:// link and is closed afterwards.
      const tab = await chrome.tabs.create({ url: cfg.vscodeUrl || 'vscode://', active: true });
      setTimeout(() => chrome.tabs.remove(tab.id).catch(() => {}), 5000);
      await new Promise((r) => setTimeout(r, 700)); // give the OS a moment to raise VS Code
    } catch (e) {
      /* fall through to minimising Chrome */
    }
  }
  try {
    const win = await chrome.windows.get(windowId);
    // a fullscreen window can't go straight to minimized
    if (win.state === 'fullscreen') await chrome.windows.update(windowId, { state: 'normal' });
    await chrome.windows.update(windowId, { state: 'minimized' });
  } catch (e) {
    flashBadge('X', '#c62828');
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'go-vscode') return;
  const win = await chrome.windows.getLastFocused();
  switchToVSCode(win.id);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'SWITCH_VSCODE') switchToVSCode(msg.windowId);
});
