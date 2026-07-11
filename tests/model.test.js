'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const { migrateLegacy, stableId, toLegacyContent, validateDocument } = require('../editor/shared/model');

function loadContent() {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, 'content.js'), 'utf8');
  return new Function(source + '; return CONTENT;')();
}

test('stable IDs are deterministic and namespaced', () => {
  assert.equal(stableId('section', 'about:bio'), stableId('section', 'about:bio'));
  assert.notEqual(stableId('section', 'about:bio'), stableId('block', 'about:bio'));
  assert.notEqual(stableId('section', 'about:bio'), stableId('section', 'about:quote'));
});

test('current content migrates into a valid versioned document', () => {
  const content = loadContent();
  const document = migrateLegacy(content);
  assert.deepEqual(validateDocument(document), []);
  assert.equal(document.schemaVersion, 1);
  assert.equal(document.site.homePageId, 'about');
  assert.deepEqual(Object.keys(document.pages).sort(), ['about', 'projects']);
  assert.ok(Object.keys(document.sections).length >= 7);
  assert.ok(Object.values(document.blocks).some((block) => block.type === 'project'));
  assert.ok(Object.keys(document.media).length >= 1);
  assert.equal(document.reusableSections.header.linked, true);
  assert.equal(document.reusableSections.footer.sourcePath, 'footer');
});

test('legacy content round-trips without data loss', () => {
  const content = loadContent();
  const document = migrateLegacy(content);
  assert.deepEqual(toLegacyContent(document), content);
});

test('migration output is deterministic for identical input', () => {
  const content = loadContent();
  assert.deepEqual(migrateLegacy(content), migrateLegacy(content));
});

test('remigration preserves compatible structured settings', () => {
  const content = loadContent();
  const first = migrateLegacy(content);
  const sectionId = first.pages.about.sections[0];
  first.sections[sectionId].settings = { paddingTop: 72 };
  first.pages.about.seo = { title: 'About Berkeley' };

  const second = migrateLegacy(content, first);
  assert.deepEqual(second.sections[sectionId].settings, { paddingTop: 72 });
  assert.deepEqual(second.pages.about.seo, { title: 'About Berkeley' });
});

test('validation reports broken graph references', () => {
  const document = migrateLegacy(loadContent());
  document.pages.about.sections.push('missing-section');
  assert.ok(validateDocument(document).some((error) => error.includes('missing-section')));
});

test('custom pages migrate with their section registry', () => {
  const content = loadContent();
  content.sitePages = { process: { id: 'process', title: 'Process', slug: 'process.html', status: 'hidden' } };
  content.sections = content.sections || {};
  content.sections.process = [];
  const document = migrateLegacy(content);
  assert.equal(document.pages.process.slug, 'process.html');
  assert.equal(document.pages.process.status, 'hidden');
  assert.deepEqual(document.pages.process.sections, []);
});
