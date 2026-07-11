// Local website editor server.
// Serves the portfolio site at http://localhost:4444 with an editor overlay
// injected into HTML pages, plus a small JSON API for editing content,
// managing images, and publishing (git commit/push).
//
// Plain Node built-ins only. Start with:  node editor/server.js
// (or double-click "Edit Website.command" in the site root)

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');
const { migrateLegacy, validateDocument } = require('./shared/model');
const { runPublishChecks } = require('./shared/publish-checks');

const HOST = '127.0.0.1';
const PORT = parseInt(process.env.PORT, 10) || 4444;

// Site root is the parent of this editor/ directory — never process.cwd(),
// so the server works no matter where it is launched from.
const SITE_ROOT = process.env.PORTFOLIO_SITE_ROOT
  ? path.resolve(process.env.PORTFOLIO_SITE_ROOT)
  : path.resolve(__dirname, '..');
const IMAGES_ROOT = path.join(SITE_ROOT, 'assets', 'images');
const CONTENT_FILE = path.join(SITE_ROOT, 'content.js');
const RESUME_FILE = path.join(SITE_ROOT, 'assets', 'resume.pdf');
const EDITOR_DATA_ROOT = path.join(SITE_ROOT, '.editor-data');
const REVISIONS_ROOT = path.join(EDITOR_DATA_ROOT, 'revisions');
const DOCUMENT_FILE = path.join(EDITOR_DATA_ROOT, 'site.json');
const GENERATED_PAGES_FILE = path.join(EDITOR_DATA_ROOT, 'generated-pages.json');
const MEDIA_METADATA_FILE = path.join(EDITOR_DATA_ROOT, 'media.json');
const HOME_STATE_FILE = path.join(EDITOR_DATA_ROOT, 'home-page.txt');
const PUBLISH_REPORT_FILE = path.join(EDITOR_DATA_ROOT, 'publish-report.json');
const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25MB request body cap
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15MB decoded image cap

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const NO_CACHE_EXTS = new Set(['.html', '.js', '.css']);

const EDITOR_INJECTION =
  '<meta name="portfolio-editor-token" content="' + SESSION_TOKEN + '">' +
  '<link rel="stylesheet" href="/editor/editor.css"><script src="/editor/editor.js" defer></script>';

const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'projects.html', 'about.html', 'content.js', 'content-loader.js',
  'render-projects.js', 'sections.js', 'theme-config.js', 'nav.js', 'lightbox.js',
  'seo.js', 'sitemap.xml', 'robots.txt',
]);
const PUBLIC_EDITOR_FILES = new Set(['editor/editor.css', 'editor/editor.js']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, {
    cwd: SITE_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function requestOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === HOST) &&
      parsed.port === String(PORT)
    );
  } catch (e) {
    return false;
  }
}

function apiRequestAllowed(req) {
  const supplied = req.headers['x-portfolio-editor-token'];
  if (typeof supplied !== 'string' || supplied.length !== SESSION_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(SESSION_TOKEN));
}

function isPublicPath(decoded) {
  const relative = decoded.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!relative || relative.split('/').some((segment) => !segment || segment.startsWith('.'))) {
    return false;
  }
  if (PUBLIC_ROOT_FILES.has(relative) || PUBLIC_EDITOR_FILES.has(relative)) return true;
  if (/^[a-z0-9][a-z0-9-]*\.html$/.test(relative)) return true;
  return relative.startsWith('assets/');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        const err = new Error('Request body too large');
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const buf = await readBody(req);
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch (e) {
    const err = new Error('Invalid JSON body');
    err.statusCode = 400;
    throw err;
  }
}

// Evaluate a JS file in a child node process to confirm it parses/runs and
// defines CONTENT. Returns null on success or an error string.
function evaluateContentFile(filePath) {
  return new Promise((resolve) => {
    const check =
      'const s = require("fs").readFileSync(process.argv[1], "utf8");' +
      'const f = new Function(s + "; return CONTENT;");' +
      'const c = f();' +
      'if (!c || typeof c !== "object") throw new Error("CONTENT missing");';
    execFile(
      process.execPath,
      ['-e', check, filePath],
      { timeout: 10000 },
      (error, stdout, stderr) => {
        resolve(error ? (stderr || error.message) : null);
      }
    );
  });
}

