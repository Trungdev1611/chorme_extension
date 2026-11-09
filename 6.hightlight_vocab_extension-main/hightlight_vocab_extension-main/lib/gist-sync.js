// Two-way sync between chrome.storage.local vocab and a secret GitHub Gist (file: vocab.json).
// Strategy: pull remote -> merge per word by updatedAt (newest wins, tombstones included) -> push if remote is behind.
// Needs lib/storage.js loaded first. Used by background.js and options page.
(function (global) {
  const FILE = 'vocab.json';
  const API = 'https://api.github.com';

  function authHeaders(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async function api(path, token, opts) {
    const res = await fetch(API + path, Object.assign({}, opts, { headers: authHeaders(token) }));
    if (!res.ok) {
      let msg = '';
      try {
        msg = (await res.json()).message;
      } catch (e) {
        /* ignore */
      }
      if (res.status === 401) msg = 'Token sai hoặc hết hạn';
      if (res.status === 404) msg = 'Không tìm thấy Gist (sai Gist ID hoặc token thiếu quyền gist)';
      throw new Error(`GitHub ${res.status}: ${msg || res.statusText}`);
    }
    return res.json();
  }

  async function fetchRemote(cfg) {
    const gist = await api(`/gists/${cfg.gistId}`, cfg.token);
    const file = gist.files && gist.files[FILE];
    if (!file) return {};
    let text = file.content;
    if (file.truncated) text = await (await fetch(file.raw_url)).text();
    const data = JSON.parse(text || '{}');
    return data.words || {};
  }

  async function pushRemote(cfg, words) {
    const content = JSON.stringify({ version: 1, words });
    await api(`/gists/${cfg.gistId}`, cfg.token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { [FILE]: { content } } })
    });
  }

  async function createGist(token) {
    const body = {
      description: 'Highlight Vocab data',
      public: false,
      files: { [FILE]: { content: JSON.stringify({ version: 1, words: {} }) } }
    };
    const res = await fetch(API + '/gists', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(token)),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}: không tạo được Gist (token cần quyền gist)`);
    return (await res.json()).id;
  }

  function merge(local, remote) {
    const stamp = VocabStorage.stamp;
    const merged = {};
    const toLocal = {};
    let remoteBehind = false;
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const l = local[k];
      const r = remote[k];
      if (!l) {
        merged[k] = r;
        toLocal[k] = r;
      } else if (!r) {
        merged[k] = l;
        remoteBehind = true;
      } else if (stamp(r) > stamp(l)) {
        merged[k] = r;
        toLocal[k] = r;
      } else if (stamp(l) > stamp(r)) {
        merged[k] = l;
        remoteBehind = true;
      } else {
        merged[k] = l;
      }
    }
    return { merged, toLocal, remoteBehind };
  }

  let running = null;

  function sync() {
    if (running) return running;
    running = (async () => {
      const cfg = await VocabStorage.getGistConfig();
      if (!cfg.gistId || !cfg.token) return { skipped: true };
      try {
        const remote = await fetchRemote(cfg);
        const local = await VocabStorage.getAllRecords();
        const { merged, toLocal, remoteBehind } = merge(local, remote);
        const pulled = Object.keys(toLocal).length;
        if (pulled) await VocabStorage.putRecords(toLocal);
        if (remoteBehind) await pushRemote(cfg, merged);
        const result = { skipped: false, pulled, pushed: remoteBehind };
        await VocabStorage.setSyncStatus({ at: Date.now(), ok: true, pulled, pushed: remoteBehind });
        return result;
      } catch (err) {
        await VocabStorage.setSyncStatus({ at: Date.now(), ok: false, error: String((err && err.message) || err) });
        throw err;
      }
    })().finally(() => {
      running = null;
    });
    return running;
  }

  global.GistSync = { sync, createGist };
})(typeof self !== 'undefined' ? self : this);
