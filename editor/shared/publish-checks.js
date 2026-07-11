'use strict';

const fs = require('fs');
const path = require('path');

function issue(severity, code, message, target) {
  return { severity, code, message, target: target || '' };
}

function walk(value, visit, keyPath) {
  if (typeof value === 'string') visit(value, keyPath || '');
  else if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, (keyPath || '') + '.' + index));
  else if (value && typeof value === 'object') Object.keys(value).forEach((key) => walk(value[key], visit, keyPath ? keyPath + '.' + key : key));
}

function pageRecords(content) {
  const records = {
    about: { id: 'about', title: 'About', slug: 'index.html', builtin: true },
    projects: { id: 'projects', title: 'Projects', slug: 'projects.html', builtin: true },
  };
  Object.keys(content.sitePages || {}).forEach((id) => { records[id] = Object.assign({ id }, content.sitePages[id]); });
  return records;
}

function runPublishChecks(content, siteRoot) {
  const issues = [];
  const pages = pageRecords(content);
  const slugs = new Map();
  Object.values(pages).forEach((page) => {
    if (!page.title || !String(page.title).trim()) issues.push(issue('error', 'empty-page-title', 'A page is missing its title.', 'pages:' + page.id));
    if (!/^[a-z0-9][a-z0-9-]*\.html$/.test(page.slug || '')) issues.push(issue('error', 'invalid-route', '“' + (page.title || page.id) + '” has an invalid page URL.', 'pages:' + page.id));
    else if (slugs.has(page.slug)) issues.push(issue('error', 'duplicate-route', 'Two pages use “' + page.slug + '”.', 'pages:' + page.id));
    else slugs.set(page.slug, page.id);
  });

  const ids = new Set();
  Object.keys(content.sectionData || {}).forEach((id) => {
    if (ids.has(id)) issues.push(issue('error', 'duplicate-id', 'Duplicate section ID “' + id + '”.', 'layers:' + id));
    ids.add(id);
  });

  const checkedFiles = new Set();
  walk(content, (value, key) => {
    if (/^assets\//.test(value) && !checkedFiles.has(value)) {
      checkedFiles.add(value);
      const absolute = path.resolve(siteRoot, value);
      if (!absolute.startsWith(path.resolve(siteRoot) + path.sep) || !fs.existsSync(absolute)) {
        issues.push(issue('error', 'missing-file', 'Missing local file: ' + value, key.indexOf('siteSeo') >= 0 ? 'design:seo' : 'media:' + value));
      } else if (fs.statSync(absolute).size > 5 * 1024 * 1024) {
        issues.push(issue('warning', 'oversized-media', value + ' is larger than 5 MB and may load slowly.', 'media:' + value));
      }
    }
    if (/^(https?:|mailto:)/i.test(value)) {
      try { new URL(value); } catch (error) { issues.push(issue('error', 'invalid-link', 'Invalid link: ' + value, key)); }
    }
  });

  Object.keys(content.projects || {}).forEach((id) => {
    const project = content.projects[id] || {};
    if (!String(project.title || '').trim()) issues.push(issue('error', 'empty-project-title', 'A project is missing its title.', 'project:' + id));
    if ((project.images || []).length && !String(project.imageAlt || '').trim()) {
      issues.push(issue('error', 'missing-alt', '“' + (project.title || id) + '” needs image alternative text.', 'project:' + id));
    }
  });
  if (content.about && content.about.profilePhoto && !String(content.about.profileAlt || '').trim()) {
    issues.push(issue('error', 'missing-alt', 'The profile photo needs alternative text.', 'media:' + content.about.profilePhoto));
  }

  const seo = content.siteSeo || {};
  if (!String(seo.description || '').trim()) issues.push(issue('warning', 'missing-description', 'Add a site description for search results and social sharing.', 'design:seo'));
  if (!String(seo.siteUrl || '').trim()) issues.push(issue('warning', 'missing-site-url', 'Add the public site URL to generate canonical links and a sitemap.', 'design:seo'));
  if (!fs.existsSync(path.join(siteRoot, 'assets', 'resume.pdf'))) issues.push(issue('warning', 'missing-resume', 'The resume download is not available yet.', 'media:assets/resume.pdf'));

  const errors = issues.filter((item) => item.severity === 'error').length;
  const warnings = issues.length - errors;
  return { checkedAt: new Date().toISOString(), passed: errors === 0, errors, warnings, issues };
}

module.exports = { runPublishChecks };
