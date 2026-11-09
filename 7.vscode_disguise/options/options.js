const DEFAULTS = {
  defaultLevel: 2,
  autoApply: true,
  fullscreen: false,
  dark: true,
  theme: 'dracula',
  project: 'my-project',
  fileName: '',
  rules: ''
};

const $ = (id) => document.getElementById(id);

async function load() {
  const { config } = await chrome.storage.sync.get('config');
  const cfg = Object.assign({}, DEFAULTS, config || {});
  $('default-level').value = String(cfg.defaultLevel);
  $('rules').value = cfg.rules;
  $('auto-apply').checked = cfg.autoApply;
  $('fullscreen').checked = cfg.fullscreen;
  $('dark').checked = cfg.dark;
  $('theme').value = cfg.theme;
  $('project').value = cfg.project;
  $('file-name').value = cfg.fileName;
}

$('save-btn').addEventListener('click', async () => {
  const config = {
    defaultLevel: Number($('default-level').value),
    rules: $('rules').value,
    autoApply: $('auto-apply').checked,
    fullscreen: $('fullscreen').checked,
    dark: $('dark').checked,
    theme: $('theme').value,
    project: $('project').value.trim() || DEFAULTS.project,
    fileName: $('file-name').value.trim()
  };
  await chrome.storage.sync.set({ config });
  $('save-status').textContent = 'Đã lưu. Tải lại tab để áp dụng.';
  setTimeout(() => ($('save-status').textContent = ''), 3000);
});

load();
