// Three levels, chosen per site in the options page:
//   1 = tab title + favicon only
//   2 = level 1 + editor-style frame around the live page (page stays fully usable)
//   3 = level 2 + page text re-rendered as a code listing (page itself hidden; read-only)
(function () {
  const HOST_ID = 'vsd-host';
  const STYLE_ID = 'vsd-page-style';
  const TITLE_H = 30;
  const TAB_H = 35;
  const ACT_W = 48;
  const SIDE_W = 240;
  const STATUS_H = 22;

  const DEFAULTS = {
    defaultLevel: 2,
    autoApply: true,
    fullscreen: false,
    dark: true,
    theme: 'dracula',
    hideSidebar: false,
    project: 'my-project',
    fileName: '',
    rules: ''
  };

  // Colours for the frame, the flat page theme and the level-3 listing.
  //  dark    = VS Code Dark+
  //  dracula = "Dracula Theme Soft" (dracula-theme.theme-dracula), with the user's own comment colour #87c76a
  const THEMES = {
    dark: {
      title: '#3c3c3c', titleText: '#cccccc', act: '#333333', actIcon: '#858585', actOn: '#ffffff', actBorder: '#ffffff',
      side: '#252526', sideText: '#cccccc', sel: '#37373d', selText: '#ffffff',
      tabs: '#252526', tabActive: '#1e1e1e', tabBorder: '#007acc', tabText: '#ffffff', tabX: '#aaaaaa',
      status: '#007acc', statusText: '#ffffff',
      bg: '#1e1e1e', fg: '#d4d4d4', ln: '#858585', heading: '#6a9955', li: '#ce9178', pre: '#9cdcfe',
      link: '#569cd6', field: '#2d2d2d', fieldBorder: '#454545', border: '#3c3c3c', muted: '#858585', badge: '#007acc', badgeText: '#ffffff'
    },
    dracula: {
      title: '#262626', titleText: '#f6f6f4', act: '#343746', actIcon: '#7b7f8b', actOn: '#f6f6f4', actBorder: '#ff79c6',
      side: '#262626', sideText: '#f6f6f4', sel: '#44475a', selText: '#f6f6f4',
      tabs: '#191a21', tabActive: '#282a36', tabBorder: '#ff79c6', tabText: '#f6f6f4', tabX: '#7b7f8b',
      status: '#191a21', statusText: '#f6f6f4',
      bg: '#282a36', fg: '#f6f6f4', ln: '#7b7f8b', heading: '#87c76a', li: '#e7ee98', pre: '#97e1f1',
      link: '#97e1f1', field: '#343746', fieldBorder: '#44475a', border: '#44475a', muted: '#7b7f8b', badge: '#ff79c6', badgeText: '#282a36'
    }
  };

  const ICON =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#007ACC" d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/></svg>'
    );

  let current = null; // { cleanups: [fn], level, dark, theme }

  // After the extension is reloaded, the old content script in an already-open tab is orphaned but still alive.
  // A new copy asks the old one to undo its changes (leaving its state in a DOM attribute) so the two never
  // stack two frames or fight over the title, then re-applies the same level.
  document.dispatchEvent(new CustomEvent('vsd-takeover'));
  let handoff = null;
  try {
    const raw = document.documentElement.getAttribute('data-vsd-state');
    if (raw) handoff = JSON.parse(raw);
  } catch (e) {
    /* ignore */
  }
  document.documentElement.removeAttribute('data-vsd-state');
  document.addEventListener('vsd-takeover', () => {
    if (current) {
      document.documentElement.setAttribute(
        'data-vsd-state',
        JSON.stringify({ level: current.level, dark: current.dark, theme: current.theme })
      );
    }
    remove();
  });

  // ---------- config ----------
  function getConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('config', (r) => resolve(Object.assign({}, DEFAULTS, (r && r.config) || {})));
    });
  }

  // Line format: domain=level[,dark|light][,dracula|darkplus][,filename.ext]   e.g.  study4.com=2,dark,dracula,study4.js
  function parseRules(text) {
    const rules = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const [domain, rest = ''] = line.split('=').map((x) => x.trim());
      const [lvl, ...opts] = rest.split(',').map((x) => x.trim());
      const level = Number(lvl);
      if (!domain || !(level >= 0 && level <= 3)) continue;
      const rule = { domain: domain.toLowerCase(), level, dark: null, name: '', theme: '' };
      for (const o of opts) {
        if (o.toLowerCase() === 'dark') rule.dark = true;
        else if (o.toLowerCase() === 'light') rule.dark = false;
        else if (o.toLowerCase() === 'dracula') rule.theme = 'dracula';
        else if (o.toLowerCase() === 'darkplus') rule.theme = 'dark';
        else if (o.includes('.')) rule.name = o;
      }
      rules.push(rule);
    }
    return rules;
  }

  // study4.com -> study4.js, dictionary.cambridge.org -> cambridge.js, translate.google.com.vn -> google.js
  function autoName(host) {
    const parts = host.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
    if (parts.length > 1) {
      const second = ['com', 'co', 'org', 'net', 'gov', 'edu', 'ac'];
      if (parts.length > 2 && second.includes(parts[parts.length - 2])) parts.splice(-2);
      else parts.pop();
    }
    const base = (parts[parts.length - 1] || 'index').replace(/[^a-z0-9_-]/g, '') || 'index';
    return base + '.js';
  }

  // Explicit rule name > explicit option > automatic name from the site.
  function resolveFileName(cfg) {
    const rule = ruleFor(location.hostname, cfg.rules);
    if (rule && rule.name) return rule.name;
    if (cfg.fileName && cfg.fileName !== 'index.js') return cfg.fileName;
    return autoName(location.hostname);
  }

  function ruleFor(host, rulesText) {
    host = host.toLowerCase();
    return parseRules(rulesText).find((r) => host === r.domain || host.endsWith('.' + r.domain)) || null;
  }

  // ---------- level 3: page text -> code lines ----------
  function extractBlocks() {
    const root = document.querySelector('main, article, [role="main"]') || document.body;
    const sel = 'h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,td,th,dt,dd';
    const blocks = [];
    for (const el of root.querySelectorAll(sel)) {
      if (blocks.length >= 3000) break;
      if (el.closest('nav,footer,aside,script,style,noscript,template,textarea,pre,code,[hidden],[aria-hidden="true"]')) continue;
      if (el.querySelector(sel)) continue; // container of other blocks
      if (!el.getClientRects().length) continue; // not rendered (display:none etc.)
      if (getComputedStyle(el).visibility === 'hidden') continue;
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 400);
      if (!text) continue;
      const tag = el.tagName.toLowerCase();
      blocks.push({ kind: /^h\d$/.test(tag) ? 'h' : tag === 'li' ? 'li' : tag === 'pre' ? 'pre' : 'p', text });
    }
    return blocks;
  }

  function buildEditor(container) {
    const blocks = extractBlocks();
    if (!blocks.length) blocks.push({ kind: 'h', text: 'Không có nội dung để hiển thị' });
    const frag = document.createDocumentFragment();
    blocks.forEach((b, i) => {
      const row = document.createElement('div');
      row.className = 'line';
      const num = document.createElement('span');
      num.className = 'ln';
      num.textContent = String(i + 1);
      const txt = document.createElement('span');
      txt.className = 'tx ' + b.kind;
      txt.textContent = b.kind === 'h' ? '// ' + b.text : b.kind === 'li' ? '  - ' + b.text : b.text;
      row.appendChild(num);
      row.appendChild(txt);
      frag.appendChild(row);
    });
    container.appendChild(frag);
  }

  // ---------- the editor-style frame ----------
  // Icon colours in the spirit of Material Icon Theme.
  const FILE_COLORS = { js: '#cbcb41', json: '#f9a825', css: '#42a5f5', html: '#e44d26', md: '#42a5f5', env: '#faf743', gitignore: '#e64a19' };
  const DIR_COLORS = {
    '.vscode': '#42a5f5', node_modules: '#8bc34a', public: '#42a5f5', src: '#66bb6a', assets: '#ffca28',
    components: '#ffca28', hooks: '#ab47bc', pages: '#26a69a', services: '#ef5350', utils: '#ffa726'
  };

  // Fake project tree. kind: 'dir' (collapsed), 'open' (expanded), 'file'; the active file is inserted under src/.
  const TREE = [
    { d: 0, k: 'dir', t: '.vscode' },
    { d: 0, k: 'dir', t: 'node_modules' },
    { d: 0, k: 'dir', t: 'public' },
    { d: 0, k: 'open', t: 'src' },
    { d: 1, k: 'dir', t: 'assets' },
    { d: 1, k: 'dir', t: 'components' },
    { d: 1, k: 'dir', t: 'hooks' },
    { d: 1, k: 'dir', t: 'pages' },
    { d: 1, k: 'dir', t: 'services' },
    { d: 1, k: 'dir', t: 'utils' },
    { d: 1, k: 'file', t: 'App.css' },
    { d: 1, k: 'file', t: 'App.js' },
    { d: 1, k: 'active' },
    { d: 1, k: 'file', t: 'main.js' },
    { d: 0, k: 'file', t: '.env' },
    { d: 0, k: 'file', t: '.eslintrc.json' },
    { d: 0, k: 'file', t: '.gitignore' },
    { d: 0, k: 'file', t: 'index.html' },
    { d: 0, k: 'file', t: 'package-lock.json' },
    { d: 0, k: 'file', t: 'package.json' },
    { d: 0, k: 'file', t: 'README.md' },
    { d: 0, k: 'file', t: 'vite.config.js' }
  ];

  // ACT-ICONS-START
  const fillIcon = (d) => `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${d}"/></svg>`;
  const lineIcon = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ACT = {
    files: fillIcon('M17.5 0h-9L7 1.5V6H2.5L1 7.5v15.07L2.5 24h12.07L16 22.57V18h4.7l1.3-1.43V4.5L17.5 0zm0 2.12l2.38 2.38H17.5V2.12zm-3 20.38h-12v-15H7v9.07L8.5 18h6v4.5zm6-6h-12v-15H16V6h4.5v10.5z'),
    search: fillIcon('M15.25 0a8.25 8.25 0 0 0-6.18 13.72L1 22.88l1.12 1l8.05-9.12A8.251 8.251 0 1 0 15.25.01V0zm0 15a6.75 6.75 0 1 1 0-13.5a6.75 6.75 0 0 1 0 13.5z'),
    git: fillIcon('M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.4a3.737 3.737 0 1 0-1.494 0v9.117a3.776 3.776 0 1 0 1.816.099 2.99 2.99 0 0 1 2.668-1.667h2.99a4.484 4.484 0 0 0 4.223-3.039 3.736 3.736 0 0 0 3.25-3.687zM4.565 3.738a2.242 2.242 0 1 1 4.484 0 2.242 2.242 0 0 1-4.484 0zm4.484 16.441a2.242 2.242 0 1 1-4.484 0 2.242 2.242 0 0 1 4.484 0zm8.221-9.715a2.242 2.242 0 1 1 0-4.485 2.242 2.242 0 0 1 0 4.485z'),
    run: lineIcon('<path d="M9 4.5l10 6.5-10 6.5z"/><ellipse cx="6" cy="19" rx="2.6" ry="2.2"/><path d="M3 17l1.6 1M3 21l1.6-1M9 17l-1.6 1M9 21l-1.6-1"/>'),
    ext: lineIcon('<rect x="3.5" y="11.5" width="7" height="7"/><rect x="10.5" y="11.5" width="7" height="7"/><rect x="3.5" y="4.5" width="7" height="7"/><rect x="13" y="3" width="7" height="7" transform="rotate(8 16.5 6.5)"/>'),
    db: lineIcon('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
    account: lineIcon('<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-4 3.6-6.5 7.5-6.5s6.9 2.5 7.5 6.5"/>'),
    gear: lineIcon('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5" stroke-dasharray="3.1 2.1"/>')
  };

  function actHtml(count) {
    return `
        <div class="ic on" id="act-explorer" title="Explorer">${ACT.files}</div>
        <div class="ic">${ACT.search}</div>
        <div class="ic">${ACT.git}<span class="badge">${count}</span></div>
        <div class="ic">${ACT.run}</div>
        <div class="ic">${ACT.ext}<svg class="warn" viewBox="0 0 16 16"><path d="M8 1.5l7 12.5H1z" fill="#cca700"/><path d="M8 6v4M8 11.5v1" stroke="#262626" stroke-width="1.4" stroke-linecap="round"/></svg></div>
        <div class="ic">${ACT.db}</div>
        <div class="grow"></div>
        <div class="ic">${ACT.account}</div>
        <div class="ic">${ACT.gear}</div>`;
  }
  // ACT-ICONS-END

  // Small inline SVG icons in the spirit of Material Icon Theme (static markup only; names are used for lookup).
  const svg = (inner) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block">${inner}</svg>`;
  const label = (txt, color, size, y) =>
    `<text x="8" y="${y || 12}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${color}" font-family="Segoe UI,Arial,sans-serif">${txt}</text>`;

  function iconFor(name, kind) {
    if (kind === 'dir' || kind === 'open') {
      const c = DIR_COLORS[name] || '#42a5f5';
      return svg(
        kind === 'open'
          ? `<path d="M1.5 3.5h4.2l1.3 1.4h7.5v1.3H4.4L1.5 12.5z" fill="${c}" opacity=".65"/><path d="M4.2 6.2h11.3l-2.7 6.3H1.5z" fill="${c}"/>`
          : `<path d="M1.5 3h4.3l1.3 1.6h7.4v8.2h-13z" fill="${c}"/>`
      );
    }
    switch (name) {
      case 'package.json':
        return svg(`<path d="M8 1.5l5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7z" fill="#8bc34a"/>` + label('n', '#262626', 8, 10.5));
      case 'package-lock.json':
        return svg(`<rect x="3.5" y="7" width="9" height="7" rx="1.2" fill="#ef9a3a"/><path d="M5.5 7V5.6a2.5 2.5 0 015 0V7" stroke="#ef9a3a" stroke-width="1.5" fill="none"/>`);
      case '.gitignore':
        return svg(`<path d="M8 1.2l6.8 6.8L8 14.8 1.2 8z" fill="#e64a19"/><circle cx="8" cy="8" r="1.5" fill="#262626"/>`);
      case '.env':
        return svg(`<circle cx="8" cy="8" r="5" fill="none" stroke="#faf743" stroke-width="2" stroke-dasharray="2.2 1.3"/><circle cx="8" cy="8" r="2" fill="#faf743"/>`);
      case '.eslintrc.json':
        return svg(`<path d="M8 1.5l5.5 3.2v6.6L8 14.5l-5.5-3.2V4.7z" fill="none" stroke="#8080f2" stroke-width="1.7"/><path d="M5.8 8h4.4" stroke="#8080f2" stroke-width="1.7"/>`);
      case 'vite.config.js':
        return svg(`<path d="M9.8 1.2L3.4 9.2h3.9l-1.1 5.6 6.4-8.1H8.6z" fill="#a78bfa"/>`);
      default:
    }
    const ext = name.split('.').pop();
    if (ext === 'js') return svg(`<rect x="1.5" y="1.5" width="13" height="13" rx="2.2" fill="#cbcb41"/>` + label('JS', '#262626', 8));
    if (ext === 'json') return svg(label('{ }', '#f9a825', 11, 11.5));
    if (ext === 'css') return svg(label('#', '#42a5f5', 14, 12.5));
    if (ext === 'html') return svg(label('&lt;&gt;', '#e44d26', 11, 11.5));
    if (ext === 'md') return svg(`<circle cx="8" cy="8" r="6.2" fill="#42a5f5"/>` + label('i', '#262626', 9.5, 11));
    return svg(`<path d="M3.5 1.5h6l3 3v10h-9z" fill="#7b7f8b"/>`);
  }

  function shellCss(t) {
    return `
    *{box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif}
    .title{position:fixed;top:0;left:0;right:0;height:${TITLE_H}px;background:${t.title};color:${t.titleText};display:flex;align-items:center;font-size:12px;z-index:3}
    .title .logo{width:16px;height:16px;margin:0 10px}
    .title .menu span{padding:0 7px}
    .title .center{position:absolute;left:0;right:0;text-align:center;pointer-events:none}
    .title .ctl{margin-left:auto;display:flex}
    .title .ctl span{width:46px;text-align:center;font-size:14px}
    .tabs{position:fixed;top:${TITLE_H}px;left:var(--left);right:0;height:${TAB_H}px;background:${t.tabs};display:flex;z-index:3}
    .tab{display:flex;align-items:center;gap:8px;padding:0 14px;background:${t.tabActive};color:${t.tabText};font-size:13px;border-top:1px solid ${t.tabBorder}}
    .tab .x{color:${t.tabX};font-size:12px}
    .act{position:fixed;top:${TITLE_H}px;bottom:${STATUS_H}px;left:0;width:${ACT_W}px;background:${t.act};display:flex;flex-direction:column;align-items:center;padding-top:6px;z-index:3}
    .act .ic{width:${ACT_W}px;height:${ACT_W}px;display:flex;align-items:center;justify-content:center;color:${t.actIcon};font-size:22px;cursor:default}
    .act .ic.on{color:${t.actOn};box-shadow:inset 2px 0 ${t.actBorder};cursor:pointer}
    .act .ic{position:relative}
    .act .ic svg{width:24px;height:24px;display:block}
    .act .grow{flex:1}
    .act .badge{position:absolute;right:5px;bottom:7px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:${t.badge};color:${t.badgeText};font-size:10px;font-weight:600;line-height:16px;text-align:center}
    .act .ic svg.warn{position:absolute;right:6px;bottom:8px;width:13px;height:13px}
    .side{position:fixed;top:${TITLE_H}px;bottom:${STATUS_H}px;left:${ACT_W}px;width:${SIDE_W}px;background:${t.side};color:${t.sideText};font-size:13px;z-index:3;overflow:hidden;display:flex;flex-direction:column}
    .side.hidden{display:none}
    .side .head{padding:10px 20px;font-size:11px;letter-spacing:.5px}
    .side .row{padding:2px 12px;white-space:nowrap;line-height:20px}
    .side .row.sel{background:${t.sel};color:${t.selText}}
    .side .row .dot{display:inline-block;width:12px;margin-right:3px;text-align:center;font-size:10px;color:${t.muted}}
    .side .proj{font-weight:700;font-size:11px;padding:3px 8px;text-transform:uppercase}
    .side .row .ico{display:inline-block;width:16px;height:16px;margin-right:6px;vertical-align:middle}
    .side .tree{overflow:hidden}
    .side .sec{margin-top:auto;border-top:1px solid ${t.border};font-size:11px;font-weight:700;padding:5px 8px}
    .side .sec + .sec{margin-top:0}
    .status{position:fixed;left:0;right:0;bottom:0;height:${STATUS_H}px;background:${t.status};color:${t.statusText};display:flex;align-items:center;gap:14px;padding:0 10px;font-size:12px;z-index:3}
    .status .sp{margin-left:auto}
    .editor{position:fixed;top:${TITLE_H + TAB_H}px;bottom:${STATUS_H}px;left:var(--left);right:0;background:${t.bg};color:${t.fg};overflow:auto;z-index:2;
      font:14px/1.6 Consolas,'Courier New',monospace;padding:6px 0}
    .line{display:flex}
    .ln{flex:0 0 56px;text-align:right;padding-right:18px;color:${t.ln};user-select:none}
    .tx{flex:1;white-space:pre-wrap;word-break:break-word;padding-right:24px}
    .tx.h{color:${t.heading};font-weight:600}
    .tx.li{color:${t.li}}
    .tx.pre{color:${t.pre}}
  `;
  }

  function buildShell(level, cfg, t, onLayout) {
    // Stable fake "pending changes" number per site, like the source-control badge in VS Code.
    let hash = 0;
    for (const ch of location.hostname) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const badgeCount = 3 + (hash % 27);
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>${shellCss(t)}</style>
      <div class="title">
        <img class="logo" src="${ICON}" />
        <div class="menu"><span>File</span><span>Edit</span><span>Selection</span><span>View</span><span>Go</span><span>Run</span><span>Terminal</span><span>Help</span></div>
        <div class="center" id="title-text"></div>
        <div class="ctl"><span>&#8212;</span><span>&#9633;</span><span>&#10005;</span></div>
      </div>
      <div class="act">${actHtml(badgeCount)}</div>
      <div class="side" id="side">
        <div class="head">EXPLORER</div>
        <div class="proj" id="proj"></div>
        <div class="tree" id="tree"></div>
        <div class="sec">&#9656; OUTLINE</div>
        <div class="sec">&#9656; TIMELINE</div>
        <div class="sec">&#9656; NPM SCRIPTS</div>
      </div>
      <div class="tabs"><div class="tab"><span id="tab-name"></span><span class="x">&#10005;</span></div></div>
      <div class="status">
        <span>&#9095; main*</span><span>&#9888; 0 &#10005; 0</span>
        <span class="sp">Ln 12, Col 8</span><span>Spaces: 2</span><span>UTF-8</span><span>JavaScript</span>
      </div>
      ${level === 3 ? '<div class="editor" id="editor"></div>' : ''}
    `;
    const $ = (id) => root.getElementById(id);
    $('title-text').textContent = `${cfg.fileName} - ${cfg.project} - Visual Studio Code`;
    $('proj').textContent = '▾ ' + cfg.project;
    const tree = $('tree');
    for (const n of TREE) {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.paddingLeft = 12 + n.d * 14 + 'px';
      const isDir = n.k === 'dir' || n.k === 'open';
      const name = n.k === 'active' ? cfg.fileName : n.t;
      if (n.k === 'active') row.classList.add('sel');
      const chev = document.createElement('span');
      chev.className = 'dot';
      chev.textContent = n.k === 'open' ? '\u25BE' : n.k === 'dir' ? '\u25B8' : '';
      const ico = document.createElement('span');
      ico.className = 'ico';
      ico.innerHTML = iconFor(name, n.k);
      row.appendChild(chev);
      row.appendChild(ico);
      row.appendChild(document.createTextNode(name));
      tree.appendChild(row);
    }
    $('tab-name').textContent = cfg.fileName;

    let sidebarOpen = !cfg.hideSidebar;
    const apply = () => {
      const left = ACT_W + (sidebarOpen ? SIDE_W : 0);
      host.style.setProperty('--left', left + 'px');
      $('side').classList.toggle('hidden', !sidebarOpen);
      onLayout(left);
    };
    $('act-explorer').addEventListener('click', () => {
      sidebarOpen = !sidebarOpen;
      apply();
      // remember the choice for next time
      chrome.storage.sync.get('config', (r) => {
        const config = Object.assign({}, (r && r.config) || {}, { hideSidebar: !sidebarOpen });
        chrome.storage.sync.set({ config });
      });
    });
    apply();
    if (level === 3) buildEditor($('editor'));
    return host;
  }

  // ---------- apply / remove ----------
  function remove() {
    if (!current) return;
    for (const fn of current.cleanups.reverse()) {
      try {
        fn();
      } catch (e) {
        /* ignore */
      }
    }
    current = null;
  }

  function apply(level, cfgIn) {
    const cfg = Object.assign({}, cfgIn, { fileName: resolveFileName(cfgIn) });
    remove();
    const cleanups = [];
    const t = THEMES[cfg.theme] || THEMES.dracula;
    current = { cleanups, level, dark: !!cfg.dark, theme: cfg.theme in THEMES ? cfg.theme : 'dracula' };

    // tab title (re-asserted if the page changes it)
    const title = `${cfg.fileName} - ${cfg.project} - Visual Studio Code`;
    const origTitle = document.title;
    document.title = title;
    const titleObs = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    titleObs.observe(document.head || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
    cleanups.push(() => {
      titleObs.disconnect();
      document.title = origTitle;
    });

    // favicon
    const icons = [...document.querySelectorAll('link[rel~="icon"]')];
    const slots = icons.map((l) => ({ l, parent: l.parentNode, next: l.nextSibling }));
    icons.forEach((l) => l.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = ICON;
    (document.head || document.documentElement).appendChild(link);
    cleanups.push(() => {
      link.remove();
      for (const { l, parent, next } of slots) {
        if (!parent) continue;
        if (next && next.parentNode === parent) parent.insertBefore(l, next);
        else parent.appendChild(l);
      }
    });

    if (level < 2) return;

    // frame (+ page shifted into the free area for level 2, page hidden for level 3)
    const style = document.createElement('style');
    style.id = STYLE_ID;
    const pageCss = (left) => {
      if (level === 3) return `body{display:none !important} html{background:${t.bg} !important}`;
      let css = `html:root{margin:${TITLE_H + TAB_H}px 0 ${STATUS_H}px ${left}px !important;${cfg.dark ? `background:${t.bg} !important;color-scheme:dark !important;` : ''}}`;
      if (cfg.dark) {
        // Flat, monochrome editor-like theme: keeps layout and interactivity, removes colourful styling.
        // Backgrounds become the theme colour (not transparent) so floating popups/tooltips stay opaque and readable.
        // ":not(#vsd-x)" raises specificity (an id) so site stylesheets loaded later can't override it.
        const B = 'html:root body:not(#vsd-x)';
        // web-highlight = highlight element of another extension: leave its own colours alone.
        const EX = ':not(mark):not(web-highlight):not(web-highlight *):not(img):not(svg):not(video):not(canvas):not(picture):not(iframe)';
        css +=
          `${B}{background:${t.bg} !important}` +
          `${B} *${EX}{background-color:${t.bg} !important;background-image:none !important;` +
          `color:${t.fg} !important;font-family:'Segoe UI',system-ui,sans-serif !important;-webkit-text-fill-color:${t.fg} !important;` +
          `border-color:${t.border} !important;box-shadow:none !important;text-shadow:none !important;border-radius:0 !important}` +
          `${B} a${EX},${B} a *${EX}{color:${t.link} !important;-webkit-text-fill-color:${t.link} !important}` +
          `${B} button${EX},${B} select${EX},${B} textarea${EX},${B} input${EX}:not([type=checkbox]):not([type=radio]){` +
          `background-color:${t.field} !important;border:1px solid ${t.fieldBorder} !important;color:${t.fg} !important;-webkit-text-fill-color:${t.fg} !important}` +
          `${B} ::placeholder{color:${t.muted} !important}`;
      }
      return css;
    };
    const host = buildShell(level, cfg, t, (left) => {
      style.textContent = pageCss(left);
    });
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.appendChild(host);
    cleanups.push(() => {
      host.remove();
      style.remove();
    });

    // Level 2 keeps the real page usable, so make sure copying works on it: some sites (e.g. a read-only Slate editor)
    // cancel the browser's copy and write their own empty selection, so Ctrl+C / "Copy" puts nothing on the clipboard.
    // This capture-phase listener runs first and copies what is actually highlighted. Inputs and rich editors are left alone.
    if (level === 2) {
      const onCopy = (e) => {
        const ae = document.activeElement;
        if (ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) return;
        const text = String(getSelection() || '');
        if (!text || !e.clipboardData) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        e.clipboardData.setData('text/plain', text);
      };
      document.addEventListener('copy', onCopy, true);
      cleanups.push(() => document.removeEventListener('copy', onCopy, true));
    }
  }

  // ---------- remember per site ----------
  // A site turned on by hand (popup / hotkey) is remembered, so every page of it opens already disguised.
  const STATE_KEY = 'siteState';
  const siteKey = () => location.hostname.toLowerCase().replace(/^www\./, '');

  function readSiteStates() {
    return new Promise((resolve) => {
      try {
        chrome.storage.sync.get(STATE_KEY, (r) => resolve((r && r[STATE_KEY]) || {}));
      } catch (e) {
        resolve({});
      }
    });
  }

  async function saveSiteState(entry) {
    try {
      const all = await readSiteStates();
      if (entry) all[siteKey()] = entry;
      else delete all[siteKey()];
      chrome.storage.sync.set({ [STATE_KEY]: all });
    } catch (e) {
      /* ignore */
    }
  }

  async function findSiteState() {
    const all = await readSiteStates();
    const host = location.hostname.toLowerCase();
    const keys = Object.keys(all)
      .filter((k) => host === k || host.endsWith('.' + k))
      .sort((a, b) => b.length - a.length);
    return keys.length ? all[keys[0]] : null;
  }

  // ---------- wiring ----------
  async function configForThisPage() {
    const cfg = await getConfig();
    const rule = ruleFor(location.hostname, cfg.rules);
    if (rule && rule.dark !== null) cfg.dark = rule.dark;
    if (rule && rule.theme) cfg.theme = rule.theme;
    const level = rule && rule.level > 0 ? rule.level : cfg.defaultLevel;
    return { cfg, level };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'STATUS') {
      sendResponse({
        active: !!current,
        level: current ? current.level : 0,
        dark: current ? current.dark : null,
        theme: current ? current.theme : null
      });
      return;
    }
    if (msg.type === 'OFF') {
      remove();
      saveSiteState(null);
      sendResponse({ active: false });
      return;
    }
    if (msg.type === 'APPLY') {
      (async () => {
        const cfg = await getConfig();
        cfg.dark = !!msg.dark;
        if (msg.theme) cfg.theme = msg.theme;
        if (typeof msg.hideSidebar === 'boolean') cfg.hideSidebar = msg.hideSidebar;
        apply(msg.level, cfg);
        saveSiteState({ level: msg.level, dark: !!cfg.dark, theme: cfg.theme });
        sendResponse({ active: true, level: msg.level, dark: cfg.dark, theme: cfg.theme });
      })();
      return true;
    }
    if (msg.type === 'TOGGLE') {
      (async () => {
        if (current) {
          remove();
          saveSiteState(null);
          sendResponse({ active: false });
          return;
        }
        const { cfg, level } = await configForThisPage();
        apply(level, cfg);
        saveSiteState({ level, dark: !!cfg.dark, theme: cfg.theme });
        sendResponse({ active: true });
      })();
      return true;
    }
  });

  (async function init() {
    const cfg = await getConfig();
    if (handoff && handoff.level >= 1) {
      cfg.dark = !!handoff.dark;
      if (handoff.theme) cfg.theme = handoff.theme;
      apply(handoff.level, cfg);
      return;
    }
    if (!cfg.autoApply) return;
    const rule = ruleFor(location.hostname, cfg.rules);
    if (rule && rule.level > 0) {
      if (rule.dark !== null) cfg.dark = rule.dark;
      if (rule.theme) cfg.theme = rule.theme;
      apply(rule.level, cfg);
    } else if (!rule) {
      // no explicit rule: use what was last chosen by hand for this site
      const saved = await findSiteState();
      if (saved && saved.level >= 1) {
        cfg.dark = !!saved.dark;
        if (saved.theme) cfg.theme = saved.theme;
        apply(saved.level, cfg);
      }
    }
  })();
})();
