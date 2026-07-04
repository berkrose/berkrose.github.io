// ─── CONTENT-LOADER.JS ──────────────────────────────────────────────────────
// Reads data-content attributes and populates elements from content.js.
// You do not need to edit this file.
// ─────────────────────────────────────────────────────────────────────────────

(function () {

  function resolve(obj, path) {
    return path.split('.').reduce(function (cur, key) {
      if (cur === undefined || cur === null) return undefined;
      return cur[isNaN(key) ? key : Number(key)];
    }, obj);
  }

  // Apply a per-element font-size override (CONTENT.styles[path].fontScale) by
  // wrapping the element's children in an inner span sized in em. Using em on an
  // inner span keeps responsive Tailwind sizes (e.g. text-3xl md:text-4xl) intact,
  // because the em resolves against the element's own breakpoint-aware size.
  function applyTextScale(el, path) {
    var scale = (typeof CONTENT !== 'undefined' && CONTENT.styles && CONTENT.styles[path])
      ? CONTENT.styles[path].fontScale : null;
    var wrap = el.querySelector(':scope > .txt-scale');
    if (!scale || scale === 1) {
      if (wrap) { while (wrap.firstChild) el.insertBefore(wrap.firstChild, wrap); wrap.remove(); }
      return;
    }
    if (!wrap) {
      wrap = document.createElement('span');
      wrap.className = 'txt-scale';
      while (el.firstChild) wrap.appendChild(el.firstChild);
      el.appendChild(wrap);
    }
    wrap.style.fontSize = scale + 'em';
  }

  function applyContent() {
    if (typeof CONTENT === 'undefined') return;

    document.querySelectorAll('[data-content]').forEach(function (el) {
      var path = el.getAttribute('data-content');
      var value = resolve(CONTENT, path);
      if (value === undefined || value === null) return; // safe fallback — keep existing text
      if (typeof value === 'string' && value.indexOf('<') !== -1) {
        el.innerHTML = value;  // use innerHTML for strings containing HTML tags (e.g. <br>)
      } else {
        el.textContent = String(value);
      }
      applyTextScale(el, path);
    });

    document.querySelectorAll('[data-content-src]').forEach(function (el) {
      var value = resolve(CONTENT, el.getAttribute('data-content-src'));
      if (typeof value === 'string' && value.length > 0) {
        el.src = value;
      }
    });
  }

  window.applyContent = applyContent;
  window.applyTextScale = applyTextScale;

  document.addEventListener('DOMContentLoaded', applyContent);

})();
