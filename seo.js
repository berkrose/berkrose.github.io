(function () {
  'use strict';
  if (typeof CONTENT === 'undefined') return;

  function setMeta(selector, attributes) {
    var node = document.head.querySelector(selector);
    if (!node) { node = document.createElement(attributes.tag || 'meta'); document.head.appendChild(node); }
    Object.keys(attributes).forEach(function (name) { if (name !== 'tag') node.setAttribute(name, attributes[name]); });
  }

  function currentPage() {
    var path = location.pathname.split('/').pop() || 'index.html';
    var pages = Object.assign({
      about: { id: 'about', title: 'About', slug: 'index.html' },
      projects: { id: 'projects', title: 'Projects', slug: 'projects.html' }
    }, CONTENT.sitePages || {});
    var homeId = CONTENT.siteSettings && CONTENT.siteSettings.homePageId || 'about';
    return Object.keys(pages).map(function (id) { return pages[id]; }).find(function (page) {
      return (path === 'index.html' && page.id === homeId) || page.slug === path || (path === 'about.html' && page.id === 'about');
    }) || pages[homeId];
  }

  var page = currentPage();
  var site = CONTENT.siteSeo || {};
  var seo = page.seo || {};
  var brand = site.siteName || (CONTENT.nav && CONTENT.nav.logo) || 'Berkeley Skuratowicz';
  var title = seo.title || (page.id === 'about' ? brand : page.title + ' - ' + brand);
  var description = seo.description || site.description || '';
  var base = String(site.siteUrl || 'https://berkrose.github.io').replace(/\/$/, '');
  var canonical = seo.canonical || base + (location.pathname === '/' || location.pathname.endsWith('/index.html') ? '/' : location.pathname);
  var image = seo.socialImage || site.socialImage || '';
  if (image && !/^https?:/i.test(image)) image = base + '/' + image.replace(/^\//, '');

  document.title = title;
  if (description) setMeta('meta[name="description"]', { name: 'description', content: description });
  setMeta('meta[property="og:title"]', { property: 'og:title', content: title });
  if (description) setMeta('meta[property="og:description"]', { property: 'og:description', content: description });
  setMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
  setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
  if (image) setMeta('meta[property="og:image"]', { property: 'og:image', content: image });
  setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: image ? 'summary_large_image' : 'summary' });
  setMeta('link[rel="canonical"]', { tag: 'link', rel: 'canonical', href: canonical });
  if (seo.noIndex) setMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, nofollow' });
}());
