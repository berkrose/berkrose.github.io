# Editing & Publishing Your Website

Your portfolio has a built-in visual editor. You edit the site by clicking things
right on the page — no code. When you're happy, you press **Publish** and the live
site at **https://berkrose.github.io** updates for everyone.

Nothing you change is visible to the public until you press Publish.

---

## Start editing

Double-click **`Edit Website.command`** in the Portfolio_Website folder.

Your browser opens the site with a dark **EDITING** bar along the bottom. That bar
only appears in the editor — visitors never see it.

(If double-clicking shows a security warning the first time: right-click the file →
**Open** → **Open**. macOS only asks once.)

---

## What you can change

### Text
Hover any text — it gets a dashed red outline. Click it, type your change, then click
away (or press **Enter**) to keep it. Press **Esc** to cancel.

### Text size
While you're editing a piece of text, a small bar appears just above it with
**A− / A+ / reset**. Use **A+** to make that text bigger, **A−** to make it smaller,
and **reset** to return to the original size. Each piece of text is sized on its own,
and everything still shrinks correctly on phones.

### Undo and redo
Made a change you didn't mean to? Use the **↺** (undo) and **↻** (redo) buttons in the
bottom bar, or press **Cmd+Z** to undo and **Cmd+Shift+Z** to redo. This covers text
edits, photos, projects, sizes, and sections — right back to your last save.

### Photos
Every project has a **PHOTOS** button on its image. Click it to:
- **Add photos** — pick one or more image files from your computer
- **Make main** — set which photo shows first
- **Reorder** — arrows move a photo earlier or later
- **Delete** — the × removes a photo (a project always keeps at least one)

New photos are automatically shrunk to a web-friendly size.

To change your **profile photo** on the About page, click it while editing.

### Projects
- **Add** — the **+ ADD PROJECT** button (bottom bar) creates a new project. Give it
  a title, then click its text and Photos to fill it in.
- **Move / Delete** — each project has ↑ ↓ ✕ controls in its top-right corner.
  Projects renumber themselves automatically.

### Sections
A "section" is a big block of the page — the intro, the projects, the contact banner,
and on the About page the biography, expertise, quote, and closing.

- **Add** — the **+ ADD SECTION** button (bottom bar) lets you add a new block. Pick a
  type: **Text**, **Text + photo**, **Photo gallery**, or **Quote**. It drops in styled
  to match the site; click its text to fill it in, and use its photo controls for images.
- **Move** — hover a section and use the ↑ ↓ buttons in its top-left corner to move it.
- **Hide** — built-in sections have a hide button (⦸). A hidden section disappears from
  the live site; while editing you'll see a small "Hidden … [Show]" bar to bring it back.
- **Delete** — sections you added have a ✕ to remove them.

Switch between the **About** (landing) and **Projects** pages using the links in the
bottom bar. The **+ ADD PROJECT** button appears only on the Projects page.

---

## Saving vs. Publishing

| Button | What it does |
|--------|--------------|
| **Save** | Stores your work on this computer. Safe to do often. Visitors do **not** see it yet. |
| **Publish** | Puts everything online at your live site. This is the one that makes changes public. |
| **Discard** | Throws away everything since your last Publish and reloads the last published version. |

The status text in the bar tells you where you stand: *All changes saved*,
*Unsaved changes*, or *Saved - not published yet*.

**Typical flow:** edit → Save as you go → when it all looks right, press **Publish**.
The live site updates about a minute later.

---

## Good to know

- **You can't break the live site by experimenting.** Until you press Publish,
  everything stays on your computer. If you make a mess, press **Discard** to snap
  back to the last published version.
- **Publish needs internet.** If you're offline, Publish will tell you your changes
  are saved safely and to try again later — nothing is lost.
- **To stop the editor**, just close the browser tab. (The little helper program it
  started closes on its own; you can also quit it from Activity Monitor if you ever
  want to — look for "node".)

---

## Under the hood (for reference)

- All website text lives in `content.js` — the editor writes to it for you. Text
  sizes live under a `styles` key, and the section layout under `sections` /
  `sectionData`; all of it is created for you as you edit.
- Project sections are drawn by `render-projects.js`, and page section order plus any
  sections you add are drawn by `sections.js` — both from `content.js`, so nothing
  needs HTML editing.
- `editor/` holds the local editor (a small Node server + the on-page tools). It runs
  only on your computer and is never part of what visitors load.
- Publishing = a `git` commit and push to the `berkrose.github.io` repository on
  GitHub, which GitHub Pages serves as your live site.
- `Launch Portfolio.command` still opens the plain site (no editor) if you just want
  to look at it.
