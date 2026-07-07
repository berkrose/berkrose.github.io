// ─── LIGHTBOX.JS ────────────────────────────────────────────────────────────
// Full-screen photo viewer for visitors. Click a project's main image (or a
// gallery section photo) to open it large, with prev/next arrows, Esc/arrow
// keys, and click-outside to close. Does nothing in the editor (there, clicks
// open the photo manager instead).
// ────────────────────────────────────────────────────────────────────────────

(function () {
  var CSS = [
    '.lb-overlay{position:fixed;inset:0;z-index:99990;background:rgba(10,10,10,.93);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:24px}',
    '.lb-img{max-width:92vw;max-height:82vh;object-fit:contain;box-shadow:0 20px 80px rgba(0,0,0,.6)}',
    '.lb-caption{color:#bbb;font-family:"Inter Tight","Inter",sans-serif;font-size:11px;letter-spacing:.12em;text-transform:uppercase;text-align:center;max-width:80vw}',
    '.lb-btn{position:absolute;background:none;border:none;color:#fff;cursor:pointer;font-size:34px;line-height:1;padding:14px;opacity:.75;user-select:none}',
    '.lb-btn:hover{opacity:1}',
    '.lb-close{top:10px;right:14px}',
    '.lb-prev{left:6px;top:50%;transform:translateY(-50%)}',
    '.lb-next{right:6px;top:50%;transform:translateY(-50%)}',
    '.lb-count{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);color:#888;font-family:"Inter Tight",sans-serif;font-size:11px;letter-spacing:.12em}',
    'img.lb-zoom{cursor:zoom-in}'
  ].join('');

  var state = null; // { images, index, alt }

  function editorActive() {
    return !!document.querySelector('.ed-toolbar');
  }

  function fileName(src) {
    return String(src).split('/').pop();
  }

  function show(images, index, alt) {
    close();
    state = { images: images, index: index, alt: alt || '' };

    var overlay = document.createElement('div');
    overlay.className = 'lb-overlay';
    overlay.id = 'lb-overlay';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });

    var img = document.createElement('img');
    img.className = 'lb-img';
    img.alt = state.alt;
    overlay.appendChild(img);

    var caption = document.createElement('div');
    caption.className = 'lb-caption';
    caption.textContent = state.alt;
    overlay.appendChild(caption);

    var closeBtn = document.createElement('button');
    closeBtn.className = 'lb-btn lb-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', close);
    overlay.appendChild(closeBtn);

    var count = document.createElement('div');
    count.className = 'lb-count';
    overlay.appendChild(count);

    if (images.length > 1) {
      var prev = document.createElement('button');
      prev.className = 'lb-btn lb-prev';
      prev.innerHTML = '&#8249;';
      prev.setAttribute('aria-label', 'Previous photo');
      prev.addEventListener('click', function () { step(-1); });
      overlay.appendChild(prev);

      var next = document.createElement('button');
      next.className = 'lb-btn lb-next';
      next.innerHTML = '&#8250;';
      next.setAttribute('aria-label', 'Next photo');
      next.addEventListener('click', function () { step(1); });
      overlay.appendChild(next);
    }

    function render() {
      img.src = state.images[state.index];
      count.textContent = state.images.length > 1
        ? (state.index + 1) + ' / ' + state.images.length : '';
    }
    overlay._render = render;
    render();

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  function step(dir) {
    if (!state) return;
    var n = state.images.length;
    state.index = (state.index + dir + n) % n;
    var overlay = document.getElementById('lb-overlay');
    if (overlay && overlay._render) overlay._render();
  }

  function close() {
    var overlay = document.getElementById('lb-overlay');
    if (overlay) overlay.remove();
    document.body.style.overflow = '';
    state = null;
  }

  document.addEventListener('keydown', function (e) {
    if (!state) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  document.addEventListener('click', function (e) {
    if (editorActive()) return; // editor owns image clicks
    var img = e.target.closest('img');
    if (!img || img.closest('#lb-overlay')) return;

    // Project main image -> that project's full photo set, starting at the
    // currently shown photo (thumbnails may have swapped it).
    if (img.classList.contains('project-img')) {
      var section = img.closest('[data-project-key]');
      var key = section && section.dataset.projectKey;
      var proj = key && typeof CONTENT !== 'undefined' && CONTENT.projects && CONTENT.projects[key];
      var images = (proj && proj.images && proj.images.length) ? proj.images : [img.getAttribute('src')];
      var current = fileName(img.src);
      var idx = 0;
      images.forEach(function (s, i) { if (fileName(s) === current) idx = i; });
      show(images, idx, proj ? (proj.imageAlt || proj.title) : img.alt);
      return;
    }

    // Gallery section photo -> that gallery's set.
    var gallery = img.closest('[data-role="sec-gallery"]');
    if (gallery) {
      var imgs = Array.prototype.slice.call(gallery.querySelectorAll('img'))
        .map(function (im) { return im.getAttribute('src'); });
      show(imgs, imgs.indexOf(img.getAttribute('src')), img.alt);
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    if (!editorActive()) {
      // zoom cursor hint on eligible photos (re-applied after renders is not
      // needed for visitors, where render happens once on load)
      setTimeout(function () {
        document.querySelectorAll('img.project-img, [data-role="sec-gallery"] img')
          .forEach(function (im) { im.classList.add('lb-zoom'); });
      }, 0);
    }
  });
})();