function validateContent(content) {
  const requiredKeys = ['nav', 'hero', 'projects', 'cta', 'footer', 'about'];
  if (
    !content || typeof content !== 'object' || Array.isArray(content) ||
    !requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(content, key))
  ) {
    return 'Document must include: ' + requiredKeys.join(', ');
  }
  return null;
}

function contentOutput(content) {
  return '// Generated by the website editor - edit via Edit Website.command\n' +
    'const CONTENT = ' + JSON.stringify(content, null, 2) + ';\n';
}

function loadContentFile() {
  const source = fs.readFileSync(CONTENT_FILE, 'utf8');
  return new Function(source + '; return CONTENT;')();
}

async function writeContentAtomic(content) {
  const validationError = validateContent(content);
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const tmp = CONTENT_FILE + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, contentOutput(content), 'utf8');
  const evalError = await evaluateContentFile(tmp);
  if (evalError) {
    fs.rmSync(tmp, { force: true });
    console.error('content.js validation failed:', evalError);
    const error = new Error('Content validation failed; the previous version was preserved.');
    error.statusCode = 500;
    throw error;
  }
  fs.renameSync(tmp, CONTENT_FILE);
}

function readStructuredDocument() {
  if (!fs.existsSync(DOCUMENT_FILE)) return null;
  try {
    const document = JSON.parse(fs.readFileSync(DOCUMENT_FILE, 'utf8'));
    return validateDocument(document).length ? null : document;
  } catch (error) {
    console.error('Could not read structured document:', error.message);
    return null;
  }
}

function writeStructuredDocument(content) {
  const document = migrateLegacy(content, readStructuredDocument());
  const mediaMetadata = readMediaMetadata();
  Object.values(document.media).forEach((item) => {
    if (mediaMetadata[item.source]) Object.assign(item, mediaMetadata[item.source]);
  });
  const errors = validateDocument(document);
  if (errors.length) throw new Error('Structured document validation failed: ' + errors.join('; '));
  fs.mkdirSync(EDITOR_DATA_ROOT, { recursive: true });
  const tmp = DOCUMENT_FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(document, null, 2), 'utf8');
  fs.renameSync(tmp, DOCUMENT_FILE);
  return document;
}

