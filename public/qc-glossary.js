/* ==================================================================
   ON MART QC — English ⇄ Khmer glossary panel (Settings page)

   Loaded by one line in public/qc.html before </body>:
       <script src="/qc-glossary.js"></script>

   A controlled terminology list, not machine translation: one English
   term maps to one agreed Khmer wording, so the same phrase is used in
   every inspection, report and export. Additive — it appends its own
   card and touches nothing the template owns.
   ================================================================== */
(function () {
  'use strict';

  var API = '/api/glossary';
  var CARD_HEADING = 'បញ្ជីជម្រើស';

  var state = { terms: [], canEdit: false, dirty: false, saving: false, q: '' };
  var panel = null, tbody = null, statusEl = null, saveBtn = null, countEl = null;
  var lookupIn = null, lookupOut = null;

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* The Settings card, found the same way the save script finds it, so
     the panel lands in the right place and nowhere else. */
  function settingsCard() {
    var heads = document.querySelectorAll('h1, h2, h3, h4, h5');
    for (var i = 0; i < heads.length; i++) {
      var h = heads[i];
      if ((h.textContent || '').indexOf(CARD_HEADING) === -1) continue;
      if (!visible(h)) continue;
      var node = h.parentElement;
      for (var up = 0; node && up < 6; up++) {
        var t = node.textContent || '';
        if (t.indexOf('បញ្ជីហាង') !== -1 && t.indexOf('អ្នកសវនកម្ម') !== -1 &&
            node.querySelectorAll('input').length > 0) {
          return node;
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function el(tag, style, text) {
    var e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function input(value, ph) {
    var i = document.createElement('input');
    i.type = 'text';
    i.value = value || '';
    if (ph) i.placeholder = ph;
    i.setAttribute('style',
      'width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:7px;' +
      'font-family:inherit;font-size:13.5px;background:#fff;');
    return i;
  }

  function btn(label, bg, fg, border) {
    var b = el('button', [
      'padding:5px 11px', 'border-radius:7px', 'font-size:12px',
      'font-family:inherit', 'cursor:pointer', 'white-space:nowrap',
      'border:1px solid ' + border, 'background:' + bg, 'color:' + fg
    ].join(';'), label);
    b.type = 'button';
    return b;
  }

  function say(msg, color) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.style.color = color || '#64748b';
    if (msg) {
      clearTimeout(statusEl.__t);
      statusEl.__t = setTimeout(function () { statusEl.textContent = ''; }, 5000);
    }
  }

  function markDirty() {
    state.dirty = true;
    if (saveBtn) {
      saveBtn.disabled = !state.canEdit;
      saveBtn.style.opacity = state.canEdit ? '1' : '0.5';
    }
  }

  /* ----------------------------- lookup --------------------------- */

  function lookup(q) {
    q = String(q || '').trim().toLowerCase();
    if (!q) return null;
    var exact = null, starts = null, contains = null;
    for (var i = 0; i < state.terms.length; i++) {
      var t = state.terms[i];
      var en = t.en.toLowerCase(), km = t.km;
      if (en === q || km === q) { exact = t; break; }
      if (!starts && (en.indexOf(q) === 0 || km.indexOf(q) === 0)) starts = t;
      if (!contains && (en.indexOf(q) !== -1 || km.indexOf(q) !== -1)) contains = t;
    }
    return exact || starts || contains;
  }

  function renderLookup() {
    if (!lookupOut) return;
    var q = lookupIn.value;
    if (!q.trim()) { lookupOut.innerHTML = ''; return; }
    var hit = lookup(q);
    if (!hit) {
      lookupOut.innerHTML = '<span style="color:#b45309">រកមិនឃើញពាក្យនេះទេ — ' +
        'អ្នកអាចបន្ថែមវាខាងក្រោម។</span>';
      return;
    }
    lookupOut.innerHTML =
      '<strong style="font-size:15px">' + escapeHtml(hit.en) + '</strong>' +
      '<span style="margin:0 10px;color:#94a3b8">⇄</span>' +
      '<strong style="font-size:15px;color:#1d4ed8">' + escapeHtml(hit.km) + '</strong>' +
      '<span style="margin-left:10px;font-size:12px;color:#64748b">' +
      escapeHtml(hit.cat || '') + '</span>';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------ table --------------------------- */

  function matches(t, q) {
    if (!q) return true;
    q = q.toLowerCase();
    return t.en.toLowerCase().indexOf(q) !== -1 ||
           t.km.indexOf(q) !== -1 ||
           (t.cat || '').toLowerCase().indexOf(q) !== -1;
  }

  function renderTable() {
    if (!tbody) return;
    tbody.innerHTML = '';
    var shown = 0;

    for (var i = 0; i < state.terms.length; i++) {
      (function (term, idx) {
        if (!matches(term, state.q)) return;
        shown++;

        var tr = document.createElement('tr');
        var tdStyle = 'padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;';

        var c1 = el('td', tdStyle);
        var inEn = input(term.en, 'English');
        inEn.disabled = !state.canEdit;
        inEn.addEventListener('input', function () { term.en = inEn.value; markDirty(); });
        c1.appendChild(inEn);

        var c2 = el('td', tdStyle);
        var inKm = input(term.km, 'ភាសាខ្មែរ');
        inKm.disabled = !state.canEdit;
        inKm.addEventListener('input', function () { term.km = inKm.value; markDirty(); });
        c2.appendChild(inKm);

        var c3 = el('td', tdStyle);
        var inCat = input(term.cat || '', 'ប្រភេទ');
        inCat.disabled = !state.canEdit;
        inCat.addEventListener('input', function () { term.cat = inCat.value; markDirty(); });
        c3.appendChild(inCat);

        var c4 = el('td', tdStyle + 'width:1%;white-space:nowrap;');
        if (state.canEdit) {
          var del = btn('លុប', '#fff', '#b91c1c', '#fca5a5');
          del.addEventListener('click', function () {
            state.terms.splice(idx, 1);
            markDirty();
            renderTable();
            renderLookup();
          });
          c4.appendChild(del);
        }

        tr.appendChild(c1); tr.appendChild(c2); tr.appendChild(c3); tr.appendChild(c4);
        tbody.appendChild(tr);
      })(state.terms[i], i);
    }

    if (shown === 0) {
      var tr = document.createElement('tr');
      var td = el('td', 'padding:14px 8px;color:#64748b;', 'រកមិនឃើញពាក្យត្រូវនឹងការស្វែងរក');
      td.colSpan = 4;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    if (countEl) {
      countEl.textContent = 'ពាក្យសរុប ' + state.terms.length +
        (state.q ? ' · បង្ហាញ ' + shown : '');
    }
  }

  /* ------------------------------ data ---------------------------- */

  function load() {
    return fetch(API, { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) { say(res.body.error || 'ផ្ទុកមិនបាន', '#b91c1c'); return; }
        state.terms = res.body.terms || [];
        state.canEdit = !!res.body.canEdit;
        state.dirty = false;
        if (saveBtn) {
          saveBtn.style.display = state.canEdit ? '' : 'none';
          saveBtn.disabled = true;
          saveBtn.style.opacity = '0.5';
        }
        renderTable();
        renderLookup();
      })
      .catch(function (e) { say('ផ្ទុកមិនបាន៖ ' + e.message, '#b91c1c'); });
  }

  function save() {
    if (state.saving || !state.canEdit) return;
    var clean = state.terms.filter(function (t) {
      return String(t.en || '').trim() && String(t.km || '').trim();
    });
    if (clean.length === 0) {
      say('បញ្ជីពាក្យទទេ — មិនរក្សាទុកទេ', '#b91c1c');
      return;
    }
    state.saving = true;
    saveBtn.disabled = true;
    say('កំពុងរក្សាទុក…', '#2563eb');

    fetch(API, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ terms: clean })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        state.saving = false;
        if (!res.ok) {
          say(res.body.messageKm || res.body.error || 'រក្សាទុកមិនបាន', '#b91c1c');
          saveBtn.disabled = false;
          return;
        }
        state.dirty = false;
        say('✓ រក្សាទុករួច · ពាក្យ ' + res.body.count, '#15803d');
        return load();
      })
      .catch(function (e) {
        state.saving = false;
        saveBtn.disabled = false;
        say('រក្សាទុកមិនបាន — ទិន្នន័យចាស់នៅដដែល', '#b91c1c');
      });
  }

  /* ------------------------------ build --------------------------- */

  function build(card) {
    panel = el('div', [
      'margin-top:18px', 'padding:20px', 'background:#fff',
      'border:1px solid #e2e8f0', 'border-radius:14px',
      'box-shadow:0 1px 3px rgba(15,23,42,.06)', 'font-family:inherit'
    ].join(';'));
    panel.id = 'qcGlossaryPanel';

    panel.appendChild(el('h3', 'margin:0 0 4px;font-size:19px;',
      'វចនានុក្រមបច្ចេកទេស — អង់គ្លេស ⇄ ខ្មែរ'));
    panel.appendChild(el('div', 'margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.7;',
      'ពាក្យបច្ចេកទេសមួយ ត្រូវប្រើការបកប្រែតែមួយ ក្នុងរបាយការណ៍ និងការត្រួតពិនិត្យទាំងអស់។'));

    /* lookup box */
    var lookWrap = el('div',
      'padding:13px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;margin-bottom:16px;');
    lookWrap.appendChild(el('div', 'font-size:12.5px;color:#475569;margin-bottom:7px;',
      'រកពាក្យបកប្រែ / Look up a term'));
    lookupIn = input('', 'វាយពាក្យអង់គ្លេស ឬខ្មែរ…');
    lookupIn.addEventListener('input', renderLookup);
    lookWrap.appendChild(lookupIn);
    lookupOut = el('div', 'margin-top:10px;min-height:22px;font-size:14px;line-height:1.6;');
    lookWrap.appendChild(lookupOut);
    panel.appendChild(lookWrap);

    /* toolbar */
    var bar = el('div', 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px;');
    var search = input('', 'ច្រោះតារាងខាងក្រោម…');
    search.style.maxWidth = '260px';
    search.addEventListener('input', function () { state.q = search.value.trim(); renderTable(); });
    bar.appendChild(search);

    countEl = el('span', 'font-size:12.5px;color:#64748b;');
    bar.appendChild(countEl);

    var spacer = el('span', 'flex:1;');
    bar.appendChild(spacer);

    var addBtn = btn('+ បន្ថែមពាក្យ', '#eff6ff', '#1e40af', '#93c5fd');
    addBtn.style.padding = '7px 14px';
    addBtn.style.fontSize = '13px';
    addBtn.addEventListener('click', function () {
      if (!state.canEdit) return;
      state.terms.unshift({ en: '', km: '', cat: 'General' });
      state.q = '';
      search.value = '';
      markDirty();
      renderTable();
      var first = tbody.querySelector('input');
      if (first) first.focus();
    });
    bar.appendChild(addBtn);

    saveBtn = btn('រក្សាទុក / Save', '#1d4ed8', '#fff', '#1d4ed8');
    saveBtn.style.padding = '7px 16px';
    saveBtn.style.fontSize = '13px';
    saveBtn.style.fontWeight = '600';
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
    saveBtn.addEventListener('click', save);
    bar.appendChild(saveBtn);

    panel.appendChild(bar);

    statusEl = el('div', 'font-size:12.5px;min-height:18px;margin-bottom:8px;');
    panel.appendChild(statusEl);

    /* table */
    var scroll = el('div', 'overflow-x:auto;max-height:420px;overflow-y:auto;' +
      'border:1px solid #e2e8f0;border-radius:10px;');
    var table = el('table', 'width:100%;border-collapse:collapse;font-size:13px;min-width:620px;');
    var thead = document.createElement('thead');
    var htr = document.createElement('tr');
    ['English', 'ភាសាខ្មែរ', 'ប្រភេទ / Category', ''].forEach(function (h) {
      var th = el('th',
        'text-align:left;padding:9px 8px;border-bottom:2px solid #e2e8f0;' +
        'color:#475569;font-weight:600;background:#f8fafc;position:sticky;top:0;', h);
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
    scroll.appendChild(table);
    panel.appendChild(scroll);

    panel.appendChild(el('div', 'margin-top:12px;font-size:12px;color:#64748b;line-height:1.7;',
      'ការកែប្រែត្រូវរក្សាទុកក្នុងមូលដ្ឋានទិន្នន័យ ហើយមានកំណែដូចទិន្នន័យមេដទៃទៀត។'));

    // Place it directly after the Settings card.
    if (card.parentElement) {
      card.parentElement.insertBefore(panel, card.nextSibling);
    } else {
      card.appendChild(panel);
    }
  }

  /* ------------------------------ boot ---------------------------- */

  function sweep() {
    var card = settingsCard();
    if (!card) return;                       // not on the Settings page
    if (panel && document.contains(panel)) return;
    build(card);
    load();
  }

  function boot() {
    sweep();
    try {
      var pending = false;
      var mo = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () { pending = false; sweep(); }, 300);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* the interval below is enough */ }
    setInterval(sweep, 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
