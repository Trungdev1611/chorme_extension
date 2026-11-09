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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'PROMPT_MEANING') {
      const input = window.prompt(`Nhập nghĩa cho "${message.word}":`, '');
      sendResponse({ meaning: input });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