function pageHtml(page) {
  const title = String(page.title || 'Page').replace(/[<>&"]/g, '');
  const pageId = String(page.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  return '<!DOCTYPE html>\n<html class="light" lang="en">\n<head>\n' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + title + ' - Berkeley Skuratowicz</title>\n' +
    '<link href="assets/images/profile.jpeg" rel="icon" type="image/jpeg">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Inter+Tight:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@1,600&display=swap" rel="stylesheet">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined" rel="stylesheet">\n' +
    '<link href="assets/css/site.min.css" rel="stylesheet">\n' +
    '<script src="content.js"></script><script src="content-loader.js"></script><script src="sections.js"></script>\n' +
    '<script src="nav.js"></script><script src="lightbox.js"></script><script src="seo.js"></script><script src="theme-config.js"></script>\n' +
    '<style>body{background:var(--c-surface);color:#1a1c1c;font-family:var(--f-body),sans-serif}</style>\n' +
    '</head><body class="bg-surface text-on-surface antialiased">\n' +
    '<nav class="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md"><div class="flex justify-between items-center w-full px-8 py-6 max-w-[1920px] mx-auto">' +
    '<a href="index.html" class="font-bold text-lg tracking-tighter text-black" data-content="nav.logo">Berkeley Skuratowicz</a>' +
    '<div class="hidden md:flex gap-8 items-center" data-site-nav="desktop"></div>' +
    '<div class="md:hidden relative"><button id="nav-menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="nav-menu-panel" class="flex items-center text-black"><span class="material-symbols-outlined" id="nav-menu-icon">menu</span></button>' +
    '<div id="nav-menu-panel" data-site-nav="mobile" class="hidden absolute right-0 top-full mt-3 bg-white shadow-xl border border-zinc-100 py-2 min-w-[170px]"></div></div></div></nav>\n' +
    '<main data-page-id="' + pageId + '" class="pt-32 pb-24 max-w-[1920px] mx-auto min-h-screen"></main>\n' +
    '<footer class="w-full py-16 px-8 bg-surface-container-low"><div class="flex flex-col md:flex-row justify-between items-start md:items-center w-full gap-8 max-w-[1920px] mx-auto">' +
    '<div class="font-bold text-black font-headline tracking-tighter" data-content="footer.logo">Berkeley Skuratowicz</div>' +
    '<div data-site-nav="footer" class="flex flex-wrap gap-8"></div>' +
    '<div class="font-label text-[11px] tracking-[0.1em] uppercase text-zinc-400" data-content="footer.copyright"></div></div></footer>\n' +
    '</body></html>\n';
}

function generatedPages(content) {
  const pages = content.sitePages || {};
  const written = [];
  fs.mkdirSync(EDITOR_DATA_ROOT, { recursive: true });
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(GENERATED_PAGES_FILE, 'utf8')); } catch (error) {}
  for (const page of Object.values(pages)) {
    if (!page || page.builtin || !/^[a-z0-9][a-z0-9-]*\.html$/.test(page.slug || '')) continue;
    fs.writeFileSync(path.join(SITE_ROOT, page.slug), pageHtml(page), 'utf8');
    written.push(page.slug);
  }
  for (const oldSlug of previous) {
    if (!written.includes(oldSlug) && /^[a-z0-9][a-z0-9-]*\.html$/.test(oldSlug)) {
      fs.rmSync(path.join(SITE_ROOT, oldSlug), { force: true });
    }
  }
  const homeId = content.siteSettings && content.siteSettings.homePageId || 'about';
  const aboutFile = path.join(SITE_ROOT, 'about.html');
  let previousHome = '';
  try { previousHome = fs.readFileSync(HOME_STATE_FILE, 'utf8').trim(); } catch (error) {}
  if (homeId !== 'about') {
    fs.writeFileSync(aboutFile, fs.readFileSync(path.join(SITE_ROOT, 'index.html'), 'utf8'), 'utf8');
  } else if (previousHome && previousHome !== 'about') {
    fs.writeFileSync(aboutFile,
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Berkeley Skuratowicz</title>' +
      '<meta http-equiv="refresh" content="0; url=index.html"><link rel="canonical" href="https://berkrose.github.io/">' +
      '<script>window.location.replace("index.html")</script></head><body><p>This page has moved. <a href="index.html">Continue to the site</a>.</p></body></html>\n',
      'utf8');
  }
  fs.writeFileSync(HOME_STATE_FILE, homeId, 'utf8');
  fs.writeFileSync(GENERATED_PAGES_FILE, JSON.stringify(written, null, 2), 'utf8');
  generateSeoFiles(content);
}

function normalizedSiteUrl(content) {
  const raw = content.siteSeo && content.siteSeo.siteUrl || 'https://berkrose.github.io';
  try { return new URL(raw).toString().replace(/\/$/, ''); } catch (error) { return ''; }
}

function generateSeoFiles(content) {
  const siteUrl = normalizedSiteUrl(content);
  if (!siteUrl) return;
  const pages = [
    { id: 'about', slug: 'index.html', status: 'published' },
    { id: 'projects', slug: 'projects.html', status: 'published' },
  ];
  Object.values(content.sitePages || {}).forEach((page) => pages.push(page));
  const homeId = content.siteSettings && content.siteSettings.homePageId || 'about';
  const urls = pages.filter((page) => page && page.status !== 'hidden' && !(page.seo && page.seo.noIndex)).map((page) => {
    const relative = page.id === homeId ? '' : (page.id === 'about' ? 'about.html' : page.slug);
    return '  <url><loc>' + siteUrl + '/' + relative + '</loc></url>';
  });
  fs.writeFileSync(path.join(SITE_ROOT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n', 'utf8');
  fs.writeFileSync(path.join(SITE_ROOT, 'robots.txt'), 'User-agent: *\nAllow: /\nSitemap: ' + siteUrl + '/sitemap.xml\n', 'utf8');
}

function collectAssetManifest() {
  const assets = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        assets.push({
          path: path.relative(SITE_ROOT, absolute).replace(/\\/g, '/'),
          bytes: stat.size,
          modified: stat.mtime.toISOString(),
        });
      }
    }
  }
  walk(IMAGES_ROOT);
  if (fs.existsSync(RESUME_FILE)) {
    const stat = fs.statSync(RESUME_FILE);
    assets.push({ path: 'assets/resume.pdf', bytes: stat.size, modified: stat.mtime.toISOString() });
  }
  return assets.sort((a, b) => a.path.localeCompare(b.path));
}

