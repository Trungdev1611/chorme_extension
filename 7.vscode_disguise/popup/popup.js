const $ = (id) => document.getElementById(id);
const msgEl = $('msg');
const darkEl = $('dark');
const themeEl = $('theme');
const hideEl = $('hide-sidebar');

async function getConfig() {
  const { config } = await chrome.storage.sync.get('config');
  return Object.assign({ defaultLevel: 2, dark: true, theme: 'dracula' }, config || {});
}

async function saveConfig(partial) {
  const { config } = await chrome.storage.sync.get('config');
  await chrome.storage.sync.set({ config: Object.assign({}, config || {}, partial) });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Talk to the page; if the content script isn't there yet (tab opened before install), inject it once.
async function send(tabId, msg) {
  try {
    return await chrome.tabs.sendMessage(tabId, msg);
  } catch (e) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
    return await chrome.tabs.sendMessage(tabId, msg);
  }
}

function showLevel(level) {
  for (const n of [0, 1, 2, 3]) $('lv' + n).classList.toggle('on', n === level);
}

async function refresh() {
  const cfg = await getConfig();
  darkEl.checked = !!cfg.dark;
  themeEl.value = cfg.theme || 'dracula';
  hideEl.checked = !!cfg.hideSidebar;
  const tab = await activeTab();
  if (!tab) return;
  try {
    const st = await send(tab.id, { type: 'STATUS' });
    showLevel(st && st.active ? st.level : 0);
    if (st && st.active && st.dark !== null) darkEl.checked = st.dark;
    if (st && st.active && st.theme) themeEl.value = st.theme;
  } catch (e) {
    msgEl.textContent = 'Trang này không cho extension chạy (chrome://, Web Store...).';
    for (const b of document.querySelectorAll('.levels button')) b.disabled = true;
    darkEl.disabled = true;
  }
}

async function choose(level) {
  msgEl.textContent = '';
  const tab = await activeTab();
  if (!tab) return;
  try {
    if (level === 0) {
      await send(tab.id, { type: 'OFF' });
      chrome.runtime.sendMessage({ type: 'FULLSCREEN', windowId: tab.windowId, on: false });
    } else {
      // remember the choice so the hotkey reuses it
      await saveConfig({ defaultLevel: level, dark: darkEl.checked, theme: themeEl.value, hideSidebar: hideEl.checked });
      await send(tab.id, { type: 'APPLY', level, dark: darkEl.checked, theme: themeEl.value, hideSidebar: hideEl.checked });
      chrome.runtime.sendMessage({ type: 'FULLSCREEN', windowId: tab.windowId, on: true });
    }
    showLevel(level);
  } catch (e) {
    msgEl.textContent = 'Không áp dụng được trên trang này.';
  }
}

for (const btn of document.querySelectorAll('.levels button')) {
  btn.addEventListener('click', () => choose(Number(btn.dataset.level)));
}

darkEl.addEventListener('change', async () => {
  await saveConfig({ dark: darkEl.checked });
  // re-apply with the new setting if a level is active
  const active = [1, 2, 3].find((n) => $('lv' + n).classList.contains('on'));
  if (active) choose(active);
});

hideEl.addEventListener('change', async () => {
  await saveConfig({ hideSidebar: hideEl.checked });
  const active = [1, 2, 3].find((n) => $('lv' + n).classList.contains('on'));
  if (active) choose(active);
});

themeEl.addEventListener('change', async () => {
  await saveConfig({ theme: themeEl.value });
  const active = [1, 2, 3].find((n) => $('lv' + n).classList.contains('on'));
  if (active) choose(active);
});

$('vscode-btn').addEventListener('click', async () => {
  const tab = await activeTab();
  if (tab) chrome.runtime.sendMessage({ type: 'SWITCH_VSCODE', windowId: tab.windowId });
  window.close();
});

$('options-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
