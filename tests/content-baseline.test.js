'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function loadContent() {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'content.js'), 'utf8');
  return new Function(source + '; return CONTENT;')();
}

test('current content document has the required top-level contract', () => {
  const content = loadContent();
  for (const key of ['nav', 'hero', 'projects', 'cta', 'footer', 'about']) {
    assert.ok(Object.prototype.hasOwnProperty.call(content, key), key);
  }
});

test('every project has stable core fields and resolvable local images', () => {
  const content = loadContent();
  assert.ok(Object.keys(content.projects).length >= 8);

  for (const [key, project] of Object.entries(content.projects)) {
    assert.equal(typeof project.title, 'string', key + '.title');
    assert.ok(project.title.trim(), key + '.title');
    assert.ok(Array.isArray(project.tags), key + '.tags');
    assert.ok(Array.isArray(project.images), key + '.images');
    for (const image of project.images) {
      assert.equal(typeof image, 'string', key + '.images');
      assert.ok(fs.existsSync(path.join(PROJECT_ROOT, image)), key + ': ' + image);
    }
  }
});

test('section registries reference valid built-in or custom section data', () => {
  const content = loadContent();
  if (!content.sections) return;

  for (const [page, entries] of Object.entries(content.sections)) {
    assert.ok(Array.isArray(entries), page);
    const ids = new Set();
    for (const entry of entries) {
      assert.equal(typeof entry.id, 'string', page);
      assert.equal(ids.has(entry.id), false, page + ': duplicate ' + entry.id);
      ids.add(entry.id);
      if (!entry.builtin) {
        assert.ok(content.sectionData && content.sectionData[entry.id], page + ': ' + entry.id);
      }
    }
  }
});
