# Unify connector for Claude

Lets Claude see and change Unify during a conversation, in a typed chat or in
voice mode. Talk something through, and the problems, goals, steps, tasks,
sessions and journal entries that come out of it go straight into Unify. The
app picks them up the next time it opens or syncs.

It's a small MCP server (`worker.js`), run for free as a Cloudflare Worker and
added to Claude as a custom connector. It has no libraries and no build step:
you paste the file into Cloudflare.

## What Claude can do with it

| Tool | |
|---|---|
| `get_overview` | open problems, active goals and their remaining steps, other tasks, the current session, recent journal entries, each with its id |
| `add_problem` | text, life area, emotion, difficulty |
| `add_goal` | title, why, area, difficulty, the problems it solves, its first steps |
| `add_tasks` | steps of a goal, or standalone tasks; optionally onto the current session |
| `complete_task` | tick off a task, with an optional reflection (saved to the journal, as the app does) |
| `plan_session` | add tasks to the open session in order, or start one; reorder it |
| `add_journal_entry` | text, mood, feelings, linked problems and goals |
| `update_item` | reword or change anything; resolve a problem, finish a goal or session |
| `delete_item` | only when asked to, or to undo a mistake |

Every change is made the way the app makes it (`store.js`): ids,
`createdAt`, `updatedAt`, `fieldsAt`, and `deleted` for deletions. So the
app's merge combines the connector's changes with a device's own edits,
field by field, even if that device was offline at the time. If the file
changed between the connector reading and writing it, the connector reads it
again and redoes the change.

The connector can't stop sharing a shared session. A shared session must be
finished or deleted in the app, so its shared copy is taken down. The
connector can still add tasks to it.

## Setting it up, once

### 1. Make the Worker

1. Go to **dash.cloudflare.com** and sign up (the free plan is enough).
2. Open **Workers & Pages → Create → Create Worker** (start from *Hello
   World*). Name it, for example `unify-connector`, then **Deploy**.
3. Open **Edit code**. Replace everything with the contents of
   `connector/worker.js`, then **Deploy**.

### 2. Give it its settings

In the Worker, go to **Settings → Variables and Secrets → Add**:

| Name | Type | Value |
|---|---|---|
| `CONNECTOR_KEY` | Secret | at least 24 random letters and digits (a password generator is fine). It's part of the connector's address and is what keeps everyone else out |
| `TIMEZONE` | Text | your time zone, e.g. `Europe/London`, so "today" is your today |

Then add **one** of the two below: wherever your data is kept now. Settings in
the app tells you which.

**Signed in with Google (your Unify account):**

| Name | Type | Value |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Secret | Firebase console → project `unify-sessions` → ⚙ **Project settings → Service accounts → Generate new private key**. Paste the whole downloaded JSON file, then delete the download |
| `FIREBASE_UID` | Text | Firebase console → **Authentication → Users**: the *User UID* of your Google account |

**A private GitHub repository:**

| Name | Type | Value |
|---|---|---|
| `GITHUB_TOKEN` | Secret | a fine-grained token: **Only select repositories → Unify-data**, **Contents: Read and write**, nothing else |

`GITHUB_REPO` (default `AaronUnify2/Unify-data`), `GITHUB_PATH` (default
`data/unify.json`), `GITHUB_BRANCH` and `FIREBASE_DATABASE_URL` can also be
set, but you don't need them. If you move from GitHub to a Google account
later, add the Firebase two. They take over from `GITHUB_TOKEN`, which you
can then delete.

**Deploy** again after adding settings, if Cloudflare asks.

### 3. Add it to Claude

The connector's address is the Worker's address, then `/mcp/`, then the key:

```
https://unify-connector.<your-subdomain>.workers.dev/mcp/<CONNECTOR_KEY>
```

(Opening the Worker's address without the key in a browser says *Unify
connector*. That shows it's running.)

1. In **claude.ai** (on a computer is easiest), open **Settings → Connectors
   → Add custom connector**.
2. Name: `Unify`. URL: the address above. Leave the advanced OAuth fields
   empty. Click **Add**.
3. In a chat, turn on Unify in the tools menu (the **+** / sliders button
   under the message box). The phone app uses the same connectors, voice mode
   included.

Then just talk: *"I'm stressed that the garage is full, I can't even park in
there… let's make that a goal and plan Saturday morning around it."* Claude
reads Unify, suggests a goal and steps, and adds them when you agree.

For the best results, put Unify chats in a claude.ai **Project** whose
instructions say something like: *"Use the Unify connector. When we talk
about something bothering me, offer to add it as a problem; turn plans into
goals with quick, concrete steps; plan sessions when I'm deciding what to do
today."*

## Keeping it safe

- Anyone with the full address can read and change your Unify data. Treat it
  like a password. To shut someone out, change `CONNECTOR_KEY` in Cloudflare,
  then edit the connector's URL in Claude to match.
- The service account key and the GitHub token are kept only as the Worker's
  secrets. They're never in this repository, in Claude, or in the data.
- The service account can reach everything in the Firebase project, so keep
  it nowhere else. If it leaks, delete it in Google Cloud → IAM → Service
  accounts → Keys, and make a new one.

## Updating

Paste the new `worker.js` into **Edit code** and **Deploy**. The settings
stay.

## Testing it

The checks used: the worker run in Node with `api.github.com`, the Firebase
database and Google's token endpoint mocked. That covered the wrong key
refused, every tool, bad input refused with nothing written, stale-version
conflicts retried (and given up after four), simultaneous calls, old and
unknown fields kept, and an invalid file left alone. The app was also run in
a headless browser, at 390px and at desktop width, against the same mocked
file. It loaded the connector's changes, and a device's offline edits to
other fields of the same records merged with them. Finally, the official MCP
TypeScript SDK client connected, listed the tools and called them.
