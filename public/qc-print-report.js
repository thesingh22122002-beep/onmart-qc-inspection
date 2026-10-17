/* ==================================================================
   ON MART QC — print-quality report (correct Khmer shaping)

   Loaded by one line in public/qc.html before </body>:
       <script src="/qc-print-report.js"></script>

   WHY THIS EXISTS
   ---------------
   jsPDF writes glyphs in the order the characters appear. Khmer needs
   OpenType shaping: pre-base vowels move in front of their consonant,
   and coeng consonants stack underneath. jsPDF does neither, so
   "ទួលគោក" comes out as "ទួលគ ោក" and "ល្អ" as "លុអ". That is not a
   font problem — every Khmer font renders the same way through jsPDF,
   because the shaping engine, not the typeface, is missing.

   The browser already shapes Khmer correctly: that is why the app reads
   properly on screen. So this builds the report as HTML and hands it to
   the browser's own print engine. The result is a PDF with correct
   Khmer, selectable text, and embedded photos.
   ================================================================== */
(function () {
  'use strict';

  /* The report opens in a blank window, so its base URL is about:blank and
     root-relative paths resolve to nothing. Every asset must be absolute or
     the Khmer webfont silently fails to load — and without the font the
     browser cannot shape Khmer either, which is the very bug this fixes. */
  var ORIGIN = (location && location.origin) ? location.origin : '';
  var FONT_REG = ORIGIN + '/NotoSansKhmer-Regular.woff2';
  var FONT_BOLD = ORIGIN + '/NotoSansKhmer-Bold.woff2';
  var LOGO_URL = ORIGIN + '/logo.png';

  /* Read the Khmer original even when the interface is switched to
     English, so button matching keeps working in both languages. */
  function kmText(el) {
    if (!el) return '';
    var out = '';
    try {
      var tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
      var n;
      while ((n = tw.nextNode())) out += (n.__qcKm !== undefined ? n.__qcKm : n.nodeValue);
    } catch (e) { out = el.textContent || ''; }
    return out;
  }

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function pct(n) { return (Number(n || 0) * 100).toFixed(1) + '%'; }

  function reportNo(prefix) {
    var d = new Date();
    function p(x) { return String(x).padStart(2, '0'); }
    return prefix + '-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
           '-' + p(d.getHours()) + p(d.getMinutes());
  }

  /* ----------------------------- styles ---------------------------- */

  var PRINT_CSS =
    '@font-face{font-family:"ONMART Khmer";src:url("' + FONT_REG + '") format("woff2");' +
      'font-weight:400;font-display:block;}' +
    '@font-face{font-family:"ONMART Khmer";src:url("' + FONT_BOLD + '") format("woff2");' +
      'font-weight:700;font-display:block;}' +
    '#qcPrintRoot{display:none;}' +
    '@media print{' +
      '@page{size:A4;margin:14mm 12mm 16mm 12mm;}' +
      'html.qc-printing body>*{display:none!important;}' +
      'html.qc-printing body>#qcPrintRoot{display:block!important;}' +
      'html.qc-printing #qcPrintRoot{font-family:"ONMART Khmer","Khmer OS",' +
        '"Noto Sans Khmer","Khmer UI",system-ui,sans-serif;font-size:11px;' +
        'color:#12151b;line-height:1.75;}' +
      '#qcPrintRoot .hd{display:flex;align-items:center;gap:12px;' +
        'border-bottom:2px solid #12151b;padding-bottom:8px;margin-bottom:12px;}' +
      '#qcPrintRoot .hd img{height:38px;}' +
      '#qcPrintRoot .hd h1{margin:0;font-size:18px;}' +
      '#qcPrintRoot .hd .sub{margin:2px 0 0;font-size:10.5px;color:#5a5a5a;}' +
      '#qcPrintRoot .meta{font-size:10px;color:#5a5a5a;margin-left:auto;text-align:right;}' +
      '#qcPrintRoot h2{font-size:14px;margin:16px 0 6px;}' +
      '#qcPrintRoot h3{font-size:12.5px;margin:12px 0 4px;}' +
      '#qcPrintRoot table{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:10px;}' +
      '#qcPrintRoot th{background:#12151b!important;color:#fff!important;text-align:left;' +
        'padding:5px 6px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '#qcPrintRoot td{border:1px solid #d7dbe0;padding:5px 6px;vertical-align:top;}' +
      '#qcPrintRoot thead{display:table-header-group;}' +
      '#qcPrintRoot tr{page-break-inside:avoid;}' +
      '#qcPrintRoot .faults th{background:#cf4331!important;}' +
      '#qcPrintRoot .crit{color:#cf4331;font-weight:700;}' +
      '#qcPrintRoot .major{color:#c98a1b;}' +
      '#qcPrintRoot .sum{font-weight:700;font-size:12px;margin:4px 0 10px;}' +
      '#qcPrintRoot .photo{page-break-inside:avoid;margin:0 0 14px;}' +
      '#qcPrintRoot .photo .cap{font-size:10px;color:#5a5a5a;margin-bottom:3px;}' +
      '#qcPrintRoot .photo img{max-width:88mm;max-height:62mm;border:1px solid #d7dbe0;}' +
      '#qcPrintRoot .grid{display:flex;flex-wrap:wrap;gap:10px;}' +
      '#qcPrintRoot .grid .photo{width:88mm;}' +
      '#qcPrintRoot .foot{margin-top:18px;border-top:1px solid #d7dbe0;padding-top:6px;' +
        'font-size:9.5px;color:#8a8a8a;}' +
      '#qcPrintRoot .qblock{width:100%;border-collapse:collapse;margin:0 0 10px;page-break-inside:avoid;font-size:10px;}' +
      '#qcPrintRoot .qblock td{border:1px solid #9aa3ad;padding:5px 7px;vertical-align:top;}' +
      '#qcPrintRoot .qblock .q{width:auto;}' +
      '#qcPrintRoot .qblock .sc{width:22mm;text-align:center;white-space:nowrap;}' +
      '#qcPrintRoot .qhead td{background:#f2f4f7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '#qcPrintRoot .qhead.hdr td{background:#12151b!important;color:#fff!important;font-weight:700;}' +
      '#qcPrintRoot .qmeta{font-size:9px;color:#5a5a5a;margin-top:2px;}' +
      '#qcPrintRoot .qblock .lbl{width:42mm;color:#333;background:#fbfbfc!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '#qcPrintRoot .qblock .d1{padding-left:9mm;}' +
      '#qcPrintRoot .qblock .d2{padding-left:13mm;}' +
      '#qcPrintRoot .qblock .d3{padding-left:17mm;}' +
      '#qcPrintRoot .qblock .dash{color:#9aa3ad;}' +
      '#qcPrintRoot img.ev{max-width:62mm;max-height:48mm;border:1px solid #d7dbe0;margin:2px 6px 2px 0;}' +
      '#qcPrintRoot .qtop{margin-bottom:0;}' +
      '#qcPrintRoot .pagebreak{page-break-before:always;}' +
    '}';

  function head() { return ''; }

  function header(title, sub, no) {
    return '<div class="hd">' +
      '<img src="' + LOGO_URL + '" alt="ON MART">' +
      '<div><h1>' + esc(title) + '</h1><p class="sub">' + esc(sub) + '</p></div>' +
      '<div class="meta">' + esc(no) + '<br>' + esc(new Date().toLocaleString()) + '</div>' +
      '</div>';
  }

  function footer(no) {
    return '<div class="foot">ON MART QC · ' + esc(no) +
      ' · បោះពុម្ពនៅ ' + esc(new Date().toLocaleString()) + '</div>';
  }

  /* One block per finding, in the ON Mart / 7-Eleven audit layout:
     the question with its score, then answer, reason, note and the photo
     evidence for that item — indented so the nesting is visible. Each
     block stays on one page. */
  function faultBlocks(faults, photosByItem) {
    if (!faults || !faults.length) {
      return '<p>គ្មានកំហុសត្រូវបានកត់ត្រា។</p>';
    }
    var mv = window.mcqVal || function () { return ''; };

    return faults.map(function (f) {
      var shots = [];
      if (f.photos && f.photos.length) {
        shots = f.photos.map(function (x) { return x.dataUrl || x.data_url; });
      } else if (photosByItem && f.itemId && photosByItem[f.itemId]) {
        shots = photosByItem[f.itemId].map(function (x) { return x.data_url || x.dataUrl; });
      }

      var photoCell = shots.length
        ? shots.map(function (src) {
            return '<img class="ev" src="' + src + '">';
          }).join('')
        : '<span class="dash">–</span>';

      function row(label, value, depth) {
        // span the two score columns so every row shares one 3-column grid
        return '<tr><td class="lbl d' + depth + '">' + esc(label) + '</td>' +
               '<td class="val" colspan="2">' + value + '</td></tr>';
      }
      function txt(v) {
        return v ? esc(v) : '<span class="dash">–</span>';
      }

      var sev = f.severity === 'critical' ? 'crit' : 'major';

      return '<table class="qblock"><tbody>' +
        '<tr class="qhead"><td class="q">' +
          '<b>' + esc(f.no) + '.</b> ' + esc(f.desc) +
          '<div class="qmeta">' + esc(f.pillar) +
            ' · ការវាយតម្លៃ៖ <span class="' + sev + '">' + esc(f.rating) + '</span></div>' +
        '</td>' +
        '<td class="sc">' + esc(f.max ? Number(f.score).toFixed(1) : '–') + '</td>' +
        '<td class="sc">' + esc(f.max || '–') + '</td></tr>' +
        row('ចម្លើយ / Answer', txt(mv(f, 'answer')), 1) +
        row('មូលហេតុ / Reason', txt(mv(f, 'reason')), 2) +
        row('ហេតុផល / Cause', txt(mv(f, 'cause')), 2) +
        row('កំណត់ចំណាំ / Note', txt(f.notes), 3) +
        row('ភស្តុតាងរូបភាព / Photo', photoCell, 3) +
      '</tbody></table>';
    }).join('');
  }

  function faultHeader() {
    return '<table class="qblock qtop"><tbody><tr class="qhead hdr">' +
      '<td class="q">សំណួរ / Question</td>' +
      '<td class="sc">ពិន្ទុទទួលបាន</td>' +
      '<td class="sc">ពិន្ទុពេញ</td></tr></tbody></table>';
  }

  function photoBlock(photos, titleText) {
    if (!photos || !photos.length) return '';
    var html = '<h3>' + esc(titleText) + '</h3><div class="grid">';
    photos.forEach(function (p, i) {
      var src = p.data_url || p.dataUrl || '';
      var cap = 'រូបទី ' + (i + 1) + (p.item_id ? ' · ' + p.item_id : '');
      html += '<div class="photo"><div class="cap">' + esc(cap) + '</div>' +
              '<img src="' + src + '"></div>';
    });
    return html + '</div>';
  }

  /* --------------------------- open window -------------------------- */

  /* Print from inside the page rather than from a new window.
     A window opened with window.open('') has about:blank as its base, which
     makes the Khmer webfont a cross-origin request and gets it blocked — and
     with no font the browser cannot shape Khmer, which is the exact bug this
     feature exists to fix. Printing in place keeps the already-loaded font
     and avoids pop-up blockers too. */
  function openAndPrint(bodyHtml) {
    var old = document.getElementById('qcPrintRoot');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var oldStyle = document.getElementById('qcPrintStyle');
    if (oldStyle && oldStyle.parentNode) oldStyle.parentNode.removeChild(oldStyle);

    var style = document.createElement('style');
    style.id = 'qcPrintStyle';
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'qcPrintRoot';
    root.setAttribute('data-qc-no-i18n', '1');
    root.innerHTML = bodyHtml;
    document.body.appendChild(root);

    function cleanup() {
      document.documentElement.classList.remove('qc-printing');
      window.removeEventListener('afterprint', cleanup);
      setTimeout(function () {
        if (root.parentNode) root.parentNode.removeChild(root);
        if (style.parentNode) style.parentNode.removeChild(style);
      }, 300);
    }
    window.addEventListener('afterprint', cleanup);

    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    var waiting = imgs.filter(function (im) { return !im.complete; }).length;

    function go() {
      document.documentElement.classList.add('qc-printing');
      setTimeout(function () {
        try { window.focus(); window.print(); } catch (e) {}
        // Safari and some mobile browsers never fire afterprint.
        setTimeout(cleanup, 1500);
      }, 250);
    }

    if (!waiting) { go(); return; }
    var done = 0;
    imgs.forEach(function (im) {
      if (im.complete) return;
      var tick = function () { if (++done >= waiting) go(); };
      im.addEventListener('load', tick);
      im.addEventListener('error', tick);
    });
    setTimeout(go, 6000);   // backstop so a stuck image cannot block printing
  }

  /* ------------------------ current inspection ---------------------- */

  function printCurrent() {
    var totals = (window.computeTotals ? window.computeTotals() : null);
    var faults = (window.getFaults ? window.getFaults() : []);
    if (!totals) { alert('មិនអាចអានទិន្នន័យសវនកម្មបានទេ។'); return; }

    var no = reportNo('QC');
    var store = val('f_store') || '-';
    var html = head() +
      header('របាយការណ៍ត្រួតពិនិត្យគុណភាព QC',
             'ON MART — ' + store, no) +
      '<table><tbody>' +
      '<tr><td><b>ហាង</b></td><td>' + esc(store) + '</td>' +
      '<td><b>កាលបរិច្ឆេទ</b></td><td>' + esc(val('f_date')) + '</td></tr>' +
      '<tr><td><b>វេន</b></td><td>' + esc(val('f_shift')) + '</td>' +
      '<td><b>ម៉ោងចូល / ចេញ</b></td><td>' + esc(val('f_inout')) + '</td></tr>' +
      '<tr><td><b>អ្នកសវនកម្ម</b></td><td>' + esc(val('f_auditor')) + '</td>' +
      '<td><b>អ្នកគ្រប់គ្រងតំបន់</b></td><td>' + esc(val('f_areamgr')) + '</td></tr>' +
      '<tr><td><b>បុគ្គលិកតម្រូវ</b></td><td>' + esc(val('f_reqstaff')) + '</td>' +
      '<td><b>បុគ្គលិកជាក់ស្តែង</b></td><td>' + esc(val('f_actstaff')) + '</td></tr>' +
      '</tbody></table>' +
      '<div class="sum">ពិន្ទុសរុប៖ ' + esc(Number(totals.totalScore).toFixed(1)) + ' / ' +
        esc(totals.totalMax) + '  (' + esc(pct(totals.pct)) + ')   |   លំដាប់ថ្នាក់៖ ' +
        esc(totals.band) + '   |   ធ្លាក់ស្វ័យប្រវត្តិ៖ ' +
        (totals.autoFail ? 'បាទ/ចាស' : 'ទេ') + '</div>' +
      '<h2>ពិន្ទុតាមផ្នែក</h2><table><thead><tr><th>ធាតុផ្សំ</th><th>អតិបរមា</th>' +
        '<th>ពិន្ទុ</th><th>%</th></tr></thead><tbody>' +
      (totals.rows || []).map(function (r) {
        return '<tr><td>' + esc(r.title) + '</td><td>' + esc(r.max) + '</td><td>' +
          esc(Number(r.score).toFixed(1)) + '</td><td>' +
          esc(r.max ? (r.score / r.max * 100).toFixed(1) + '%' : '0%') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h2>កំហុស និងការរកឃើញ (' + faults.length + ')</h2>' +
      faultHeader() + faultBlocks(faults, null);

    openAndPrint(html + footer(no));
  }

  /* ---------------------------- history ----------------------------- */

  function printHistory() {
    var rows = (window.filteredHistory ? window.filteredHistory() : []);
    if (!rows.length) { alert('គ្មានទិន្នន័យសម្រាប់របាយការណ៍ — សូមរក្សាទុកសវនកម្ម ឬពិនិត្យតម្រង។'); return; }

    var groups = {};
    rows.forEach(function (h) { (groups[h.store] = groups[h.store] || []).push(h); });
    var names = Object.keys(groups).sort();
    var no = reportNo('QCH');

    /* Photos live on the server, so collect them first and index them by
       inspection and checklist item. Then each finding can show its own
       evidence inline instead of in a separate pile at the end. */
    var jobs = rows.map(function (h) {
      return (window.fetchPhotosFor ? window.fetchPhotosFor(h.id) : Promise.resolve([]))
        .then(function (ph) { return { id: h.id, photos: ph || [] }; })
        .catch(function () { return { id: h.id, photos: [] }; });
    });

    Promise.all(jobs).then(function (sets) {
      var photoIndex = {};
      var loose = {};
      sets.forEach(function (s) {
        photoIndex[s.id] = {};
        loose[s.id] = [];
        s.photos.forEach(function (ph) {
          var k = ph.item_id || '';
          if (k) {
            (photoIndex[s.id][k] = photoIndex[s.id][k] || []).push(ph);
          } else {
            loose[s.id].push(ph);
          }
        });
      });

      var html = head() +
        header(names.length > 1 ? 'របាយការណ៍ប្រវត្តិសវនកម្មចម្រុះហាង'
                                : 'របាយការណ៍ប្រវត្តិសវនកម្មតាមហាង',
               'ON MART — ' + names.length + ' ហាង, ' + rows.length + ' សវនកម្ម', no);

      if (names.length > 1) {
        html += '<h2>សេចក្តីសង្ខេបតាមហាង</h2><table><thead><tr><th>ហាង</th>' +
          '<th>ចំនួនសវនកម្ម</th><th>ពិន្ទុមធ្យម %</th><th>ធ្លាក់ស្វ័យប្រវត្តិ</th></tr></thead><tbody>';
        names.forEach(function (s) {
          var a = groups[s];
          var avg = a.reduce(function (t2, h) { return t2 + h.pct; }, 0) / a.length * 100;
          html += '<tr><td>' + esc(s) + '</td><td>' + a.length + '</td><td>' +
            avg.toFixed(1) + '%</td><td>' +
            a.filter(function (h) { return h.autoFail; }).length + '</td></tr>';
        });
        html += '</tbody></table>';
      }

      names.forEach(function (s, idx) {
        if (idx > 0) html += '<div class="pagebreak"></div>';
        html += '<h2>ហាង៖ ' + esc(s) + '</h2>';
        var arr = groups[s].slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
        arr.forEach(function (h) {
          html += '<h3>សវនកម្ម ' + esc(h.date) + ' · វេន ' + esc(h.shift || '-') +
            ' · អ្នកសវនកម្ម ' + esc(h.auditor || '-') + '</h3>' +
            '<div class="sum">ពិន្ទុសរុប៖ ' + esc(pct(h.pct)) + '   |   លំដាប់ថ្នាក់៖ ' +
            esc(h.band) + '   |   ធ្លាក់ស្វ័យប្រវត្តិ៖ ' + (h.autoFail ? 'បាទ/ចាស' : 'ទេ') + '</div>' +
            '<table><thead><tr><th>ធាតុផ្សំ</th><th>អតិបរមា</th><th>ពិន្ទុ</th><th>%</th>' +
            '</tr></thead><tbody>' +
            (h.pillarRows || []).map(function (r) {
              return '<tr><td>' + esc(r.title) + '</td><td>' + esc(r.max) + '</td><td>' +
                esc(Number(r.score).toFixed(1)) + '</td><td>' +
                esc(r.max ? (r.score / r.max * 100).toFixed(1) + '%' : '0%') + '</td></tr>';
            }).join('') + '</tbody></table>' +
            '<h3>កំហុស និងការរកឃើញ (' + (h.faults || []).length + ')</h3>' +
            faultHeader() + faultBlocks(h.faults, photoIndex[h.id] || null);

          // Records saved before items carried an id keep their photos here,
          // so nothing from the old data is lost.
          if (loose[h.id] && loose[h.id].length) {
            html += photoBlock(loose[h.id], 'រូបភាពភស្តុតាងផ្សេងទៀត — ' + h.date);
          }
        });
      });

      openAndPrint(html + footer(no));
    });
  }

  /* ----------------------------- buttons ---------------------------- */

  function makeBtn(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-qc-print', '1');
    b.setAttribute('data-qc-no-i18n', '1');
    b.textContent = label;
    b.setAttribute('style', [
      'display:block', 'width:100%', 'text-align:left', 'margin-top:6px',
      'padding:10px 14px', 'border-radius:10px', 'cursor:pointer',
      'border:1px solid #1d4ed8', 'background:#1d4ed8', 'color:#fff',
      'font-family:inherit', 'font-size:14px', 'font-weight:600'
    ].join(';'));
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  /* Take over the existing PDF buttons.
     They are bound with addEventListener to a jsPDF routine that cannot
     shape Khmer, so replacing the node drops that listener and the same
     button now produces the template report with correct Khmer. The
     Word buttons keep their own handler — Word shapes Khmer itself, and
     its builder already uses this layout. */
  function rebind(id, handler, label) {
    var el = document.getElementById(id);
    if (!el || el.getAttribute('data-qc-rebound')) return;
    var clone = el.cloneNode(true);
    clone.setAttribute('data-qc-rebound', '1');
    clone.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      handler();
    });
    if (label) {
      var km = kmText(clone).trim();
      if (km && clone.textContent.trim() === km) clone.textContent = label;
    }
    el.parentNode.replaceChild(clone, el);
  }

  function mount() {
    rebind('btnExportPdf', printCurrent, '📄 របាយការណ៍ PDF (កំហុស)');
    rebind('btnExportHistoryPdf', printHistory, '📄 របាយការណ៍ PDF (ហាងដែលបានជ្រើស)');

    // The separate print buttons added earlier are no longer needed.
    var extra = document.querySelectorAll('[data-qc-print]');
    for (var i = 0; i < extra.length; i++) {
      if (extra[i].parentNode) extra[i].parentNode.removeChild(extra[i]);
    }
  }

  function boot() {
    mount();
    try {
      var pending = false;
      var mo = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        setTimeout(function () { pending = false; mount(); }, 300);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* the interval below covers it */ }
    setInterval(mount, 4000);

    window.qcPrintInspection = printCurrent;
    window.qcPrintHistory = printHistory;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
