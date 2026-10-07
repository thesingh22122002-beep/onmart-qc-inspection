/* ==================================================================
   ON MART QC — Settings page: Save / Edit / Delete
   Loaded by ONE line added to public/qc.html before </body>:

       <script src="/qc-settings-save.js"></script>

   Additive: reads the inputs already on the page, adds a per-row
   toolbar and a bottom save bar. Replaces no function, overwrites no
   variable. If it cannot find the lists it does nothing rather than
   breaking the page.
   ================================================================== */

(function () {
  'use strict';

  var API      = '/api/settings-lists';
  var DRAFT_KEY = 'qc_settings_draft_v1';
  var state = {
    saving: false,
    dirty: false,
    canEdit: false,
    canApprove: false,
    lastSavedAt: null,
    lastSavedBy: null,
    baseline: null,
    requestId: null
  };

  /* ---------------------------------------------------------------- *
   * Finding the two lists.
   *
   * We locate them by their visible Khmer labels rather than by class
   * names or internal variables, so a future restyle of the template
   * does not break saving.
   * ---------------------------------------------------------------- */

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function findColumn(labelText, otherLabel) {
    var all = document.querySelectorAll('label, div, h3, h4, h5, span, strong, p, td, th');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];

      // The same wording appears on hidden panels elsewhere in the app
      // (the inspection form has its own auditor field), so only consider
      // labels that are actually on screen.
      if (!visible(el)) continue;

      // A label is an element that holds text but no inputs of its own.
      if (el.querySelectorAll('input').length > 0) continue;

      var t = (el.textContent || '').trim();
      if (t !== labelText && t.indexOf(labelText) !== 0) continue;
      if (t.length > labelText.length + 40) continue;   // a wrapper, not the label

      // Walk up to the nearest ancestor that actually holds inputs, but
      // reject one that also contains the other column's label — that
      // would be the two-column wrapper, not this column.
      var node = el.parentElement;
      for (var up = 0; node && up < 5; up++) {
        if (node.querySelectorAll('input').length > 0) {
          if (!visible(node)) break;
          if (otherLabel && (node.textContent || '').indexOf(otherLabel) !== -1) break;
          return node;
        }
        node = node.parentElement;
      }
    }
    return null;
  }

  function textInputs(root) {
    if (!root) return [];
    var out = [];
    var list = root.querySelectorAll('input');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var type = (el.type || 'text').toLowerCase();
      if (type === 'text' || type === 'search' || type === '') out.push(el);
    }
    return out;
  }

  function readLists() {
    var storeCol = findColumn('បញ្ជីហាង', 'អ្នកសវនកម្ម');
    var inspCol  = findColumn('អ្នកសវនកម្ម', 'បញ្ជីហាង');

    var storeInputs = textInputs(storeCol);
    var stores = [];
    for (var i = 0; i + 1 < storeInputs.length; i += 2) {
      stores.push({
        code: storeInputs[i].value.trim(),
        name: storeInputs[i + 1].value.trim(),
        _els: [storeInputs[i], storeInputs[i + 1]]
      });
    }

    var inspInputs = textInputs(inspCol);
    var inspectors = [];
    for (var j = 0; j < inspInputs.length; j++) {
      var v = inspInputs[j].value.trim();
      // Skip blanks and the "(បន្ថែមអ្នកសវនកម្ម)" placeholder row.
      if (!v) continue;
      if (v.charAt(0) === '(' && v.charAt(v.length - 1) === ')') continue;
      inspectors.push(v);
    }

    return { stores: stores, inspectors: inspectors, ok: !!storeCol };
  }

  function signature(lists) {
    var s = lists.stores.map(function (x) { return x.code + '\u0001' + x.name; }).join('\u0002');
    return s + '\u0003' + lists.inspectors.join('\u0002');
  }

  /* ---------------------------------------------------------------- *
   * The bar
   * ---------------------------------------------------------------- */

  var bar, btn, status, note;

  function buildBar() {
    bar = document.createElement('div');
    bar.id = 'qcSettingsSaveBar';
    bar.setAttribute('style', [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:9000',
      'display:flex', 'align-items:center', 'gap:14px', 'flex-wrap:wrap',
      'padding:11px 18px', 'background:#ffffff',
      'border-top:1px solid #e2e8f0',
      'box-shadow:0 -4px 18px rgba(15,23,42,.10)',
      'font-family:inherit', 'font-size:14px'
    ].join(';'));

    status = document.createElement('div');
    status.setAttribute('style', 'flex:1;min-width:200px;line-height:1.5;');

    note = document.createElement('div');
    note.setAttribute('style', 'font-size:12.5px;color:#64748b;');

    btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('style', [
      'padding:9px 22px', 'border-radius:10px', 'border:0',
      'background:#1d4ed8', 'color:#fff', 'font-size:14px',
      'font-family:inherit', 'cursor:pointer', 'font-weight:600'
    ].join(';'));
    btn.textContent = 'រក្សាទុក / Save';
    btn.addEventListener('click', save);

    var revert = document.createElement('button');
    revert.type = 'button';
    revert.setAttribute('style', [
      'padding:9px 16px', 'border-radius:10px', 'border:1px solid #cbd5e1',
      'background:#fff', 'color:#334155', 'font-size:13.5px',
      'font-family:inherit', 'cursor:pointer'
    ].join(';'));
    revert.textContent = 'ផ្ទុកឡើងវិញ / Reload';
    revert.addEventListener('click', function () {
      if (state.dirty && !window.confirm(
        'អ្នកមានការកែប្រែដែលមិនទាន់រក្សាទុក។ ផ្ទុកឡើងវិញនឹងបោះបង់ការកែប្រែទាំងនោះ។ បន្តទេ?'
      )) return;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      location.reload();
    });

    var pull = document.createElement('button');
    pull.type = 'button';
    pull.setAttribute('style', [
      'padding:9px 16px', 'border-radius:10px', 'border:1px solid #93c5fd',
      'background:#eff6ff', 'color:#1e40af', 'font-size:13.5px',
      'font-family:inherit', 'cursor:pointer'
    ].join(';'));
    pull.textContent = '⭳ ទាញពីម៉ាស៊ីនបម្រើ';
    pull.title = 'បំពេញបញ្ជីឡើងវិញពីមូលដ្ឋានទិន្នន័យ';
    pull.addEventListener('click', restoreFromServer);

    var left = document.createElement('div');
    left.setAttribute('style', 'flex:1;min-width:220px;');
    left.appendChild(status);
    left.appendChild(note);

    bar.appendChild(left);
    bar.appendChild(pull);
    bar.appendChild(revert);
    bar.appendChild(btn);
    document.body.appendChild(bar);

    // Keep the bar from covering the last row of the form.
    spacer = document.createElement('div');
    spacer.setAttribute('style', 'height:72px;');
    document.body.appendChild(spacer);

    positionBar();
    window.addEventListener('resize', positionBar);
    setInterval(positionBar, 2000);   // the sync pill appears and resizes
  }

  /* The template already has its own fixed sync bar at the bottom right.
     Sit above it rather than underneath, or the Save button ends up
     hidden behind it. */
  var spacer;
  function positionBar() {
    if (!bar) return;
    var other = document.getElementById('qcSyncBar');
    var lift = 0;
    if (other && visible(other)) {
      var r = other.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 120) lift = Math.round(r.height) + 18;
    }
    bar.style.bottom = lift + 'px';
    if (spacer) spacer.style.height = (bar.offsetHeight + lift + 14) + 'px';
  }

  function stamp(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    function p(n) { return (n < 10 ? '0' : '') + n; }
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return p(d.getDate()) + '-' + m[d.getMonth()] + '-' + d.getFullYear() +
           ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function render() {
    if (!bar) return;

    if (!state.canEdit) {
      if (state.signedOut) {
        status.innerHTML = '<span style="color:#b91c1c">' +
          'សម័យប្រើប្រាស់បានផុតកំណត់ — សូមចូលប្រើម្ដងទៀត។</span>';
        note.textContent = 'Signed out. Sign in again to save.';
      } else {
        status.innerHTML = '<span style="color:#92400e">' +
          'អ្នកមិនមានសិទ្ធិរក្សាទុកបញ្ជីនេះទេ — ការកែប្រែនៅក្នុងឧបករណ៍នេះប៉ុណ្ណោះ។</span>';
        note.textContent = 'Read-only: changes stay on this device and are not shared.';
      }
      btn.disabled = true;
      btn.style.background = '#94a3b8';
      btn.style.cursor = 'not-allowed';
      return;
    }

    btn.disabled = state.saving || !state.dirty;
    btn.style.background = btn.disabled ? '#94a3b8' : '#1d4ed8';
    btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
    btn.textContent = state.saving
      ? 'កំពុងរក្សាទុក…'
      : (state.canApprove ? 'រក្សាទុក / Save' : 'ដាក់ស្នើ / Submit');

    if (state.saving) {
      status.innerHTML = '<strong>កំពុងរក្សាទុកការកែប្រែ…</strong>';
      note.textContent = 'Saving your changes…';
    } else if (state.dirty) {
      status.innerHTML = '<strong style="color:#b45309">' +
        'មានការកែប្រែដែលមិនទាន់រក្សាទុក</strong>';
      note.textContent = 'You have unsaved changes.';
    } else if (state.lastSavedAt) {
      status.innerHTML = '<strong style="color:#15803d">✓ បានរក្សាទុក</strong>';
      note.textContent = 'Last Updated: ' + stamp(state.lastSavedAt) +
        (state.lastSavedBy ? '  ·  Updated By: ' + state.lastSavedBy : '');
    } else {
      status.innerHTML = 'បញ្ជីត្រូវបានធ្វើសមកាលកម្មជាមួយម៉ាស៊ីនបម្រើ';
      note.textContent = 'In sync with the server.';
    }
  }

  function markDirty() {
    var lists = readLists();
    var sig = signature(lists);
    state.dirty = state.baseline !== null && sig !== state.baseline;
    if (state.dirty) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          stores: lists.stores.map(function (s) { return { code: s.code, name: s.name }; }),
          inspectors: lists.inspectors,
          at: new Date().toISOString()
        }));
      } catch (e) { /* storage may be unavailable */ }
    }
    render();
  }

  function clearRowErrors() {
    var marked = document.querySelectorAll('[data-qc-row-error="1"]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].style.border = '';
      marked[i].style.background = '';
      marked[i].removeAttribute('data-qc-row-error');
    }
  }

  function flagRows(rows, lists) {
    clearRowErrors();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var entry = lists.stores[r.row];
      if (!entry || !entry._els) continue;
      var el = r.field === 'code' ? entry._els[0] : entry._els[1];
      if (!el) continue;
      el.style.border = '1.5px solid #dc2626';
      el.style.background = '#fef2f2';
      el.setAttribute('data-qc-row-error', '1');
      if (i === 0 && el.scrollIntoView) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }
  }

  /* ---------------------------------------------------------------- *
   * Per-row toolbar: កែ (Edit) · រក្សាទុក (Save) · លុប (Delete)
   *
   * Rows that already hold data start locked, so a stray keystroke
   * cannot quietly change a store name. Edit unlocks one row at a time.
   * ---------------------------------------------------------------- */

  function commonAncestor(a, b) {
    var seen = [];
    for (var n = a; n; n = n.parentElement) seen.push(n);
    for (var m = b; m; m = m.parentElement) {
      if (seen.indexOf(m) !== -1) return m;
    }
    return a.parentElement;
  }

  function miniBtn(label, bg, fg, border) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-qc-btn', '1');
    b.textContent = label;
    b.setAttribute('style', [
      'padding:4px 10px', 'margin-left:4px', 'border-radius:7px',
      'font-size:12px', 'font-family:inherit', 'cursor:pointer',
      'white-space:nowrap',
      'border:1px solid ' + border, 'background:' + bg, 'color:' + fg
    ].join(';'));
    return b;
  }

  function setLocked(row, locked) {
    var ins = row.__qcInputs || [];
    for (var i = 0; i < ins.length; i++) {
      ins[i].readOnly = locked;
      ins[i].style.background = locked ? '#f8fafc' : '';
      ins[i].style.color = locked ? '#475569' : '';
    }
    row.__qcLocked = locked;
    if (row.__qcEditBtn) {
      row.__qcEditBtn.textContent = locked ? 'កែ' : 'កំពុងកែ';
      row.__qcEditBtn.style.background = locked ? '#fff' : '#fef3c7';
    }
    if (row.__qcSaveBtn) {
      row.__qcSaveBtn.style.opacity = locked ? '0.45' : '1';
      row.__qcSaveBtn.style.cursor = locked ? 'not-allowed' : 'pointer';
    }
  }

  function rowStatus(row, text, color) {
    if (!row.__qcStatus) return;
    row.__qcStatus.textContent = text || '';
    row.__qcStatus.style.color = color || '#64748b';
    if (text) {
      clearTimeout(row.__qcStatusTimer);
      row.__qcStatusTimer = setTimeout(function () {
        if (row.__qcStatus) row.__qcStatus.textContent = '';
      }, 4000);
    }
  }

  function patch(payload) {
    return fetch(API, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; });
    });
  }

  function saveRow(row) {
    if (row.__qcLocked || row.__qcBusy) return;
    var ins = row.__qcInputs;
    var payload;

    if (row.__qcKind === 'store') {
      payload = {
        op: 'upsert', kind: 'store',
        code: ins[0].value.trim(),
        name: ins[1].value.trim(),
        originalCode: row.__qcOriginal[0],
        requestId: newRequestId()
      };
      if (!payload.code || !payload.name) {
        rowStatus(row, 'ត្រូវការលេខកូដ និងឈ្មោះ', '#dc2626');
        return;
      }
    } else {
      payload = {
        op: 'upsert', kind: 'inspector',
        name: ins[0].value.trim(),
        originalName: row.__qcOriginal[0],
        requestId: newRequestId()
      };
      if (!payload.name) {
        rowStatus(row, 'ត្រូវការឈ្មោះ', '#dc2626');
        return;
      }
    }

    row.__qcBusy = true;
    rowStatus(row, 'កំពុងរក្សាទុក…', '#2563eb');

    patch(payload).then(function (res) {
      row.__qcBusy = false;
      if (!res.ok) {
        rowStatus(row, res.body.error || 'រក្សាទុកមិនបាន', '#dc2626');
        if (res.body.field === 'code' && ins[0]) ins[0].style.border = '1.5px solid #dc2626';
        if (res.body.field === 'name' && ins[1]) ins[1].style.border = '1.5px solid #dc2626';
        return;
      }
      for (var i = 0; i < ins.length; i++) ins[i].style.border = '';
      row.__qcOriginal = ins.map(function (el) { return el.value.trim(); });
      setLocked(row, true);
      rowStatus(row, res.body.queued ? '⏳ ដាក់ស្នើរួច' : '✓ រក្សាទុករួច',
                res.body.queued ? '#b45309' : '#15803d');
      state.baseline = signature(readLists());
      markDirty();
    }).catch(function (e) {
      row.__qcBusy = false;
      rowStatus(row, 'បណ្ដាញមានបញ្ហា — ទិន្នន័យចាស់នៅដដែល', '#dc2626');
    });
  }

  function deleteRow(row) {
    if (row.__qcBusy) return;
    var ins = row.__qcInputs;
    var label = row.__qcKind === 'store'
      ? (row.__qcOriginal[0] || ins[0].value) + ' — ' + (row.__qcOriginal[1] || ins[1].value)
      : (row.__qcOriginal[0] || ins[0].value);

    var isNew = !row.__qcOriginal[0];
    if (isNew) {                       // never saved — just drop it locally
      clickTemplateRemove(row);
      markDirty();
      return;
    }

    if (!window.confirm(
      'លុប "' + label + '" ចេញពីបញ្ជីមែនទេ?\n\n' +
      'វានឹងត្រូវកំណត់ជាអសកម្ម មិនមែនលុបចោលទាំងស្រុងទេ។\n' +
      'ទិន្នន័យត្រួតពិនិត្យចាស់ដែលយោងទៅវានៅតែរក្សាទុកដដែល។'
    )) return;

    row.__qcBusy = true;
    rowStatus(row, 'កំពុងលុប…', '#2563eb');

    var payload = row.__qcKind === 'store'
      ? { op: 'delete', kind: 'store', originalCode: row.__qcOriginal[0], requestId: newRequestId() }
      : { op: 'delete', kind: 'inspector', originalName: row.__qcOriginal[0], requestId: newRequestId() };

    patch(payload).then(function (res) {
      row.__qcBusy = false;
      if (!res.ok) {
        rowStatus(row, res.body.error || 'លុបមិនបាន', '#dc2626');
        return;
      }
      if (res.body.queued) {
        rowStatus(row, '⏳ ដាក់ស្នើសុំការអនុម័ត', '#b45309');
        return;
      }
      clickTemplateRemove(row);
      state.baseline = signature(readLists());
      markDirty();
    }).catch(function () {
      row.__qcBusy = false;
      rowStatus(row, 'បណ្ដាញមានបញ្ហា — គ្មានអ្វីត្រូវបានលុបទេ', '#dc2626');
    });
  }

  /* Use the template's own ✕ so its internal list stays in step with
     the DOM; fall back to removing the row if there is no such button. */
  function clickTemplateRemove(row) {
    var btns = row.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (!btns[i].getAttribute('data-qc-btn')) { btns[i].click(); break; }
    }
    // If the template did not remove the row itself, take it out directly
    // so the screen never disagrees with what the server now holds.
    setTimeout(function () {
      if (row.parentElement) row.parentElement.removeChild(row);
      state.baseline = signature(readLists());
      markDirty();
    }, 60);
  }

  /* The element that represents one row: the closest ancestor that still
     holds only this row's inputs. Climbing any further would capture the
     neighbouring rows as well. */
  function rowFor(input, col, expected) {
    var node = input;
    while (node.parentElement && node.parentElement !== col) {
      if (textInputs(node.parentElement).length > expected) break;
      node = node.parentElement;
    }
    return node;
  }

  function decorateRow(row, kind, inputs) {
    if (row.getAttribute('data-qc-row') === '1') return;
    row.setAttribute('data-qc-row', '1');
    row.__qcKind = kind;
    row.__qcInputs = inputs;
    row.__qcOriginal = inputs.map(function (el) { return el.value.trim(); });

    var bar = document.createElement('span');
    bar.setAttribute('data-qc-btn', '1');
    bar.setAttribute('style', 'display:inline-flex;align-items:center;margin-left:6px;');

    var edit = miniBtn('កែ', '#fff', '#334155', '#cbd5e1');
    var save = miniBtn('រក្សាទុក', '#1d4ed8', '#fff', '#1d4ed8');
    var del  = miniBtn('លុប', '#fff', '#b91c1c', '#fca5a5');

    var status = document.createElement('span');
    status.setAttribute('style', 'margin-left:8px;font-size:11.5px;white-space:nowrap;');

    row.__qcEditBtn = edit;
    row.__qcSaveBtn = save;
    row.__qcStatus = status;

    edit.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setLocked(row, !row.__qcLocked);
      if (!row.__qcLocked && inputs[0]) inputs[0].focus();
    });
    save.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      saveRow(row);
    });
    del.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      deleteRow(row);
    });

    bar.appendChild(edit);
    bar.appendChild(save);
    bar.appendChild(del);
    bar.appendChild(status);
    row.appendChild(bar);

    // The template's own ✕ removes the row on this device only, which
    // looks like a delete but is undone by the next page load. Hide it so
    // there is one delete, the one that reaches the database. It is only
    // hidden, not removed, so the delete below can still drive it.
    var btns = row.querySelectorAll('button');
    for (var b = 0; b < btns.length; b++) {
      if (!btns[b].getAttribute('data-qc-btn')) {
        btns[b].style.display = 'none';
        btns[b].setAttribute('data-qc-hidden', '1');
      }
    }

    // A row with existing data starts locked; a freshly added blank row
    // is left open so the user can type straight into it.
    setLocked(row, row.__qcOriginal.some(function (v) { return !!v; }));
  }

  function decorateRows() {
    if (!state.canEdit) return;
    var storeCol = findColumn('បញ្ជីហាង', 'អ្នកសវនកម្ម');
    var inspCol  = findColumn('អ្នកសវនកម្ម', 'បញ្ជីហាង');

    var si = textInputs(storeCol);
    for (var i = 0; i + 1 < si.length; i += 2) {
      decorateRow(commonAncestor(si[i], si[i + 1]), 'store', [si[i], si[i + 1]]);
    }

    var ii = textInputs(inspCol);
    for (var j = 0; j < ii.length; j++) {
      decorateRow(rowFor(ii[j], inspCol, 1), 'inspector', [ii[j]]);
    }
  }

  /* ---------------------------------------------------------------- *
   * Restore from server.
   *
   * The template keeps its lists in this browser. Signing out, clearing
   * site data or opening the app on a new device leaves the page empty
   * even though the server still holds everything. This refills the page
   * from the database.
   * ---------------------------------------------------------------- */

  function addButtonIn(col) {
    if (!col) return null;
    var btns = col.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-qc-btn')) continue;
      var t = (btns[i].textContent || '').trim();
      if (t.charAt(0) === '+' || t.indexOf('បន្ថែម') !== -1) return btns[i];
    }
    return null;
  }

  function setValue(el, v) {
    el.readOnly = false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function wait(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  /* Write the server's lists onto the page, growing the lists first so
     there is a row for every record. */
  function applyServerLists(srvStores, srvInsp) {
    var storeCol = findColumn('បញ្ជីហាង', 'អ្នកសវនកម្ម');
    var inspCol = findColumn('អ្នកសវនកម្ម', 'បញ្ជីហាង');
    var addStore = addButtonIn(storeCol);
    var addInsp = addButtonIn(inspCol);

    function grow(btn, col, perRow, want) {
      var have = Math.floor(textInputs(col).length / perRow);
      if (!btn || have >= want) return Promise.resolve();
      btn.click();
      return wait(70).then(function () { return grow(btn, col, perRow, want); });
    }

    return grow(addStore, storeCol, 2, srvStores.length)
      .then(function () { return grow(addInsp, inspCol, 1, srvInsp.length); })
      .then(function () { return wait(140); })
      .then(function () {
        var si = textInputs(findColumn('បញ្ជីហាង', 'អ្នកសវនកម្ម'));
        for (var i = 0; i < srvStores.length && (i * 2 + 1) < si.length; i++) {
          setValue(si[i * 2], srvStores[i].code);
          setValue(si[i * 2 + 1], srvStores[i].name);
        }
        var ii = textInputs(findColumn('អ្នកសវនកម្ម', 'បញ្ជីហាង'));
        for (var j = 0; j < srvInsp.length && j < ii.length; j++) {
          setValue(ii[j], srvInsp[j]);
        }
        return wait(160);
      })
      .then(function () {
        decorateRows();
        resyncRows();
        state.baseline = signature(readLists());
        state.dirty = false;
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      });
  }

  /* After the page has been refilled from the server, each row's "value
     before editing" must be re-read. Without this a row that arrived from
     the server still carries the blank original it was decorated with, so
     saving it would be treated as a new record rather than an update. */
  function resyncRows() {
    var rows = document.querySelectorAll('[data-qc-row="1"]');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.__qcInputs) continue;
      r.__qcOriginal = r.__qcInputs.map(function (el) { return el.value.trim(); });
      setLocked(r, r.__qcOriginal.some(function (v) { return !!v; }));
      rowStatus(r, '', '');
    }
  }

  /* Does what is on screen already match the server? */
  function matchesServer(srvStores, srvInsp) {
    var l = readLists();
    if (l.stores.length < srvStores.length) return false;
    for (var i = 0; i < srvStores.length; i++) {
      var row = l.stores[i];
      if (!row || row.code !== srvStores[i].code || row.name !== srvStores[i].name) return false;
    }
    for (var j = 0; j < srvInsp.length; j++) {
      if (l.inspectors.indexOf(srvInsp[j]) === -1) return false;
    }
    return true;
  }

  /**
   * On opening the page, make the screen agree with the database.
   *
   * The template keeps its lists in this browser, so a record saved on
   * one device is invisible on another until the page is told about it.
   * The server is the source of truth, so pull from it — but never over
   * unsaved edits, and never from an empty server, which would blank a
   * list that is actually fine.
   */
  function autoSync(srvStores, srvInsp) {
    if (state.autoSynced || state.dirty || state.saving) return;
    if (!srvStores || srvStores.length === 0) return;
    if (matchesServer(srvStores, srvInsp || [])) { state.autoSynced = true; return; }

    state.autoSynced = true;
    applyServerLists(srvStores, srvInsp || []).then(function () {
      render();
      if (note) {
        note.textContent = 'បានទាញពីម៉ាស៊ីនបម្រើ · ហាង ' + srvStores.length +
                           ' · អ្នកសវនកម្ម ' + (srvInsp || []).length;
      }
    });
  }

  /* Still reachable from the console if a list ever needs forcing back:
     qcSettingsRestore() */
  try { window.qcSettingsRestore = function () { return restoreFromServer(); }; } catch (e) {}

  function restoreFromServer() {
    if (state.saving) return;
    if (state.dirty && !window.confirm(
      'អ្នកមានការកែប្រែដែលមិនទាន់រក្សាទុក។ ការទាញពីម៉ាស៊ីនបម្រើនឹងសរសេរជាន់លើវា។ បន្តទេ?'
    )) return;

    state.saving = true;
    render();

    fetch(API, { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.body.error || 'មិនអាចទាញទិន្នន័យបាន');
        var srvStores = res.body.stores || [];
        var srvInsp = res.body.inspectors || [];
        if (srvStores.length === 0 && srvInsp.length === 0) {
          throw new Error('ម៉ាស៊ីនបម្រើគ្មានទិន្នន័យទេ');
        }
        return applyServerLists(srvStores, srvInsp).then(function () {
          state.saving = false;
          render();
          window.alert(
            'បានទាញពីម៉ាស៊ីនបម្រើ៖\n' +
            'ហាង ' + srvStores.length + ' · អ្នកសវនកម្ម ' + srvInsp.length
          );
        });
      })
      .catch(function (e) {
        state.saving = false;
        render();
        window.alert('ទាញមិនបាន៖ ' + (e && e.message ? e.message : e));
      });
  }

  /* ---------------------------------------------------------------- *
   * Save
   * ---------------------------------------------------------------- */

  function newRequestId() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'rq-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
  }

  function save() {
    if (state.saving || !state.canEdit) return;        // duplicate-click guard
    var lists = readLists();
    if (!lists.ok) {
      window.alert('រកមិនឃើញបញ្ជីហាងនៅលើទំព័រនេះទេ។');
      return;
    }

    clearRowErrors();

    // Refuse to send an empty list — that would deactivate every store.
    var filled = lists.stores.filter(function (s) { return s.code || s.name; });
    if (filled.length === 0) {
      window.alert('បញ្ជីហាងទទេ។ ការរក្សាទុកត្រូវបានបញ្ឈប់ដើម្បីការពារទិន្នន័យដែលមានស្រាប់។');
      return;
    }

    if (!state.requestId) state.requestId = newRequestId();
    state.saving = true;
    render();

    fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        stores: filled.map(function (s) { return { code: s.code, name: s.name }; }),
        inspectors: lists.inspectors,
        requestId: state.requestId
      })
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, ok: r.ok, body: j }; });
    }).then(function (res) {
      state.saving = false;

      if (res.status === 422 && res.body.rows) {
        flagRows(res.body.rows, lists);
        window.alert((res.body.error || 'Please correct the highlighted rows before saving.'));
        render();
        return;
      }
      if (res.status === 401) {
        window.alert('សម័យប្រើប្រាស់បានផុតកំណត់។ សូមចូលម្តងទៀត។\nYour session expired. Please sign in again.');
        render();
        return;
      }
      if (res.status === 403) {
        state.canEdit = false;
        render();
        return;
      }
      if (!res.ok) {
        window.alert(
          (res.body.messageKm || 'ការរក្សាទុកមិនបានសម្រេច។') + '\n' +
          (res.body.message || 'Your previous data is still safe. No changes were applied.')
        );
        render();
        return;
      }

      state.requestId = null;

      if (res.body.queued) {
        state.dirty = false;
        state.baseline = signature(readLists());
        try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
        window.alert('បានដាក់ស្នើសុំការអនុម័ត។\nSubmitted for approval.');
        render();
        return;
      }

      state.dirty = false;
      state.baseline = signature(readLists());
      state.lastSavedAt = res.body.savedAt;
      state.lastSavedBy = res.body.savedBy;
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}

      var s = res.body.summary || {};
      if (s.deactivated) {
        window.alert(
          'បានរក្សាទុក។\n' +
          'ហាង ' + s.deactivated + ' ត្រូវបានដកចេញពីបញ្ជី ហើយកំណត់ជាអសកម្ម។\n' +
          'ទិន្នន័យត្រួតពិនិត្យចាស់របស់ពួកវានៅតែរក្សាទុកដដែល។'
        );
      }
      render();
    }).catch(function (e) {
      state.saving = false;
      window.alert(
        'ការរក្សាទុកមិនបានសម្រេច។ ទិន្នន័យមុនរបស់អ្នកនៅតែមានសុវត្ថិភាព។\n' +
        'Save failed. Your previous data is still safe. ' + (e && e.message ? e.message : '')
      );
      render();
    });
  }

  /* ---------------------------------------------------------------- *
   * Start up
   * ---------------------------------------------------------------- */

  /* Ask the server who we are and what we may do. A 401 means the session
     has expired, which is a different problem from lacking permission, so
     the two are reported differently. Re-checked periodically because a
     session can expire while the page stays open. */
  function refreshPermissions() {
    return fetch(API, { cache: 'no-store' })
      .then(function (r) {
        state.signedOut = (r.status === 401);
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        var was = state.canEdit;
        state.canEdit = !!(j && j.canEdit);
        state.canApprove = !!(j && j.canApprove);
        if (state.canEdit && !was) decorateRows();
        render();
        // The GET already carries the lists, so no second round trip.
        if (j) autoSync(j.stores, j.inspectors);
      })
      .catch(function () { render(); });
  }

  /* The bottom bar is switched off: saving happens per row, and the page
     pulls from the server by itself, so a bulk Save/Reload strip added
     nothing but clutter. Set this to true to bring it back. */
  var SHOW_BOTTOM_BAR = false;

  function attach() {
    var lists = readLists();
    if (!lists.ok) return false;

    if (SHOW_BOTTOM_BAR) buildBar();
    state.baseline = signature(lists);

    // Catch typing, row add and row delete alike.
    document.addEventListener('input', function (e) {
      if (e.target && e.target.tagName === 'INPUT') markDirty();
    }, true);
    document.addEventListener('click', function () {
      setTimeout(markDirty, 60);
    }, true);

    window.addEventListener('beforeunload', function (e) {
      if (!state.dirty) return undefined;
      e.preventDefault();
      e.returnValue = '';
      return '';
    });

    refreshPermissions();

    render();
    return true;
  }

  /* The Settings panel is rendered only once its tab is opened, and rows
     appear and disappear as the user works, so keep watching rather than
     giving up after a fixed number of tries. */
  var attached = false;
  function sweep() {
    if (!attached) {
      attached = attach();
    } else {
      decorateRows();
      positionBar();
    }
  }

  function boot() {
    sweep();
    try {
      var mo = new MutationObserver(function () {
        clearTimeout(window.__qcSweepTimer);
        window.__qcSweepTimer = setTimeout(sweep, 150);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* older browsers fall back to the interval below */ }
    setInterval(sweep, 1500);
    // Pick up a sign-in that happened in another tab.
    setInterval(function () { if (attached) refreshPermissions(); }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
