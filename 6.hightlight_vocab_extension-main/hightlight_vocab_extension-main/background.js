importScripts('lib/config.js', 'lib/storage.js', 'lib/gist-sync.js');

const MENU_ID = 'add-to-extension-vocab';

const ALARM_PUSH = 'vocab-push';
const ALARM_PERIODIC = 'vocab-periodic';

function runSync() {
  return GistSync.sync().catch(() => {
    /* error is recorded in syncStatus and shown in options */
  });
}

function setupAlarms() {
  chrome.alarms.create(ALARM_PERIODIC, { delayInMinutes: 1, periodInMinutes: 15 });
}

async function boot() {
  try {
    await VocabStorage.migrateFromSync();
  } catch (e) {
    /* retried on next start */
  }
  setupAlarms();
  runSync();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Thêm vào Extension Vocab',
    contexts: ['selection']
  });
  boot();
});

chrome.runtime.onStartup.addListener(boot);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_PUSH || alarm.name === ALARM_PERIODIC) runSync();
});

// Debounced push: any vocab change restarts a 30s timer, so a burst of saves = one request.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && VocabStorage.isVocabChange(changes)) {
    chrome.alarms.create(ALARM_PUSH, { delayInMinutes: 0.5 });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.selectionText) return;

  const word = info.selectionText.trim();
  if (!word) return;

  let meaning = '';
  if (tab && tab.id !== undefined) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'PROMPT_MEANING',
        word
      });
      if (!response || response.meaning === null) return; // user cancelled
      meaning = response.meaning;
    } catch (e) {
      // content script not available on this page (e.g. chrome:// or webstore); fall back silently
    }
  }

  try {
    await VocabStorage.saveVocab({
      word,
      meaning,
      sourceUrl: tab && tab.url ? tab.url : '',
      createdAt: Date.now()
    });
    notify('Đã lưu từ vựng', `"${word}" đã được thêm vào Extension Vocab.`);
    const usage = await VocabStorage.getUsage();
    if (usage.warn) {
      notify(
        'Sắp đầy bộ nhớ',
        `Đã dùng ${Math.round(usage.ratio * 100)}% dung lượng. Hãy xuất JSON để sao lưu (popup > Xuất JSON).`
      );
    }
  } catch (err) {
    if (isQuotaError(err)) {
      notify(
        'Hết dung lượng đồng bộ',
        'Không thể lưu thêm từ mới. Hãy xuất JSON để sao lưu rồi xoá bớt từ.'
      );
    } else {
      notify('Lỗi lưu từ vựng', String((err && err.message) || err));
    }
  }
});

function isQuotaError(err) {
  const msg = String((err && err.message) || err || '');
  return /QUOTA_BYTES|MAX_ITEMS|quota/i.test(msg);
}

function notify(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message
  });
}
