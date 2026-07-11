// ─── THEME-CONFIG.JS ────────────────────────────────────────────────────────
// Shared Tailwind (Play CDN) config for both pages, PLUS the theme engine.
// Themable design tokens (accent color, page background, fonts) are routed
// through CSS custom properties so the editor can repaint the site live and
// visitors get whatever theme is saved in CONTENT.theme. When CONTENT.theme is
// absent, the built-in defaults reproduce the original design exactly.
//
// Loaded on both index.html and projects.html, right after the Tailwind CDN
// script and after content.js (so CONTENT is available).
// ────────────────────────────────────────────────────────────────────────────

(function () {

  // ── Default token values (must reproduce the original look exactly) ─────────
  var DEFAULTS = {
    '--c-accent': '#bb0018',
    '--c-accent-strong': '#e2252b',
    '--c-surface': '#f9f9f9',
    '--c-surface-low': '#f3f3f4',
    '--f-headline': "'Inter Tight', system-ui, sans-serif",
    '--f-body': "'Inter', system-ui, sans-serif",
    '--f-label': "'Inter Tight', system-ui, sans-serif"
  };

  var root = document.documentElement;
  function setVar(name, value) { root.style.setProperty(name, value); }

  // Apply defaults synchronously (before first paint) so the vars always resolve.
  Object.keys(DEFAULTS).forEach(function (k) { setVar(k, DEFAULTS[k]); });

  var systemStyle = document.createElement('style');
  systemStyle.id = 'theme-system-style';
  systemStyle.textContent =
    'html.theme-type-compact{font-size:14.5px}html.theme-type-balanced{font-size:16px}html.theme-type-expressive{font-size:17.5px}' +
    'html.theme-width-focused main{max-width:1200px!important;margin-left:auto!important;margin-right:auto!important}' +
    'html.theme-width-standard main{max-width:1920px!important;margin-left:auto!important;margin-right:auto!important}' +
    'html.theme-width-fluid main{max-width:none!important}' +
    'html.theme-density-tight main>section,html.theme-density-tight #projects-container>section{padding-top:40px!important;padding-bottom:40px!important}' +
    'html.theme-density-airy main>section,html.theme-density-airy #projects-container>section{padding-top:112px!important;padding-bottom:112px!important}' +
    'html.theme-corners-subtle main img,html.theme-corners-subtle main button,html.theme-corners-subtle main a.bg-primary{border-radius:4px!important}' +
    'html.theme-corners-soft main img,html.theme-corners-soft main button,html.theme-corners-soft main a.bg-primary{border-radius:10px!important}' +
    'html.theme-images-natural .project-img,html.theme-images-natural main img{filter:none!important}' +
    'html.theme-images-mono main img{filter:grayscale(1) contrast(1.08)!important}' +
    'html.theme-buttons-outline main a.bg-primary{background:transparent!important;color:#111!important;border:1px solid #111!important}' +
    'html.theme-buttons-minimal main a.bg-primary{background:transparent!important;color:var(--c-accent)!important;border-bottom:1px solid currentColor!important;padding-left:0!important;padding-right:0!important}';
  document.head.appendChild(systemStyle);

  function setChoiceClass(prefix, value, fallback) {
    Array.prototype.slice.call(root.classList).forEach(function (name) {
      if (name.indexOf(prefix) === 0) root.classList.remove(name);
    });
    root.classList.add(prefix + (value || fallback));
  }

  // ── Presets shared with the editor (window.THEME_PRESETS) ───────────────────
  var BACKGROUNDS = {
    paper: { surface: '#f9f9f9', low: '#f3f3f4' },
    warm:  { surface: '#faf8f5', low: '#f3efe9' },
    cool:  { surface: '#f8f9fa', low: '#eef1f4' },
    cream: { surface: '#fbf7ef', low: '#f5eede' }
  };

  var FONTS = {
    modern:    { headline: 'Inter Tight',      body: 'Inter',        label: 'Inter Tight',  css: null },
    grotesk:   { headline: 'Space Grotesk',    body: 'Inter',        label: 'Space Grotesk',
                 css: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap' },
    editorial: { headline: 'Playfair Display', body: 'Source Sans 3', label: 'Source Sans 3',
                 css: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Source+Sans+3:wght@400;600;700&display=swap' },
    archivo:   { headline: 'Archivo',          body: 'Archivo',      label: 'Archivo',
                 css: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap' },
    classic:   { headline: 'DM Serif Display', body: 'DM Sans',      label: 'DM Sans',
                 css: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Serif+Display&display=swap' }
  };

  var ACCENTS = [
    { key: 'crimson', name: 'Crimson', value: '#bb0018' },
    { key: 'ember',   name: 'Ember',   value: '#c2410c' },
    { key: 'cobalt',  name: 'Cobalt',  value: '#1d4ed8' },
    { key: 'forest',  name: 'Forest',  value: '#15803d' },
    { key: 'violet',  name: 'Violet',  value: '#6d28d9' },
    { key: 'ink',     name: 'Ink',     value: '#111111' }
  ];

  // ── Colour helper: a brighter partner shade for the accent ──────────────────
  function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
  function brighten(hex, amount) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(r + (255 - r) * amount);
    g = clamp(g + (255 - g) * amount);
    b = clamp(b + (255 - b) * amount);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ── Font <link> injection (one managed link, swapped on change) ─────────────
  function setFontLink(url) {
    var el = document.getElementById('theme-font-link');
    if (!url) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('link');
      el.id = 'theme-font-link';
      el.rel = 'stylesheet';
      document.head.appendChild(el);
    }
    if (el.href !== url) el.href = url;
  }

  function fam(name) { return "'" + name + "', system-ui, sans-serif"; }

  // ── The public entry point: paint a CONTENT.theme object (or reset on null) ──
  function applyTheme(theme) {
    theme = theme || {};

    // Accent
    if (theme.accent) {
      setVar('--c-accent', theme.accent);
      setVar('--c-accent-strong', brighten(theme.accent, 0.18));
    } else {
      setVar('--c-accent', DEFAULTS['--c-accent']);
      setVar('--c-accent-strong', DEFAULTS['--c-accent-strong']);
    }

    // Background preset
    var bg = BACKGROUNDS[theme.background] || BACKGROUNDS.paper;
    setVar('--c-surface', bg.surface);
    setVar('--c-surface-low', bg.low);

    // Font pairing
    var f = FONTS[theme.fonts] || FONTS.modern;
    setVar('--f-headline', fam(f.headline));
    setVar('--f-body', fam(f.body));
    setVar('--f-label', fam(f.label));
    setFontLink(f.css);

    setChoiceClass('theme-type-', theme.typeScale, 'balanced');
    setChoiceClass('theme-density-', theme.density, 'standard');
    setChoiceClass('theme-width-', theme.contentWidth, 'standard');
    setChoiceClass('theme-corners-', theme.corners, 'square');
    setChoiceClass('theme-images-', theme.images, 'editorial');
    setChoiceClass('theme-buttons-', theme.buttons, 'solid');
  }

  window.applyTheme = applyTheme;
  window.THEME_PRESETS = { backgrounds: BACKGROUNDS, fonts: FONTS, accents: ACCENTS };

  // ── Tailwind config (identical to the original, themable tokens now var()) ───
  if (window.tailwind) tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          'on-error-container': '#93000a',
          'inverse-primary': '#c6c6c6',
          'tertiary': '#000000',
          'tertiary-fixed-dim': '#c6c6c6',
          'on-secondary-container': '#fffbff',
          'primary-container': '#1b1b1b',
          'tertiary-container': '#1a1c1c',
          'outline': '#7e7576',
          'surface-container-highest': '#e2e2e2',
          'on-surface': '#1a1c1c',
          'outline-variant': '#cfc4c5',
          'inverse-surface': '#2f3131',
          'secondary-container': 'var(--c-accent-strong)',
          'surface': 'var(--c-surface)',
          'on-tertiary-fixed': '#1a1c1c',
          'surface-container-lowest': '#ffffff',
          'on-tertiary-container': '#838484',
          'on-tertiary-fixed-variant': '#464747',
          'surface-variant': '#e2e2e2',
          'on-secondary-fixed-variant': '#930010',
          'primary-fixed': '#e2e2e2',
          'on-background': '#1a1c1c',
          'on-secondary-fixed': '#410003',
          'inverse-on-surface': '#f0f1f1',
          'primary': '#000000',
          'surface-tint': '#5e5e5e',
          'on-surface-variant': '#4c4546',
          'on-primary-fixed': '#1b1b1b',
          'surface-container-low': 'var(--c-surface-low)',
          'secondary': 'var(--c-accent)',
          'on-primary-fixed-variant': '#474747',
          'surface-container': '#eeeeee',
          'surface-container-high': '#e8e8e8',
          'secondary-fixed': '#ffdad6',
          'tertiary-fixed': '#e3e2e2',
          'surface-bright': '#f9f9f9',
          'on-secondary': '#ffffff',
          'on-primary-container': '#848484',
          'on-error': '#ffffff',
          'error': '#ba1a1a',
          'surface-dim': '#dadada',
          'primary-fixed-dim': '#c6c6c6',
          'on-tertiary': '#ffffff',
          'error-container': '#ffdad6',
          'secondary-fixed-dim': '#ffb3ac',
          'background': 'var(--c-surface)',
          'on-primary': '#ffffff'
        },
        borderRadius: { 'DEFAULT': '0px', 'lg': '0px', 'xl': '0px', 'full': '9999px' },
        fontFamily: {
          headline: ['var(--f-headline)'],
          body: ['var(--f-body)'],
          label: ['var(--f-label)'],
          quote: ['Cormorant Garamond', 'serif']
        }
      }
    }
  };

  // Paint any saved theme immediately (before first paint; CONTENT is loaded).
  if (typeof CONTENT !== 'undefined' && CONTENT.theme) applyTheme(CONTENT.theme);

})();
