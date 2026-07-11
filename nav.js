// ─── NAV.JS ─────────────────────────────────────────────────────────────────
// Toggles the mobile navigation menu (the ☰ icon shown below the md breakpoint).
// Loaded by index.html and projects.html. Harmless on desktop, where the menu
// button is hidden by CSS.
// ────────────────────────────────────────────────────────────────────────────

(function () {
  document.addEventListener('DOMContentLoaded', function () {
    function pageRecords() {
      var records = {
        about: { id: 'about', title: 'About', slug: 'index.html', builtin: true, status: 'published' },
        projects: { id: 'projects', title: 'Projects', slug: 'projects.html', builtin: true, status: 'published' }
      };
      if (typeof CONTENT !== 'undefined' && CONTENT.sitePages) {
        Object.keys(CONTENT.sitePages).forEach(function (id) {
          records[id] = Object.assign({ id: id, status: 'published' }, CONTENT.sitePages[id]);
        });
      }
      return records;
    }

    var pages = pageRecords();
    var homeId = (typeof CONTENT !== 'undefined' && CONTENT.siteSettings && CONTENT.siteSettings.homePageId) || 'about';
    var currentPath = location.pathname.split('/').pop() || 'index.html';
    var currentId = document.querySelector('main[data-page-id]')
      ? document.querySelector('main[data-page-id]').dataset.pageId
      : (document.getElementById('projects-container') ? 'projects' : 'about');

    if (currentPath === 'index.html' && homeId !== 'about' && pages[homeId]) {
      location.replace(pages[homeId].slug);
      return;
    }

    function pageUrl(page) {
      if (page.id === homeId) return 'index.html';
      if (page.id === 'about' && homeId !== 'about') return 'about.html';
      return page.slug;
    }

    var orderedIds = (typeof CONTENT !== 'undefined' && Array.isArray(CONTENT.siteNavigation))
      ? CONTENT.siteNavigation.slice()
      : ['projects', 'about'];
    Object.keys(pages).forEach(function (id) { if (orderedIds.indexOf(id) === -1) orderedIds.push(id); });
    var visiblePages = orderedIds.map(function (id) { return pages[id]; })
      .filter(function (page) { return page && page.status !== 'hidden'; });
    var navItems = visiblePages.concat(((typeof CONTENT !== 'undefined' && CONTENT.siteNavLinks) || []).map(function (link) {
      return { id: link.id, title: link.label, externalUrl: /^(https?:\/\/|mailto:)/i.test(link.url || '') ? link.url : '#' };
    }));

    function fillNavigation(container, kind) {
      if (!container) return;
      container.innerHTML = '';
      navItems.forEach(function (page) {
        var link = document.createElement('a');
        link.href = page.externalUrl || pageUrl(page);
        link.textContent = page.title;
        var active = page.id === currentId;
        if (page.externalUrl && /^https?:/i.test(page.externalUrl)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        if (kind === 'mobile') {
          link.className = 'block px-5 py-3 font-label text-[13px] tracking-[0.1em] uppercase ' +
            (active ? 'text-secondary' : 'text-zinc-700 hover:text-secondary hover:bg-zinc-50') + ' transition-colors';
        } else if (kind === 'footer') {
          link.className = 'font-label text-[11px] tracking-[0.1em] uppercase text-zinc-500 hover:text-secondary transition-colors underline-offset-4 hover:underline';
        } else {
          link.className = 'font-label text-[13px] tracking-[0.1em] uppercase transition-colors duration-300 ' +
            (active ? 'text-secondary border-b-2 border-secondary' : 'text-zinc-500 hover:text-black');
        }
        container.appendChild(link);
      });
    }

    var desktopNav = document.querySelector('[data-site-nav="desktop"]') || document.querySelector('nav div.hidden.md\\:flex');
    var mobileNav = document.getElementById('nav-menu-panel');
    var footerNav = document.querySelector('[data-site-nav="footer"]') || document.querySelector('footer div.flex.flex-wrap');
    fillNavigation(desktopNav, 'desktop');
    fillNavigation(mobileNav, 'mobile');
    fillNavigation(footerNav, 'footer');

    var logo = document.querySelector('nav a[data-content="nav.logo"]');
    if (logo) logo.href = 'index.html';

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
