# Unify

Problems into goals, goals into steps — and a journal of how it goes.

A personal life-improvement app, grown from the single-file prototypes
(Unify 218 → 300 → 400) in
[UnifyVersion1](https://github.com/AaronUnify2/UnifyVersion1). Built for one
person, phone first, and usable from a computer too.

Live at **https://aaronunify2.github.io/Unify/** — Pages serves the `main`
branch as it stands.

## Where data is kept

Each device chooses, on its first screen:

| | |
|---|---|
| **Signed in with Google** | Kept in the person's Unify account: one file at `/users/<uid>/file` in the Firebase Realtime Database, readable and writable only by them (`firebase-rules.json`). Every device they sign in on stays in step |
| **This device only** | Kept in this browser's storage and nowhere else |
| **A private GitHub repository** | Kept as `data/unify.json` in a repository of their own, with a token (the original way; Aaron's data lives in the private **Unify-data** repository) |

This repository is the app and is public: no personal data, ever.

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
5. **Session** — for a morning or a day of getting things done. In Tasks,
   *Plan a session* and tap the tasks; put them in order (drag the handle,
   or the arrows) and work down the list. *Get link* shares it: anyone with
   the link can tick things off and add to it, and everyone sees it live.
   Helpers' ticks tick your tasks; what they add waits for you to keep (as a
   task, optionally under a goal) or discard. Finishing stops the link.

Plus:

- **Journal** — free writing with a mood and feelings, linked to goals and
  problems. Select a few words and *Turn into a problem*.
- **Probe** — describe a situation in your own words and see anything like it
  you've written before, and what came of it. Also the gaps (problems with no
  goal, goals with no next step, goals gone quiet), what keeps coming back,
  and open problems that seem to be the same thing.
- **Insights** — a few figures and small charts.
- **Claude connector** — talk to Claude, typing or in voice mode, and what
  comes out of it (problems, goals, steps, tasks, sessions, journal entries)
  goes straight into Unify. A small server in `connector/`, set up once:
  see `connector/README.md`.

Harada mode (the 8×8 grid in Unify 300/400) is left out: it never got used.

## Layout

```
  index.html          the app
  session.html        a shared session, as helpers see it
  firebase-rules.json the sharing database's rules
  sw.js               offline support (app files network-first; vendor/ cache-first)
  manifest.webmanifest, icons/   Add to Home Screen
  css/app.css
  js/
    util.js           escaping, ids, dates
    model.js          what the data is made of; normalising a file
    merge.js          combining two copies, field by field
    github.js         reading and writing the data file on GitHub
    account.js        signing in with Google; the data file in the account
    store.js          the data in memory, this device's copy, changes; Prefs
    sync.js           keeping this device and GitHub in step
    share.js          the sharing database (Firebase), by plain REST
    live.js           keeping a shared session and your tasks in step
    session-page.js   the shared page helpers open (session.html)
    semantic.js       the language model and fingerprints (from Process Hub)
    semantic-worker.js
    probe.js          search, gaps, patterns, related problems
    handlers.js       data-act / data-form / data-live / data-change / data-bind
    ui.js             sheets, toasts, tags, pickers
    views-*.js        one per section
    app.js            routes, drawing, listeners, start-up
  connector/          Unify as a Claude connector (an MCP server for a Cloudflare Worker) — see connector/README.md
  vendor/             Transformers.js and all-MiniLM-L6-v2, self-hosted — see vendor/README.md
```

`SPEC.md` describes the data file field by field.

## Signing in

**With Google.** Firebase Authentication, with the library self-hosted in
`vendor/firebase-12.19.0` (`js/account.js`). It needs, once, in the
Firebase console (project `unify-sessions`):

1. *Build → Authentication → Get started → Sign-in method → Google →
   Enable*, with a support email.
2. *Authentication → Settings → Authorized domains*: add
   `aaronunify2.github.io`.
3. *Project settings → General → Your apps → Web (`</>`)*: register an app
   (no Hosting), and copy `apiKey` and `appId` from its config into
   `CONFIG` at the top of `js/account.js`. None of it is secret.
4. The *Rules* in Realtime Database: `firebase-rules.json` (it has a
   `users` part now as well as `sessions`).

Until `apiKey` is set, the first screen offers only *this device only* and
GitHub. Settings has *Move to a Google account* (from GitHub or this
device only: the data is merged into the account), *Sign out of this
device*, and *Delete my account and data*.

**With GitHub**, on each device, once:

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. Repository access: **Only select repositories → Unify-data**.
3. Permissions: **Contents → Read and write**. Nothing else.
4. Paste it under *Use a private GitHub repository instead*.

The token stays in that browser's `localStorage` (`unify.github`) and is only
ever sent to `api.github.com`. Unify refuses to use a repository that is
public.

## Sync

Every change is saved on the device at once, so Unify opens and works
offline. When there's a connection it reads the kept file (account or GitHub),
merges, and uploads — on opening, on coming back to the tab, when back online, and a
moment after each change. Two copies are merged field by field (each record
keeps `fieldsAt`), deletions are remembered, so phone and computer never ask
"which version?" and never overwrite each other's edits to different fields.

## Sharing sessions

A shared session is copied to a small Firebase Realtime Database while it's
shared, at `/sessions/<code>`: its name, day, your name, and its tasks'
text, notes and (if you choose) goal titles — nothing else from Unify. The
code is 24 random letters and digits and is the only way in; the rules
(`firebase-rules.json`) refuse listing sessions, anything not shaped like a
session, and over-long text. Stopping sharing or finishing deletes the copy.
The link is `session.html#<code>`; the code stays after the `#`, so it is
never sent to GitHub Pages.

Anyone with a link can change that session (tick, untick, add), as with
"anyone with the link can edit" in Google Docs, so send it to people you
trust. Anyone who finds the database's address could also create sessions
of their own in it; they can't see or touch yours.

Setting it up, once (free, on Google's Spark plan):

1. **console.firebase.google.com** → sign in → *Create a project* (any name,
   e.g. `unify-sessions`; Google Analytics not needed).
2. *Build → Realtime Database → Create Database*. Location: the closest one
   (Singapore for Australia). Security rules: **Start in locked mode** — not
   test mode, whose rules switch themselves off after 30 days.
3. The *Rules* tab: replace everything with `firebase-rules.json` → *Publish*.
4. The *Data* tab: the address at the top (`https://….firebasedatabase.app`
   or `https://….firebaseio.com`) goes in `DATABASE` at the top of
   `js/share.js`.

Without it, sessions work in full; *Get link* just isn't offered.

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

Accounts were tested against the Firebase Auth and Realtime Database
emulators (`firebase emulators:start --only database,auth`), with
`CONFIG.apiKey` set to anything and `EMULATOR` in `account.js` pointed at
them: the rules (only the owner reads or writes their file; nobody lists
users), saves refused on a stale ETag, and in browsers — signing in on a
phone and a computer and merging both, staying signed in, this device only
then signing in, moving from GitHub (with another device's newer change on
GitHub), deleting the account, and signing out.

Sessions were tested against the Firebase Realtime Database emulator
(`firebase emulators:start --only database`, rules loaded from
`firebase-rules.json`), with `DATABASE` in `share.js` pointed at it: the
rules (listing refused, bad shapes and long text refused, ticking and adding
allowed), and two browsers — the app and the shared page — ticking, unticking,
adding, keeping, reordering, renaming and finishing, each seen live by the
other, plus a tick made while the app was closed arriving when it opened.
