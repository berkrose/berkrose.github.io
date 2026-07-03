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

Switch between the **Home** and **About** pages using the links in the bottom bar.

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

- All website text lives in `content.js` — the editor writes to it for you.
- Project sections are drawn by `render-projects.js` from that text, so adding a
  project needs no HTML editing.
- `editor/` holds the local editor (a small Node server + the on-page tools). It runs
  only on your computer and is never part of what visitors load.
- Publishing = a `git` commit and push to the `berkrose.github.io` repository on
  GitHub, which GitHub Pages serves as your live site.
- `Launch Portfolio.command` still opens the plain site (no editor) if you just want
  to look at it.
