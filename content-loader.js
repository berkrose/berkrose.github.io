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

  function applyContent() {
    if (typeof CONTENT === 'undefined') return;

    document.querySelectorAll('[data-content]').forEach(function (el) {
      var value = resolve(CONTENT, el.getAttribute('data-content'));
      if (value === undefined || value === null) return; // safe fallback — keep existing text
      if (typeof value === 'string' && value.indexOf('<') !== -1) {
        el.innerHTML = value;  // use innerHTML for strings containing HTML tags (e.g. <br>)
      } else {
        el.textContent = String(value);
      }
    });

    document.querySelectorAll('[data-content-src]').forEach(function (el) {
      var value = resolve(CONTENT, el.getAttribute('data-content-src'));
      if (typeof value === 'string' && value.length > 0) {
        el.src = value;
      }
    });
  }

  window.applyContent = applyContent;

  document.addEventListener('DOMContentLoaded', applyContent);

})();