function readMediaMetadata() {
  try { return JSON.parse(fs.readFileSync(MEDIA_METADATA_FILE, 'utf8')); }
  catch (error) { return {}; }
}

function writeMediaMetadata(metadata) {
  fs.mkdirSync(EDITOR_DATA_ROOT, { recursive: true });
  const tmp = MEDIA_METADATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(metadata, null, 2), 'utf8');
  fs.renameSync(tmp, MEDIA_METADATA_FILE);
}

function countReferences(value, target) {
  if (value === target) return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countReferences(item, target), 0);
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((sum, item) => sum + countReferences(item, target), 0);
  }
  return 0;
}

function mediaInventory() {
  const content = loadContentFile();
  const metadata = readMediaMetadata();
  return collectAssetManifest().map((asset) => {
    const absolute = path.join(SITE_ROOT, asset.path);
    const extension = path.extname(asset.path).toLowerCase();
    const hash = crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
    return Object.assign({}, asset, metadata[asset.path] || {}, {
      type: extension === '.pdf' ? 'document' : 'image',
      extension,
      hash,
      usageCount: countReferences(content, asset.path),
    });
  });
}

function validMediaPath(relative) {
  return typeof relative === 'string' &&
    (/^assets\/images\/[a-zA-Z0-9._/-]+\.(png|jpe?g|webp)$/.test(relative) || relative === 'assets/resume.pdf') &&
    !relative.split('/').some((part) => !part || part === '..' || part.startsWith('.'));
}

