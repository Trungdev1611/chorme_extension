const colorEl = document.getElementById('highlight-color');
const domainsEl = document.getElementById('disabled-domains');
const saveBtn = document.getElementById('save-btn');
const statusEl = document.getElementById('save-status');

const tokenEl = document.getElementById('gist-token');
const gistIdEl = document.getElementById('gist-id');
const createBtn = document.getElementById('create-gist-btn');
const syncBtn = document.getElementById('sync-btn');
const syncStatusEl = document.getElementById('sync-status');
const usageEl = document.getElementById('usage');

function showStatus(text, cls) {
  syncStatusEl.textContent = text;
  syncStatusEl.className = 'status' + (cls ? ' ' + cls : '');
}

async function refreshInfo() {
  const st = await VocabStorage.getSyncStatus();
  if (st) {
    const when = new Date(st.at).toLocaleString();
    if (st.ok) showStatus(`Đồng bộ lần cuối ${when} (nhận ${st.pulled}, ${st.pushed ? 'đã đẩy lên' : 'không có gì mới để đẩy'}).`);
    else showStatus(`Lỗi đồng bộ lúc ${when}: ${st.error}`, 'err');
  }
  const u = await VocabStorage.getUsage();
  const kb = (u.bytes / 1024).toFixed(1);
  usageEl.textContent = `Bộ nhớ từ vựng: ${kb} KB / ${(u.quota / 1048576).toFixed(0)} MB (${(u.ratio * 100).toFixed(1)}%)` +
    (u.warn ? ' - sắp đầy, hãy xuất JSON sao lưu!' : '');
  usageEl.className = 'status' + (u.warn ? ' warn' : '');
}

async function load() {
  const gist = await VocabStorage.getGistConfig();
  tokenEl.value = gist.token;
  gistIdEl.value = gist.gistId;
  await refreshInfo();
  const settings = await VocabStorage.getSettings();
  colorEl.value = settings.highlightColor;
  domainsEl.value = (settings.disabledDomains || []).join('\n');
}

saveBtn.addEventListener('click', async () => {
  const disabledDomains = domainsEl.value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  await VocabStorage.saveSettings({
    highlightColor: colorEl.value,
    disabledDomains
  });

  statusEl.textContent = 'Đã lưu.';
  setTimeout(() => (statusEl.textContent = ''), 2000);
});

load();

createBtn.addEventListener('click', async () => {
  const token = tokenEl.value.trim();
  if (!token) return showStatus('Hãy dán token trước.', 'err');
  if (gistIdEl.value.trim() && !confirm('Đã có Gist ID. Vẫn tạo Gist mới và thay thế?')) return;
  showStatus('Đang tạo Gist...');
  try {
    gistIdEl.value = await GistSync.createGist(token);
    showStatus('Đã tạo Gist. Bấm "Lưu & đồng bộ" để đẩy từ vựng lên.');
  } catch (e) {
    showStatus(e.message, 'err');
  }
});

syncBtn.addEventListener('click', async () => {
  await VocabStorage.saveGistConfig({ gistId: gistIdEl.value, token: tokenEl.value });
  showStatus('Đang đồng bộ...');
  try {
    const r = await GistSync.sync();
    if (r.skipped) return showStatus('Cần nhập cả Token và Gist ID.', 'err');
  } catch (e) {
    /* shown via status below */
  }
  await refreshInfo();
});

document.getElementById('cleanup-btn').addEventListener('click', async () => {
  if (!confirm('Xoá các từ cũ khỏi Chrome Sync (chỉ xoá từ đã có an toàn ở local + Gist). Không thể hoàn tác. Tiếp tục?')) return;
  try {
    const r = await VocabStorage.cleanupOldSyncWords();
    showStatus(`Đã xoá ${r.removed} từ cũ khỏi Chrome Sync, giữ lại ${r.kept} từ chưa khớp.`);
  } catch (e) {
    showStatus(e.message, 'err');
  }
});
