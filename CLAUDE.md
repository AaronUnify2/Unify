# Unify

Aaron's personal life-improvement app: problems → goals → steps, a journal,
and Probe. A multi-file static web app: plain HTML, CSS and JavaScript, no
build step, no framework, no `package.json`, no dependency install. The
browser loads the files as they sit in the repository.

Read `README.md` for how it works and `SPEC.md` for the data file.

## Public repository — no personal data, ever

This repository is public and served by GitHub Pages. Aaron's data lives in
the **private** `AaronUnify2/Unify-data` repository, as `data/unify.json`.
Never copy anything from it here — not as a fixture, an example, a
screenshot or a commit message. Test data is made up.

## How to build things here

- **Plain, readable JavaScript.** ES5-style modules on `window` (`Store`,
  `Sync`, `Probe`, `Views`…), one concern per file under `js/`. It should
  still make sense in six months. No clever abstractions, no syntax that
  needs tooling.
- **No external dependencies unless asked.** `vendor/` holds unmodified
  copies of Transformers.js and all-MiniLM-L6-v2 (the same as Process Hub's);
  keep them as they are — see `vendor/README.md`.
- **Always produce complete files**, not diffs or fragments.
- **Phone first.** Most use is on a phone; it must also work well on a
  computer (rail from 760px, list beside record from 1100px).
- **Streamlined over featureful.** The core is: put in problems, turn them
  into goals with quick, meaningful steps. Everything else is a bonus and
  earns its place by being used. Ask before adding a section.
- Every change to data goes through `Store` (it stamps `updatedAt` and
  `fieldsAt`, which the merge depends on). Never edit records in place
  without it.
- If the data shape changes, update `model.js` (`DEFAULTS`, `normalise`),
  `SPEC.md`, and keep old files loading.

## Testing

Serve the repository over http and drive it in a headless browser, with
`https://api.github.com/**` mocked (an in-memory file, 409 on a stale sha).
Check edge cases and computed results rather than assuming; test at 390px
wide and at desktop width. Say plainly if something doesn't work.

## Hosting

GitHub Pages serves `main` from the root (Settings → Pages → Deploy from a
branch → `main`, `/`). `.nojekyll` stops Jekyll. Every page carries
`<meta name="robots" content="noindex, nofollow">`.

```
https://aaronunify2.github.io/Unify/
```

`sw.js` caches the app for offline use. When adding a file under `js/` or
`css/`, add it to `SHELL` in `sw.js` and bump `CACHE`.

## Workflow

- Develop on the assigned working branch, commit with a clear message, merge
  into `main` and push. **No pull request** unless Aaron asks for one.
- After merging, send him the live URL.
- Never ask Aaron for his GitHub token, and never write one anywhere.
