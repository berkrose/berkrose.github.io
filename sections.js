// ─── SECTIONS.JS ────────────────────────────────────────────────────────────
// Renders page section ORDER, visibility, and custom (editor-added) sections
// from CONTENT.sections / CONTENT.sectionData. When those are absent (every
// pre-v2 save and the original authored pages), this file is a no-op and the
// page renders exactly as authored. Loaded by both index.html and about.html;
// the editor uses window.renderSections() / window.defaultSections() to add,
// move, hide, and delete sections.
//
// Built-in sections are the authored <section> blocks carrying data-section.
// Custom sections carry both data-section and data-custom-section (= their id),
// and their text/images live in CONTENT.sectionData keyed by that id, so paths
// like "sectionData.<id>.heading" stay stable across reordering.
// ────────────────────────────────────────────────────────────────────────────

(function () {

  function pageId() {
    return document.getElementById('projects-container') ? 'home' : 'about';
  }

  function mainEl() {
    return document.querySelector('main');
  }

  // Authored order of built-in sections, captured once before any reordering so
  // the "no registry" state remains fully renderable (undo can restore it).
  var authoredOrder = null;
  function captureAuthored() {
    if (authoredOrder) return;
    var main = mainEl();
    if (!main) { authoredOrder = []; return; }
    authoredOrder = Array.prototype.slice
      .call(main.querySelectorAll(':scope > [data-section]'))
      .filter(function (el) { return !el.hasAttribute('data-custom-section'); })
      .map(function (el) { return el.getAttribute('data-section'); });
  }

  function defaultSections() {
    captureAuthored();
    return authoredOrder.map(function (id) { return { id: id, builtin: true }; });
  }

  // ── Element helpers ─────────────────────────────────────────────────────────
  function elc(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function stampedEl(tag, className, text, path) {
    var n = elc(tag, className, text);
    n.setAttribute('data-content', path);
    if (window.applyTextScale) window.applyTextScale(n, path);
    return n;
  }

  var LABEL_CLASS = "font-['Inter_Tight'] text-[0.6875rem] tracking-[0.15em] uppercase text-secondary font-bold block";
  var HEADING_CLASS = "text-3xl md:text-4xl font-headline font-bold tracking-[-0.02em] text-primary";
  var BODY_P_CLASS = "text-sm text-on-surface-variant leading-relaxed";

  function imagePlaceholderEl() {
    var wrap = elc('div', 'w-full h-full flex flex-col items-center justify-center gap-4');
    wrap.appendChild(elc('span', 'material-symbols-outlined text-[64px] text-zinc-300', 'image'));
    wrap.appendChild(elc('span', "font-['Inter_Tight'] text-[0.6875rem] tracking-[0.1em] uppercase text-zinc-300", 'Image Coming Soon'));
    return wrap;
  }

  function buildBody(id, data) {
    var wrap = elc('div', 'space-y-4 max-w-2xl');
    wrap.dataset.role = 'sec-body';
    (data.body || []).forEach(function (para, i) {
      wrap.appendChild(stampedEl('p', BODY_P_CLASS, para, 'sectionData.' + id + '.body.' + i));
    });
    return wrap;
  }

  // ── Custom section builders ─────────────────────────────────────────────────
  function buildTextSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-4xl mx-auto space-y-6');
    sec.appendChild(stampedEl('span', LABEL_CLASS, data.label || '', 'sectionData.' + id + '.label'));
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    sec.appendChild(buildBody(id, data));
    return sec;
  }

  function buildTextImageSection(id, data) {
    var sec = elc('section', 'px-8 py-20');
    var grid = elc('div', 'max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center');

    var textCol = elc('div', 'lg:col-span-5 space-y-6');
    textCol.appendChild(stampedEl('span', LABEL_CLASS, data.label || '', 'sectionData.' + id + '.label'));
    textCol.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    textCol.appendChild(buildBody(id, data));

    var imgCol = elc('div', 'lg:col-span-7');
    var frame = elc('div', 'aspect-[16/10] overflow-hidden bg-surface flex items-center justify-center');
    frame.dataset.role = 'sec-image';
    if (data.image) {
      var img = document.createElement('img');
      img.src = data.image;
      img.alt = data.imageAlt || '';
      img.className = 'w-full h-full object-cover';
      frame.appendChild(img);
    } else {
      frame.appendChild(imagePlaceholderEl());
    }
    imgCol.appendChild(frame);

    // side = which side the image sits on (default left).
    if (data.side === 'right') { grid.appendChild(textCol); grid.appendChild(imgCol); }
    else { grid.appendChild(imgCol); grid.appendChild(textCol); }
    sec.appendChild(grid);
    return sec;
  }

  function buildGallerySection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-6xl mx-auto space-y-8');
    sec.appendChild(stampedEl('h2', HEADING_CLASS + ' text-center', data.heading || '', 'sectionData.' + id + '.heading'));
    var grid = elc('div', 'grid grid-cols-2 md:grid-cols-3 gap-4');
    grid.dataset.role = 'sec-gallery';
    var imgs = data.images || [];
    if (imgs.length === 0) {
      var ph = elc('div', 'col-span-full aspect-[3/1] bg-surface flex items-center justify-center');
      ph.appendChild(imagePlaceholderEl());
      grid.appendChild(ph);
    } else {
      imgs.forEach(function (src) {
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.className = 'w-full aspect-square object-cover';
        grid.appendChild(img);
      });
    }
    sec.appendChild(grid);
    return sec;
  }

  function buildQuoteSection(id, data) {
    var sec = elc('section', 'max-w-6xl mx-auto my-20 py-16 px-8 border-y border-outline-variant/20');
    var inner = elc('div', 'flex flex-col items-center text-center');
    inner.appendChild(elc('span', 'material-symbols-outlined text-secondary opacity-30 text-5xl mb-12', 'format_quote'));
    var bq = document.createElement('blockquote');
    bq.appendChild(stampedEl('p', 'text-4xl md:text-6xl lg:text-7xl font-quote italic leading-tight text-primary max-w-5xl tracking-tight', data.text || '', 'sectionData.' + id + '.text'));
    bq.appendChild(stampedEl('footer', 'mt-8 text-xl md:text-2xl font-quote italic text-on-surface-variant opacity-60', data.attribution || '', 'sectionData.' + id + '.attribution'));
    inner.appendChild(bq);
    sec.appendChild(inner);
    return sec;
  }

  function buildCustomSection(id, data) {
    var sec;
    switch (data.type) {
      case 'textImage': sec = buildTextImageSection(id, data); break;
      case 'gallery':   sec = buildGallerySection(id, data); break;
      case 'quote':     sec = buildQuoteSection(id, data); break;
      default:          sec = buildTextSection(id, data); break;
    }
    sec.setAttribute('data-section', id);
    sec.setAttribute('data-custom-section', id);
    return sec;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function renderSections() {
    var main = mainEl();
    if (typeof CONTENT === 'undefined' || !main) return;
    captureAuthored();
    var page = pageId();
    var registry = (CONTENT.sections && CONTENT.sections[page]) || null;

    // Index the built-in section elements currently in the DOM.
    var builtins = {};
    Array.prototype.slice.call(main.querySelectorAll(':scope > [data-section]'))
      .forEach(function (el) {
        if (!el.hasAttribute('data-custom-section')) {
          builtins[el.getAttribute('data-section')] = el;
        }
      });

    if (!registry) {
      // No registry: drop any custom sections and restore authored order + visibility.
      Array.prototype.slice.call(main.querySelectorAll(':scope > [data-custom-section]'))
        .forEach(function (el) { el.remove(); });
      authoredOrder.forEach(function (id) {
        var el = builtins[id];
        if (el) { el.style.removeProperty('display'); main.appendChild(el); }
      });
      return;
    }

    var seenCustom = {};
    registry.forEach(function (entry) {
      var el;
      if (entry.builtin) {
        el = builtins[entry.id];
        if (!el) return;
        if (entry.hidden) el.style.display = 'none';
        else el.style.removeProperty('display');
      } else {
        seenCustom[entry.id] = true;
        var data = (CONTENT.sectionData && CONTENT.sectionData[entry.id]) || { type: entry.type || 'text' };
        var existing = main.querySelector(':scope > [data-custom-section="' + entry.id + '"]');
        el = buildCustomSection(entry.id, data);
        if (existing) existing.replaceWith(el);
        if (entry.hidden) el.style.display = 'none';
      }
      main.appendChild(el); // appendChild MOVES the node -> establishes registry order
    });

    // Remove custom sections that are no longer referenced.
    Array.prototype.slice.call(main.querySelectorAll(':scope > [data-custom-section]'))
      .forEach(function (el) {
        if (!seenCustom[el.getAttribute('data-custom-section')]) el.remove();
      });

    // Defensive: any built-in not named in the registry stays visible at the end.
    authoredOrder.forEach(function (id) {
      var inReg = registry.some(function (e) { return e.builtin && e.id === id; });
      if (!inReg && builtins[id]) { builtins[id].style.removeProperty('display'); main.appendChild(builtins[id]); }
    });
  }

  window.renderSections = renderSections;
  window.defaultSections = defaultSections;

  document.addEventListener('DOMContentLoaded', renderSections);

})();
