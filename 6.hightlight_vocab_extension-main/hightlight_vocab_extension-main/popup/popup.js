const listEl = document.getElementById('vocab-list');
const emptyState = document.getElementById('empty-state');
const searchEl = document.getElementById('search');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const optionsLink = document.getElementById('options-link');
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');
const quotaEl = document.getElementById('quota-warning');
const countEl = document.getElementById('count');

let vocabEntries = [];

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function render(filter = '') {
  const q = filter.trim().toLowerCase();
  const filtered = vocabEntries.filter(
    (e) => !q || e.word.toLowerCase().includes(q) || (e.meaning || '').toLowerCase().includes(q)
  );

  listEl.innerHTML = '';
  emptyState.hidden = vocabEntries.length > 0;
  countEl.textContent = q
    ? `(${filtered.length}/${vocabEntries.length} từ)`
    : `(${vocabEntries.length} từ)`;

  for (const entry of filtered) {
    const li = document.createElement('li');
    li.className = 'vocab-item';

    const info = document.createElement('div');
    info.className = 'vocab-info';

    const wordEl = document.createElement('strong');
    wordEl.textContent = entry.word;

    const meaningEl = document.createElement('div');
    meaningEl.className = 'meaning';
    meaningEl.textContent = entry.meaning || '(chưa có nghĩa)';

    const dateEl = document.createElement('span');
    dateEl.className = 'date';
    dateEl.textContent = formatDate(entry.createdAt);

    const wordRow = document.createElement('div');
    wordRow.className = 'word-row';
    wordRow.appendChild(wordEl);
    wordRow.appendChild(dateEl);

    info.appendChild(wordRow);
    info.appendChild(meaningEl);

    const delBtn = document.createElement('button');
    delBtn.textContent = 'Xoá';
    delBtn.className = 'delete-btn';
    delBtn.addEventListener('click', async () => {
      await VocabStorage.deleteVocab(entry.word);
      await loadAndRender();
    });

    li.appendChild(info);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  }
}

async function loadAndRender() {
  const map = await VocabStorage.getAllVocab();
  vocabEntries = Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
  render(searchEl.value);

  const usage = await VocabStorage.getUsage();
  quotaEl.hidden = !usage.warn;
  if (usage.warn) {
    quotaEl.textContent = `Đã dùng ${Math.round(usage.ratio * 100)}% bộ nhớ. Hãy bấm "Xuất JSON" để sao lưu.`;
  }
}

searchEl.addEventListener('input', () => render(searchEl.value));

exportBtn.addEventListener('click', async () => {
  const map = await VocabStorage.getAllVocab();
  const blob = new Blob([JSON.stringify(Object.values(map), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'extension-vocab.json';
  a.click();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : Object.values(data.words || {});
    const n = await VocabStorage.importList(list);
    alert(`Đã nhập ${n} từ.`);
    await loadAndRender();
  } catch (e) {
    alert('File JSON không hợp lệ: ' + e.message);
  }
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Xoá toàn bộ từ vựng đã lưu? Hành động này không thể hoàn tác.')) return;
  await VocabStorage.clearAllVocab();
  await loadAndRender();
});

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && VocabStorage.isVocabChange(changes)) loadAndRender();
});

loadAndRender();
