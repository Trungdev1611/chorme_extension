const DEFAULTS = {
  defaultLevel: 2,
  autoApply: true,
  fullscreen: false,
  dark: true,
  theme: 'dracula',
  hideSidebar: false,
  openVscode: true,
  vscodeUrl: 'vscode://',
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
  $('hide-sidebar').checked = cfg.hideSidebar;
  $('open-vscode').checked = cfg.openVscode;
  $('vscode-url').value = cfg.vscodeUrl;
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
    hideSidebar: $('hide-sidebar').checked,
    openVscode: $('open-vscode').checked,
    vscodeUrl: $('vscode-url').value.trim() || 'vscode://',
    project: $('project').value.trim() || DEFAULTS.project,
    fileName: $('file-name').value.trim()
  };
  await chrome.storage.sync.set({ config });
  $('save-status').textContent = 'Đã lưu. Tải lại tab để áp dụng.';
  setTimeout(() => ($('save-status').textContent = ''), 3000);
});

load();

async function refreshRemembered() {
  const { siteState } = await chrome.storage.sync.get('siteState');
  $('remembered-count').textContent = String(Object.keys(siteState || {}).length);
}

$('forget-btn').addEventListener('click', async () => {
  if (!confirm('Quên tất cả trang đã nhớ? Các trang sẽ không tự bật giao diện nữa (quy tắc trong ô quy tắc vẫn giữ).')) return;
  await chrome.storage.sync.remove('siteState');
  refreshRemembered();
});

refreshRemembered();
