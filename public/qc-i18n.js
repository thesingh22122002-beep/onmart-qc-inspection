/* ==================================================================
   ON MART QC — Khmer ⇄ English interface switch

   Loaded by one line in public/qc.html before </body>, after the two
   dictionary files:
       <script src="/qc-i18n-dict.js"></script>
       <script src="/qc-i18n-dict2.js"></script>
       <script src="/qc-i18n.js"></script>

   How it works: every text node, placeholder, title and option label is
   looked up in the dictionary and swapped. The Khmer original is kept on
   the node itself, so switching back is an exact restore rather than a
   reverse translation — nothing is lost and nothing drifts.

   Store names, inspector names and anything the user typed are data, not
   interface wording, so they are never translated.
   ================================================================== */
(function () {
  'use strict';

  var KEY = 'qc_lang';
  var DICT = window.QC_I18N || {};
  var lang = 'km';
  var applying = false;
  var btn = null;

  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'km') lang = saved;
  } catch (e) { /* private mode */ }

  /* Nodes whose text must never be touched. */
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, PRE: 1 };

  function skip(node) {
    for (var p = node.parentNode; p; p = p.parentNode) {
      if (p.nodeType !== 1) continue;
      if (SKIP_TAGS[p.tagName]) return true;
      if (p.getAttribute && p.getAttribute('data-qc-no-i18n') === '1') return true;
    }
    return false;
  }

  /* --------------------------- translate -------------------------- */

  function translateTextNode(n) {
    var raw = n.nodeValue;
    if (!raw) return;
    var trimmed = raw.trim();
    if (!trimmed) return;

    if (lang === 'en') {
      // The app rewrites some nodes itself (the running score in the
      // header, for one). If the text is no longer what we wrote, treat
      // it as fresh Khmer and translate it again.
      if (n.__qcKm !== undefined) {
        if (n.nodeValue === n.__qcEn) return;        // still our translation
        delete n.__qcKm;
        delete n.__qcEn;
      }
      var hit = DICT[trimmed];
      if (!hit) return;
      n.__qcKm = raw;                                // keep the exact original
      n.__qcEn = raw.replace(trimmed, hit);          // preserve surrounding space
      n.nodeValue = n.__qcEn;
    } else {
      if (n.__qcKm === undefined) return;
      n.nodeValue = n.__qcKm;
      delete n.__qcKm;
      delete n.__qcEn;
    }
  }

  function translateAttr(el, attr) {
    var store = '__qcKm_' + attr;
    if (lang === 'en') {
      if (el[store] !== undefined) return;
      var cur = el.getAttribute(attr);
      if (!cur) return;
      var hit = DICT[cur.trim()];
      if (!hit) return;
      el[store] = cur;
      el.setAttribute(attr, hit);
    } else {
      if (el[store] === undefined) return;
      el.setAttribute(attr, el[store]);
      delete el[store];
    }
  }

  function walk(root) {
    if (!root || root.nodeType !== 1) return;

    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [], n;
    while ((n = tw.nextNode())) nodes.push(n);
    for (var i = 0; i < nodes.length; i++) {
      if (!skip(nodes[i])) translateTextNode(nodes[i]);
    }

    var withPh = root.querySelectorAll('input[placeholder], textarea[placeholder]');
    for (var j = 0; j < withPh.length; j++) translateAttr(withPh[j], 'placeholder');

    var withTitle = root.querySelectorAll('[title]');
    for (var k = 0; k < withTitle.length; k++) translateAttr(withTitle[k], 'title');

    if (root.matches) {
      if (root.matches('input[placeholder], textarea[placeholder]')) translateAttr(root, 'placeholder');
      if (root.matches('[title]')) translateAttr(root, 'title');
    }
  }

  function apply() {
    applying = true;
    try {
      walk(document.body);
      document.documentElement.setAttribute('lang', lang === 'en' ? 'en' : 'km');
      if (btn) btn.textContent = lang === 'en' ? '🌐 ភាសាខ្មែរ' : '🌐 English';
    } finally {
      // Let the observer settle before listening again.
      setTimeout(function () { applying = false; }, 0);
    }
  }

  function setLang(next) {
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
    apply();
  }

  /* ---------------------------- button ---------------------------- */

  function mountButton() {
    if (btn && document.contains(btn)) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'qcLangToggle';
    btn.setAttribute('data-qc-no-i18n', '1');   // never translate the button itself
    btn.setAttribute('style', [
      'padding:8px 14px', 'border-radius:10px', 'cursor:pointer',
      'font-family:inherit', 'font-size:13.5px', 'font-weight:600',
      'border:1px solid rgba(255,255,255,.35)', 'background:rgba(255,255,255,.12)',
      'color:#fff', 'white-space:nowrap', 'margin-right:8px'
    ].join(';'));
    btn.textContent = lang === 'en' ? '🌐 ភាសាខ្មែរ' : '🌐 English';
    btn.addEventListener('click', function () {
      setLang(lang === 'en' ? 'km' : 'en');
    });

    // Sit next to the menu button in the header when we can find it.
    var anchor = null;
    var buttons = document.querySelectorAll('button, a');
    for (var i = 0; i < buttons.length; i++) {
      var t = (buttons[i].textContent || '').trim();
      if (t.indexOf('ម៉ឺនុយ') !== -1 || t.indexOf('Menu') !== -1) { anchor = buttons[i]; break; }
    }

    if (anchor && anchor.parentElement) {
      anchor.parentElement.insertBefore(btn, anchor);
    } else {
      // Fall back to a floating control so the switch is always reachable.
      btn.style.position = 'fixed';
      btn.style.top = '10px';
      btn.style.right = '10px';
      btn.style.zIndex = '9500';
      btn.style.background = '#1d4ed8';
      btn.style.border = '1px solid #1d4ed8';
      document.body.appendChild(btn);
    }
  }

  /* ----------------------------- boot ----------------------------- */

  function boot() {
    mountButton();
    if (lang === 'en') apply();

    try {
      var pending = false;
      var mo = new MutationObserver(function (records) {
        if (applying || lang !== 'en') return;
        if (pending) return;
        pending = true;
        setTimeout(function () {
          pending = false;
          applying = true;
          for (var i = 0; i < records.length; i++) {
            var rec = records[i];
            if (rec.type === 'characterData') {
              // A node the app rewrote in place — re-translate it.
              if (rec.target && !skip(rec.target)) translateTextNode(rec.target);
              continue;
            }
            var added = rec.addedNodes;
            for (var j = 0; j < added.length; j++) {
              if (added[j].nodeType === 1) walk(added[j]);
              else if (added[j].nodeType === 3 && !skip(added[j])) translateTextNode(added[j]);
            }
          }
          setTimeout(function () { applying = false; }, 0);
        }, 120);
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { /* without an observer, a tab switch still re-applies below */ }

    // Panels are built when their tab is opened, so re-apply on navigation.
    document.addEventListener('click', function () {
      if (lang !== 'en') return;
      setTimeout(apply, 250);
    }, true);

    // Expose for the console and for other scripts.
    window.qcSetLanguage = setLang;
    window.qcGetLanguage = function () { return lang; };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
