// Shared storage wrapper.
//  - Vocab lives in chrome.storage.local (10 MB) as one item per word: "word:<lowercase>".
//  - Deleting a word writes a tombstone ({deleted:true, updatedAt}) so deletions can sync across devices.
//  - Settings + Gist config live in chrome.storage.sync (tiny, follows the Google account).
// Used by background, content script, popup, and options pages (classic script, not a module).
(function (global) {
  const VOCAB_PREFIX = 'word:';
  const SETTINGS_KEY = 'settings';
  const GIST_KEY = 'gistConfig';
  const SYNC_STATUS_KEY = 'syncStatus';
  const MIGRATED_KEY = 'migratedFromSync';
  const WARN_RATIO = 0.8;

  const DEFAULT_SETTINGS = {
    highlightColor: '#ffe066',
    disabledDomains: []
  };

  function area(name) {
    const a = chrome.storage[name];
    return {
      get: (keys) =>
        new Promise((resolve, reject) =>
          a.get(keys, (r) => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(r)))
        ),
      set: (items) =>
        new Promise((resolve, reject) =>
          a.set(items, () => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()))
        ),
      remove: (keys) =>
        new Promise((resolve, reject) =>
          a.remove(keys, () => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve()))
        ),
      bytesInUse: () =>
        new Promise((resolve, reject) =>
          a.getBytesInUse(null, (n) => (chrome.runtime.lastError ? reject(chrome.runtime.lastError) : resolve(n)))
        )
    };
  }

  const local = area('local');
  const sync = area('sync');

  function toKey(word) {
    return VOCAB_PREFIX + word.trim().toLowerCase();
  }

  function stamp(record) {
    return (record && (record.updatedAt || record.createdAt)) || 0;
  }

  // Every record including tombstones, keyed by lowercase word.
  async function getAllRecords() {
    const all = await local.get(null);
    const result = {};
    for (const key of Object.keys(all)) {
      if (key.startsWith(VOCAB_PREFIX)) result[key.slice(VOCAB_PREFIX.length)] = all[key];
    }
    return result;
  }

  // Live (non-deleted) vocab only.
  async function getAllVocab() {
    const records = await getAllRecords();
    const result = {};
    for (const k of Object.keys(records)) {
      if (!records[k].deleted) result[k] = records[k];
    }
    return result;
  }

  async function saveVocab(record) {
    const key = toKey(record.word);
    const existing = (await local.get(key))[key];
    const now = Date.now();
    const payload = {
      word: record.word.trim(),
      meaning: record.meaning || '',
      note: record.note || '',
      sourceUrl: record.sourceUrl || '',
      createdAt: record.createdAt || (existing && existing.createdAt) || now,
      updatedAt: now
    };
    await local.set({ [key]: payload });
    return payload;
  }

  async function deleteVocab(word) {
    await local.set({ [toKey(word)]: { word: word.trim(), deleted: true, updatedAt: Date.now() } });
  }

  async function clearAllVocab() {
    const live = await getAllVocab();
    const now = Date.now();
    const items = {};
    for (const k of Object.keys(live)) {
      items[VOCAB_PREFIX + k] = { word: live[k].word, deleted: true, updatedAt: now };
    }
    if (Object.keys(items).length) await local.set(items);
  }

  // Write already-formed records (used by sync / import). map: lowercaseWord -> record.
  async function putRecords(map) {
    const items = {};
    for (const k of Object.keys(map)) items[VOCAB_PREFIX + k] = map[k];
    if (Object.keys(items).length) await local.set(items);
  }

  // Import a list of {word, meaning, ...}; keeps whichever copy is newer. Returns number written.
  async function importList(list) {
    const current = await getAllRecords();
    const toWrite = {};
    for (const r of list) {
      if (!r || typeof r.word !== 'string' || !r.word.trim()) continue;
      const k = r.word.trim().toLowerCase();
      const incoming = {
        word: r.word.trim(),
        meaning: r.meaning || '',
        note: r.note || '',
        sourceUrl: r.sourceUrl || '',
        createdAt: r.createdAt || Date.now(),
        updatedAt: r.updatedAt || r.createdAt || Date.now()
      };
      if (!current[k] || stamp(incoming) > stamp(current[k])) toWrite[k] = incoming;
    }
    await putRecords(toWrite);
    return Object.keys(toWrite).length;
  }

  async function getUsage() {
    const bytes = await local.bytesInUse();
    const quota = chrome.storage.local.QUOTA_BYTES || 10485760;
    const ratio = bytes / quota;
    return { bytes, quota, ratio, warn: ratio >= WARN_RATIO };
  }

  // One-time copy of vocab from the old chrome.storage.sync location into local.
  async function migrateFromSync() {
    const flag = (await local.get(MIGRATED_KEY))[MIGRATED_KEY];
    if (flag) return 0;
    const all = await sync.get(null);
    const old = {};
    for (const key of Object.keys(all)) {
      if (key.startsWith(VOCAB_PREFIX) && all[key] && all[key].word) {
        old[key.slice(VOCAB_PREFIX.length)] = all[key];
      }
    }
    const current = await getAllRecords();
    const toWrite = {};
    for (const k of Object.keys(old)) {
      if (!current[k] || stamp(old[k]) > stamp(current[k])) toWrite[k] = old[k];
    }
    await putRecords(toWrite);
    await local.set({ [MIGRATED_KEY]: true });
    return Object.keys(toWrite).length;
  }

  // Remove old word:* items from chrome.storage.sync, but only ones already safe in local.
  // Preconditions: migration done and last Gist sync succeeded. Words not matching local are kept.
  async function cleanupOldSyncWords() {
    const flag = (await local.get(MIGRATED_KEY))[MIGRATED_KEY];
    if (!flag) throw new Error('Migration chưa chạy xong, chưa thể dọn.');
    const st = await getSyncStatus();
    if (!st || !st.ok) throw new Error('Lần đồng bộ Gist gần nhất chưa thành công, chưa thể dọn.');
    const old = await sync.get(null);
    const current = await getAllRecords();
    const removable = [];
    let kept = 0;
    for (const key of Object.keys(old)) {
      if (!key.startsWith(VOCAB_PREFIX)) continue;
      const cur = current[key.slice(VOCAB_PREFIX.length)];
      if (cur && stamp(cur) >= stamp(old[key])) removable.push(key);
      else kept++;
    }
    if (removable.length) await sync.remove(removable);
    return { removed: removable.length, kept };
  }

  async function getSettings() {
    const stored = await sync.get(SETTINGS_KEY);
    return Object.assign({}, DEFAULT_SETTINGS, stored[SETTINGS_KEY] || {});
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    const merged = Object.assign({}, current, partial);
    await sync.set({ [SETTINGS_KEY]: merged });
    return merged;
  }

  async function getGistConfig() {
    const stored = await sync.get(GIST_KEY);
    const saved = stored[GIST_KEY] || {};
    const def = global.VOCAB_DEFAULT_GIST || {};
    return {
      gistId: saved.gistId || def.gistId || '',
      token: saved.token || def.token || ''
    };
  }

  async function saveGistConfig(cfg) {
    const clean = { gistId: (cfg.gistId || '').trim(), token: (cfg.token || '').trim() };
    await sync.set({ [GIST_KEY]: clean });
    return clean;
  }

  async function getSyncStatus() {
    return (await local.get(SYNC_STATUS_KEY))[SYNC_STATUS_KEY] || null;
  }

  async function setSyncStatus(status) {
    await local.set({ [SYNC_STATUS_KEY]: status });
  }

  function isVocabChange(changes) {
    return Object.keys(changes).some((k) => k.startsWith(VOCAB_PREFIX));
  }

  global.VocabStorage = {
    VOCAB_PREFIX,
    getAllVocab,
    getAllRecords,
    saveVocab,
    deleteVocab,
    clearAllVocab,
    putRecords,
    importList,
    getUsage,
    migrateFromSync,
    cleanupOldSyncWords,
    getSettings,
    saveSettings,
    getGistConfig,
    saveGistConfig,
    getSyncStatus,
    setSyncStatus,
    isVocabChange,
    stamp,
    DEFAULT_SETTINGS
  };
})(typeof self !== 'undefined' ? self : this);
