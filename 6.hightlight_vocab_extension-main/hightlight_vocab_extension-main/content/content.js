(function () {
  const HIGHLIGHT_CLASS = 'vocab-highlight-ext';
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT']);

  let vocabMap = {}; // wordLower -> record
  let regex = null;
  let settings = VocabStorage.DEFAULT_SETTINGS;
  let scheduled = false;

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildRegex(words) {
    if (!words.length) return null;
    const sorted = [...words].sort((a, b) => b.length - a.length);
    const pattern = sorted.map(escapeRegExp).join('|');
    return new RegExp(`\\b(${pattern})\\b`, 'gi');
  }

  function isDomainDisabled() {
    const host = location.hostname;
    return (settings.disabledDomains || []).some((d) => d && host.includes(d.trim()));
  }

  function shouldSkip(node) {
    let el = node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.classList && el.classList.contains(HIGHLIGHT_CLASS)) return true;
      if (el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }

  function highlightRoot(root) {
    if (!root || !regex || isDomainDisabled()) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(node)) return NodeFilter.FILTER_REJECT;
        regex.lastIndex = 0;
        return regex.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });

    const targets = [];
    let n;
    while ((n = walker.nextNode())) targets.push(n);

    for (const textNode of targets) {
      const text = textNode.nodeValue;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let match;
      let matched = false;

      while ((match = regex.exec(text))) {
        matched = true;
        const full = match[0];
        const start = match.index;
        if (start > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));

        const mark = document.createElement('mark');
        mark.className = HIGHLIGHT_CLASS;
        mark.style.backgroundColor = settings.highlightColor;
        mark.textContent = full;
        const record = vocabMap[full.toLowerCase()];
        if (record && record.meaning) mark.title = record.meaning;
        frag.appendChild(mark);

        lastIndex = start + full.length;
        if (match.index === regex.lastIndex) regex.lastIndex++;
      }

      if (matched) {
        if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        textNode.parentNode.replaceChild(frag, textNode);
      }
    }
  }

  function scheduleHighlight(root) {
    if (scheduled) return;
    scheduled = true;
    const run = () => {
      scheduled = false;
      highlightRoot(root || document.body);
    };
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(run, { timeout: 1000 });
    } else {
      setTimeout(run, 200);
    }
  }

  async function refreshVocab() {
    settings = await VocabStorage.getSettings();
    vocabMap = await VocabStorage.getAllVocab();
    regex = buildRegex(Object.keys(vocabMap));
  }

  async function init() {
    await refreshVocab();
    if (!regex || isDomainDisabled()) return;

    scheduleHighlight(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            scheduleHighlight(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            scheduleHighlight(node.parentElement);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.storage.onChanged.addListener(async (changes, area) => {
    const relevant =
      (area === 'local' && VocabStorage.isVocabChange(changes)) || (area === 'sync' && changes.settings);
    if (!relevant) return;
    await refreshVocab();
    if (regex && !isDomainDisabled()) scheduleHighlight(document.body);
  });

  // ---- Non-modal "add word" panel (Shadow DOM so page CSS can't break it) ----
  let panelHost = null;

  function closePanel() {
    if (panelHost) panelHost.remove();
    panelHost = null;
  }

  // Bounding rect of the current selection (or the focused input), in viewport coordinates.
  function getSelectionRect() {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      const r = active.getBoundingClientRect();
      if (r.width || r.height) return r;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width || r.height) return r;
    }
    return null;
  }

  // Put the panel just under the selected word; flip above if there is no room; fall back to top-right.
  function positionPanel(host, rect) {
    const GAP = 8;
    const MARGIN = 8;
    const doc = document.documentElement;
    if (!rect) {
      host.style.position = 'fixed';
      host.style.top = '16px';
      host.style.right = '16px';
      return;
    }
    host.style.position = 'absolute';
    const width = host.offsetWidth;
    const height = host.offsetHeight;
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;
    const maxLeft = Math.max(MARGIN, doc.clientWidth - width - MARGIN);
    const left = Math.min(Math.max(rect.left, MARGIN), maxLeft);
    const fitsBelow = rect.bottom + GAP + height <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + GAP : Math.max(MARGIN, rect.top - GAP - height);
    host.style.left = left + scrollX + 'px';
    host.style.top = top + scrollY + 'px';
  }

  function showAddPanel(word, sourceUrl, anchorRect) {
    closePanel();
    panelHost = document.createElement('div');
    panelHost.style.cssText = 'all:initial;position:absolute;top:0;left:0;z-index:2147483647;';
    const root = panelHost.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .box{width:300px;box-sizing:border-box;padding:12px;background:#fff;color:#222;border:1px solid #ccc;
          border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.25);font:13px system-ui,sans-serif}
        .title{font-weight:600;margin-bottom:8px}
        label{display:block;font-size:12px;color:#555;margin:6px 0 2px}
        input,textarea{width:100%;box-sizing:border-box;padding:6px;border:1px solid #bbb;border-radius:4px;
          font:13px system-ui,sans-serif;color:#222;background:#fff}
        textarea{resize:vertical;min-height:60px}
        .row{display:flex;gap:6px;justify-content:flex-end;margin-top:10px}
        button{padding:6px 12px;border:1px solid #bbb;border-radius:4px;background:#f5f5f5;color:#222;cursor:pointer;font:13px system-ui,sans-serif}
        button.primary{background:#2d7ff9;border-color:#2d7ff9;color:#fff}
        .msg{margin-top:8px;font-size:12px}
        .ok{color:#2e7d32}.err{color:#c62828}.warn{color:#b26a00}
        .hint{font-size:11px;color:#888;margin-top:6px}
      </style>
      <div class="box">
        <div class="title">Thêm vào Extension Vocab</div>
        <label>Từ</label>
        <input id="w" type="text" />
        <label>Nghĩa</label>
        <textarea id="m" placeholder="Dán nghĩa vào đây (bạn có thể chuyển tab để copy)"></textarea>
        <div class="row"><button id="cancel">Huỷ</button><button id="save" class="primary">Lưu</button></div>
        <div id="msg" class="msg"></div>
        <div class="hint">Enter: lưu · Shift+Enter: xuống dòng · Esc: huỷ</div>
      </div>`;

    const $ = (id) => root.getElementById(id);
    const wordEl = $('w');
    const meaningEl = $('m');
    const msgEl = $('msg');
    wordEl.value = word;

    // Keep keystrokes away from page shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      panelHost.addEventListener(type, (e) => e.stopPropagation());
    }

    function setMsg(text, cls) {
      msgEl.textContent = text;
      msgEl.className = 'msg ' + (cls || '');
    }

    async function save() {
      const w = wordEl.value.trim();
      if (!w) return setMsg('Từ không được để trống.', 'err');
      try {
        await VocabStorage.saveVocab({ word: w, meaning: meaningEl.value.trim(), sourceUrl });
      } catch (err) {
        const text = String((err && err.message) || err);
        return setMsg(/quota/i.test(text) ? 'Hết dung lượng. Hãy xuất JSON rồi xoá bớt từ.' : 'Lỗi: ' + text, 'err');
      }
      const usage = await VocabStorage.getUsage();
      if (usage.warn) {
        setMsg(`Đã lưu. Bộ nhớ ${Math.round(usage.ratio * 100)}%, hãy xuất JSON sao lưu.`, 'warn');
        setTimeout(closePanel, 2500);
      } else {
        setMsg('Đã lưu.', 'ok');
        setTimeout(closePanel, 700);
      }
    }

    $('save').addEventListener('click', save);
    $('cancel').addEventListener('click', closePanel);
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
      else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        save();
      }
    });

    document.documentElement.appendChild(panelHost);
    positionPanel(panelHost, anchorRect);
    meaningEl.focus({ preventScroll: true });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === 'SHOW_ADD_PANEL') {
      showAddPanel(message.word, message.sourceUrl || location.href, getSelectionRect());
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
