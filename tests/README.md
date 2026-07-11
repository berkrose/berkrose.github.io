# Test Baseline

Run all current automated checks with:

```sh
npm run verify
```

## Coverage established in Milestone 0

- Current `content.js` top-level contract
- Project core fields and local image references
- Section registry integrity
- Local editor security headers and API session authorization
- Hostile-origin and invalid-content-type rejection
- Complete content save and incomplete-content rejection
- Private-file and dotfile blocking
- Approved public asset serving and correct HEAD behavior
- Unsafe image destination rejection
- Discard restoration boundaries
- Atomic content writes, autosave revision creation, named checkpoints, asset manifests,
  and validated revision restore
- Deterministic legacy-to-structured migration, stable IDs, graph validation, and exact
  legacy-content round trips

`editor-server.test.js` creates a temporary Git-backed portfolio fixture. It does not
write to or discard the real portfolio content.

## Visual baselines

`visual-baselines/` contains full-page captures for editor and visitor modes on About
and Projects at 1440x1000 desktop and 390x844 mobile viewports.

The editor baselines were intentionally updated after Milestone 1 introduced the
workspace sidebar, top toolbar, mobile drawer, Layers selection, and Preview mode.

Milestone 4 browser checks verified project duplicate/copy/paste and custom-section
duplicate operations as single undoable transactions, returning the real content to its
original state with no console errors.

Milestone 5 browser checks verified responsive columns at desktop and phone widths,
section styling, no mobile overflow, and complete undo recovery. Milestone 6 checks
rendered the expanded block library, repeated-item controls, and project metadata with
all test mutations undone and no console errors.

Milestone 7 integration checks generate and remove custom static pages in an isolated
fixture. Browser checks verify dynamic desktop, phone, and footer navigation plus the
Pages settings interface without changing portfolio content.

Milestone 8 tests verify media inventory, SHA-256 duplicate detection, reference counts,
metadata, image signatures, replacement boundaries, and refusal to delete used files.
Browser checks loaded 33 current assets, filtered to the profile image, and confirmed
that used media exposes no delete action.

Milestone 9 browser checks applied the Studio and Editorial design presets, verified
their typography and width tokens, and undid both changes back to the original design.
The editor toolbar retained its own dark theme, the page had no horizontal overflow,
and the browser console remained clear.

Milestone 10 tests verify invalid routes, missing local files, missing alternative text,
and explicit warning acknowledgement. Browser checks confirmed the real portfolio passes
with zero errors, displays five actionable warnings, and exposes the site check from the
main editor toolbar. Runtime SEO metadata, sitemap, and robots output are also generated.

At baseline creation:

- No horizontal overflow was detected at the mobile viewport.
- Visitor pages contained no editor markup.
- The editor session token was present and 64 hexadecimal characters long.
- The only browser warning was Tailwind Play CDN's production-use warning.
- The simple visitor baseline server returned a non-blocking 404 for `favicon.ico`.

Intentional visual changes must be reviewed against these images before replacing them.
