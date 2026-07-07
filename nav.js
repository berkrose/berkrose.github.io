// ─── NAV.JS ─────────────────────────────────────────────────────────────────
// Toggles the mobile navigation menu (the ☰ icon shown below the md breakpoint).
// Loaded by index.html and projects.html. Harmless on desktop, where the menu
// button is hidden by CSS.
// ────────────────────────────────────────────────────────────────────────────

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('nav-menu-toggle');
    var panel = document.getElementById('nav-menu-panel');
    var icon = document.getElementById('nav-menu-icon');
    if (!btn || !panel) return;

    function setOpen(open) {
      panel.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (icon) icon.textContent = open ? 'close' : 'menu';
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(panel.classList.contains('hidden'));
    });

    // Tapping anywhere outside closes the menu.
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('hidden') &&
          !panel.contains(e.target) && !btn.contains(e.target)) {
        setOpen(false);
      }
    });

    // Returning to desktop width resets to the closed state.
    window.addEventListener('resize', function () {
      if (window.innerWidth >= 768) setOpen(false);
    });
  });
})();
