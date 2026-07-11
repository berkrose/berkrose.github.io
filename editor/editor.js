// ─── EDITOR.JS ──────────────────────────────────────────────────────────────
// On-page editing overlay for the portfolio site. Injected by editor/server.js
// only - never part of the published site. All DOM the editor creates carries
// a data-editor attribute and "ed-" class prefix, and is never written back
// into CONTENT (commits store text values only).
// ────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // Only run when served by the editor server (never from disk / the live site).
  if (location.protocol === 'file:') return;
  if (typeof CONTENT === 'undefined') return;

  // ── State ─────────────────────────────────────────────────────────────────
  // The working draft IS the global CONTENT object: render-projects.js and
  // content-loader.js read the bare CONTENT binding, so mutating it keeps the
  // page live. A pristine deep clone is kept for reference/reverts.
  var draft = CONTENT;
  var pristine = JSON.parse(JSON.stringify(CONTENT));
  var unsaved = false;
  var serverStatus = null;
  var editing = null; // { el, path, prevValue, prevHTML, multiline }
  var statusEl = null;
  var statusDot = null;
  var modalState = null; // { key } while photo manager is open
  var suppressUnloadWarning = false;

  var isHomePage = null; // resolved on init
  var currentPageId = null;

  // Undo/redo: JSON snapshots of the whole draft. lastSaved is the snapshot of
  // the most recently saved state, used to derive the "unsaved" flag truthfully
  // (so undoing back to the saved state clears it).
  var undoStack = [];
  var redoStack = [];
  var lastSaved = null;
  var undoBtn = null;
  var redoBtn = null;
  var sidebar = null;
  var sidebarPanel = null;
  var breadcrumbEl = null;
  var selectedSection = null;
  var activeWorkspaceTab = 'pages';
  var autosaveTimer = null;
  var saveInFlight = null;
  var autosaveState = 'saved';
  var CLIPBOARD_KEY = 'portfolio-editor-clipboard';
  var TEMPLATE_KEY = 'portfolio-editor-section-templates';
  var tokenMeta = document.querySelector('meta[name="portfolio-editor-token"]');
  var sessionToken = tokenMeta ? tokenMeta.getAttribute('content') : '';

  // ── Small helpers ─────────────────────────────────────────────────────────
  function getPath(obj, path) {
    return path.split('.').reduce(function (cur, key) {
      if (cur === undefined || cur === null) return undefined;
      return cur[isNaN(key) ? key : Number(key)];
    }, obj);
  }

  function setPath(obj, path, value) {
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = Array.isArray(cur) ? Number(parts[i]) : parts[i];
      if (cur[k] === undefined || cur[k] === null) {
        cur[k] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      }
      cur = cur[k];
    }
    var last = parts[parts.length - 1];
    cur[Array.isArray(cur) ? Number(last) : last] = value;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    node.setAttribute('data-editor', '');
    return node;
  }

  function api(path, body) {
    return fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portfolio-Editor-Token': sessionToken
      },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  // ── Toasts ────────────────────────────────────────────────────────────────
  var toastHost = null;
  function toast(msg, type, ms) {
    if (!toastHost) {
      toastHost = make('div', 'ed-toasts');
      document.body.appendChild(toastHost);
    }
    var t = make('div', 'ed-toast' + (type ? ' ed-toast-' + type : ''), msg);
    toastHost.appendChild(t);
    setTimeout(function () {
      t.classList.add('ed-toast-out');
      setTimeout(function () { t.remove(); }, 400);
    }, ms || 3800);
  }

  // ── Undo / redo history ─────────────────────────────────────────────────────
  function snapshot() {
    return JSON.stringify(draft);
  }

  // Restore a snapshot IN PLACE - draft/CONTENT is a const binding shared with
  // render-projects.js and content-loader.js, so it must never be reassigned.
  function restoreState(json) {
    var parsed = JSON.parse(json);
    Object.keys(draft).forEach(function (k) { delete draft[k]; });
    Object.assign(draft, parsed);
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  // Re-render everything from the restored draft and refresh editor chrome.
  function afterRestore() {
    // Close any open photo modal without a mid-restore rerender.
    var modal = document.getElementById('ed-photo-modal');
    if (modal) modal.remove();
    modalState = null;
    if (typeof window.applyTheme === 'function') window.applyTheme(draft.theme || null);
    if (typeof window.applyContent === 'function') window.applyContent();
    if (typeof window.renderSections === 'function') window.renderSections();
    rerender();
    markUnsaved();
    updateHistoryButtons();
  }

  function undo() {
    if (editing) commitEdit();
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restoreState(undoStack.pop());
    afterRestore();
  }

  function redo() {
    if (editing) commitEdit();
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restoreState(redoStack.pop());
    afterRestore();
  }

  // ── Status ────────────────────────────────────────────────────────────────
  // "unsaved" is derived: true whenever the draft differs from the last saved
  // snapshot. Callers still invoke markUnsaved() after mutating.
  function markUnsaved() {
    unsaved = (lastSaved !== null && snapshot() !== lastSaved);
    if (unsaved) scheduleAutosave();
    updateStatusText();
  }

  function scheduleAutosave(delay) {
    clearTimeout(autosaveTimer);
    autosaveState = 'pending';
    autosaveTimer = setTimeout(function () { save({ silent: true }); }, delay || 1400);
  }

  function refreshStatus() {
    return fetch('/api/status', {
      headers: { 'X-Portfolio-Editor-Token': sessionToken }
    }).then(function (r) { return r.json(); })
      .then(function (s) { serverStatus = s; updateStatusText(); })
      .catch(function () { updateStatusText(); });
  }

  function updateStatusText() {
    if (!statusEl) return;
    var text, dotClass;
    if (autosaveState === 'saving') {
      text = 'Saving...';
      dotClass = 'ed-dot ed-dot-unsaved';
    } else if (unsaved) {
      text = autosaveState === 'pending' ? 'Autosave pending' : 'Unsaved changes';
      dotClass = 'ed-dot ed-dot-unsaved';
    } else if (serverStatus && (serverStatus.dirty || serverStatus.aheadCount > 0)) {
      text = 'Saved - not published yet';
      dotClass = 'ed-dot ed-dot-unpublished';
    } else {
      text = 'All changes saved';
      dotClass = 'ed-dot';
    }
    statusEl.textContent = text;
    statusDot.className = dotClass;
  }

  // ── Save / Publish / Discard ──────────────────────────────────────────────
  function save(options) {
    options = options || {};
    if (editing) commitEdit();
    clearTimeout(autosaveTimer);
    if (saveInFlight) {
      scheduleAutosave(250);
      return saveInFlight;
    }
    var sentSnapshot = snapshot();
    autosaveState = 'saving';
    updateStatusText();
    saveInFlight = api('/api/content', JSON.parse(sentSnapshot)).then(function (res) {
      if (res.ok) {
        lastSaved = sentSnapshot;
        unsaved = snapshot() !== lastSaved;
        autosaveState = unsaved ? 'pending' : 'saved';
        if (!options.silent) toast('Saved', 'ok', 2200);
        if (unsaved) scheduleAutosave(300);
        return refreshStatus();
      }
      autosaveState = 'error';
      toast('Could not save: ' + (res.data.error || 'unknown error'), 'error', 6000);
    }).catch(function (e) {
      autosaveState = 'error';
      toast('Could not save: ' + e.message, 'error', 6000);
    }).finally(function () {
      saveInFlight = null;
      updateStatusText();
    });
    return saveInFlight;
  }

  function formatRevisionDate(value) {
    try {
      return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (e) {
      return value;
    }
  }

  function restoreRevision(id, backdrop) {
    if (!confirm('Restore this revision? Your current draft is already preserved in revision history.')) return;
    var preserveCurrent = unsaved ? save({ silent: true }) : Promise.resolve();
    preserveCurrent.then(function () {
      return api('/api/revisions/restore', { id: id });
    }).then(function (res) {
      if (!res.ok || !res.data.content) {
        toast('Could not restore revision: ' + (res.data.error || 'unknown error'), 'error', 6000);
        return;
      }
      pushHistory();
      restoreState(JSON.stringify(res.data.content));
      lastSaved = snapshot();
      unsaved = false;
      autosaveState = 'saved';
      if (typeof window.applyTheme === 'function') window.applyTheme(draft.theme || null);
      if (typeof window.applyContent === 'function') window.applyContent();
      if (typeof window.renderSections === 'function') window.renderSections();
      rerender();
      if (backdrop) backdrop.remove();
      refreshStatus();
      toast('Revision restored', 'ok', 3500);
    });
  }

  function createCheckpoint(name, backdrop) {
    api('/api/revisions', { name: name, content: draft }).then(function (res) {
      if (!res.ok) {
        toast('Could not create checkpoint: ' + (res.data.error || 'unknown error'), 'error', 6000);
        return;
      }
      if (backdrop) backdrop.remove();
      toast('Checkpoint created', 'ok', 3000);
      openRevisionsModal();
    });
  }

  function openRevisionsModal() {
    var backdrop = make('div', 'ed-backdrop');
    backdrop.id = 'ed-revisions-modal';
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
    var modal = make('div', 'ed-modal ed-revisions-modal');
    var head = make('div', 'ed-modal-head');
    head.appendChild(make('h3', '', 'Revision history'));
    var close = make('button', 'ed-modal-close', '×');
    close.type = 'button';
    close.addEventListener('click', function () { backdrop.remove(); });
    head.appendChild(close);
    modal.appendChild(head);

    var checkpoint = make('div', 'ed-checkpoint-create');
    var input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = 'Checkpoint name, for example: Before layout changes';
    input.setAttribute('data-editor', '');
    var create = make('button', 'ed-btn ed-btn-save', 'Create checkpoint');
    create.type = 'button';
    create.addEventListener('click', function () {
      if (!input.value.trim()) { input.focus(); return; }
      createCheckpoint(input.value.trim(), backdrop);
    });
    checkpoint.appendChild(input);
    checkpoint.appendChild(create);
    modal.appendChild(checkpoint);

    var list = make('div', 'ed-revision-list');
    list.appendChild(make('p', 'ed-workspace-empty', 'Loading revisions...'));
    modal.appendChild(list);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    fetch('/api/revisions', { headers: { 'X-Portfolio-Editor-Token': sessionToken } })
      .then(function (response) { return response.json(); })
      .then(function (data) {
        list.innerHTML = '';
        if (!data.revisions || !data.revisions.length) {
          list.appendChild(make('p', 'ed-workspace-empty', 'No revisions yet. Autosave creates them as you work.'));
          return;
        }
        data.revisions.forEach(function (revision) {
          var row = make('div', 'ed-revision-row');
          var details = make('div', 'ed-revision-details');
          details.appendChild(make('strong', '', revision.name || (revision.kind === 'auto' ? 'Autosave' : 'Checkpoint')));
          details.appendChild(make('span', '', formatRevisionDate(revision.createdAt) + ' · ' + revision.assetCount + ' assets'));
          row.appendChild(details);
          var restore = make('button', 'ed-btn ed-btn-ghost', 'Restore');
          restore.type = 'button';
          restore.addEventListener('click', function () { restoreRevision(revision.id, backdrop); });
          row.appendChild(restore);
          list.appendChild(row);
        });
      }).catch(function () {
        list.innerHTML = '';
        list.appendChild(make('p', 'ed-workspace-empty', 'Could not load revision history.'));
      });
  }

  function publish() {
    if (editing) commitEdit();
    if (!confirm('This will make your changes visible to everyone. Publish now?')) return;
    var pre = unsaved ? save() : Promise.resolve();
    pre.then(function () {
      return api('/api/publish', {});
    }).then(function (res) {
      if (res.ok) {
        refreshStatus().then(function () {
          var when = serverStatus && serverStatus.lastPublish
            ? new Date(serverStatus.lastPublish).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
            : '';
          toast('Published! Your site is up to date' + (when ? ' (' + when + ')' : '') + '.', 'ok', 5000);
        });
      } else if (res.status === 409 && res.data.error === 'no-remote') {
        toast('Publishing isn’t connected yet. Your changes are saved safely on this computer - once the site is connected to GitHub, Publish will put them online.', 'info', 9000);
        refreshStatus();
      } else if (res.status === 502 && res.data.error === 'push-failed') {
        toast('Couldn’t reach the internet to publish. Your changes are safe on this computer - try Publish again later.', 'info', 9000);
        refreshStatus();
      } else {
        toast('Publish failed: ' + (res.data.message || res.data.error || 'unknown error'), 'error', 7000);
        refreshStatus();
      }
    }).catch(function (e) {
      toast('Publish failed: ' + e.message, 'error', 6000);
    });
  }

  function discard() {
    if (!confirm('Throw away ALL unpublished changes and go back to the last published version?')) return;
    api('/api/discard').then(function (res) {
      if (res.ok) {
        unsaved = false;
        suppressUnloadWarning = true;
        location.reload();
      } else {
        toast('Could not discard: ' + (res.data.error || 'unknown error'), 'error', 6000);
      }
    }).catch(function (e) {
      toast('Could not discard: ' + e.message, 'error', 6000);
    });
  }

  // ── Text editing ──────────────────────────────────────────────────────────
  function isMultiline(path) {
    var v = getPath(draft, path);
    return typeof v === 'string' && /<br/i.test(v);
  }

  function startEdit(el) {
    if (editing) {
      if (editing.el === el) return;
      commitEdit();
    }
    var path = el.getAttribute('data-content');
    // Remove editor adornments (e.g. tag "×") so they never enter the text.
    el.querySelectorAll('[data-editor]').forEach(function (n) { n.remove(); });
    // Unwrap any font-scale span so editing operates on plain inline content;
    // the persistent wrapper is re-applied on commit/cancel via applyTextScale.
    var wrap = el.querySelector(':scope > .txt-scale');
    if (wrap) { while (wrap.firstChild) el.insertBefore(wrap.firstChild, wrap); wrap.remove(); }
    var scale = (draft.styles && draft.styles[path] && draft.styles[path].fontScale) || 1;
    editing = {
      el: el,
      path: path,
      prevValue: getPath(draft, path),
      prevHTML: el.innerHTML,
      multiline: isMultiline(path),
      scale: scale,
      basePx: parseFloat(getComputedStyle(el).fontSize) || 16
    };
    el.classList.add('ed-editing');
    el.setAttribute('contenteditable', 'true');
    el.focus();
    // Transient live preview of the current scale (absolute px, current viewport).
    if (scale !== 1) el.style.fontSize = (editing.basePx * scale) + 'px';
    showSizeBar(el);
  }

  function commitEdit() {
    if (!editing) return;
    var ed = editing;
    // Read innerText while .ed-editing is still applied (it disables
    // text-transform so uppercase-styled fields keep their real case).
    var text = ed.el.innerText.replace(/\n+$/, '');
    var value;
    if (ed.multiline) {
      value = text.split('\n').map(escapeHtml).join('<br>');
    } else {
      value = text.replace(/\s*\n\s*/g, ' ').trim();
    }
    var isTitle = /^projects\.[^.]+\.title$/.test(ed.path);
    if (value === '' && isTitle) {
      value = typeof ed.prevValue === 'string' ? ed.prevValue : '';
      toast('A project needs a title - put the old one back.', 'info', 4000);
    }
    editing = null;
    hideSizeBar();
    ed.el.classList.remove('ed-editing');
    ed.el.removeAttribute('contenteditable');
    ed.el.style.removeProperty('font-size'); // clear transient preview
    // Update the display from the committed value.
    if (typeof value === 'string' && value.indexOf('<') !== -1) {
      ed.el.innerHTML = value;
    } else {
      ed.el.textContent = value;
    }
    if (value !== ed.prevValue) pushHistory();
    setPath(draft, ed.path, value);
    // Realize the persistent responsive font-scale wrapper from draft.styles.
    if (window.applyTextScale) window.applyTextScale(ed.el, ed.path);
    if (value !== ed.prevValue) markUnsaved();
    enhance(); // re-add adornments stripped at edit start
  }

  function cancelEdit() {
    if (!editing) return;
    var ed = editing;
    editing = null;
    hideSizeBar();
    ed.el.classList.remove('ed-editing');
    ed.el.removeAttribute('contenteditable');
    ed.el.style.removeProperty('font-size'); // clear transient preview
    ed.el.innerHTML = ed.prevHTML; // unwrapped content captured at edit start
    // Any size changes made during this edit persist (their own history steps);
    // re-apply the wrapper from the current draft.styles.
    if (window.applyTextScale) window.applyTextScale(ed.el, ed.path);
    ed.el.blur();
    enhance();
  }

  // ── Font-size mini-toolbar (shown while editing a text field) ───────────────
  var sizeBar = null;

  function showSizeBar(el) {
    hideSizeBar();
    sizeBar = make('div', 'ed-size-bar');
    var minus = make('button', 'ed-size-btn', 'A−');
    var readout = make('span', 'ed-size-readout', Math.round(editing.scale * 100) + '%');
    var plus = make('button', 'ed-size-btn', 'A+');
    var reset = make('button', 'ed-size-btn ed-size-reset', 'reset');
    [minus, plus, reset].forEach(function (b) { b.type = 'button'; });

    // mousedown + preventDefault keeps focus in the field (no blur -> no commit).
    function guard(fn) {
      return function (e) { e.preventDefault(); e.stopPropagation(); fn(); };
    }
    minus.addEventListener('mousedown', guard(function () { changeSize(-0.1, readout); }));
    plus.addEventListener('mousedown', guard(function () { changeSize(0.1, readout); }));
    reset.addEventListener('mousedown', guard(function () { resetSize(readout); }));

    sizeBar.appendChild(minus);
    sizeBar.appendChild(readout);
    sizeBar.appendChild(plus);
    sizeBar.appendChild(reset);
    document.body.appendChild(sizeBar);
    sizeBar._minus = minus;
    sizeBar._plus = plus;
    positionSizeBar(el);
    updateSizeBounds();
  }

  function positionSizeBar(el) {
    if (!sizeBar) return;
    var r = el.getBoundingClientRect();
    var top = r.top - 42;
    if (top < 8) top = r.bottom + 8;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - 210));
    sizeBar.style.top = top + 'px';
    sizeBar.style.left = left + 'px';
  }

  function updateSizeBounds() {
    if (!sizeBar || !editing) return;
    if (sizeBar._minus) sizeBar._minus.disabled = editing.scale <= 0.5;
    if (sizeBar._plus) sizeBar._plus.disabled = editing.scale >= 2.0;
  }

  function changeSize(delta, readout) {
    if (!editing) return;
    var next = Math.round((editing.scale + delta) * 10) / 10;
    next = Math.max(0.5, Math.min(2.0, next));
    if (next === editing.scale) return;
    pushHistory();
    editing.scale = next;
    draft.styles = draft.styles || {};
    if (next === 1) delete draft.styles[editing.path];
    else draft.styles[editing.path] = { fontScale: next };
    if (next === 1) editing.el.style.removeProperty('font-size');
    else editing.el.style.fontSize = (editing.basePx * next) + 'px';
    if (readout) readout.textContent = Math.round(next * 100) + '%';
    markUnsaved();
    updateSizeBounds();
  }

  function resetSize(readout) {
    if (!editing || editing.scale === 1) return;
    pushHistory();
    editing.scale = 1;
    if (draft.styles) delete draft.styles[editing.path];
    editing.el.style.removeProperty('font-size');
    if (readout) readout.textContent = '100%';
    markUnsaved();
    updateSizeBounds();
  }

  function hideSizeBar() {
    if (sizeBar) { sizeBar.remove(); sizeBar = null; }
  }

  function setupEditable(el) {
    if (el.dataset.edBound) return;
    if (el.closest('[data-editor]')) return;
    el.dataset.edBound = '1';
    el.classList.add('ed-editable');
    el.tabIndex = 0;

    el.addEventListener('click', function (e) {
      // Editable nav links / CTA buttons must not navigate in edit mode.
      e.preventDefault();
      e.stopPropagation();
      if (editing && editing.el === el) return;
      startEdit(el);
    });

    el.addEventListener('keydown', function (e) {
      if (editing && editing.el === el) {
        if (e.key === 'Enter' && !editing.multiline) {
          e.preventDefault();
          commitEdit();
          el.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          cancelEdit();
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        startEdit(el);
      }
    });

    el.addEventListener('blur', function () {
      if (editing && editing.el === el) commitEdit();
    });
  }

  function selectAllIn(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ── Re-render helper (preserves open read-more panels) ────────────────────
  function rerender() {
    var openIds = [];
    document.querySelectorAll('#projects-container [id]').forEach(function (d) {
      if (d.style.maxHeight && d.style.maxHeight !== '0px') openIds.push(d.id);
    });
    if (typeof window.renderProjects === 'function') window.renderProjects();
    if (typeof window.renderSections === 'function') window.renderSections();
    openIds.forEach(function (id) {
      var d = document.getElementById(id);
      if (!d) return;
      var toggle = d.nextElementSibling;
      d.style.maxHeight = 'none';
      if (toggle) {
        var label = toggle.querySelector('.btn-label');
        var icon = toggle.querySelector('.btn-icon');
        if (label) label.textContent = 'Read Less';
        if (icon) icon.textContent = 'remove';
      }
    });
    enhance();
  }

  function renumberProjects() {
    var keys = Object.keys(draft.projects);
    keys.forEach(function (k, i) { draft.projects[k].number = pad2(i + 1); });
    draft.hero.count = pad2(keys.length) + ' Projects';
    document.querySelectorAll('[data-content="hero.count"]').forEach(function (el) {
      if (!editing || editing.el !== el) el.textContent = draft.hero.count;
    });
  }

  function reorderKeys(keys) {
    var next = {};
    keys.forEach(function (k) { next[k] = draft.projects[k]; });
    draft.projects = next;
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function copyScopedStyles(sourcePrefix, targetPrefix) {
    if (!draft.styles) return;
    Object.keys(draft.styles).forEach(function (path) {
      if (path.indexOf(sourcePrefix) !== 0) return;
      draft.styles[targetPrefix + path.slice(sourcePrefix.length)] = cloneJson(draft.styles[path]);
    });
  }

  function setEditorClipboard(payload) {
    sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(payload));
    if (activeWorkspaceTab === 'add') renderWorkspacePanel('add');
  }

  function getEditorClipboard() {
    try { return JSON.parse(sessionStorage.getItem(CLIPBOARD_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function uniqueProjectKey(title) {
    var slug = String(title || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'project';
    var key = slug;
    var number = 2;
    while (Object.prototype.hasOwnProperty.call(draft.projects, key)) {
      key = slug + number;
      number += 1;
    }
    return key;
  }

  function insertProjectAfter(sourceKey, targetKey, project) {
    var next = {};
    Object.keys(draft.projects).forEach(function (key) {
      next[key] = draft.projects[key];
      if (key === sourceKey) next[targetKey] = project;
    });
    if (!sourceKey) next[targetKey] = project;
    draft.projects = next;
  }

  function duplicateProject(key) {
    var source = draft.projects[key];
    if (!source) return;
    pushHistory();
    var copy = cloneJson(source);
    copy.title = (source.title || 'Project') + ' Copy';
    var targetKey = uniqueProjectKey(copy.title);
    insertProjectAfter(key, targetKey, copy);
    copyScopedStyles('projects.' + key + '.', 'projects.' + targetKey + '.');
    renumberProjects();
    markUnsaved();
    rerender();
    var section = document.querySelector('[data-project-key="' + targetKey + '"]');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Project duplicated', 'ok');
  }

  function copyProject(key) {
    if (!draft.projects[key]) return;
    setEditorClipboard({ type: 'project', data: cloneJson(draft.projects[key]), styles: scopedStyles('projects.' + key + '.') });
    toast('Project copied - paste it from Add', 'ok', 3500);
  }

  function scopedStyles(prefix) {
    var result = {};
    Object.keys(draft.styles || {}).forEach(function (path) {
      if (path.indexOf(prefix) === 0) result[path.slice(prefix.length)] = cloneJson(draft.styles[path]);
    });
    return result;
  }

  function applyClipboardStyles(prefix, styles) {
    if (!styles || !Object.keys(styles).length) return;
    draft.styles = draft.styles || {};
    Object.keys(styles).forEach(function (suffix) { draft.styles[prefix + suffix] = cloneJson(styles[suffix]); });
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  function adornTags() {
    document.querySelectorAll('[data-role="tags"]').forEach(function (row) {
      var section = row.closest('[data-project-key]');
      if (!section) return;
      var key = section.dataset.projectKey;

      row.querySelectorAll('[data-content]').forEach(function (chip) {
        chip.classList.add('ed-hostrel');
        if (chip.querySelector('.ed-x')) return;
        var x = make('button', 'ed-x', '×');
        x.type = 'button';
        x.title = 'Remove this tag';
        x.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var idx = Number(chip.getAttribute('data-content').split('.').pop());
          pushHistory();
          draft.projects[key].tags.splice(idx, 1);
          markUnsaved();
          rerender();
        });
        chip.appendChild(x);
      });

      if (!row.querySelector('.ed-add-tag')) {
        var add = make('button', 'ed-add-tag', '+ tag');
        add.type = 'button';
        add.title = 'Add a tag';
        add.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          pushHistory();
          var tags = draft.projects[key].tags = draft.projects[key].tags || [];
          tags.push('New Tag');
          markUnsaved();
          rerender();
          var chip = document.querySelector(
            '[data-content="projects.' + key + '.tags.' + (tags.length - 1) + '"]');
          if (chip) { startEdit(chip); selectAllIn(chip); }
        });
        row.appendChild(add);
      }
    });
  }

  // ── Paragraph lists (project read-more + custom section bodies) ────────────
  function adornParagraphList(wrap, arrPath) {
    wrap.querySelectorAll('p[data-content]').forEach(function (p) {
      p.classList.add('ed-hostrel');
      if (p.querySelector('.ed-x')) return;
      var x = make('button', 'ed-x', '×');
      x.type = 'button';
      x.title = 'Delete this paragraph';
      x.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var idx = Number(p.getAttribute('data-content').split('.').pop());
        var arr = getPath(draft, arrPath) || [];
        var current = arr[idx] || '';
        if (current.trim() !== '' && !confirm('Delete this paragraph?')) return;
        pushHistory();
        getPath(draft, arrPath).splice(idx, 1);
        markUnsaved();
        rerender();
      });
      p.appendChild(x);
    });

    if (!wrap.querySelector('.ed-add-para')) {
      var add = make('button', 'ed-add-para', '+ paragraph');
      add.type = 'button';
      add.title = 'Add a paragraph';
      add.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        pushHistory();
        var arr = getPath(draft, arrPath);
        if (!arr) { setPath(draft, arrPath, []); arr = getPath(draft, arrPath); }
        arr.push('');
        markUnsaved();
        rerender();
        var p = document.querySelector('[data-content="' + arrPath + '.' + (arr.length - 1) + '"]');
        if (p) startEdit(p);
      });
      wrap.appendChild(add);
    }
  }

  function adornParagraphLists() {
    document.querySelectorAll('[data-role="readmore"]').forEach(function (wrap) {
      var section = wrap.closest('[data-project-key]');
      if (section) adornParagraphList(wrap, 'projects.' + section.dataset.projectKey + '.readMore');
    });
    document.querySelectorAll('[data-role="sec-body"]').forEach(function (wrap) {
      var section = wrap.closest('[data-custom-section]');
      if (section) adornParagraphList(wrap, 'sectionData.' + section.getAttribute('data-custom-section') + '.body');
    });
  }

  function defaultSectionListItem(type, index) {
    if (type === 'columns') return { heading: 'Column ' + (index + 1), body: ['Add your content here.'] };
    if (type === 'buttons') return { label: 'New action', url: '#' };
    if (type === 'stats') return { value: '0', label: 'New stat' };
    if (type === 'timeline' || type === 'experience' || type === 'education') {
      return { meta: String(new Date().getFullYear()), title: 'New entry', body: 'Describe this entry.' };
    }
    return 'New skill';
  }

  function adornSectionLists() {
    document.querySelectorAll('[data-section-list]').forEach(function (wrap) {
      var path = wrap.dataset.sectionList;
      var section = wrap.closest('[data-custom-section]');
      if (!section) return;
      var id = section.getAttribute('data-custom-section');
      var data = draft.sectionData && draft.sectionData[id];
      var items = getPath(draft, path);
      if (!data || !Array.isArray(items)) return;
      Array.prototype.slice.call(wrap.children).forEach(function (child, index) {
        if (child.hasAttribute('data-editor')) return;
        child.classList.add('ed-hostrel');
        if (child.querySelector(':scope > .ed-x')) return;
        var remove = make('button', 'ed-x', '×');
        remove.type = 'button'; remove.title = 'Remove this item';
        remove.addEventListener('click', function (event) {
          event.preventDefault(); event.stopPropagation();
          if (items.length <= 1) { toast('Keep at least one item in this section.', 'info'); return; }
          pushHistory(); items.splice(index, 1); markUnsaved();
          if (window.renderSections) window.renderSections(); enhance();
        });
        child.appendChild(remove);
      });
      if (!wrap.parentElement.querySelector(':scope > .ed-add-list-item')) {
        var add = make('button', 'ed-add-para ed-add-list-item', '+ item');
        add.type = 'button'; add.title = 'Add another item';
        add.addEventListener('click', function () {
          pushHistory(); items.push(defaultSectionListItem(data.type, items.length)); markUnsaved();
          if (window.renderSections) window.renderSections(); enhance();
        });
        wrap.parentElement.appendChild(add);
      }
    });
  }

  // ── Per-project move / delete controls ────────────────────────────────────
  function adornProjectControls() {
    var sections = document.querySelectorAll('[data-project-key]');
    sections.forEach(function (section, i) {
      var key = section.dataset.projectKey;
      section.classList.add('ed-hostrel');
      if (section.querySelector('.ed-proj-controls')) return;

      var box = make('div', 'ed-proj-controls');
      box.appendChild(make('span', 'ed-ctrl-chip', 'PROJECT'));

      var up = make('button', '', '↑');
      up.type = 'button';
      up.title = 'Move this project up';
      up.disabled = i === 0;
      up.addEventListener('click', function () { moveProject(key, -1); });

      var down = make('button', '', '↓');
      down.type = 'button';
      down.title = 'Move this project down';
      down.disabled = i === sections.length - 1;
      down.addEventListener('click', function () { moveProject(key, 1); });

      var layoutBtn = make('button', '', '⚙');
      layoutBtn.type = 'button';
      layoutBtn.title = 'Layout options (image side, shape, background)';
      layoutBtn.addEventListener('click', function () { openLayoutPopover(key); });

      var detailsBtn = make('button', '', 'i');
      detailsBtn.type = 'button';
      detailsBtn.title = 'Project details and case-study metadata';
      detailsBtn.addEventListener('click', function () { openProjectDetails(key); });

      var duplicate = make('button', '', '⧉');
      duplicate.type = 'button';
      duplicate.title = 'Duplicate this project';
      duplicate.addEventListener('click', function () { duplicateProject(key); });

      var copy = make('button', '', '□');
      copy.type = 'button';
      copy.title = 'Copy this project';
      copy.addEventListener('click', function () { copyProject(key); });

      var del = make('button', 'ed-proj-delete', '✕');
      del.type = 'button';
      del.title = 'Delete this project (removes it from the site)';
      del.addEventListener('click', function () {
        var title = draft.projects[key].title || key;
        if (!confirm('Delete the project "' + title + '"? Its photos stay on this computer, but the project disappears from the site.')) return;
        pushHistory();
        delete draft.projects[key];
        renumberProjects();
        markUnsaved();
        rerender();
        toast('Deleted "' + title + '"', 'ok');
      });

      box.appendChild(up);
      box.appendChild(down);
      box.appendChild(layoutBtn);
      box.appendChild(detailsBtn);
      box.appendChild(duplicate);
      box.appendChild(copy);
      box.appendChild(del);
      section.appendChild(box);
    });
  }

  function openProjectDetails(key) {
    if (editing) commitEdit();
    var project = draft.projects[key];
    if (!project) return;
    var existing = document.getElementById('ed-project-details-modal');
    if (existing) existing.remove();
    var current = project.details || {};
    var backdrop = make('div', 'ed-backdrop');
    backdrop.id = 'ed-project-details-modal';
    var modal = make('div', 'ed-modal ed-project-details-modal');
    var head = make('div', 'ed-modal-head');
    head.appendChild(make('h3', '', 'Project details - ' + (project.title || key)));
    var close = make('button', 'ed-modal-close', '×'); close.type = 'button';
    close.addEventListener('click', function () { backdrop.remove(); }); head.appendChild(close); modal.appendChild(head);
    var form = make('div', 'ed-details-form');
    var inputs = {};
    [['role','Role','Lead designer'],['duration','Duration','12 weeks'],['tools','Tools','CAD, prototyping, research'],['team','Team','Four-person team'],['externalLabel','Link label','View project'],['externalUrl','External link','https://...']]
      .forEach(function (field) {
        var label = make('label', 'ed-setting-field'); label.appendChild(make('span', '', field[1]));
        var input = document.createElement('input'); input.type = 'text'; input.placeholder = field[2]; input.value = current[field[0]] || '';
        input.setAttribute('data-editor', ''); inputs[field[0]] = input; label.appendChild(input); form.appendChild(label);
      });
    var outcomeLabel = make('label', 'ed-setting-field ed-details-outcome'); outcomeLabel.appendChild(make('span', '', 'Outcome'));
    var outcome = document.createElement('textarea'); outcome.rows = 4; outcome.placeholder = 'What changed or improved?'; outcome.value = current.outcome || '';
    outcome.setAttribute('data-editor', ''); inputs.outcome = outcome; outcomeLabel.appendChild(outcome); form.appendChild(outcomeLabel);
    modal.appendChild(form);
    var foot = make('div', 'ed-modal-foot');
    var cancel = make('button', 'ed-btn ed-btn-ghost', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', function () { backdrop.remove(); });
    var saveDetails = make('button', 'ed-btn ed-btn-save', 'Save details'); saveDetails.type = 'button';
    saveDetails.addEventListener('click', function () {
      pushHistory();
      project.details = {};
      Object.keys(inputs).forEach(function (name) { var value = inputs[name].value.trim(); if (value) project.details[name] = value; });
      markUnsaved(); backdrop.remove(); rerender(); toast('Project details updated', 'ok');
    });
    foot.appendChild(cancel); foot.appendChild(saveDetails); modal.appendChild(foot); backdrop.appendChild(modal); document.body.appendChild(backdrop);
  }

  // ── Per-project layout popover ────────────────────────────────────────────
  var layoutPopover = null;
  function onLayoutOutside(e) {
    if (layoutPopover && !layoutPopover.contains(e.target)) closeLayoutPopover();
  }
  function closeLayoutPopover() {
    if (layoutPopover) { layoutPopover.remove(); layoutPopover = null; }
    document.removeEventListener('mousedown', onLayoutOutside, true);
  }

  // Read the project's current effective layout from the rendered DOM so the
  // popover highlights match what's on screen (preset or override).
  function currentProjLayout(key) {
    var section = document.querySelector('[data-project-key="' + key + '"]');
    var img = section && section.querySelector('.project-img');
    var frame = section && section.querySelector('[data-role="image-frame"]');
    var imageCol = frame && frame.parentElement;
    var fit = (img && img.dataset.mainFit) || draft.projects[key].imageFit || 'object-cover';
    var aspect = '16/10';
    if (frame) {
      if (frame.className.indexOf('aspect-square') !== -1) aspect = '1/1';
      else { var m = frame.className.match(/aspect-\[(\d+\/\d+)\]/); if (m) aspect = m[1]; }
    }
    return {
      side: (imageCol && imageCol.className.indexOf('lg:order-2') !== -1) ? 'right' : 'left',
      fit: fit.indexOf('contain') !== -1 ? 'object-contain' : 'object-cover',
      aspect: aspect,
      tint: !!(section && /bg-surface-container-low/.test(section.className))
    };
  }

  function setProjLayout(key, field, value) {
    pushHistory();
    if (field === 'fit') {
      draft.projects[key].imageFit = value;
    } else {
      draft.projects[key].layout = draft.projects[key].layout || {};
      draft.projects[key].layout[field] = value;
    }
    markUnsaved();
    rerender();
    openLayoutPopover(key); // reopen anchored to the rebuilt section
  }

  function openLayoutPopover(key) {
    if (editing) commitEdit();
    closeLayoutPopover();
    var section = document.querySelector('[data-project-key="' + key + '"]');
    if (!section) return;
    var cur = currentProjLayout(key);

    var pop = make('div', 'ed-layout-pop');
    pop.appendChild(make('div', 'ed-layout-title', 'Layout - ' + (draft.projects[key].title || key)));

    function group(label, options, activeVal, field) {
      pop.appendChild(make('div', 'ed-layout-label', label));
      var row = make('div', 'ed-seg');
      options.forEach(function (opt) {
        var b = make('button', 'ed-seg-btn' + (opt.val === activeVal ? ' ed-active' : ''), opt.name);
        b.type = 'button';
        b.addEventListener('click', function () { setProjLayout(key, field, opt.val); });
        row.appendChild(b);
      });
      pop.appendChild(row);
    }

    group('Image side', [{ name: 'Left', val: 'left' }, { name: 'Right', val: 'right' }], cur.side, 'side');
    group('Photo fit', [{ name: 'Fill', val: 'object-cover' }, { name: 'Fit', val: 'object-contain' }], cur.fit, 'fit');
    group('Shape', [{ name: 'Wide', val: '16/10' }, { name: 'Standard', val: '4/3' }, { name: 'Photo', val: '3/2' }, { name: 'Square', val: '1/1' }], cur.aspect, 'aspect');
    group('Background', [{ name: 'Plain', val: false }, { name: 'Tinted', val: true }], cur.tint, 'tint');

    var done = make('button', 'ed-btn ed-btn-save', 'Done');
    done.type = 'button';
    done.addEventListener('click', closeLayoutPopover);
    pop.appendChild(done);

    document.body.appendChild(pop);
    layoutPopover = pop;
    var r = section.getBoundingClientRect();
    pop.style.top = Math.max(70, Math.min(r.top + 46, window.innerHeight - 340)) + 'px';
    pop.style.right = '20px';
    setTimeout(function () { document.addEventListener('mousedown', onLayoutOutside, true); }, 0);
  }

  function moveProject(key, dir) {
    var keys = Object.keys(draft.projects);
    var i = keys.indexOf(key);
    var j = i + dir;
    if (i === -1 || j < 0 || j >= keys.length) return;
    pushHistory();
    var tmp = keys[i]; keys[i] = keys[j]; keys[j] = tmp;
    reorderKeys(keys);
    renumberProjects();
    markUnsaved();
    rerender();
    var section = document.querySelector('[data-project-key="' + key + '"]');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ── Add project ───────────────────────────────────────────────────────────
  function addProject() {
    var title = prompt('Name for the new project:');
    if (title === null) return;
    title = title.trim();
    if (!title) { toast('The project needs a name.', 'info'); return; }

    pushHistory();
    var key = uniqueProjectKey(title);

    draft.projects[key] = {
      number: '00',
      tags: ['Design'],
      title: title,
      description: 'A short summary of this project.',
      institution: '',
      year: String(new Date().getFullYear()),
      readMore: ['Tell the story of this project here.'],
      imageAlt: title,
      imageFit: 'object-cover',
      images: []
    };
    renumberProjects();
    markUnsaved();
    rerender();
    var section = document.querySelector('[data-project-key="' + key + '"]');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast('Added "' + title + '" - click its text to fill it in, and use Photos to add pictures.', 'ok', 5000);
  }

  // ── Photo manager ─────────────────────────────────────────────────────────
  var photoInput = null;

  function projectFolder(key) {
    var images = draft.projects[key].images || [];
    if (images.length > 0) {
      var parts = images[0].split('/'); // assets/images/<folder>/<file>
      if (parts.length >= 4 && parts[0] === 'assets' && parts[1] === 'images') {
        return parts[2];
      }
    }
    return key.replace(/[^a-zA-Z0-9._-]/g, '') || 'images';
  }

  function adornPhotoButtons() {
    document.querySelectorAll('[data-role="image-frame"]').forEach(function (frame) {
      var section = frame.closest('[data-project-key]');
      if (!section) return;
      var key = section.dataset.projectKey;
      frame.classList.add('ed-hostrel', 'ed-frame-clickable');

      if (!frame.querySelector('.ed-photos-btn')) {
        var btn = make('button', 'ed-photos-btn', 'Photos');
        btn.type = 'button';
        btn.title = 'Add, remove, or reorder this project’s photos';
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          openPhotoModal(key);
        });
        frame.appendChild(btn);
      }

      if (!frame.dataset.edPhotoClick) {
        frame.dataset.edPhotoClick = '1';
        frame.addEventListener('click', function (e) {
          if (e.target.closest('[data-editor]')) return;
          openPhotoModal(key);
        });
      }
    });
  }

  // Photo manager is spec-driven so projects and gallery sections can share it.
  // spec = { title, folder, getImages(), minImages, onChange() }
  var photoSpec = null;

  function projectPhotoSpec(key) {
    return {
      title: draft.projects[key].title || key,
      folder: projectFolder(key),
      getImages: function () { return draft.projects[key].images; },
      minImages: 1,
      onChange: rerender
    };
  }

  function openPhotoModal(key) {
    openPhotoModalSpec(projectPhotoSpec(key));
  }

  function openPhotoModalSpec(spec) {
    if (editing) commitEdit();
    closePhotoModal();
    photoSpec = spec;
    modalState = { spec: spec };

    var backdrop = make('div', 'ed-backdrop');
    backdrop.id = 'ed-photo-modal';
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closePhotoModal(true);
    });

    var modal = make('div', 'ed-modal');

    var head = make('div', 'ed-modal-head');
    var h = make('h3', '', 'Photos - ' + spec.title);
    var close = make('button', 'ed-modal-close', '×');
    close.type = 'button';
    close.addEventListener('click', function () { closePhotoModal(true); });
    head.appendChild(h);
    head.appendChild(close);
    modal.appendChild(head);

    var grid = make('div', 'ed-photo-grid');
    grid.id = 'ed-photo-grid';
    modal.appendChild(grid);

    var foot = make('div', 'ed-modal-foot');
    var addBtn = make('button', 'ed-btn ed-btn-save', 'Add photos');
    addBtn.type = 'button';
    addBtn.id = 'ed-add-photos-btn';
    addBtn.addEventListener('click', function () {
      if (!photoInput) {
        photoInput = document.createElement('input');
        photoInput.type = 'file';
        photoInput.multiple = true;
        photoInput.accept = 'image/png,image/jpeg,image/webp';
        photoInput.setAttribute('data-editor', '');
        photoInput.style.display = 'none';
        document.body.appendChild(photoInput);
      }
      photoInput.onchange = function () {
        var files = Array.prototype.slice.call(photoInput.files || []);
        photoInput.value = '';
        if (files.length) uploadPhotos(files, addBtn);
      };
      photoInput.click();
    });
    var hint = make('span', 'ed-modal-hint',
      spec.minImages > 0
        ? 'The first photo is the main one shown on the page.'
        : 'Photos appear in this order in the gallery.');
    foot.appendChild(addBtn);
    foot.appendChild(hint);
    modal.appendChild(foot);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    renderPhotoGrid();
  }

  function renderPhotoGrid() {
    var grid = document.getElementById('ed-photo-grid');
    if (!grid || !photoSpec) return;
    grid.replaceChildren();
    var images = photoSpec.getImages() || [];
    var showMain = photoSpec.minImages > 0;

    if (images.length === 0) {
      grid.appendChild(make('div', 'ed-modal-hint', 'No photos yet - click "Add photos" to upload some.'));
      return;
    }

    images.forEach(function (src, i) {
      var cell = make('div', 'ed-photo-cell' + (i === 0 && showMain ? ' ed-photo-cell-main' : ''));

      var wrapEl = make('div', 'ed-photo-thumb-wrap');
      var img = document.createElement('img');
      img.src = src;
      img.alt = '';
      wrapEl.appendChild(img);
      if (i === 0 && showMain) wrapEl.appendChild(make('span', 'ed-main-label', 'Main'));
      cell.appendChild(wrapEl);

      var actions = make('div', 'ed-photo-actions');

      var left = make('button', '', '◀');
      left.type = 'button';
      left.title = 'Move earlier';
      left.disabled = i === 0;
      left.addEventListener('click', function () { movePhoto(i, -1); });

      var right = make('button', '', '▶');
      right.type = 'button';
      right.title = 'Move later';
      right.disabled = i === images.length - 1;
      right.addEventListener('click', function () { movePhoto(i, 1); });

      actions.appendChild(left);
      actions.appendChild(right);

      if (showMain) {
        var main = make('button', 'ed-make-main', i === 0 ? 'Main photo' : 'Make main');
        main.type = 'button';
        main.disabled = i === 0;
        main.addEventListener('click', function () {
          pushHistory();
          var arr = photoSpec.getImages();
          arr.unshift(arr.splice(i, 1)[0]);
          markUnsaved();
          renderPhotoGrid();
        });
        actions.appendChild(main);
      }

      var del = make('button', 'ed-photo-del', '×');
      del.type = 'button';
      del.title = 'Remove this photo';
      del.addEventListener('click', function () {
        var arr = photoSpec.getImages();
        if (arr.length <= photoSpec.minImages) {
          toast('A project needs at least one photo.', 'info');
          return;
        }
        pushHistory();
        arr.splice(i, 1);
        markUnsaved();
        renderPhotoGrid();
      });
      actions.appendChild(del);

      cell.appendChild(actions);
      grid.appendChild(cell);
    });
  }

  function movePhoto(i, dir) {
    if (!photoSpec) return;
    var arr = photoSpec.getImages();
    var j = i + dir;
    if (j < 0 || j >= arr.length) return;
    pushHistory();
    var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    markUnsaved();
    renderPhotoGrid();
  }

  function closePhotoModal(applyChanges) {
    var existing = document.getElementById('ed-photo-modal');
    if (existing) existing.remove();
    if (modalState && applyChanges && photoSpec && photoSpec.onChange) {
      photoSpec.onChange();
    }
    modalState = null;
    photoSpec = null;
  }

  // ── Image upload pipeline ─────────────────────────────────────────────────
  function processImageFile(file) {
    return new Promise(function (resolve, reject) {
      var keepPng = /\.png$/i.test(file.name) || file.type === 'image/png';
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, 2000 / Math.max(w, h));
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          var dataUrl = keepPng
            ? canvas.toDataURL('image/png')
            : canvas.toDataURL('image/jpeg', 0.85);
          resolve({ base64: dataUrl.split(',')[1], ext: keepPng ? '.png' : '.jpg' });
        } catch (e) { reject(e); }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read "' + file.name + '" as an image'));
      };
      img.src = url;
    });
  }

  function safeBaseName(name) {
    var base = name.replace(/\.[^.]*$/, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 60);
    return base || 'photo';
  }

  function uploadPhotos(files, btn) {
    if (!photoSpec) return;
    var spec = photoSpec;
    var folder = spec.folder;
    var origLabel = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Uploading…'; }

    var chain = Promise.resolve();
    var okCount = 0;
    var pushed = false; // one history snapshot for the whole upload batch
    files.forEach(function (file) {
      chain = chain.then(function () {
        return processImageFile(file).then(function (out) {
          return api('/api/upload-image', {
            folder: folder,
            filename: safeBaseName(file.name) + out.ext,
            data: out.base64
          });
        }).then(function (res) {
          if (res.ok && res.data.path) {
            if (!pushed) { pushHistory(); pushed = true; }
            spec.getImages().push(res.data.path);
            okCount += 1;
            markUnsaved();
          } else {
            toast('Could not upload "' + file.name + '": ' + (res.data.error || 'unknown error'), 'error', 6000);
          }
        }).catch(function (e) {
          toast('Could not upload "' + file.name + '": ' + e.message, 'error', 6000);
        });
      });
    });

    chain.then(function () {
      if (btn) { btn.disabled = false; btn.textContent = origLabel; }
      if (okCount > 0) toast('Added ' + okCount + ' photo' + (okCount === 1 ? '' : 's'), 'ok');
      renderPhotoGrid();
    });
  }

  // ── Profile photo (about page) ────────────────────────────────────────────
  function setupProfilePhoto() {
    var img = document.querySelector('[data-content-src="about.profilePhoto"]');
    if (!img || img.dataset.edBound) return;
    img.dataset.edBound = '1';
    var holder = img.parentElement;
    if (holder) holder.classList.add('ed-photo-clickable');

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.setAttribute('data-editor', '');
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      toast('Uploading photo…', 'info', 2500);
      processImageFile(file).then(function (out) {
        return api('/api/upload-image', {
          folder: 'profile',
          filename: safeBaseName(file.name) + out.ext,
          data: out.base64
        });
      }).then(function (res) {
        if (res.ok && res.data.path) {
          pushHistory();
          draft.about.profilePhoto = res.data.path;
          img.src = res.data.path;
          markUnsaved();
          toast('Profile photo updated', 'ok');
        } else {
          toast('Could not upload the photo: ' + (res.data.error || 'unknown error'), 'error', 6000);
        }
      }).catch(function (e) {
        toast('Could not upload the photo: ' + e.message, 'error', 6000);
      });
    });

    img.addEventListener('click', function (e) {
      e.preventDefault();
      input.click();
    });
  }

  // ── Sections (add / move / hide / delete) ─────────────────────────────────
  var pageKey = null; // 'home' | 'about', set in init
  var sectionImgInput = null;

  var BUILTIN_LABELS = {
    hero: 'Intro', projects: 'Projects', cta: 'Contact banner',
    bio: 'Biography', expertise: 'Expertise', quote: 'Quote', closing: 'Closing'
  };

  // Registry for display (does not create/store one if absent).
  function currentRegistry() {
    if (draft.sections && draft.sections[pageKey]) return draft.sections[pageKey];
    return (typeof window.defaultSections === 'function') ? window.defaultSections() : [];
  }

  // Ensure a stored registry exists for this page, returning the stored array.
  function ensureSections() {
    draft.sections = draft.sections || {};
    if (!draft.sections[pageKey]) {
      draft.sections[pageKey] = (typeof window.defaultSections === 'function') ? window.defaultSections() : [];
    }
    return draft.sections[pageKey];
  }

  function moveSection(id, dir) {
    var reg = currentRegistry();
    var i = reg.findIndex(function (e) { return e.id === id; });
    var j = i + dir;
    if (i === -1 || j < 0 || j >= reg.length) return;
    pushHistory();
    reg = ensureSections();
    var tmp = reg[i]; reg[i] = reg[j]; reg[j] = tmp;
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
    var el = document.querySelector('[data-section="' + id + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function moveSectionTo(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    var registry = currentRegistry();
    var sourceIndex = registry.findIndex(function (entry) { return entry.id === sourceId; });
    var targetIndex = registry.findIndex(function (entry) { return entry.id === targetId; });
    if (sourceIndex < 0 || targetIndex < 0) return;
    pushHistory();
    registry = ensureSections();
    var moved = registry.splice(sourceIndex, 1)[0];
    targetIndex = registry.findIndex(function (entry) { return entry.id === targetId; });
    registry.splice(targetIndex, 0, moved);
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
  }

  function setSectionHidden(id, hidden) {
    pushHistory();
    var reg = ensureSections();
    var entry = reg.find(function (e) { return e.id === id; });
    if (!entry) { undoStack.pop(); updateHistoryButtons(); return; }
    entry.hidden = hidden;
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
  }

  function setSectionSetting(id, name, value) {
    var registry = ensureSections();
    var entry = registry.find(function (item) { return item.id === id; });
    if (!entry) return;
    pushHistory();
    entry.settings = entry.settings || {};
    entry.settings[name] = value;
    if (name === 'columns' && draft.sectionData && draft.sectionData[id] && draft.sectionData[id].type === 'columns') {
      var columns = draft.sectionData[id].columns = draft.sectionData[id].columns || [];
      while (columns.length < value) {
        columns.push({ heading: 'Column ' + (columns.length + 1), body: ['Add your content here.'] });
      }
    }
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
  }

  function sectionSettingControl(label, values, current, onChange) {
    var wrap = make('div', 'ed-setting-group');
    wrap.appendChild(make('div', 'ed-layout-label', label));
    var segmented = make('div', 'ed-seg');
    values.forEach(function (item) {
      var button = make('button', 'ed-seg-btn' + (item[0] === current ? ' ed-active' : ''), item[1]);
      button.type = 'button';
      button.addEventListener('click', function () { onChange(item[0]); });
      segmented.appendChild(button);
    });
    wrap.appendChild(segmented);
    return wrap;
  }

  function openSectionLayout(id) {
    if (editing) commitEdit();
    var registry = ensureSections();
    var entry = registry.find(function (item) { return item.id === id; });
    if (!entry) return;
    var existing = document.getElementById('ed-section-layout-modal');
    if (existing) existing.remove();
    var settings = entry.settings || {};
    var backdrop = make('div', 'ed-backdrop');
    backdrop.id = 'ed-section-layout-modal';
    var modal = make('div', 'ed-modal ed-section-layout-modal');
    var head = make('div', 'ed-modal-head');
    head.appendChild(make('h3', '', 'Section layout - ' + (BUILTIN_LABELS[id] || id).replace(/[-_]/g, ' ')));
    var close = make('button', 'ed-modal-close', '×');
    close.type = 'button';
    close.addEventListener('click', function () { backdrop.remove(); });
    head.appendChild(close);
    modal.appendChild(head);
    var body = make('div', 'ed-section-layout-body');
    function reopen(name, value) {
      setSectionSetting(id, name, value);
      backdrop.remove();
      openSectionLayout(id);
    }
    body.appendChild(sectionSettingControl('Content width', [['full','Full'],['wide','Wide'],['content','Content'],['narrow','Narrow']], settings.width || 'full', function (value) { reopen('width', value); }));
    body.appendChild(sectionSettingControl('Alignment', [['left','Left'],['center','Center'],['right','Right']], settings.align || 'left', function (value) { reopen('align', value); }));
    body.appendChild(sectionSettingControl('Background', [['plain','Plain'],['tinted','Tinted'],['accent','Accent'],['dark','Dark']], settings.background || 'plain', function (value) { reopen('background', value); }));
    body.appendChild(sectionSettingControl('Top spacing', [[0,'None'],[32,'S'],[64,'M'],[96,'L'],[128,'XL']], Number.isFinite(settings.paddingTop) ? settings.paddingTop : 64, function (value) { reopen('paddingTop', value); }));
    body.appendChild(sectionSettingControl('Bottom spacing', [[0,'None'],[32,'S'],[64,'M'],[96,'L'],[128,'XL']], Number.isFinite(settings.paddingBottom) ? settings.paddingBottom : 64, function (value) { reopen('paddingBottom', value); }));
    body.appendChild(sectionSettingControl('Content gap', [[8,'S'],[16,'M'],[32,'L'],[48,'XL'],[72,'2XL']], Number.isFinite(settings.gap) ? settings.gap : 48, function (value) { reopen('gap', value); }));
    var sectionData = draft.sectionData && draft.sectionData[id];
    if (sectionData && sectionData.type === 'columns') {
      body.appendChild(sectionSettingControl('Columns', [[1,'One'],[2,'Two'],[3,'Three'],[4,'Four']], Number.isFinite(settings.columns) ? settings.columns : sectionData.columns.length, function (value) { reopen('columns', value); }));
    }

    var fields = make('div', 'ed-setting-fields');
    var minHeightLabel = make('label', 'ed-setting-field');
    minHeightLabel.appendChild(make('span', '', 'Minimum height (px)'));
    var minHeight = document.createElement('input');
    minHeight.type = 'number'; minHeight.min = '0'; minHeight.max = '1600'; minHeight.step = '20';
    minHeight.value = settings.minHeight || 0; minHeight.setAttribute('data-editor', '');
    minHeight.addEventListener('change', function () { reopen('minHeight', Math.max(0, Math.min(1600, Number(minHeight.value) || 0))); });
    minHeightLabel.appendChild(minHeight);
    var anchorLabel = make('label', 'ed-setting-field');
    anchorLabel.appendChild(make('span', '', 'Section anchor'));
    var anchor = document.createElement('input');
    anchor.type = 'text'; anchor.placeholder = 'for example: experience'; anchor.value = settings.anchor || '';
    anchor.setAttribute('data-editor', '');
    anchor.addEventListener('change', function () {
      var value = anchor.value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
      if (value && !/^[a-z]/.test(value)) value = 'section-' + value;
      reopen('anchor', value);
    });
    anchorLabel.appendChild(anchor);
    fields.appendChild(minHeightLabel); fields.appendChild(anchorLabel);
    body.appendChild(fields);

    var visibility = make('div', 'ed-visibility-row');
    visibility.appendChild(make('div', 'ed-layout-label', 'Show on devices'));
    [['desktop','Desktop'],['tablet','Tablet'],['mobile','Phone']].forEach(function (device) {
      var label = make('label', 'ed-check-label');
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox'; checkbox.checked = settings[device[0]] !== false;
      checkbox.setAttribute('data-editor', '');
      checkbox.addEventListener('change', function () { reopen(device[0], checkbox.checked); });
      label.appendChild(checkbox); label.appendChild(make('span', '', device[1])); visibility.appendChild(label);
    });
    body.appendChild(visibility);
    modal.appendChild(body); backdrop.appendChild(modal); document.body.appendChild(backdrop);
  }

  function flipSectionSide(id) {
    var data = draft.sectionData && draft.sectionData[id];
    if (!data) return;
    pushHistory();
    ensureSections();
    data.side = (data.side === 'right') ? 'left' : 'right';
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
  }

  function deleteSection(id) {
    var data = draft.sectionData && draft.sectionData[id];
    var typeName = (data && data.type) ? data.type.replace('textImage', 'text and photo') : 'section';
    if (!confirm('Delete this ' + typeName + ' section?')) return;
    pushHistory();
    var reg = ensureSections();
    draft.sections[pageKey] = reg.filter(function (e) { return e.id !== id; });
    if (draft.sectionData) delete draft.sectionData[id];
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
    toast('Section deleted', 'ok');
  }

  function uniqueSectionId(type) {
    var id = type + '-' + Math.random().toString(36).slice(2, 7);
    var registry = ensureSections();
    while ((draft.sectionData && draft.sectionData[id]) || registry.some(function (entry) { return entry.id === id; })) {
      id = type + '-' + Math.random().toString(36).slice(2, 7);
    }
    return id;
  }

  function insertCustomSection(data, afterId, styles) {
    ensureSections();
    draft.sectionData = draft.sectionData || {};
    var id = uniqueSectionId(data.type || 'text');
    draft.sectionData[id] = cloneJson(data);
    var entry = { id: id, type: data.type || 'text' };
    var registry = draft.sections[pageKey];
    var index = afterId ? registry.findIndex(function (item) { return item.id === afterId; }) : -1;
    if (index >= 0) registry.splice(index + 1, 0, entry);
    else {
      var ctaIndex = registry.findIndex(function (item) { return item.builtin && item.id === 'cta'; });
      if (ctaIndex >= 0) registry.splice(ctaIndex, 0, entry);
      else registry.push(entry);
    }
    applyClipboardStyles('sectionData.' + id + '.', styles);
    return id;
  }

  function duplicateSection(id) {
    var data = draft.sectionData && draft.sectionData[id];
    if (!data) return;
    pushHistory();
    var newId = insertCustomSection(data, id, scopedStyles('sectionData.' + id + '.'));
    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
    var element = document.querySelector('[data-custom-section="' + newId + '"]');
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Section duplicated', 'ok');
  }

  function copySection(id) {
    var data = draft.sectionData && draft.sectionData[id];
    if (!data) return;
    setEditorClipboard({ type: 'section', data: cloneJson(data), styles: scopedStyles('sectionData.' + id + '.') });
    toast('Section copied - switch pages and paste it from Add', 'ok', 4200);
  }

  function savedTemplates() {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function saveSectionTemplate(id) {
    var data = draft.sectionData && draft.sectionData[id];
    if (!data) return;
    var name = prompt('Name for this reusable section template:', data.heading || data.label || 'Saved section');
    if (name === null || !name.trim()) return;
    var templates = savedTemplates();
    templates.push({ id: 'template-' + Date.now(), name: name.trim().slice(0, 60), data: cloneJson(data), styles: scopedStyles('sectionData.' + id + '.') });
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates.slice(-30)));
    toast('Section template saved', 'ok');
  }

  function pasteEditorClipboard() {
    var clipboard = getEditorClipboard();
    if (!clipboard) return;
    if (clipboard.type === 'project') {
      if (!isHomePage) { toast('Projects can only be pasted on the Projects page.', 'info'); return; }
      pushHistory();
      var project = cloneJson(clipboard.data);
      project.title = (project.title || 'Project') + ' Copy';
      var key = uniqueProjectKey(project.title);
      insertProjectAfter(null, key, project);
      applyClipboardStyles('projects.' + key + '.', clipboard.styles);
      renumberProjects();
      markUnsaved();
      rerender();
      toast('Project pasted', 'ok');
      return;
    }
    if (clipboard.type === 'section') {
      pushHistory();
      insertCustomSection(clipboard.data, null, clipboard.styles);
      markUnsaved();
      if (window.renderSections) window.renderSections();
      enhance();
      toast('Section pasted', 'ok');
    }
  }

  function adornSections() {
    var main = document.querySelector('main');
    if (!main) return;
    // Rebuild ghost bars from scratch each pass (idempotent).
    Array.prototype.slice.call(main.querySelectorAll('.ed-sec-ghost')).forEach(function (g) { g.remove(); });

    var reg = currentRegistry();
    reg.forEach(function (entry, idx) {
      var el = main.querySelector(':scope > [data-section="' + entry.id + '"]');
      if (!el) return;

      if (entry.hidden && entry.builtin) {
        var ghost = make('div', 'ed-sec-ghost');
        ghost.appendChild(make('span', 'ed-sec-ghost-label',
          'Hidden: ' + (BUILTIN_LABELS[entry.id] || entry.id)));
        var show = make('button', 'ed-sec-ghost-show', 'Show');
        show.type = 'button';
        show.addEventListener('click', function () { setSectionHidden(entry.id, false); });
        ghost.appendChild(show);
        main.insertBefore(ghost, el);
        return;
      }

      el.classList.add('ed-hostrel');
      if (el.querySelector(':scope > .ed-sec-controls')) return;

      var box = make('div', 'ed-sec-controls');
      box.appendChild(make('span', 'ed-ctrl-chip ed-ctrl-chip-sec', 'SECTION'));
      var up = make('button', '', '↑');
      up.type = 'button';
      up.title = 'Move section up';
      up.disabled = idx === 0;
      up.addEventListener('click', function () { moveSection(entry.id, -1); });
      var down = make('button', '', '↓');
      down.type = 'button';
      down.title = 'Move section down';
      down.disabled = idx === reg.length - 1;
      down.addEventListener('click', function () { moveSection(entry.id, 1); });
      box.appendChild(up);
      box.appendChild(down);

      var layout = make('button', '', '⚙');
      layout.type = 'button';
      layout.title = 'Section layout and responsive settings';
      layout.addEventListener('click', function () { openSectionLayout(entry.id); });
      box.appendChild(layout);

      if (entry.builtin) {
        var hide = make('button', '', '⦸');
        hide.type = 'button';
        hide.title = "Hide this section (visitors won't see it; you can bring it back)";
        hide.addEventListener('click', function () { setSectionHidden(entry.id, true); });
        box.appendChild(hide);
      } else {
        var data = (draft.sectionData && draft.sectionData[entry.id]) || {};
        if (data.type === 'textImage') {
          var flip = make('button', '', '⇋');
          flip.type = 'button';
          flip.title = 'Flip which side the photo is on';
          flip.addEventListener('click', function () { flipSectionSide(entry.id); });
          box.appendChild(flip);
        }
        var duplicate = make('button', '', '⧉');
        duplicate.type = 'button';
        duplicate.title = 'Duplicate this section';
        duplicate.addEventListener('click', function () { duplicateSection(entry.id); });
        box.appendChild(duplicate);
        var copy = make('button', '', '□');
        copy.type = 'button';
        copy.title = 'Copy this section';
        copy.addEventListener('click', function () { copySection(entry.id); });
        box.appendChild(copy);
        var template = make('button', '', '★');
        template.type = 'button';
        template.title = 'Save as reusable template';
        template.addEventListener('click', function () { saveSectionTemplate(entry.id); });
        box.appendChild(template);
        var del = make('button', 'ed-proj-delete', '✕');
        del.type = 'button';
        del.title = 'Delete this section';
        del.addEventListener('click', function () { deleteSection(entry.id); });
        box.appendChild(del);
      }
      el.appendChild(box);
    });
  }

  // Photos for custom sections: textImage = click-to-replace, gallery = modal.
  function gallerySpec(id) {
    return {
      title: 'Gallery',
      folder: 'sections',
      getImages: function () {
        draft.sectionData[id].images = draft.sectionData[id].images || [];
        return draft.sectionData[id].images;
      },
      minImages: 0,
      onChange: function () { if (window.renderSections) window.renderSections(); enhance(); }
    };
  }

  function replaceSectionImage(id) {
    if (!sectionImgInput) {
      sectionImgInput = document.createElement('input');
      sectionImgInput.type = 'file';
      sectionImgInput.accept = 'image/png,image/jpeg,image/webp';
      sectionImgInput.setAttribute('data-editor', '');
      sectionImgInput.style.display = 'none';
      document.body.appendChild(sectionImgInput);
    }
    sectionImgInput.onchange = function () {
      var file = sectionImgInput.files && sectionImgInput.files[0];
      sectionImgInput.value = '';
      if (!file) return;
      toast('Uploading photo…', 'info', 2500);
      processImageFile(file).then(function (out) {
        return api('/api/upload-image', {
          folder: 'sections',
          filename: safeBaseName(file.name) + out.ext,
          data: out.base64
        });
      }).then(function (res) {
        if (res.ok && res.data.path) {
          pushHistory();
          draft.sectionData[id].image = res.data.path;
          markUnsaved();
          if (window.renderSections) window.renderSections();
          enhance();
          toast('Photo updated', 'ok');
        } else {
          toast('Could not upload the photo: ' + (res.data.error || 'unknown error'), 'error', 6000);
        }
      }).catch(function (e) {
        toast('Could not upload the photo: ' + e.message, 'error', 6000);
      });
    };
    sectionImgInput.click();
  }

  function setupSectionImages() {
    document.querySelectorAll('[data-role="sec-image"]').forEach(function (frame) {
      var section = frame.closest('[data-custom-section]');
      if (!section) return;
      var id = section.getAttribute('data-custom-section');
      frame.classList.add('ed-hostrel', 'ed-frame-clickable');
      if (!frame.querySelector('.ed-photos-btn')) {
        var btn = make('button', 'ed-photos-btn', 'Replace photo');
        btn.type = 'button';
        btn.addEventListener('click', function (e) { e.stopPropagation(); replaceSectionImage(id); });
        frame.appendChild(btn);
      }
      if (!frame.dataset.edPhotoClick) {
        frame.dataset.edPhotoClick = '1';
        frame.addEventListener('click', function (e) {
          if (e.target.closest('[data-editor]')) return;
          replaceSectionImage(id);
        });
      }
    });

    document.querySelectorAll('[data-role="sec-gallery"]').forEach(function (grid) {
      var section = grid.closest('[data-custom-section]');
      if (!section) return;
      var id = section.getAttribute('data-custom-section');
      grid.classList.add('ed-hostrel');
      if (!grid.querySelector('.ed-photos-btn')) {
        var btn = make('button', 'ed-photos-btn', 'Photos');
        btn.type = 'button';
        btn.addEventListener('click', function (e) { e.stopPropagation(); openPhotoModalSpec(gallerySpec(id)); });
        grid.appendChild(btn);
      }
    });
  }

  // ── Add section ────────────────────────────────────────────────────────────
  function openAddSectionModal() {
    if (editing) commitEdit();
    var backdrop = make('div', 'ed-backdrop');
    backdrop.id = 'ed-section-modal';
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });

    var modal = make('div', 'ed-modal ed-section-library-modal');
    var head = make('div', 'ed-modal-head');
    head.appendChild(make('h3', '', 'Add a section'));
    var close = make('button', 'ed-modal-close', '×');
    close.type = 'button';
    close.addEventListener('click', function () { backdrop.remove(); });
    head.appendChild(close);
    modal.appendChild(head);

    var picker = make('div', 'ed-section-picker');
    [['text', 'Text', 'A heading and paragraphs'],
     ['textImage', 'Text + photo', 'Words beside a photo'],
     ['gallery', 'Photo gallery', 'A grid of photos'],
     ['quote', 'Quote', 'A big centered quote'],
     ['columns', 'Columns', 'Responsive side-by-side content'],
     ['buttons', 'Buttons', 'Calls to action and links'],
     ['video', 'Video', 'YouTube or Vimeo embed'],
     ['stats', 'Stats', 'Large outcomes and numbers'],
     ['timeline', 'Timeline', 'Dated milestones or process'],
     ['testimonial', 'Testimonial', 'Quote with attribution'],
     ['skills', 'Skills', 'A flexible skill list'],
     ['experience', 'Experience', 'Roles and accomplishments'],
     ['education', 'Education', 'Degrees and coursework'],
     ['download', 'Download', 'A downloadable file button'],
     ['divider', 'Divider', 'A restrained visual separator'],
     ['spacer', 'Spacer', 'Adjustable breathing room']].forEach(function (t) {
      var card = make('button', 'ed-section-card');
      card.type = 'button';
      card.appendChild(make('span', 'ed-section-card-title', t[1]));
      card.appendChild(make('span', 'ed-section-card-desc', t[2]));
      card.addEventListener('click', function () { backdrop.remove(); addSection(t[0]); });
      picker.appendChild(card);
    });
    savedTemplates().forEach(function (template) {
      var card = make('button', 'ed-section-card ed-section-card-saved');
      card.type = 'button';
      card.appendChild(make('span', 'ed-section-card-title', template.name));
      card.appendChild(make('span', 'ed-section-card-desc', 'Saved template'));
      card.addEventListener('click', function () {
        backdrop.remove();
        pushHistory();
        insertCustomSection(template.data, null, template.styles);
        markUnsaved();
        if (window.renderSections) window.renderSections();
        enhance();
      });
      picker.appendChild(card);
    });
    var contactCard = make('button', 'ed-section-card ed-section-card-disabled');
    contactCard.type = 'button'; contactCard.disabled = true;
    contactCard.appendChild(make('span', 'ed-section-card-title', 'Contact form'));
    contactCard.appendChild(make('span', 'ed-section-card-desc', 'Requires a secure form service before it can be enabled'));
    picker.appendChild(contactCard);
    modal.appendChild(picker);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  function addSection(type) {
    pushHistory();
    ensureSections();
    draft.sectionData = draft.sectionData || {};

    var data;
    if (type === 'textImage') {
      data = { type: type, label: 'Section', heading: 'New section', body: ['Write something here.'], image: '', imageAlt: '', side: 'left' };
    } else if (type === 'gallery') {
      data = { type: type, heading: 'Gallery', images: [] };
    } else if (type === 'quote') {
      data = { type: type, text: 'A quote you love.', attribution: '- Name' };
    } else if (type === 'columns') {
      data = {
        type: type,
        heading: 'New columns section',
        columns: [
          { heading: 'First column', body: ['Add your content here.'] },
          { heading: 'Second column', body: ['Add your content here.'] }
        ]
      };
    } else if (type === 'buttons') {
      data = { type: type, heading: 'Take the next step', body: 'Add a short supporting message.', buttons: [{ label: 'Primary action', url: '#' }, { label: 'Secondary action', url: '#' }] };
    } else if (type === 'video') {
      data = { type: type, heading: 'Featured video', url: '', urlLabel: 'Change video link', caption: '' };
    } else if (type === 'stats') {
      data = { type: type, heading: 'Project outcomes', items: [{ value: '25%', label: 'Improvement' }, { value: '8', label: 'Prototypes' }, { value: '12', label: 'Interviews' }] };
    } else if (type === 'timeline' || type === 'experience' || type === 'education') {
      data = { type: type, heading: type === 'education' ? 'Education' : (type === 'experience' ? 'Experience' : 'Timeline'), items: [{ meta: '2026', title: 'First entry', body: 'Describe the milestone, role, or program.' }, { meta: '2025', title: 'Second entry', body: 'Add another useful detail.' }] };
    } else if (type === 'testimonial') {
      data = { type: type, quote: 'Add a meaningful quote here.', attribution: 'Name', role: 'Role or organization' };
    } else if (type === 'skills') {
      data = { type: type, heading: 'Skills', items: ['Product design', 'Prototyping', 'Engineering'] };
    } else if (type === 'download') {
      data = { type: type, heading: 'Download', body: 'Offer a useful file or resource.', label: 'Download file', url: 'assets/resume.pdf' };
    } else if (type === 'divider') {
      data = { type: type };
    } else if (type === 'spacer') {
      data = { type: type, height: 64 };
    } else {
      data = { type: 'text', label: 'Section', heading: 'New section', body: ['Write something here.'] };
    }
    var id = insertCustomSection(data, null, null);

    markUnsaved();
    if (window.renderSections) window.renderSections();
    enhance();
    var el = document.querySelector('[data-custom-section="' + id + '"]');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast('Added a ' + (type === 'textImage' ? 'text and photo' : type) + ' section - click its text to edit it.', 'ok', 5000);
  }

  // ── Resume upload (the "Download Resume" button on the About page) ─────────
  function setupResumeUpload() {
    var link = document.querySelector('a[href$="resume.pdf"]');
    if (!link || link.dataset.edBound) return;
    link.dataset.edBound = '1';
    link.classList.add('ed-resume-btn');
    link.title = 'Click to upload a new resume PDF';

    // Show whether a resume file exists yet.
    var badge = make('span', 'ed-resume-badge', '…');
    link.appendChild(badge);
    fetch(link.getAttribute('href'), { method: 'HEAD' }).then(function (r) {
      badge.textContent = r.ok ? 'Replace PDF' : 'No file yet - click to upload';
      badge.className = 'ed-resume-badge' + (r.ok ? '' : ' ed-resume-missing');
    }).catch(function () { badge.remove(); });

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.setAttribute('data-editor', '');
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      toast('Uploading resume…', 'info', 2500);
      var reader = new FileReader();
      reader.onload = function () {
        var base64 = String(reader.result).split(',')[1] || '';
        api('/api/upload-resume', { data: base64 }).then(function (res) {
          if (res.ok) {
            badge.textContent = 'Replace PDF';
            badge.className = 'ed-resume-badge';
            refreshStatus(); // new file on disk -> "not published yet" indicator
            toast('Resume uploaded - the Download Resume button now works. Publish to put it online.', 'ok', 6000);
          } else {
            toast('Could not upload the resume: ' + (res.data.error || 'unknown error'), 'error', 7000);
          }
        }).catch(function (e) {
          toast('Could not upload the resume: ' + e.message, 'error', 6000);
        });
      };
      reader.onerror = function () { toast('Could not read that file.', 'error', 5000); };
      reader.readAsDataURL(file);
    });

    link.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      input.click();
    });
  }

  // ── Theme panel (accent / background / fonts) ─────────────────────────────
  var themeFontsLoaded = false;
  function loadPairingPreviewFonts() {
    if (themeFontsLoaded) return;
    themeFontsLoaded = true;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.setAttribute('data-editor', '');
    link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700' +
      '&family=Playfair+Display:wght@700&family=Archivo:wght@400;700' +
      '&family=DM+Serif+Display&family=DM+Sans:wght@400;700' +
      '&family=Source+Sans+3:wght@400;600&display=swap';
    document.head.appendChild(link);
  }

  function setThemeField(name, value) {
    pushHistory();
    draft.theme = draft.theme || {};
    draft.theme[name] = value;
    if (window.applyTheme) window.applyTheme(draft.theme);
    markUnsaved();
  }

  function resetTheme() {
    if (!draft.theme) return;
    pushHistory();
    delete draft.theme;
    if (window.applyTheme) window.applyTheme(null);
    markUnsaved();
  }

  function openThemeModal() {
    if (editing) commitEdit();
    var old = document.getElementById('ed-theme-modal');
    if (old) old.remove();
    loadPairingPreviewFonts();

    var P = window.THEME_PRESETS || { accents: [], backgrounds: {}, fonts: {} };
    var theme = draft.theme || {};

    var backdrop = make('div', 'ed-backdrop');
    backdrop.id = 'ed-theme-modal';
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });

    var modal = make('div', 'ed-modal ed-modal-theme');
    var head = make('div', 'ed-modal-head');
    head.appendChild(make('h3', '', 'Design & theme'));
    var close = make('button', 'ed-modal-close', '×');
    close.type = 'button';
    close.addEventListener('click', function () { backdrop.remove(); });
    head.appendChild(close);
    modal.appendChild(head);

    var reopen = function () { backdrop.remove(); openThemeModal(); };
    var body = make('div', 'ed-theme-body');

    // Accent
    body.appendChild(make('div', 'ed-theme-label', 'Accent color'));
    var accentRow = make('div', 'ed-swatch-row');
    (P.accents || []).forEach(function (a) {
      var sw = make('button', 'ed-swatch');
      sw.type = 'button';
      sw.title = a.name;
      sw.style.background = a.value;
      if ((theme.accent || '#bb0018').toLowerCase() === a.value.toLowerCase()) sw.classList.add('ed-active');
      sw.addEventListener('click', function () { setThemeField('accent', a.value); reopen(); });
      accentRow.appendChild(sw);
    });
    var custom = document.createElement('input');
    custom.type = 'color';
    custom.className = 'ed-swatch ed-swatch-custom';
    custom.setAttribute('data-editor', '');
    custom.title = 'Custom color';
    custom.value = theme.accent || '#bb0018';
    custom.addEventListener('input', function () {
      setThemeField('accent', custom.value);
      accentRow.querySelectorAll('.ed-swatch:not(.ed-swatch-custom)').forEach(function (s) { s.classList.remove('ed-active'); });
    });
    accentRow.appendChild(custom);
    body.appendChild(accentRow);

    // Background
    body.appendChild(make('div', 'ed-theme-label', 'Background'));
    var bgRow = make('div', 'ed-card-row');
    [['paper', 'Paper'], ['warm', 'Warm'], ['cool', 'Cool'], ['cream', 'Cream']].forEach(function (b) {
      var preset = P.backgrounds[b[0]] || { surface: '#fff', low: '#eee' };
      var card = make('button', 'ed-bg-card');
      card.type = 'button';
      card.style.background = preset.surface;
      if ((theme.background || 'paper') === b[0]) card.classList.add('ed-active');
      var dot = make('span', 'ed-bg-dot');
      dot.style.background = preset.low;
      card.appendChild(dot);
      card.appendChild(make('span', 'ed-bg-name', b[1]));
      card.addEventListener('click', function () { setThemeField('background', b[0]); reopen(); });
      bgRow.appendChild(card);
    });
    body.appendChild(bgRow);

    // Fonts
    body.appendChild(make('div', 'ed-theme-label', 'Fonts'));
    var fontList = make('div', 'ed-font-list');
    [['modern', 'Modern'], ['grotesk', 'Grotesk'], ['editorial', 'Editorial'], ['archivo', 'Bold'], ['classic', 'Classic']].forEach(function (f) {
      var fp = P.fonts[f[0]] || { headline: 'sans-serif', body: 'sans-serif' };
      var card = make('button', 'ed-font-card');
      card.type = 'button';
      if ((theme.fonts || 'modern') === f[0]) card.classList.add('ed-active');
      var big = make('span', 'ed-font-big', 'Aa');
      big.style.fontFamily = "'" + fp.headline + "', serif";
      var meta = make('span', 'ed-font-meta', f[1] + '  -  ' + fp.headline + ' / ' + fp.body);
      meta.style.fontFamily = "'" + fp.body + "', sans-serif";
      card.appendChild(big);
      card.appendChild(meta);
      card.addEventListener('click', function () { setThemeField('fonts', f[0]); reopen(); });
      fontList.appendChild(card);
    });
    body.appendChild(fontList);
    modal.appendChild(body);

    var foot = make('div', 'ed-modal-foot');
    var resetBtn = make('button', 'ed-btn ed-btn-ghost', 'Reset to original design');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', function () { resetTheme(); reopen(); });
    foot.appendChild(resetBtn);
    modal.appendChild(foot);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  // ── Editable links (LinkedIn / email destinations) ────────────────────────
  var linkPopover = null;
  function onLinkOutside(e) {
    if (linkPopover && !linkPopover.contains(e.target)) closeLinkPopover();
  }
  function closeLinkPopover() {
    if (linkPopover) { linkPopover.remove(); linkPopover = null; }
    document.removeEventListener('mousedown', onLinkOutside, true);
  }

  function openLinkPopover(anchor, kind, path) {
    if (editing) commitEdit();
    closeLinkPopover();
    var current = getPath(draft, path) || '';

    var pop = make('div', 'ed-link-pop');
    pop.appendChild(make('div', 'ed-link-pop-label', kind === 'mailto' ? 'Email address' : 'Link address (URL)'));
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'ed-link-input';
    input.setAttribute('data-editor', '');
    input.value = current;
    pop.appendChild(input);

    var row = make('div', 'ed-link-pop-row');
    var save = make('button', 'ed-btn ed-btn-save', 'Save');
    save.type = 'button';
    var cancel = make('button', 'ed-btn ed-btn-ghost', 'Cancel');
    cancel.type = 'button';
    row.appendChild(save);
    row.appendChild(cancel);
    pop.appendChild(row);

    function commit() {
      var val = input.value.trim();
      if (kind === 'mailto') {
        if (val.indexOf('@') === -1) { toast('That does not look like an email address.', 'error', 4000); return; }
      } else if (val && !/^(https?:\/\/|mailto:|assets\/|\/|#)/i.test(val)) {
        val = 'https://' + val;
      }
      pushHistory();
      setPath(draft, path, val);
      if (window.applyContent) window.applyContent();
      markUnsaved();
      if (anchor.closest('[data-custom-section]') && window.renderSections) {
        window.renderSections();
        enhance();
      }
      closeLinkPopover();
      toast('Link updated', 'ok', 2500);
    }
    save.addEventListener('click', commit);
    cancel.addEventListener('click', closeLinkPopover);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeLinkPopover(); }
    });

    document.body.appendChild(pop);
    linkPopover = pop;
    var r = anchor.getBoundingClientRect();
    var top = r.bottom + 8;
    if (top > window.innerHeight - 120) top = Math.max(8, r.top - 130);
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 290)) + 'px';
    input.focus();
    input.select();
    setTimeout(function () { document.addEventListener('mousedown', onLinkOutside, true); }, 0);
  }

  function adornLinks() {
    document.querySelectorAll('[data-content-href],[data-content-mailto]').forEach(function (a) {
      if (a.dataset.edLinkBound) return;
      a.dataset.edLinkBound = '1';
      a.classList.add('ed-link-editable');
      a.title = 'Click to change where this links';
      var isMailto = a.hasAttribute('data-content-mailto');
      var path = a.getAttribute(isMailto ? 'data-content-mailto' : 'data-content-href');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openLinkPopover(a, isMailto ? 'mailto' : 'href', path);
      });
    });
  }

  // ── Enhance (idempotent; re-run after every render) ───────────────────────
  function enhance() {
    document.querySelectorAll('[data-content]').forEach(setupEditable);
    adornTags();
    adornParagraphLists();
    adornSectionLists();
    adornProjectControls();
    adornPhotoButtons();
    adornSections();
    setupSectionImages();
    setupProfilePhoto();
    setupResumeUpload();
    adornLinks();
    refreshLayers();
  }

  // ── Workspace shell ──────────────────────────────────────────────────────
  function sectionLabel(el) {
    if (!el) return 'Page';
    var id = el.getAttribute('data-section') || el.getAttribute('data-custom-section');
    if (id) return (BUILTIN_LABELS[id] || id).replace(/[-_]/g, ' ');
    if (el.id === 'projects-container') return 'Projects';
    var heading = el.querySelector('h1,h2,h3');
    return heading && heading.textContent.trim() ? heading.textContent.trim().slice(0, 42) : 'Section';
  }

  function pageSections() {
    var main = document.querySelector('main');
    if (!main) return [];
    return Array.prototype.slice.call(main.children).filter(function (el) {
      return !el.hasAttribute('data-editor') &&
        (el.matches('section,[data-section],[data-custom-section],#projects-container'));
    });
  }

  function selectSection(el) {
    if (selectedSection === el) return;
    if (selectedSection) selectedSection.classList.remove('ed-selected-section');
    selectedSection = el || null;
    if (selectedSection) selectedSection.classList.add('ed-selected-section');
    if (breadcrumbEl) breadcrumbEl.textContent = selectedSection
      ? (isHomePage ? 'Projects / ' : 'About / ') + sectionLabel(selectedSection)
      : (isHomePage ? 'Projects' : 'About');
    refreshLayers();
  }

  function refreshLayers() {
    if (!sidebarPanel || activeWorkspaceTab !== 'layers') return;
    renderWorkspacePanel('layers');
  }

  function workspaceButton(label, description, handler, className) {
    var button = make('button', 'ed-workspace-command' + (className ? ' ' + className : ''));
    button.type = 'button';
    button.appendChild(make('span', 'ed-workspace-command-label', label));
    if (description) button.appendChild(make('span', 'ed-workspace-command-desc', description));
    button.addEventListener('click', handler);
    return button;
  }

  function sitePages() {
    var pages = {
      about: { id: 'about', title: 'About', slug: 'index.html', builtin: true, status: 'published' },
      projects: { id: 'projects', title: 'Projects', slug: 'projects.html', builtin: true, status: 'published' }
    };
    Object.keys(draft.sitePages || {}).forEach(function (id) {
      pages[id] = Object.assign({ id: id, status: 'published' }, draft.sitePages[id]);
    });
    return pages;
  }

  function pageUrl(page) {
    var homeId = draft.siteSettings && draft.siteSettings.homePageId || 'about';
    if (page.id === homeId) return '/index.html';
    if (page.id === 'about' && homeId !== 'about') return '/about.html';
    return '/' + page.slug;
  }

  function uniquePageSlug(title, excludeId) {
    var base = String(title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    var slug = base + '.html';
    var number = 2;
    var pages = sitePages();
    function used(candidate) {
      return Object.keys(pages).some(function (id) { return id !== excludeId && pages[id].slug === candidate; });
    }
    while (used(slug) || slug === 'index.html' || slug === 'about.html' || slug === 'projects.html') {
      slug = base + '-' + number + '.html'; number += 1;
    }
    return slug;
  }

  function addPage() {
    var title = prompt('Name for the new page:');
    if (title === null || !title.trim()) return;
    title = title.trim();
    pushHistory();
    draft.sitePages = draft.sitePages || {};
    draft.siteNavigation = draft.siteNavigation || ['projects', 'about'];
    draft.sections = draft.sections || {};
    var id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    var baseId = id, number = 2;
    while (sitePages()[id]) { id = baseId + '-' + number; number += 1; }
    var slug = uniquePageSlug(title);
    draft.sitePages[id] = { id: id, title: title, slug: slug, status: 'published' };
    draft.siteNavigation.push(id);
    draft.sections[id] = [];
    markUnsaved();
    save({ silent: true }).then(function () { location.href = '/' + slug; });
  }

  function duplicatePage(id) {
    var source = sitePages()[id];
    if (!source || source.builtin) return;
    pushHistory();
    var title = source.title + ' Copy';
    var newId = uniquePageSlug(title).replace(/\.html$/, '');
    var slug = uniquePageSlug(title);
    draft.sitePages[newId] = { id: newId, title: title, slug: slug, status: 'hidden' };
    draft.siteNavigation = draft.siteNavigation || ['projects', 'about'];
    draft.siteNavigation.push(newId);
    draft.sections = draft.sections || {};
    draft.sectionData = draft.sectionData || {};
    draft.sections[newId] = [];
    (draft.sections[id] || []).forEach(function (entry) {
      if (entry.builtin) return;
      var data = draft.sectionData[entry.id];
      if (!data) return;
      var newSectionId = uniqueSectionId(data.type || 'text');
      draft.sectionData[newSectionId] = cloneJson(data);
      copyScopedStyles('sectionData.' + entry.id + '.', 'sectionData.' + newSectionId + '.');
      draft.sections[newId].push({ id: newSectionId, type: data.type || 'text' });
    });
    markUnsaved(); renderWorkspacePanel('pages'); toast('Page duplicated as hidden', 'ok');
  }

  function deletePage(id) {
    var page = sitePages()[id];
    if (!page || page.builtin || !confirm('Delete the page "' + page.title + '"?')) return;
    pushHistory();
    (draft.sections && draft.sections[id] || []).forEach(function (entry) {
      if (draft.sectionData) delete draft.sectionData[entry.id];
    });
    if (draft.sections) delete draft.sections[id];
    delete draft.sitePages[id];
    draft.siteNavigation = (draft.siteNavigation || []).filter(function (pageId) { return pageId !== id; });
    if (draft.siteSettings && draft.siteSettings.homePageId === id) draft.siteSettings.homePageId = 'about';
    markUnsaved(); renderWorkspacePanel('pages');
  }

  function openPageSettings(id) {
    var page = sitePages()[id];
    if (!page) return;
    var backdrop = make('div', 'ed-backdrop');
    var modal = make('div', 'ed-modal ed-modal-sm');
    var head = make('div', 'ed-modal-head'); head.appendChild(make('h3', '', 'Page settings'));
    var close = make('button', 'ed-modal-close', '×'); close.type = 'button'; close.addEventListener('click', function () { backdrop.remove(); }); head.appendChild(close); modal.appendChild(head);
    var form = make('div', 'ed-details-form');
    var titleLabel = make('label', 'ed-setting-field'); titleLabel.appendChild(make('span', '', 'Page title'));
    var titleInput = document.createElement('input'); titleInput.type = 'text'; titleInput.value = page.title; titleInput.setAttribute('data-editor', ''); titleLabel.appendChild(titleInput); form.appendChild(titleLabel);
    var slugLabel = make('label', 'ed-setting-field'); slugLabel.appendChild(make('span', '', 'Page URL'));
    var slugInput = document.createElement('input'); slugInput.type = 'text'; slugInput.value = page.slug; slugInput.disabled = !!page.builtin; slugInput.setAttribute('data-editor', ''); slugLabel.appendChild(slugInput); form.appendChild(slugLabel);
    var hiddenLabel = make('label', 'ed-check-label'); var hidden = document.createElement('input'); hidden.type = 'checkbox'; hidden.checked = page.status === 'hidden'; hidden.setAttribute('data-editor', ''); hiddenLabel.appendChild(hidden); hiddenLabel.appendChild(make('span', '', 'Hide from navigation')); form.appendChild(hiddenLabel);
    var homeLabel = make('label', 'ed-check-label'); var home = document.createElement('input'); home.type = 'checkbox'; home.checked = (draft.siteSettings && draft.siteSettings.homePageId || 'about') === id; home.setAttribute('data-editor', ''); homeLabel.appendChild(home); homeLabel.appendChild(make('span', '', 'Use as home page')); form.appendChild(homeLabel);
    modal.appendChild(form);
    var foot = make('div', 'ed-modal-foot');
    if (!page.builtin) {
      var duplicate = make('button', 'ed-btn ed-btn-ghost', 'Duplicate'); duplicate.type = 'button'; duplicate.addEventListener('click', function () { backdrop.remove(); duplicatePage(id); }); foot.appendChild(duplicate);
      var remove = make('button', 'ed-btn ed-btn-ghost', 'Delete'); remove.type = 'button'; remove.addEventListener('click', function () { backdrop.remove(); deletePage(id); }); foot.appendChild(remove);
    }
    var savePage = make('button', 'ed-btn ed-btn-save', 'Save page'); savePage.type = 'button';
    savePage.addEventListener('click', function () {
      if (!titleInput.value.trim()) return;
      pushHistory(); draft.sitePages = draft.sitePages || {};
      var target = draft.sitePages[id] || cloneJson(page);
      target.title = titleInput.value.trim(); target.status = hidden.checked ? 'hidden' : 'published';
      if (!page.builtin) target.slug = uniquePageSlug(slugInput.value.replace(/\.html$/, ''), id);
      draft.sitePages[id] = target;
      draft.siteSettings = draft.siteSettings || {}; if (home.checked) draft.siteSettings.homePageId = id;
      else if (draft.siteSettings.homePageId === id) draft.siteSettings.homePageId = 'about';
      markUnsaved(); backdrop.remove(); renderWorkspacePanel('pages');
    });
    foot.appendChild(savePage); modal.appendChild(foot); backdrop.appendChild(modal); document.body.appendChild(backdrop);
  }

  function moveNavigationItem(id, direction) {
    draft.siteNavigation = draft.siteNavigation || ['projects', 'about'];
    var index = draft.siteNavigation.indexOf(id), target = index + direction;
    if (index < 0 || target < 0 || target >= draft.siteNavigation.length) return;
    pushHistory(); var item = draft.siteNavigation[index]; draft.siteNavigation[index] = draft.siteNavigation[target]; draft.siteNavigation[target] = item;
    markUnsaved(); renderWorkspacePanel('pages');
  }

  function addExternalNavigation() {
    var label = prompt('Navigation label:'); if (label === null || !label.trim()) return;
    var url = prompt('Web address:'); if (url === null || !url.trim()) return;
    url = url.trim(); if (!/^(https?:\/\/|mailto:)/i.test(url)) url = 'https://' + url;
    pushHistory(); draft.siteNavLinks = draft.siteNavLinks || [];
    draft.siteNavLinks.push({ id: 'external-' + Date.now(), label: label.trim(), url: url });
    markUnsaved(); renderWorkspacePanel('pages');
  }

  function deleteExternalNavigation(id) {
    pushHistory(); draft.siteNavLinks = (draft.siteNavLinks || []).filter(function (link) { return link.id !== id; });
    markUnsaved(); renderWorkspacePanel('pages');
  }

  function renderWorkspacePanel(tabName) {
    if (!sidebarPanel) return;
    activeWorkspaceTab = tabName;
    sidebar.querySelectorAll('.ed-workspace-tab').forEach(function (tab) {
      tab.classList.toggle('ed-active', tab.dataset.tab === tabName);
      tab.setAttribute('aria-selected', tab.dataset.tab === tabName ? 'true' : 'false');
    });
    sidebarPanel.innerHTML = '';

    var titleMap = { pages: 'Pages', layers: 'Layers', add: 'Add', design: 'Design', media: 'Media' };
    var panelHead = make('div', 'ed-workspace-panel-head');
    panelHead.appendChild(make('h2', 'ed-workspace-title', titleMap[tabName]));
    var closePanel = make('button', 'ed-workspace-close', 'Close');
    closePanel.type = 'button';
    closePanel.addEventListener('click', function () { sidebar.classList.remove('ed-mobile-open'); });
    panelHead.appendChild(closePanel);
    sidebarPanel.appendChild(panelHead);

    if (tabName === 'pages') {
      var pageList = make('div', 'ed-workspace-list');
      var pages = sitePages();
      var order = (draft.siteNavigation || ['projects', 'about']).slice();
      Object.keys(pages).forEach(function (id) { if (order.indexOf(id) === -1) order.push(id); });
      order.forEach(function (id) {
        var page = pages[id]; if (!page) return;
        var row = make('div', 'ed-page-row' + (currentPageId === id ? ' ed-active' : ''));
        var link = make('a', 'ed-page-select'); link.href = pageUrl(page);
        link.appendChild(make('span', 'ed-page-icon', page.title.charAt(0).toUpperCase())); link.appendChild(make('span', '', page.title));
        if ((draft.siteSettings && draft.siteSettings.homePageId || 'about') === id) link.appendChild(make('span', 'ed-page-home', 'Home'));
        if (page.status === 'hidden') link.appendChild(make('span', 'ed-page-home', 'Hidden'));
        var up = make('button', 'ed-layer-action', '↑'); up.type = 'button'; up.title = 'Move navigation item up'; up.disabled = order.indexOf(id) === 0; up.addEventListener('click', function () { moveNavigationItem(id, -1); });
        var down = make('button', 'ed-layer-action', '↓'); down.type = 'button'; down.title = 'Move navigation item down'; down.disabled = order.indexOf(id) === order.length - 1; down.addEventListener('click', function () { moveNavigationItem(id, 1); });
        var settings = make('button', 'ed-layer-action', '⚙'); settings.type = 'button'; settings.title = 'Page settings'; settings.addEventListener('click', function () { openPageSettings(id); });
        row.appendChild(link); row.appendChild(up); row.appendChild(down); row.appendChild(settings); pageList.appendChild(row);
      });
      (draft.siteNavLinks || []).forEach(function (external) {
        var row = make('div', 'ed-page-row');
        var label = make('div', 'ed-page-select'); label.appendChild(make('span', 'ed-page-icon', '↗')); label.appendChild(make('span', '', external.label)); label.appendChild(make('span', 'ed-page-home', 'External'));
        var remove = make('button', 'ed-layer-action', '×'); remove.type = 'button'; remove.title = 'Remove navigation link'; remove.addEventListener('click', function () { deleteExternalNavigation(external.id); });
        row.appendChild(label); row.appendChild(remove); pageList.appendChild(row);
      });
      sidebarPanel.appendChild(pageList);
      sidebarPanel.appendChild(workspaceButton('Add page', 'Create another static page', addPage, 'ed-workspace-command-primary'));
      sidebarPanel.appendChild(workspaceButton('Add external link', 'Link navigation to another website', addExternalNavigation));
      return;
    }

    if (tabName === 'layers') {
      var layers = make('div', 'ed-layer-list');
      [['Header', document.querySelector('body > nav')], ['Footer', document.querySelector('body > footer')]]
        .forEach(function (globalItem) {
          if (!globalItem[1]) return;
          var globalRow = make('button', 'ed-layer-row ed-layer-global');
          globalRow.type = 'button';
          globalRow.appendChild(make('span', 'ed-layer-index', 'G'));
          globalRow.appendChild(make('span', 'ed-layer-name', globalItem[0]));
          globalRow.appendChild(make('span', 'ed-layer-state', 'Global'));
          globalRow.addEventListener('click', function () {
            selectSection(globalItem[1]);
            globalItem[1].scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          layers.appendChild(globalRow);
        });
      pageSections().forEach(function (el, index) {
        var row = make('div', 'ed-layer-row' + (selectedSection === el ? ' ed-active' : ''));
        var layerId = el.getAttribute('data-section') || el.getAttribute('data-custom-section');
        row.draggable = !!layerId;
        if (layerId) {
          row.addEventListener('dragstart', function (event) {
            event.dataTransfer.setData('text/plain', layerId);
            event.dataTransfer.effectAllowed = 'move';
          });
          row.addEventListener('dragover', function (event) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
          });
          row.addEventListener('drop', function (event) {
            event.preventDefault();
            moveSectionTo(event.dataTransfer.getData('text/plain'), layerId);
          });
        }
        var select = make('button', 'ed-layer-select');
        select.type = 'button';
        select.appendChild(make('span', 'ed-layer-index', pad2(index + 1)));
        select.appendChild(make('span', 'ed-layer-name', sectionLabel(el)));
        if (el.style.display === 'none') select.appendChild(make('span', 'ed-layer-state', 'Hidden'));
        select.addEventListener('click', function () {
          selectSection(el);
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        row.appendChild(select);
        if (layerId) {
          var moveUp = make('button', 'ed-layer-action', '↑');
          moveUp.type = 'button';
          moveUp.title = 'Move section up';
          moveUp.disabled = index === 0;
          moveUp.addEventListener('click', function () { moveSection(layerId, -1); });
          var moveDown = make('button', 'ed-layer-action', '↓');
          moveDown.type = 'button';
          moveDown.title = 'Move section down';
          moveDown.disabled = index === pageSections().length - 1;
          moveDown.addEventListener('click', function () { moveSection(layerId, 1); });
          row.appendChild(moveUp);
          row.appendChild(moveDown);
        }
        var customId = el.getAttribute('data-custom-section');
        if (customId) {
          var duplicate = make('button', 'ed-layer-action', '⧉');
          duplicate.type = 'button';
          duplicate.title = 'Duplicate this section';
          duplicate.addEventListener('click', function () { duplicateSection(customId); });
          var copy = make('button', 'ed-layer-action', '□');
          copy.type = 'button';
          copy.title = 'Copy this section';
          copy.addEventListener('click', function () { copySection(customId); });
          row.appendChild(duplicate);
          row.appendChild(copy);
        }
        layers.appendChild(row);
      });
      sidebarPanel.appendChild(layers);
      return;
    }

    if (tabName === 'add') {
      var addList = make('div', 'ed-workspace-stack');
      var clipboard = getEditorClipboard();
      if (clipboard) {
        var canPaste = clipboard.type === 'section' || (clipboard.type === 'project' && isHomePage);
        if (canPaste) addList.appendChild(workspaceButton('Paste ' + clipboard.type, 'Insert the item copied in this editor session', pasteEditorClipboard, 'ed-workspace-command-primary'));
      }
      if (isHomePage) {
        addList.appendChild(workspaceButton('Project', 'Add another portfolio project', addProject));
      }
      addList.appendChild(workspaceButton('Section', 'Text, photo, gallery, or quote', openAddSectionModal));
      sidebarPanel.appendChild(addList);
      return;
    }

    if (tabName === 'design') {
      sidebarPanel.appendChild(workspaceButton('Site theme', 'Colors, backgrounds, and font pairing', openThemeModal));
      sidebarPanel.appendChild(make('p', 'ed-workspace-note', 'Spacing, columns, and responsive layout controls arrive in Milestones 5 and 9.'));
      return;
    }

    sidebarPanel.appendChild(make('p', 'ed-workspace-empty', 'Your centralized image and file library will appear here in Milestone 8. Project and section photo controls still work directly on the page.'));
  }

  function buildWorkspace() {
    document.body.classList.add('ed-shell-active');
    sidebar = make('aside', 'ed-workspace');
    sidebar.setAttribute('aria-label', 'Editor workspace');

    var head = make('div', 'ed-workspace-head');
    head.appendChild(make('span', 'ed-workspace-mark', 'BS'));
    var identity = make('div', 'ed-workspace-identity');
    identity.appendChild(make('strong', '', 'Portfolio Editor'));
    identity.appendChild(make('span', '', 'Local workspace'));
    head.appendChild(identity);
    sidebar.appendChild(head);

    var tabs = make('div', 'ed-workspace-tabs');
    tabs.setAttribute('role', 'tablist');
    [['pages', 'Pages'], ['layers', 'Layers'], ['add', 'Add'], ['design', 'Design'], ['media', 'Media']]
      .forEach(function (item) {
        var tab = make('button', 'ed-workspace-tab', item[1]);
        tab.type = 'button';
        tab.dataset.tab = item[0];
        tab.setAttribute('role', 'tab');
        tab.addEventListener('click', function () {
          var sameTab = activeWorkspaceTab === item[0];
          renderWorkspacePanel(item[0]);
          if (window.matchMedia('(max-width: 820px)').matches) {
            sidebar.classList.toggle('ed-mobile-open', !sameTab || !sidebar.classList.contains('ed-mobile-open'));
          }
        });
        tabs.appendChild(tab);
      });
    sidebar.appendChild(tabs);

    sidebarPanel = make('div', 'ed-workspace-panel');
    sidebar.appendChild(sidebarPanel);
    document.body.appendChild(sidebar);
    renderWorkspacePanel('pages');
  }

  function setPreviewMode(enabled) {
    if (editing) commitEdit();
    document.body.classList.toggle('ed-preview-mode', enabled);
    if (enabled) {
      var exit = make('button', 'ed-preview-exit', 'Exit preview');
      exit.type = 'button';
      exit.addEventListener('click', function () { setPreviewMode(false); });
      document.body.appendChild(exit);
    } else {
      var existing = document.querySelector('.ed-preview-exit');
      if (existing) existing.remove();
    }
  }

  // ── Toolbar ───────────────────────────────────────────────────────────────
  function buildToolbar() {
    var bar = make('div', 'ed-toolbar');

    bar.appendChild(make('span', 'ed-badge', 'EDITING'));
    breadcrumbEl = make('span', 'ed-breadcrumb', isHomePage ? 'Projects' : 'About');
    bar.appendChild(breadcrumbEl);

    var history = make('div', 'ed-history');
    undoBtn = make('button', 'ed-btn ed-btn-ghost ed-btn-icon', '↺');
    undoBtn.type = 'button';
    undoBtn.title = 'Undo (Cmd+Z)';
    undoBtn.disabled = true;
    undoBtn.addEventListener('click', undo);
    redoBtn = make('button', 'ed-btn ed-btn-ghost ed-btn-icon', '↻');
    redoBtn.type = 'button';
    redoBtn.title = 'Redo (Cmd+Shift+Z)';
    redoBtn.disabled = true;
    redoBtn.addEventListener('click', redo);
    history.appendChild(undoBtn);
    history.appendChild(redoBtn);
    bar.appendChild(history);

    var previewBtn = make('button', 'ed-btn ed-btn-ghost', 'Preview');
    previewBtn.type = 'button';
    previewBtn.id = 'ed-preview';
    previewBtn.addEventListener('click', function () { setPreviewMode(true); });
    bar.appendChild(previewBtn);

    var historyBtn = make('button', 'ed-btn ed-btn-ghost', 'History');
    historyBtn.type = 'button';
    historyBtn.id = 'ed-revisions';
    historyBtn.addEventListener('click', openRevisionsModal);
    bar.appendChild(historyBtn);

    var status = make('span', 'ed-status');
    statusDot = make('span', 'ed-dot');
    statusEl = make('span', '', 'All changes saved');
    status.appendChild(statusDot);
    status.appendChild(statusEl);
    bar.appendChild(status);

    var actions = make('div', 'ed-actions');
    var saveBtn = make('button', 'ed-btn ed-btn-save', 'Save');
    saveBtn.type = 'button';
    saveBtn.id = 'ed-save';
    saveBtn.addEventListener('click', function () { save(); });

    var discardBtn = make('button', 'ed-btn ed-btn-ghost', 'Discard');
    discardBtn.type = 'button';
    discardBtn.id = 'ed-discard';
    discardBtn.addEventListener('click', discard);

    var publishBtn = make('button', 'ed-btn ed-btn-publish', 'Publish');
    publishBtn.type = 'button';
    publishBtn.id = 'ed-publish';
    publishBtn.addEventListener('click', publish);

    actions.appendChild(saveBtn);
    actions.appendChild(discardBtn);
    actions.appendChild(publishBtn);
    bar.appendChild(actions);

    document.body.appendChild(bar);
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    isHomePage = !!document.getElementById('projects-container');
    var pageMain = document.querySelector('main[data-page-id]');
    currentPageId = pageMain && pageMain.dataset.pageId ? pageMain.dataset.pageId : (isHomePage ? 'projects' : 'about');
    pageKey = currentPageId === 'projects' ? 'home' : currentPageId;
    lastSaved = snapshot();
    buildWorkspace();
    buildToolbar();
    enhance();
    refreshStatus();
    updateHistoryButtons();

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
      // Undo/redo. While a field is being edited, let the browser handle its
      // native character-level undo instead of our operation history.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        if (editing) return;
        e.preventDefault();
        if (e.shiftKey) { redo(); } else { undo(); }
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        if (editing) return;
        e.preventDefault();
        redo();
      }
      if (e.key === 'Escape' && !editing && document.getElementById('ed-photo-modal')) {
        closePhotoModal(true);
      }
      if (e.key === 'Escape' && document.body.classList.contains('ed-preview-mode')) {
        setPreviewMode(false);
      }
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-editor]')) return;
      var section = e.target.closest('main > section, main > [data-section], main > [data-custom-section], #projects-container');
      if (section) selectSection(section);
    });

    window.addEventListener('beforeunload', function (e) {
      if (unsaved && !suppressUnloadWarning) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  // This script is deferred, so it usually executes while readyState is
  // 'interactive' - BEFORE DOMContentLoaded fires and before content-loader /
  // render-projects (whose listeners registered earlier) have run. Wait for
  // DOMContentLoaded so the page content is in place; the 'load' listener is
  // a fallback for the window between DOMContentLoaded and full load.
  var initialized = false;
  function initOnce() {
    if (initialized) return;
    initialized = true;
    init();
  }
  if (document.readyState === 'complete') {
    initOnce();
  } else {
    document.addEventListener('DOMContentLoaded', initOnce);
    window.addEventListener('load', initOnce);
  }

})();
