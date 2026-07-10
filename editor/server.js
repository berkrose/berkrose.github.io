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
};

const NO_CACHE_EXTS = new Set(['.html', '.js', '.css']);

const EDITOR_INJECTION =
  '<meta name="portfolio-editor-token" content="' + SESSION_TOKEN + '">' +
  '<link rel="stylesheet" href="/editor/editor.css"><script src="/editor/editor.js" defer></script>';

const PUBLIC_ROOT_FILES = new Set([
  'index.html', 'projects.html', 'about.html', 'content.js', 'content-loader.js',
  'render-projects.js', 'sections.js', 'theme-config.js', 'nav.js', 'lightbox.js',
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
  const requiredKeys = ['nav', 'hero', 'projects', 'cta', 'footer', 'about'];
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    !requiredKeys.every((k) => Object.prototype.hasOwnProperty.call(body, k))
  ) {
    sendJson(res, 400, {
      error: 'Body must be the complete CONTENT object with keys: ' + requiredKeys.join(', '),
    });
    return;
  }

  const previous = fs.existsSync(CONTENT_FILE)
    ? fs.readFileSync(CONTENT_FILE, 'utf8')
    : null;

  const output =
    '// Generated by the website editor - edit via Edit Website.command\n' +
    'const CONTENT = ' +
    JSON.stringify(body, null, 2) +
    ';\n';

  fs.writeFileSync(CONTENT_FILE, output, 'utf8');

  const evalError = await evaluateContentFile(CONTENT_FILE);
  if (evalError) {
    // Roll back to the previous version.
    if (previous !== null) {
      fs.writeFileSync(CONTENT_FILE, previous, 'utf8');
    } else {
      fs.unlinkSync(CONTENT_FILE);
    }
    console.error('content.js validation failed:', evalError);
    sendJson(res, 500, { error: 'Content validation failed; the previous version was restored.' });
    return;
  }

  sendJson(res, 200, { ok: true });
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
