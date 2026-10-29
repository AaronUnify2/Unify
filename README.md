# Unify

Problems into goals, goals into steps — and a journal of how it goes.

A personal life-improvement app, grown from the single-file prototypes
(Unify 218 → 300 → 400) in
[UnifyVersion1](https://github.com/AaronUnify2/UnifyVersion1). Built for one
person, phone first, and usable from a computer too.

Live at **https://aaronunify2.github.io/Unify/** — Pages serves the `main`
branch as it stands.

## Two repositories

| | | |
|---|---|---|
| **Unify** (this one) | public | The app. No personal data, ever |
| **Unify-data** | private | `data/unify.json` — everything you write |

The app reads and writes the data file through the GitHub API with a token
kept in each browser. Without one, it shows a sign-in screen (or runs on one
device only, if you choose that).

## The model

1. **Problems** — something causing a negative emotion, with a life area, the
   emotion, and how hard it seems to fix (1 *fixable now* … 5 *I don't know
   how to fix this*).
2. **Goals** — combine problems into what you'll do about them. One sheet:
   the goal, why it matters, and the first steps, one per line.
3. **Tasks** — every step of every goal, plus standalone tasks. Ticking one
   off asks *what went well?* and *what would you do differently?*; the
   answers go to the journal as a reflection.
4. **Finishing** a goal offers to mark its problems resolved.

Plus:

- **Journal** — free writing with a mood and feelings, linked to goals and
  problems. Select a few words and *Turn into a problem*.
- **Probe** — describe a situation in your own words and see anything like it
  you've written before, and what came of it. Also the gaps (problems with no
  goal, goals with no next step, goals gone quiet), what keeps coming back,
  and open problems that seem to be the same thing.
- **Insights** — a few figures and small charts.

Harada mode (the 8×8 grid in Unify 300/400) is left out: it never got used.

## Layout

```
  index.html          the app
  sw.js               offline support (app files network-first; vendor/ cache-first)
  manifest.webmanifest, icons/   Add to Home Screen
  css/app.css
  js/
    util.js           escaping, ids, dates
    model.js          what the data is made of; normalising a file
    merge.js          combining two copies, field by field
    github.js         reading and writing the data file
    store.js          the data in memory, this device's copy, changes; Prefs
    sync.js           keeping this device and GitHub in step
    semantic.js       the language model and fingerprints (from Process Hub)
    semantic-worker.js
    probe.js          search, gaps, patterns, related problems
    handlers.js       data-act / data-form / data-live / data-change / data-bind
    ui.js             sheets, toasts, tags, pickers
    views-*.js        one per section
    app.js            routes, drawing, listeners, start-up
  vendor/             Transformers.js and all-MiniLM-L6-v2, self-hosted — see vendor/README.md
```

`SPEC.md` describes the data file field by field.

## Signing in

On each device, once:

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories → Unify-data**.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Paste it into Unify's sign-in screen.

The token stays in that browser's `localStorage` (`unify.github`) and is only
ever sent to `api.github.com`. Unify refuses to use a repository that is
public. **Sign out** (Settings) removes the token and the device's copy.

## Sync

Every change is saved on the device at once, so Unify opens and works
offline. When there's a connection it reads the file on GitHub, merges, and
uploads — on opening, on coming back to the tab, when back online, and a
moment after each change. Two copies are merged field by field (each record
keeps `fieldsAt`), deletions are remembered, so phone and computer never ask
"which version?" and never overwrite each other's edits to different fields.

## Probe and the language model

The same self-hosted all-MiniLM-L6-v2 as Process Hub, in a worker. It runs on
the device; nothing written is sent anywhere to be read. Fingerprints are
kept in IndexedDB (`unify-vectors`). Thresholds are in `js/probe.js` — short
personal sentences score lower than FAQ text, so they're lower than Process
Hub's; tune them by using it.

## Testing

Serve the folder over http and drive it in a headless browser with
`https://api.github.com/**` routed to a mock that keeps the file in memory —
never with real data. The checks used for the first version: sign-in
(bad token, public repository refused), the whole problem → goal → steps →
reflection → finish chain, journal → problem, editing while typing, two
devices editing offline and merging, simultaneous saves (409 then merge),
reopening offline, Probe with the model loaded, no sideways scrolling at
390px, and sign-out leaving nothing behind.