function detectedImageType(bytes) {
  if (bytes.length >= 8 && bytes.slice(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return '.png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return '.jpg';
  if (bytes.length >= 12 && bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') return '.webp';
  return '';
}

function imageTypeMatches(extension, detected) {
  return detected && (extension === detected || ((extension === '.jpeg' || extension === '.jpg') && detected === '.jpg'));
}

function handleMediaList(res) {
  const media = mediaInventory();
  const hashCounts = {};
  media.forEach((item) => { hashCounts[item.hash] = (hashCounts[item.hash] || 0) + 1; });
  media.forEach((item) => { item.duplicate = hashCounts[item.hash] > 1; });
  sendJson(res, 200, { media });
}

function handleMediaMetadata(body, res) {
  if (!body || !validMediaPath(body.path)) { sendJson(res, 400, { error: 'Invalid media path' }); return; }
  const metadata = readMediaMetadata();
  metadata[body.path] = {
    label: typeof body.label === 'string' ? body.label.trim().slice(0, 100) : '',
    alt: typeof body.alt === 'string' ? body.alt.trim().slice(0, 300) : '',
    caption: typeof body.caption === 'string' ? body.caption.trim().slice(0, 500) : '',
    credit: typeof body.credit === 'string' ? body.credit.trim().slice(0, 200) : '',
    focalX: Math.max(0, Math.min(100, Number(body.focalX) || 50)),
    focalY: Math.max(0, Math.min(100, Number(body.focalY) || 50)),
    archived: !!body.archived,
  };
  writeMediaMetadata(metadata);
  sendJson(res, 200, { ok: true, metadata: metadata[body.path] });
}

function handleMediaDelete(body, res) {
  const relative = body && body.path;
  if (!validMediaPath(relative) || relative === 'assets/resume.pdf') {
    sendJson(res, 400, { error: 'Only unused images can be deleted here' }); return;
  }
  const item = mediaInventory().find((entry) => entry.path === relative);
  if (!item) { sendJson(res, 404, { error: 'Media not found' }); return; }
  if (item.usageCount > 0) { sendJson(res, 409, { error: 'Media is still used ' + item.usageCount + ' time(s)' }); return; }
  const absolute = path.resolve(SITE_ROOT, relative);
  if (!absolute.startsWith(IMAGES_ROOT + path.sep)) { sendJson(res, 403, { error: 'Forbidden path' }); return; }
  fs.unlinkSync(absolute);
  const metadata = readMediaMetadata(); delete metadata[relative]; writeMediaMetadata(metadata);
  sendJson(res, 200, { ok: true });
}

function handleMediaReplace(body, res) {
  const relative = body && body.path;
  if (!validMediaPath(relative) || relative === 'assets/resume.pdf' || typeof body.data !== 'string') {
    sendJson(res, 400, { error: 'Invalid replacement request' }); return;
  }
  const extension = path.extname(relative).toLowerCase();
  const bytes = Buffer.from(body.data, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || !imageTypeMatches(extension, detectedImageType(bytes))) {
    sendJson(res, 400, { error: 'Replacement must match the existing image type and be under 15MB' }); return;
  }
  const absolute = path.resolve(SITE_ROOT, relative);
  if (!absolute.startsWith(IMAGES_ROOT + path.sep) || !fs.existsSync(absolute)) {
    sendJson(res, 404, { error: 'Media not found' }); return;
  }
  const tmp = absolute + '.tmp'; fs.writeFileSync(tmp, bytes); fs.renameSync(tmp, absolute);
  sendJson(res, 200, { ok: true, bytes: bytes.length });
}

function revisionFiles() {
  if (!fs.existsSync(REVISIONS_ROOT)) return [];
  return fs.readdirSync(REVISIONS_ROOT)
    .filter((name) => /^[a-zA-Z0-9_-]+\.json$/.test(name))
    .map((name) => path.join(REVISIONS_ROOT, name));
}

function readRevision(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error('Could not read revision:', file, error.message);
    return null;
  }
}

function listRevisions() {
  return revisionFiles().map(readRevision).filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneRevisions() {
  const revisions = listRevisions();
  const autos = revisions.filter((revision) => revision.kind === 'auto').slice(40);
  const named = revisions.filter((revision) => revision.kind === 'named').slice(20);
  for (const revision of autos.concat(named)) {
    fs.rmSync(path.join(REVISIONS_ROOT, revision.id + '.json'), { force: true });
  }
}

function createRevision(content, options) {
  const validationError = validateContent(content);
  if (validationError) throw new Error(validationError);
  const createdAt = new Date().toISOString();
  const id = createdAt.replace(/[^0-9]/g, '').slice(0, 17) + '-' + crypto.randomBytes(4).toString('hex');
  const revision = {
    id,
    createdAt,
    kind: options && options.kind === 'named' ? 'named' : 'auto',
    name: options && typeof options.name === 'string' ? options.name.trim().slice(0, 80) : '',
    content,
    assets: collectAssetManifest(),
  };
  if (options && options.report) revision.publishReport = options.report;
  fs.mkdirSync(REVISIONS_ROOT, { recursive: true });
  const destination = path.join(REVISIONS_ROOT, id + '.json');
  const tmp = destination + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(revision, null, 2), 'utf8');
  fs.renameSync(tmp, destination);
  pruneRevisions();
  return revision;
}

// ---------------------------------------------------------------------------
// API handlers
// ---------------------------------------------------------------------------

function handleStatus() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  let hasRemote = false;
  try {
    hasRemote = git(['remote']).trim().length > 0;
  } catch (e) {
    hasRemote = false;
  }

  const dirty = git(['status', '--porcelain']).trim().length > 0;

  let aheadCount = 0;
  let lastPublish = null;
  try {
    const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']).trim();
    aheadCount = parseInt(git(['rev-list', '--count', upstream + '..HEAD']).trim(), 10) || 0;
    const iso = git(['log', '-1', '--format=%cI', upstream]).trim();
    lastPublish = iso || null;
  } catch (e) {
    // No upstream configured.
    aheadCount = 0;
    lastPublish = null;
  }

  return { branch, hasRemote, dirty, aheadCount, lastPublish };
}

async function handleContent(body, res) {
  const validationError = validateContent(body);
  if (validationError) {
    sendJson(res, 400, { error: validationError });
    return;
  }
  await writeContentAtomic(body);
  const document = writeStructuredDocument(body);
  generatedPages(body);
  const revision = createRevision(body, { kind: 'auto' });
  sendJson(res, 200, {
    ok: true,
    revisionId: revision.id,
    savedAt: revision.createdAt,
    documentVersion: document.schemaVersion,
  });
}

function handleStructuredDocument(res) {
  let document = readStructuredDocument();
  if (!document) {
    const content = loadContentFile();
    document = writeStructuredDocument(content);
  }
  sendJson(res, 200, { document });
}

function handleListRevisions(res) {
  const revisions = listRevisions().map((revision) => ({
    id: revision.id,
    createdAt: revision.createdAt,
    kind: revision.kind,
    name: revision.name,
    assetCount: Array.isArray(revision.assets) ? revision.assets.length : 0,
  }));
  sendJson(res, 200, { revisions });
}

function handleCreateRevision(body, res) {
  const content = body && body.content;
  const name = body && body.name;
  const validationError = validateContent(content);
  if (validationError || typeof name !== 'string' || !name.trim()) {
    sendJson(res, 400, { error: validationError || 'Checkpoint name is required' });
    return;
  }
  const revision = createRevision(content, { kind: 'named', name });
  sendJson(res, 201, { id: revision.id, createdAt: revision.createdAt });
}

async function handleRestoreRevision(body, res) {
  const id = body && body.id;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    sendJson(res, 400, { error: 'Invalid revision ID' });
    return;
  }
  const file = path.join(REVISIONS_ROOT, id + '.json');
  if (!fs.existsSync(file)) {
    sendJson(res, 404, { error: 'Revision not found' });
    return;
  }
  const revision = readRevision(file);
  const validationError = revision && validateContent(revision.content);
  if (!revision || validationError) {
    sendJson(res, 500, { error: 'Revision is invalid and was not restored' });
    return;
  }
  await writeContentAtomic(revision.content);
  createRevision(revision.content, { kind: 'auto' });
  sendJson(res, 200, { ok: true, content: revision.content, restoredFrom: revision.id });
}

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function handleUploadImage(body, res) {
  const { folder, filename, data } = body || {};

  if (
    typeof folder !== 'string' || !SAFE_NAME_RE.test(folder) || folder.startsWith('.') ||
    typeof filename !== 'string' || !SAFE_NAME_RE.test(filename) || filename.startsWith('.')
  ) {
    sendJson(res, 400, { error: 'Invalid folder or filename' });
    return;
  }

  const ext = path.extname(filename).toLowerCase();
  if (!IMAGE_EXTS.has(ext)) {
    sendJson(res, 400, { error: 'Filename extension must be png, jpg, jpeg, or webp' });
    return;
  }

  if (typeof data !== 'string' || data.length === 0) {
    sendJson(res, 400, { error: 'Missing base64 image data' });
    return;
  }

  let bytes;
  try {
    bytes = Buffer.from(data, 'base64');
  } catch (e) {
    sendJson(res, 400, { error: 'Invalid base64 data' });
    return;
  }
  if (bytes.length === 0) {
    sendJson(res, 400, { error: 'Invalid base64 data' });
    return;
  }
  if (!imageTypeMatches(ext, detectedImageType(bytes))) {
    sendJson(res, 400, { error: 'File contents do not match the image extension' });
    return;
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    sendJson(res, 413, { error: 'Image exceeds 15MB limit' });
    return;
  }

  const dir = path.join(IMAGES_ROOT, folder);
  // Belt and braces: verify resolved dir stays inside assets/images.
  if (!path.resolve(dir).startsWith(IMAGES_ROOT + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden path' });
    return;
  }
  fs.mkdirSync(dir, { recursive: true });

  const base = path.basename(filename, ext);
  let finalName = filename;
  let counter = 2;
  while (fs.existsSync(path.join(dir, finalName))) {
    finalName = base + '-' + counter + ext;
    counter += 1;
  }

  fs.writeFileSync(path.join(dir, finalName), bytes);
  sendJson(res, 200, { path: 'assets/images/' + folder + '/' + finalName });
}

// Uploads the resume PDF to the fixed path assets/resume.pdf (overwrites).
// The "Download Resume" link on the About page points at that path.
function handleUploadResume(body, res) {
  const data = body && body.data;
  if (typeof data !== 'string' || data.length === 0) {
    sendJson(res, 400, { error: 'Missing base64 PDF data' });
    return;
  }

  let bytes;
  try {
    bytes = Buffer.from(data, 'base64');
  } catch (e) {
    sendJson(res, 400, { error: 'Invalid base64 data' });
    return;
  }
  if (bytes.length === 0 || bytes.slice(0, 5).toString('latin1') !== '%PDF-') {
    sendJson(res, 400, { error: 'File must be a PDF' });
    return;
  }
  if (bytes.length > 10 * 1024 * 1024) {
    sendJson(res, 413, { error: 'PDF exceeds 10MB limit - export a smaller version' });
    return;
  }

  const dest = RESUME_FILE;
  const tmp = dest + '.tmp';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, dest);
  sendJson(res, 200, { path: 'assets/resume.pdf', bytes: bytes.length });
}

