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

At baseline creation:

- No horizontal overflow was detected at the mobile viewport.
- Visitor pages contained no editor markup.
- The editor session token was present and 64 hexadecimal characters long.
- The only browser warning was Tailwind Play CDN's production-use warning.
- The simple visitor baseline server returned a non-blocking 404 for `favicon.ico`.

Intentional visual changes must be reviewed against these images before replacing them.
