'use strict';

const SCHEMA_VERSION = 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableId(prefix, source) {
  let hash = 2166136261;
  const input = String(source);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return prefix + '-' + (hash >>> 0).toString(36);
}

function sectionEntries(content, pageId) {
  const configured = content.sections && content.sections[pageId];
  if (Array.isArray(configured)) return configured;
  if (pageId === 'home') {
    return [
      { id: 'hero', builtin: true },
      { id: 'projects', builtin: true },
      { id: 'cta', builtin: true },
    ];
  }
  return [
    { id: 'bio', builtin: true },
    { id: 'expertise', builtin: true },
    { id: 'quote', builtin: true },
    { id: 'closing', builtin: true },
  ];
}

function migrateLegacy(content, previousDocument) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new Error('Legacy content must be an object');
  }

  const previous = previousDocument && previousDocument.schemaVersion === SCHEMA_VERSION
    ? previousDocument
    : null;
  const document = {
    schemaVersion: SCHEMA_VERSION,
    site: {
      title: (content.nav && content.nav.logo) || 'Portfolio',
      homePageId: 'about',
      locale: 'en',
      designPresetId: 'original',
    },
    navigation: [
      { id: 'nav-about', label: 'About', target: { type: 'page', pageId: 'about' }, children: [] },
      { id: 'nav-projects', label: 'Projects', target: { type: 'page', pageId: 'projects' }, children: [] },
    ],
    pages: {},
    sections: {},
    columns: {},
    blocks: {},
    media: {},
    design: clone(content.theme || {}),
    legacyContent: clone(content),
  };

  const pageDefinitions = [
    { id: 'about', title: 'About', slug: 'index.html', registry: 'about' },
    { id: 'projects', title: 'Projects', slug: 'projects.html', registry: 'home' },
  ];

  for (const pageDefinition of pageDefinitions) {
    const orderedSections = [];
    for (const entry of sectionEntries(content, pageDefinition.registry)) {
      const sectionId = stableId('section', pageDefinition.id + ':' + entry.id);
      const columnId = stableId('column', sectionId + ':main');
      const blockId = stableId('block', sectionId + ':legacy');
      orderedSections.push(sectionId);
      document.sections[sectionId] = {
        id: sectionId,
        key: entry.id,
        type: entry.builtin ? 'builtin' : ((content.sectionData && content.sectionData[entry.id] && content.sectionData[entry.id].type) || entry.type || 'text'),
        builtin: !!entry.builtin,
        hidden: !!entry.hidden,
        settings: clone((previous && previous.sections[sectionId] && previous.sections[sectionId].settings) || {}),
        columns: [columnId],
        reusableId: null,
      };
      document.columns[columnId] = {
        id: columnId,
        width: 12,
        settings: clone((previous && previous.columns[columnId] && previous.columns[columnId].settings) || {}),
        blocks: [blockId],
      };
      document.blocks[blockId] = {
        id: blockId,
        type: 'legacy-section',
        content: { sourcePath: entry.builtin ? entry.id : 'sectionData.' + entry.id },
        settings: clone((previous && previous.blocks[blockId] && previous.blocks[blockId].settings) || {}),
      };
    }
    document.pages[pageDefinition.id] = {
      id: pageDefinition.id,
      title: pageDefinition.title,
      slug: pageDefinition.slug,
      status: 'published',
      seo: clone((previous && previous.pages[pageDefinition.id] && previous.pages[pageDefinition.id].seo) || {}),
      sections: orderedSections,
    };
  }

  for (const [key, project] of Object.entries(content.projects || {})) {
    const blockId = stableId('project', key);
    document.blocks[blockId] = {
      id: blockId,
      type: 'project',
      content: { key, sourcePath: 'projects.' + key },
      settings: clone(project.layout || {}),
    };
    for (const imagePath of project.images || []) {
      const mediaId = stableId('media', imagePath);
      document.media[mediaId] = document.media[mediaId] || {
        id: mediaId,
        source: imagePath,
        derivatives: {},
        alt: project.title || '',
        caption: '',
        credit: '',
        metadata: {},
      };
    }
  }

  if (content.about && content.about.profilePhoto) {
    const mediaId = stableId('media', content.about.profilePhoto);
    document.media[mediaId] = {
      id: mediaId,
      source: content.about.profilePhoto,
      derivatives: {},
      alt: (content.nav && content.nav.logo) || 'Profile photo',
      caption: '',
      credit: '',
      metadata: {},
    };
  }

  return document;
}

function validateDocument(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return ['Document must be an object'];
  }
  if (document.schemaVersion !== SCHEMA_VERSION) errors.push('Unsupported schemaVersion');
  for (const key of ['site', 'pages', 'sections', 'columns', 'blocks', 'media', 'design', 'legacyContent']) {
    if (!document[key] || typeof document[key] !== 'object' || Array.isArray(document[key])) {
      errors.push(key + ' must be an object');
    }
  }
  if (!Array.isArray(document.navigation)) errors.push('navigation must be an array');
  if (document.site && document.pages && !document.pages[document.site.homePageId]) {
    errors.push('homePageId must reference a page');
  }

  for (const [pageId, page] of Object.entries(document.pages || {})) {
    if (!Array.isArray(page.sections)) {
      errors.push('Page ' + pageId + ' sections must be an array');
      continue;
    }
    for (const sectionId of page.sections) {
      if (!document.sections[sectionId]) errors.push('Page ' + pageId + ' references missing section ' + sectionId);
    }
  }
  for (const [sectionId, section] of Object.entries(document.sections || {})) {
    if (!Array.isArray(section.columns)) {
      errors.push('Section ' + sectionId + ' columns must be an array');
      continue;
    }
    for (const columnId of section.columns) {
      if (!document.columns[columnId]) errors.push('Section ' + sectionId + ' references missing column ' + columnId);
    }
  }
  for (const [columnId, column] of Object.entries(document.columns || {})) {
    if (!Array.isArray(column.blocks)) {
      errors.push('Column ' + columnId + ' blocks must be an array');
      continue;
    }
    for (const blockId of column.blocks) {
      if (!document.blocks[blockId]) errors.push('Column ' + columnId + ' references missing block ' + blockId);
    }
  }
  return errors;
}

function toLegacyContent(document) {
  const errors = validateDocument(document);
  if (errors.length) throw new Error(errors.join('; '));
  return clone(document.legacyContent);
}

module.exports = {
  SCHEMA_VERSION,
  migrateLegacy,
  stableId,
  toLegacyContent,
  validateDocument,
};
