// ─── RENDER-PROJECTS.JS ─────────────────────────────────────────────────────
// Builds every project section on the homepage from CONTENT.projects
// (defined in content.js). To add, remove, or reorder projects, edit
// content.js only — no HTML changes needed.
//
// PROJECT_LAYOUTS below preserves the per-project layout quirks of the
// original hand-written markup (image side, section background, aspect
// ratio, element ids, placeholder icon). Projects without an entry get an
// automatic alternating image-left / image-right layout.
// ─────────────────────────────────────────────────────────────────────────────

(function () {

  // Per-project layout settings. All fields optional:
  //   idKey        — base for element ids (img-<idKey>), defaults to project key
  //   detailId     — id of the expandable read-more block, defaults <idKey>-detail
  //   side         — "left" | "right": which side the image sits on at lg widths
  //   imageFirst   — whether the image column comes first in the DOM
  //   sectionClass / gridClass / imageColClass / textColClass / frameClass
  //                — full class strings overriding the defaults
  //   icon         — Material Symbols icon for the "Image Coming Soon" placeholder
  const PROJECT_LAYOUTS = {
    nutrisync: {
      idKey: "hydroponic",
      icon: "water_drop",
      imageFirst: true,
      imageColClass: "lg:col-span-7 order-1",
      textColClass: "lg:col-span-5 order-2 space-y-8 lg:pl-8"
    },
    bike: {
      side: "right",
      imageFirst: true
    },
    interlock: {
      side: "left"
    },
    robot: {
      icon: "smart_toy",
      side: "right",
      imageFirst: true,
      sectionClass: "project-entry bg-surface-container-low -mx-0 px-8 py-20 mb-4",
      gridClass: "max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center",
      frameClass: "aspect-[16/10] overflow-hidden bg-surface-container-low flex items-center justify-center"
    },
    lumaire: {
      side: "left",
      gridClass: "grid grid-cols-1 lg:grid-cols-12 gap-12 items-start"
    },
    tumbler: {
      icon: "precision_manufacturing",
      side: "right",
      frameClass: "aspect-[4/3] overflow-hidden bg-surface flex items-center justify-center"
    },
    cloudair: {
      side: "left",
      sectionClass: "project-entry bg-surface-container-low px-8 py-20 mb-4",
      gridClass: "max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center",
      frameClass: "aspect-[4/5] md:aspect-[3/2] overflow-hidden bg-surface-container-low"
    },
    createaplant: {
      icon: "eco",
      detailId: "plant-detail",
      side: "right"
    }
  };

  // Small helper: create an element with a class and optional text.
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Replaces a broken main image with the "Image Coming Soon" placeholder.
  function imagePlaceholder(icon) {
    const wrap = el("div", "w-full h-full flex flex-col items-center justify-center gap-4");
    wrap.appendChild(el("span", "material-symbols-outlined text-[64px] text-zinc-300", icon));
    wrap.appendChild(el("span", "font-label text-[0.6875rem] tracking-[0.1em] uppercase text-zinc-300", "Image Coming Soon"));
    return wrap;
  }

  function buildImageColumn(project, layout) {
    const col = el("div", layout.imageColClass);

    const frame = el("div", layout.frameClass);
    frame.dataset.role = "image-frame";

    // No images yet — render the "Image Coming Soon" placeholder directly.
    if (!project.images || project.images.length === 0) {
      frame.appendChild(imagePlaceholder(layout.icon));
      col.appendChild(frame);
      return col;
    }

    const img = document.createElement("img");
    img.id = "img-" + layout.idKey;
    img.src = project.images[0];
    img.alt = project.imageAlt || project.title || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.className = "project-img w-full h-full " + (project.imageFit || "object-cover");
    img.dataset.mainFit = project.imageFit || "object-cover";
    img.style.transition = "opacity 0.2s ease";
    img.addEventListener("error", function () {
      if (img.parentElement) {
        img.parentElement.replaceChildren(imagePlaceholder(layout.icon));
      }
    });
    frame.appendChild(img);
    col.appendChild(frame);

    // Thumbnail strip (one button per image; the first starts active).
    const strip = el("div", "flex gap-2 mt-3 overflow-x-auto pb-1");
    project.images.forEach(function (src, i) {
      const btn = el("button", "thumb-btn" + (i === 0 ? " active" : "") + " flex-shrink-0");
      btn.addEventListener("click", function () {
        swapImage("img-" + layout.idKey, src, btn);
      });
      const thumb = document.createElement("img");
      thumb.src = src;
      thumb.loading = "lazy";
      thumb.decoding = "async";
      thumb.alt = "";
      thumb.className = "thumb-img w-16 h-12 object-cover";
      btn.appendChild(thumb);
      strip.appendChild(btn);
    });
    col.appendChild(strip);

    return col;
  }

  function buildTextColumn(project, layout) {
    const col = el("div", layout.textColClass);

    // Dot-path prefix for data-content stamps (lets the editor find each field).
    const cp = "projects." + layout.key + ".";

    function stamped(tag, className, text, contentPath) {
      const node = el(tag, className, text);
      node.setAttribute("data-content", contentPath);
      if (window.applyTextScale) window.applyTextScale(node, contentPath);
      return node;
    }

    // Number badge + rule
    const numberRow = el("div", "flex items-center gap-4");
    numberRow.appendChild(stamped("span", "text-xs font-headline font-bold text-secondary", project.number, cp + "number"));
    numberRow.appendChild(el("div", "h-[1px] flex-grow bg-outline-variant opacity-30"));
    col.appendChild(numberRow);

    // Tags, title, description
    const body = document.createElement("div");
    const tagRow = el("div", "flex flex-wrap gap-2 mb-4");
    tagRow.dataset.role = "tags";
    (project.tags || []).forEach(function (tag, i) {
      tagRow.appendChild(stamped("span", "font-label text-[0.6875rem] tracking-[0.1em] uppercase text-zinc-500 border border-zinc-200 px-3 py-1", tag, cp + "tags." + i));
    });
    body.appendChild(tagRow);
    body.appendChild(stamped("h2", "text-3xl md:text-4xl font-headline font-bold tracking-[-0.02em] mb-6", project.title, cp + "title"));
    body.appendChild(stamped("p", "text-sm text-on-surface-variant leading-relaxed max-w-md", project.description, cp + "description"));
    if (project.details) {
      const details = el("dl", "grid grid-cols-2 gap-x-6 gap-y-4 mt-8");
      [["Role", "role"], ["Duration", "duration"], ["Tools", "tools"], ["Team", "team"]].forEach(function (field) {
        if (!project.details[field[1]]) return;
        const group = document.createElement("div");
        group.appendChild(el("dt", "font-label text-[0.625rem] tracking-[0.1em] uppercase text-zinc-400", field[0]));
        group.appendChild(stamped("dd", "text-sm text-on-surface-variant mt-1", project.details[field[1]], cp + "details." + field[1]));
        details.appendChild(group);
      });
      if (details.children.length) body.appendChild(details);
      if (project.details.outcome) {
        const outcome = el("div", "mt-6 border-l-2 border-secondary pl-4");
        outcome.appendChild(el("div", "font-label text-[0.625rem] tracking-[0.1em] uppercase text-secondary", "Outcome"));
        outcome.appendChild(stamped("p", "text-sm text-on-surface-variant mt-1", project.details.outcome, cp + "details.outcome"));
        body.appendChild(outcome);
      }
      if (project.details.externalUrl) {
        const external = stamped("a", "inline-flex mt-5 font-label text-xs uppercase text-secondary underline", project.details.externalLabel || "View project", cp + "details.externalLabel");
        external.href = project.details.externalUrl;
        external.target = "_blank";
        external.rel = "noopener noreferrer";
        external.setAttribute("data-content-href", cp + "details.externalUrl");
        body.appendChild(external);
      }
    }
    col.appendChild(body);

    // Institution + year
    const metaWrap = el("div", "pt-4");
    const metaRow = el("div", "flex items-center gap-3 text-zinc-400");
    metaRow.appendChild(stamped("span", "font-label text-[0.6875rem] tracking-[0.1em] uppercase", project.institution, cp + "institution"));
    metaRow.appendChild(el("span", "w-1 h-1 bg-zinc-300 rounded-full"));
    metaRow.appendChild(stamped("span", "font-label text-[0.6875rem] tracking-[0.1em] uppercase", project.year, cp + "year"));
    metaWrap.appendChild(metaRow);
    col.appendChild(metaWrap);

    // Expandable read-more block (hidden by default)
    const detail = el("div", "overflow-hidden");
    detail.id = layout.detailId;
    detail.style.maxHeight = "0";
    detail.style.transition = "max-height 0.5s ease";
    const detailInner = el("div", "pt-4 border-t border-outline-variant/20 space-y-4");
    detailInner.dataset.role = "readmore";
    (project.readMore || []).forEach(function (paragraph, i) {
      detailInner.appendChild(stamped("p", "text-sm text-on-surface-variant leading-relaxed", paragraph, cp + "readMore." + i));
    });
    detail.appendChild(detailInner);
    col.appendChild(detail);

    // Read More / Read Less toggle
    const toggle = el("button", "flex items-center gap-2 font-label text-[0.6875rem] tracking-[0.1em] uppercase text-primary hover:text-secondary transition-colors duration-300");
    toggle.appendChild(el("span", "btn-label", "Read More"));
    toggle.appendChild(el("span", "material-symbols-outlined text-[16px] btn-icon", "add"));
    toggle.addEventListener("click", function () {
      toggleDetail(layout.detailId, toggle);
    });
    col.appendChild(toggle);

    return col;
  }

  const ASPECTS = {
    "16/10": "aspect-[16/10]", "4/3": "aspect-[4/3]",
    "3/2": "aspect-[3/2]", "1/1": "aspect-square"
  };

  function buildSection(key, project, index) {
    const overrides = PROJECT_LAYOUTS[key] || {};
    // Per-project user overrides (from the editor's Layout panel) win over the
    // authored PROJECT_LAYOUTS presets, which win over the auto-alternate default.
    const user = project.layout || {};
    const idKey = overrides.idKey || key;
    const side = user.side || overrides.side || (index % 2 === 0 ? "left" : "right");

    let sectionClass = overrides.sectionClass || "project-entry px-8 py-20 mb-4";
    let gridClass = overrides.gridClass || "grid grid-cols-1 lg:grid-cols-12 gap-12 items-center";
    let frameClass = overrides.frameClass || "aspect-[16/10] overflow-hidden bg-surface";
    let imageColClass, textColClass, imageFirst;

    if (user.side) {
      // Explicit side forces a clean standard two-column recompute (drops any
      // preset-specific column classes so the flip is predictable).
      imageFirst = false;
      imageColClass = side === "right" ? "lg:col-span-7 order-1 lg:order-2" : "lg:col-span-7 order-1";
      textColClass = side === "right" ? "lg:col-span-5 order-2 lg:order-1 space-y-8" : "lg:col-span-5 order-2 space-y-8";
    } else {
      imageFirst = overrides.imageFirst || false;
      imageColClass = overrides.imageColClass ||
        (side === "right" ? "lg:col-span-7 order-1 lg:order-2" : "lg:col-span-7 order-1");
      textColClass = overrides.textColClass ||
        (side === "right" ? "lg:col-span-5 order-2 lg:order-1 space-y-8" : "lg:col-span-5 order-2 space-y-8");
    }

    // Aspect override: swap the frame's aspect token(s) for the chosen one.
    if (ASPECTS[user.aspect]) {
      frameClass = frameClass.replace(/(?:md:)?aspect-\[[^\]]*\]|aspect-square/g, "").replace(/\s+/g, " ").trim();
      frameClass = ASPECTS[user.aspect] + " " + frameClass;
    }

    // Background tint override.
    if (user.tint === true) {
      sectionClass = "project-entry bg-surface-container-low px-8 py-20 mb-4";
      gridClass = "max-w-[1920px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center";
      if (/bg-surface(?![a-z-])/.test(frameClass)) frameClass = frameClass.replace(/bg-surface(?![a-z-])/, "bg-surface-container-low");
      else frameClass += " bg-surface-container-low";
    } else if (user.tint === false) {
      sectionClass = "project-entry px-8 py-20 mb-4";
      gridClass = "grid grid-cols-1 lg:grid-cols-12 gap-12 items-center";
    }

    const layout = {
      key: key,
      idKey: idKey,
      detailId: overrides.detailId || idKey + "-detail",
      icon: overrides.icon || "image",
      imageFirst: imageFirst,
      sectionClass: sectionClass,
      gridClass: gridClass,
      frameClass: frameClass,
      imageColClass: imageColClass,
      textColClass: textColClass
    };

    const section = el("section", layout.sectionClass);
    section.dataset.projectKey = key;
    const grid = el("div", layout.gridClass);
    const imageCol = buildImageColumn(project, layout);
    const textCol = buildTextColumn(project, layout);
    if (layout.imageFirst) {
      grid.appendChild(imageCol);
      grid.appendChild(textCol);
    } else {
      grid.appendChild(textCol);
      grid.appendChild(imageCol);
    }
    section.appendChild(grid);
    return section;
  }

  function renderProjects() {
    const container = document.getElementById("projects-container");
    if (!container || typeof CONTENT === "undefined" || !CONTENT.projects) return;
    container.replaceChildren();
    Object.keys(CONTENT.projects).forEach(function (key, index) {
      container.appendChild(buildSection(key, CONTENT.projects[key], index));
    });
  }

  window.renderProjects = renderProjects;

  document.addEventListener("DOMContentLoaded", renderProjects);

})();
