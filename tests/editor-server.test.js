'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(PROJECT_ROOT, 'editor', 'server.js');

let fixtureRoot;
let serverProcess;
let baseUrl;
let token;

function runGit(args) {
  return execFileSync('git', args, {
    cwd: fixtureRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function write(relative, content) {
  const destination = path.join(fixtureRoot, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function validContent(label) {
  return {
    nav: { logo: 'Test' },
    hero: { heading: label || 'Heading' },
    projects: {},
    cta: { heading: 'CTA' },
    footer: { copyright: 'Test' },
    about: { bio: ['Bio'] },
  };
}

function contentSource(content) {
  return 'const CONTENT = ' + JSON.stringify(content, null, 2) + ';\n';
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => reject(new Error('Editor server start timed out: ' + stderr)), 10000);
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Editor running at')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error('Editor server exited with code ' + code + ': ' + stderr));
    });
  });
}

function apiHeaders(extra) {
  return Object.assign({ 'X-Portfolio-Editor-Token': token }, extra || {});
}

before(async () => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-editor-test-'));

  write('index.html', '<!doctype html><html><body><main>Fixture</main></body></html>');
  write('projects.html', '<!doctype html><html><body>Projects</body></html>');
  write('about.html', '<!doctype html><html><body>About</body></html>');
  write('content.js', contentSource(validContent()));
  write('content-loader.js', '');
  write('render-projects.js', '');
  write('sections.js', '');
  write('theme-config.js', '');
  write('nav.js', '');
  write('lightbox.js', '');
  write('editor/editor.js', '');
  write('editor/editor.css', '');
  write('editor/server.js', 'private');
  write('editor/server.log', 'private');
  write('assets/images/profile.jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  write('thoughts/secret.md', 'private');
  write('EDITING.md', 'private');
  write('README.md', 'unrelated tracked file\n');

  runGit(['init', '-q', '-b', 'main']);
  runGit(['config', 'user.name', 'Portfolio Test']);
  runGit(['config', 'user.email', 'portfolio-test@example.invalid']);
  runGit(['add', '-A']);
  runGit(['commit', '-qm', 'fixture baseline']);

  const port = await getFreePort();
  baseUrl = 'http://127.0.0.1:' + port;
  serverProcess = spawn(process.execPath, [SERVER_FILE], {
    cwd: PROJECT_ROOT,
    env: Object.assign({}, process.env, {
      PORT: String(port),
      PORTFOLIO_SITE_ROOT: fixtureRoot,
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer(serverProcess);

  const html = await (await fetch(baseUrl + '/')).text();
  const match = html.match(/name="portfolio-editor-token" content="([a-f0-9]{64})"/);
  assert.ok(match, 'editor HTML should contain a 256-bit session token');
  token = match[1];
});

after(() => {
  if (serverProcess && !serverProcess.killed) serverProcess.kill('SIGTERM');
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

test('serves the editor with security headers and no-cache HTML', async () => {
  const response = await fetch(baseUrl + '/');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('requires the session token for all API routes', async () => {
  const response = await fetch(baseUrl + '/api/status');
  assert.equal(response.status, 403);
});

test('accepts an authorized status request', async () => {
  const response = await fetch(baseUrl + '/api/status', { headers: apiHeaders() });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.branch, 'main');
  assert.equal(body.dirty, false);
});

test('rejects a hostile browser origin even with the token', async () => {
  const response = await fetch(baseUrl + '/api/status', {
    headers: apiHeaders({ Origin: 'https://hostile.example' }),
  });
  assert.equal(response.status, 403);
});

test('requires JSON for state-changing API requests', async () => {
  const response = await fetch(baseUrl + '/api/content', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'text/plain' }),
    body: '{}',
  });
  assert.equal(response.status, 415);
});

test('saves and validates a complete content document', async () => {
  const next = validContent('Saved heading');
  const response = await fetch(baseUrl + '/api/content', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(next),
  });
  assert.equal(response.status, 200);
  assert.match(fs.readFileSync(path.join(fixtureRoot, 'content.js'), 'utf8'), /Saved heading/);
});

test('rejects incomplete content without replacing the saved document', async () => {
  const beforeSource = fs.readFileSync(path.join(fixtureRoot, 'content.js'), 'utf8');
  const response = await fetch(baseUrl + '/api/content', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ hero: {} }),
  });
  assert.equal(response.status, 400);
  assert.equal(fs.readFileSync(path.join(fixtureRoot, 'content.js'), 'utf8'), beforeSource);
});

test('blocks private project files and dotfiles', async () => {
  const paths = [
    '/.git/config',
    '/thoughts/secret.md',
    '/EDITING.md',
    '/editor/server.js',
    '/editor/server.log',
    '/assets/.DS_Store',
  ];
  for (const requestPath of paths) {
    const response = await fetch(baseUrl + requestPath);
    assert.equal(response.status, 404, requestPath);
  }
});

test('serves approved site and editor assets', async () => {
  for (const requestPath of ['/projects.html', '/editor/editor.js', '/editor/editor.css', '/assets/images/profile.jpeg']) {
    const response = await fetch(baseUrl + requestPath);
    assert.equal(response.status, 200, requestPath);
  }
});

test('HEAD returns asset metadata without a body', async () => {
  const response = await fetch(baseUrl + '/assets/images/profile.jpeg', { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('content-length'), '4');
});

test('rejects unsafe image upload destinations', async () => {
  const response = await fetch(baseUrl + '/api/upload-image', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ folder: '../private', filename: 'photo.jpg', data: '/9j/2Q==' }),
  });
  assert.equal(response.status, 400);
});

test('discard restores editor-owned files but preserves unrelated work', async () => {
  write('README.md', 'valuable unrelated work\n');
  write('content.js', contentSource(validContent('Temporary edit')));
  write('assets/images/new-upload.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

  const response = await fetch(baseUrl + '/api/discard', {
    method: 'POST',
    headers: apiHeaders({ 'Content-Type': 'application/json' }),
    body: '{}',
  });
  assert.equal(response.status, 200);
  assert.doesNotMatch(fs.readFileSync(path.join(fixtureRoot, 'content.js'), 'utf8'), /Temporary edit/);
  assert.equal(fs.existsSync(path.join(fixtureRoot, 'assets/images/new-upload.jpg')), false);
  assert.equal(fs.readFileSync(path.join(fixtureRoot, 'README.md'), 'utf8'), 'valuable unrelated work\n');
});
