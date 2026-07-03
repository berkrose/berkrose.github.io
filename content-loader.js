// ─── CONTENT-LOADER.JS ──────────────────────────────────────────────────────
// Reads data-content attributes and populates elements from content.js.
// You do not need to edit this file.
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
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

  function resolve(obj, path) {
    return path.split('.').reduce(function (cur, key) {
      if (cur === undefined || cur === null) return undefined;
      return cur[isNaN(key) ? key : Number(key)];
    }, obj);
  }
});
