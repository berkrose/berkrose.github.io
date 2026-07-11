// ─── SECTIONS.JS ────────────────────────────────────────────────────────────
// Renders page section ORDER, visibility, and custom (editor-added) sections
// from CONTENT.sections / CONTENT.sectionData. When those are absent (every
// pre-v2 save and the original authored pages), this file is a no-op and the
// page renders exactly as authored. Loaded by both index.html and projects.html;
// the editor uses window.renderSections() / window.defaultSections() to add,
// move, hide, and delete sections.
//
// Built-in sections are the authored <section> blocks carrying data-section.
// Custom sections carry both data-section and data-custom-section (= their id),
// and their text/images live in CONTENT.sectionData keyed by that id, so paths
// like "sectionData.<id>.heading" stay stable across reordering.
// ────────────────────────────────────────────────────────────────────────────

(function () {

  var RESPONSIVE_STYLE_ID = 'section-responsive-settings';
  function ensureResponsiveStyles() {
    if (document.getElementById(RESPONSIVE_STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = RESPONSIVE_STYLE_ID;
    style.textContent =
      '@media (max-width:639px){.section-hide-mobile{display:none!important}}' +
      '@media (min-width:640px) and (max-width:1023px){.section-hide-tablet{display:none!important}}' +
      '@media (min-width:1024px){.section-hide-desktop{display:none!important}}' +
      '.section-columns-grid{display:grid;grid-template-columns:1fr}' +
      '@media (min-width:768px){.section-columns-grid[data-columns="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}' +
      '.section-columns-grid[data-columns="3"]{grid-template-columns:repeat(3,minmax(0,1fr))}' +
      '.section-columns-grid[data-columns="4"]{grid-template-columns:repeat(4,minmax(0,1fr))}}';
    document.head.appendChild(style);
  }

  function pageId() {
    var main = document.querySelector('main[data-page-id]');
    if (main && main.dataset.pageId) return main.dataset.pageId;
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

  var LABEL_CLASS = "font-label text-[0.6875rem] tracking-[0.15em] uppercase text-secondary font-bold block";
  var HEADING_CLASS = "text-3xl md:text-4xl font-headline font-bold tracking-[-0.02em] text-primary";
  var BODY_P_CLASS = "text-sm text-on-surface-variant leading-relaxed";

  function imagePlaceholderEl() {
    var wrap = elc('div', 'w-full h-full flex flex-col items-center justify-center gap-4');
    wrap.appendChild(elc('span', 'material-symbols-outlined text-[64px] text-zinc-300', 'image'));
    wrap.appendChild(elc('span', "font-label text-[0.6875rem] tracking-[0.1em] uppercase text-zinc-300", 'Image Coming Soon'));
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
    grid.dataset.layoutGrid = '';

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
      img.loading = 'lazy';
      img.decoding = 'async';
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
    grid.dataset.layoutGrid = '';
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
        img.loading = 'lazy';
        img.decoding = 'async';
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

  function buildColumnsSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-6xl mx-auto space-y-8');
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    var grid = elc('div', 'section-columns-grid gap-8');
    grid.dataset.layoutGrid = '';
    grid.dataset.sectionList = 'sectionData.' + id + '.columns';
    grid.dataset.columns = String(Math.max(1, Math.min(4, (data.columns || []).length || 2)));
    (data.columns || []).forEach(function (column, columnIndex) {
      var item = elc('div', 'space-y-4');
      item.appendChild(stampedEl('h3', 'text-xl font-headline font-bold text-primary', column.heading || '', 'sectionData.' + id + '.columns.' + columnIndex + '.heading'));
      (column.body || []).forEach(function (paragraph, paragraphIndex) {
        item.appendChild(stampedEl('p', BODY_P_CLASS, paragraph, 'sectionData.' + id + '.columns.' + columnIndex + '.body.' + paragraphIndex));
      });
      grid.appendChild(item);
    });
    sec.appendChild(grid);
    return sec;
  }

  function buildButtonsSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-4xl mx-auto space-y-6');
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    if (data.body) sec.appendChild(stampedEl('p', BODY_P_CLASS + ' max-w-2xl', data.body, 'sectionData.' + id + '.body'));
    var row = elc('div', 'flex flex-wrap gap-3');
    row.dataset.sectionList = 'sectionData.' + id + '.buttons';
    (data.buttons || []).forEach(function (button, index) {
      var holder = elc('div', 'inline-flex');
      var link = stampedEl('a', index === 0 ? 'inline-flex px-6 py-3 bg-primary text-white font-label text-xs uppercase' : 'inline-flex px-6 py-3 border border-primary text-primary font-label text-xs uppercase', button.label || '', 'sectionData.' + id + '.buttons.' + index + '.label');
      link.href = button.url || '#';
      link.setAttribute('data-content-href', 'sectionData.' + id + '.buttons.' + index + '.url');
      holder.appendChild(link); row.appendChild(holder);
    });
    sec.appendChild(row);
    return sec;
  }

  function videoEmbedUrl(value) {
    try {
      var url = new URL(value);
      var host = url.hostname.replace(/^www\./, '');
      if (host === 'youtu.be') return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(url.pathname.slice(1));
      if (host === 'youtube.com' || host === 'm.youtube.com') {
        var videoId = url.searchParams.get('v');
        if (videoId) return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId);
      }
      if (host === 'vimeo.com' && /^\/\d+/.test(url.pathname)) {
        return 'https://player.vimeo.com/video/' + encodeURIComponent(url.pathname.split('/')[1]);
      }
    } catch (error) {}
    return '';
  }

  function buildVideoSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-6xl mx-auto space-y-6');
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    var frame = elc('div', 'aspect-video bg-zinc-100 flex items-center justify-center overflow-hidden');
    var embed = videoEmbedUrl(data.url || '');
    if (embed) {
      var iframe = document.createElement('iframe');
      iframe.src = embed; iframe.title = data.heading || 'Video'; iframe.loading = 'lazy';
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      iframe.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture';
      iframe.allowFullscreen = true; iframe.className = 'w-full h-full'; frame.appendChild(iframe);
    } else frame.appendChild(elc('span', 'font-label text-xs uppercase text-zinc-400', 'Add a YouTube or Vimeo link'));
    sec.appendChild(frame);
    var link = stampedEl('a', 'inline-flex text-sm text-secondary underline', data.urlLabel || 'Change video link', 'sectionData.' + id + '.urlLabel');
    link.href = data.url || '#'; link.setAttribute('data-content-href', 'sectionData.' + id + '.url'); sec.appendChild(link);
    if (data.caption) sec.appendChild(stampedEl('p', BODY_P_CLASS, data.caption, 'sectionData.' + id + '.caption'));
    return sec;
  }

  function buildStatsSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-6xl mx-auto space-y-8');
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    var grid = elc('div', 'section-columns-grid gap-8'); grid.dataset.layoutGrid = '';
    grid.dataset.sectionList = 'sectionData.' + id + '.items';
    grid.dataset.columns = String(Math.max(1, Math.min(4, (data.items || []).length)));
    (data.items || []).forEach(function (item, index) {
      var cell = elc('div', 'space-y-2');
      cell.appendChild(stampedEl('div', 'text-4xl md:text-6xl font-headline font-bold text-secondary', item.value || '', 'sectionData.' + id + '.items.' + index + '.value'));
      cell.appendChild(stampedEl('div', 'font-label text-xs uppercase text-on-surface-variant', item.label || '', 'sectionData.' + id + '.items.' + index + '.label'));
      grid.appendChild(cell);
    });
    sec.appendChild(grid); return sec;
  }

  function buildListSection(id, data, kind) {
    var sec = elc('section', 'px-8 py-20 max-w-5xl mx-auto space-y-8');
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    var list = elc('div', 'space-y-8');
    list.dataset.sectionList = 'sectionData.' + id + '.items';
    (data.items || []).forEach(function (item, index) {
      var row = elc('article', 'grid md:grid-cols-[140px_1fr] gap-3 md:gap-8');
      row.appendChild(stampedEl('div', 'font-label text-xs uppercase text-secondary font-bold', item.meta || '', 'sectionData.' + id + '.items.' + index + '.meta'));
      var content = elc('div', 'space-y-2');
      content.appendChild(stampedEl('h3', 'text-xl font-headline font-bold text-primary', item.title || '', 'sectionData.' + id + '.items.' + index + '.title'));
      content.appendChild(stampedEl('p', BODY_P_CLASS, item.body || '', 'sectionData.' + id + '.items.' + index + '.body'));
      row.appendChild(content); list.appendChild(row);
    });
    sec.dataset.listKind = kind; sec.appendChild(list); return sec;
  }

  function buildTestimonialSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-5xl mx-auto text-center space-y-6');
    sec.appendChild(stampedEl('blockquote', 'text-3xl md:text-5xl font-quote italic text-primary leading-tight', data.quote || '', 'sectionData.' + id + '.quote'));
    sec.appendChild(stampedEl('div', 'font-label text-xs uppercase text-secondary font-bold', data.attribution || '', 'sectionData.' + id + '.attribution'));
    sec.appendChild(stampedEl('div', BODY_P_CLASS, data.role || '', 'sectionData.' + id + '.role')); return sec;
  }

  function buildSkillsSection(id, data) {
    var sec = elc('section', 'px-8 py-20 max-w-5xl mx-auto space-y-8');
    sec.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    var wrap = elc('div', 'flex flex-wrap gap-3');
    wrap.dataset.sectionList = 'sectionData.' + id + '.items';
    (data.items || []).forEach(function (item, index) {
      var holder = elc('div', 'inline-flex');
      holder.appendChild(stampedEl('span', 'border border-zinc-300 px-4 py-2 font-label text-xs uppercase', item, 'sectionData.' + id + '.items.' + index));
      wrap.appendChild(holder);
    });
    sec.appendChild(wrap); return sec;
  }

  function buildDownloadSection(id, data) {
    var sec = elc('section', 'px-8 py-16 max-w-4xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6');
    var text = elc('div', 'space-y-2');
    text.appendChild(stampedEl('h2', HEADING_CLASS, data.heading || '', 'sectionData.' + id + '.heading'));
    text.appendChild(stampedEl('p', BODY_P_CLASS, data.body || '', 'sectionData.' + id + '.body')); sec.appendChild(text);
    var link = stampedEl('a', 'inline-flex px-6 py-3 bg-primary text-white font-label text-xs uppercase', data.label || '', 'sectionData.' + id + '.label');
    link.href = data.url || '#'; link.setAttribute('data-content-href', 'sectionData.' + id + '.url'); link.setAttribute('download', ''); sec.appendChild(link);
    return sec;
  }

  function buildDividerSection() {
    var sec = elc('section', 'px-8 py-8 max-w-6xl mx-auto'); sec.appendChild(elc('div', 'h-px bg-outline-variant opacity-30')); return sec;
  }

  function buildSpacerSection(id, data) {
    var sec = elc('section', 'w-full'); sec.style.height = Math.max(16, Math.min(320, Number(data.height) || 64)) + 'px'; return sec;
  }

  function buildCustomSection(id, data) {
    var sec;
    switch (data.type) {
      case 'textImage': sec = buildTextImageSection(id, data); break;
      case 'gallery':   sec = buildGallerySection(id, data); break;
      case 'quote':     sec = buildQuoteSection(id, data); break;
      case 'columns':   sec = buildColumnsSection(id, data); break;
      case 'buttons':   sec = buildButtonsSection(id, data); break;
      case 'video':     sec = buildVideoSection(id, data); break;
      case 'stats':     sec = buildStatsSection(id, data); break;
      case 'timeline':  sec = buildListSection(id, data, 'timeline'); break;
      case 'experience': sec = buildListSection(id, data, 'experience'); break;
      case 'education': sec = buildListSection(id, data, 'education'); break;
      case 'testimonial': sec = buildTestimonialSection(id, data); break;
      case 'skills':    sec = buildSkillsSection(id, data); break;
      case 'download':  sec = buildDownloadSection(id, data); break;
      case 'divider':   sec = buildDividerSection(); break;
      case 'spacer':    sec = buildSpacerSection(id, data); break;
      default:          sec = buildTextSection(id, data); break;
    }
    sec.setAttribute('data-section', id);
    sec.setAttribute('data-custom-section', id);
    return sec;
  }

  var WIDTHS = { full: '', wide: '1440px', content: '1080px', narrow: '760px' };
  var BACKGROUNDS = {
    plain: '',
    tinted: 'var(--c-surface-low, #f3f3f4)',
    accent: 'var(--c-accent, #bb0018)',
    dark: '#161616'
  };

  function applySectionSettings(el, entry) {
    if (!el) return;
    var settings = entry.settings || {};
    el.classList.toggle('section-hide-mobile', settings.mobile === false);
    el.classList.toggle('section-hide-tablet', settings.tablet === false);
    el.classList.toggle('section-hide-desktop', settings.desktop === false);

    if (settings.width && WIDTHS[settings.width]) {
      el.style.maxWidth = WIDTHS[settings.width];
      el.style.marginLeft = 'auto';
      el.style.marginRight = 'auto';
    } else if (settings.width === 'full') {
      el.style.removeProperty('max-width');
      el.style.removeProperty('margin-left');
      el.style.removeProperty('margin-right');
    }
    if (Number.isFinite(settings.paddingTop)) el.style.paddingTop = settings.paddingTop + 'px';
    if (Number.isFinite(settings.paddingBottom)) el.style.paddingBottom = settings.paddingBottom + 'px';
    if (Number.isFinite(settings.minHeight) && settings.minHeight > 0) el.style.minHeight = settings.minHeight + 'px';
    if (settings.align) el.style.textAlign = settings.align;
    if (settings.background && BACKGROUNDS[settings.background] !== undefined) {
      if (BACKGROUNDS[settings.background]) el.style.background = BACKGROUNDS[settings.background];
      else el.style.removeProperty('background');
      var inverse = settings.background === 'accent' || settings.background === 'dark';
      el.classList.toggle('section-inverse', inverse);
      if (inverse) el.style.color = '#fff';
      else el.style.removeProperty('color');
    }
    var grid = el.querySelector('[data-layout-grid]');
    if (grid && Number.isFinite(settings.gap)) grid.style.gap = settings.gap + 'px';
    if (grid && grid.classList.contains('section-columns-grid') && Number.isFinite(settings.columns)) {
      grid.dataset.columns = String(Math.max(1, Math.min(4, settings.columns)));
      Array.prototype.forEach.call(grid.children, function (column, index) {
        column.style.display = index < settings.columns ? '' : 'none';
      });
    }
    if (settings.anchor && /^[a-z][a-z0-9-]*$/.test(settings.anchor)) el.id = settings.anchor;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  function renderSections() {
    var main = mainEl();
    if (typeof CONTENT === 'undefined' || !main) return;
    captureAuthored();
    ensureResponsiveStyles();
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
      applySectionSettings(el, entry);
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