function handleDeleteImage(body, res) {
  const relPath = body && body.path;
  const allowed = /^assets\/images\/[a-zA-Z0-9._/-]+\.(png|jpe?g|webp)$/;

  if (
    typeof relPath !== 'string' ||
    !allowed.test(relPath) ||
    relPath.split('/').some((seg) => seg === '..' || seg === '' || seg.startsWith('.'))
  ) {
    sendJson(res, 400, { error: 'Invalid image path' });
    return;
  }

  const abs = path.resolve(SITE_ROOT, relPath);
  if (!abs.startsWith(IMAGES_ROOT + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden path' });
    return;
  }

  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    sendJson(res, 404, { error: 'Image not found' });
    return;
  }

  fs.unlinkSync(abs);
  sendJson(res, 200, { ok: true });
}

function handlePublish(body, res) {
  const report = runPublishChecks(loadContentFile(), SITE_ROOT);
  fs.mkdirSync(EDITOR_DATA_ROOT, { recursive: true });
  fs.writeFileSync(PUBLISH_REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
  if (!report.passed) {
    sendJson(res, 422, { error: 'publish-checks', message: 'Fix publish errors before publishing.', report });
    return;
  }
  if (report.warnings && !(body && body.acknowledgeWarnings)) {
    sendJson(res, 409, { error: 'publish-warnings', message: 'Review and acknowledge warnings before publishing.', report });
    return;
  }
  createRevision(loadContentFile(), { kind: 'named', name: 'Publish report', report });
  git(['add', '-A']);

  const dirty = git(['status', '--porcelain']).trim().length > 0;
  let published = false;
  let output = '';

  if (dirty) {
    const message =
      (body && typeof body.message === 'string' && body.message.trim()) ||
      'Publish site update ' + new Date().toISOString();
    output += git(['commit', '-m', message]);
    published = true;
  }

  let hasRemote = false;
  try {
    hasRemote = git(['remote']).trim().length > 0;
  } catch (e) {
    hasRemote = false;
  }

  if (!hasRemote) {
    sendJson(res, 409, {
      error: 'no-remote',
      message:
        'No GitHub remote is configured yet. Your changes are saved locally' +
        (published ? ' (committed)' : '') +
        ', but publishing to the web requires connecting a GitHub repository first.',
      published,
      pushed: false,
    });
    return;
  }

  try {
    output += git(['push']);
    sendJson(res, 200, { published, pushed: true });
  } catch (e) {
    const detail = (e.stderr ? e.stderr.toString() : '') || e.message;
    console.error('git push failed:', detail);
    sendJson(res, 502, {
      error: 'push-failed',
      message:
        'Could not push to GitHub (are you online?). Your changes are committed locally and will publish next time.',
      published,
      pushed: false,
    });
  }
}

function handleDiscard(res) {
  // The editor only owns content.js, uploaded images, and the resume. Keep
  // unrelated source/docs work intact if Discard is clicked.
  git(['restore', '--worktree', '--', 'content.js', 'assets/images']);
  git(['clean', '-fd', '--', 'assets/images']);
  try {
    git(['ls-files', '--error-unmatch', 'assets/resume.pdf']);
    git(['restore', '--worktree', '--', 'assets/resume.pdf']);
  } catch (e) {
    if (fs.existsSync(RESUME_FILE)) fs.unlinkSync(RESUME_FILE);
  }
  generatedPages(loadContentFile());
  sendJson(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Static file serving
// ---------------------------------------------------------------------------

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (e) {
    sendJson(res, 400, { error: 'Bad request path' });
    return;
  }

  if (decoded === '/') decoded = '/index.html';

  if (!isPublicPath(decoded)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  const abs = path.resolve(SITE_ROOT, '.' + decoded);
  // Path traversal guard: resolved path must stay inside the site root.
  if (abs !== SITE_ROOT && !abs.startsWith(SITE_ROOT + path.sep)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (e) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  let filePath = abs;
  if (stat.isDirectory()) {
    filePath = path.join(abs, 'index.html');
    if (!fs.existsSync(filePath)) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';

  const headers = { 'Content-Type': mime };
  if (NO_CACHE_EXTS.has(ext)) {
    headers['Cache-Control'] = 'no-store, must-revalidate';
    headers['Pragma'] = 'no-cache';
  }

  if (ext === '.html') {
    // Inject the editor stylesheet/script just before </body>.
    let html = fs.readFileSync(filePath, 'utf8');
    const idx = html.lastIndexOf('</body>');
    if (idx !== -1) {
      html = html.slice(0, idx) + EDITOR_INJECTION + '\n' + html.slice(idx);
    } else {
      html += EDITOR_INJECTION;
    }
    const buf = Buffer.from(html, 'utf8');
    headers['Content-Length'] = buf.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
    return;
  }

  headers['Content-Length'] = fs.statSync(filePath).size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
  } else {
    fs.createReadStream(filePath).pipe(res);
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);

  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    sendJson(res, 400, { error: 'Bad request' });
    return;
  }

  try {
    if (pathname.startsWith('/api/')) {
      if (!requestOriginAllowed(req) || !apiRequestAllowed(req)) {
        sendJson(res, 403, { error: 'Editor session authorization failed. Reload the editor.' });
        return;
      }
      if (pathname === '/api/status' && req.method === 'GET') {
        sendJson(res, 200, handleStatus());
        return;
      }
      if (pathname === '/api/revisions' && req.method === 'GET') {
        handleListRevisions(res);
        return;
      }
      if (pathname === '/api/document' && req.method === 'GET') {
        handleStructuredDocument(res);
        return;
      }
      if (pathname === '/api/media' && req.method === 'GET') {
        handleMediaList(res);
        return;
      }
      if (pathname === '/api/publish-checks' && req.method === 'GET') {
        sendJson(res, 200, { report: runPublishChecks(loadContentFile(), SITE_ROOT) });
        return;
      }
      if (req.method === 'POST') {
        const contentType = String(req.headers['content-type'] || '').toLowerCase();
        if (!contentType.startsWith('application/json')) {
          sendJson(res, 415, { error: 'API requests must use application/json' });
          return;
        }
        const body = await readJsonBody(req);
        switch (pathname) {
          case '/api/content':
            await handleContent(body, res);
            return;
          case '/api/upload-image':
            handleUploadImage(body, res);
            return;
          case '/api/upload-resume':
            handleUploadResume(body, res);
            return;
          case '/api/delete-image':
            handleDeleteImage(body, res);
            return;
          case '/api/publish':
            handlePublish(body, res);
            return;
          case '/api/discard':
            handleDiscard(res);
            return;
          case '/api/revisions':
            handleCreateRevision(body, res);
            return;
          case '/api/revisions/restore':
            await handleRestoreRevision(body, res);
            return;
          case '/api/media/metadata':
            handleMediaMetadata(body, res);
            return;
          case '/api/media/delete':
            handleMediaDelete(body, res);
            return;
          case '/api/media/replace':
            handleMediaReplace(body, res);
            return;
        }
      }
      sendJson(res, 404, { error: 'Unknown API route' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    serveStatic(req, res, pathname);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.error('Editor request failed:', err);
    if (!res.headersSent) {
      sendJson(res, status, {
        error: status >= 500 ? 'Internal editor server error' : (err.message || 'Request failed'),
      });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    'Editor running at http://localhost:' + PORT + ' - press Ctrl+C to stop'
  );
});
