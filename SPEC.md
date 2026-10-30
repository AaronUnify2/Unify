# Unify — the data file

One JSON file, `data/unify.json`, in the private Unify-data repository.
Written by the app as `JSON.stringify(data, null, 2) + '\n'`.

```json
{
  "app": "Unify",
  "schema": 1,
  "updatedAt": "2026-10-29T04:20:00.000Z",
  "problems": [],
  "goals": [],
  "tasks": [],
  "journal": [],
  "sessions": [],
  "deleted": {}
}
```

## Every record

| Field | |
|---|---|
| `id` | `p_…`, `g_…`, `t_…`, `j_…` or `s_…`: a prefix, the time in base 36, a little randomness |
| `createdAt` | ISO time it was made |
| `updatedAt` | ISO time anything in it last changed |
| `fieldsAt` | `{ field: ISO time }` — when each field last changed. Used to merge two copies field by field |

## problems

| Field | |
|---|---|
| `text` | the problem, in your words |
| `area` | one of the 12 life areas, or `""` |
| `emotion` | one of the 19 emotions, or `""` |
| `difficulty` | 0 (not set), 1 *fixable now* … 5 *I do not know how to fix this problem* |
| `status` | `"open"` or `"resolved"` |
| `resolvedAt` | ISO time, or `null` |

Which goals a problem belongs to is worked out from `goals[].problemIds`.

## goals

| Field | |
|---|---|
| `title` | what you'll do |
| `why` | why it matters (optional) |
| `area`, `difficulty` | as for problems (difficulty texts say *achievable*) |
| `problemIds` | the problems it solves |
| `status` | `"active"` or `"done"` |
| `doneAt` | ISO time, or `null` |

## tasks

| Field | |
|---|---|
| `text` | the step |
| `goalId` | its goal, or `null` for a standalone task |
| `area` | for a standalone task; a goal's step uses the goal's area |
| `notes` | free text |
| `done`, `doneAt` | ticked off, and when |
| `calendar` | `{ date, time, duration, addedAt }` when it was sent to Google Calendar, or `null` |

## journal

| Field | |
|---|---|
| `text` | the entry. A task reflection reads `What went well: …\n\nWhat I’d do differently: …` |
| `kind` | `"entry"` or `"reflection"` (written on finishing a task or a goal) |
| `mood` | 0 (not set), 1 very low … 5 great |
| `emotions` | feelings, from the same 19 emotions |
| `problemIds`, `goalIds` | what it is about |
| `taskId` | the task a reflection is on, or `null` |

## sessions

A few tasks in the order you'll do them, for a morning or a day. Files from
before sessions existed load as having none.

| Field | |
|---|---|
| `title` | its name, e.g. "Saturday jobs" (optional) |
| `date` | the day it's for, `YYYY-MM-DD` |
| `taskIds` | its tasks, in order |
| `status` | `"open"` or `"finished"`. One is worked on at a time: the newest open one |
| `finishedAt` | ISO time, or `null` |
| `shareId` | the code of its shared copy while it's shared, or `null` |
| `sharedAt` | ISO time it was last shared, or `null` |
| `shareGoals` | whether the shared copy shows each task's goal |

## The shared copy (not in the file)

While a session is shared it is also in the sharing database (Firebase
Realtime Database), at `/sessions/<shareId>`, and deleted when sharing
stops. Rules: `firebase-rules.json`.

| Field | |
|---|---|
| `title`, `date`, `owner`, `createdAt` | the session's name and day, your name as helpers see it, when it was shared |
| `items/<key>` | one per task. `key` is the task's id, or `x_…` for something a helper added |
| `items/…/text`, `notes`, `goal` | the task's text and notes; the goal's title if `shareGoals` |
| `items/…/order` | its place in the list |
| `items/…/done`, `doneBy`, `at` | ticked, by whom, and when it was last ticked or unticked |
| `items/…/addedBy` | who added it, for a helper's addition |

A tick that differs between a task and its item is settled by time: the
item's `at` against the task's `fieldsAt.done`. A helper's addition becomes
a task only when you keep it.

## deleted

`{ id: ISO time }` for every record deleted. When two copies are merged, a
record is dropped if it was deleted at or after its last change, so a
deletion on one device isn't undone by the other's older copy.

## Merging (merge.js)

- A record only one copy has is kept.
- A record both have: each field comes from the copy whose `fieldsAt` for it
  is later (falling back to `createdAt`).
- Deletions as above; links to records that no longer exist are removed.

## Per-device, not in the file

`localStorage`: `unify.github` (the token and repository), `unify.data` (this
device's copy), `unify.sync` (the sha last read, whether there are changes
to upload), `unify.prefs` (load the model on start, ask for reflections,
recent Probe questions). IndexedDB `unify-vectors`: the model's fingerprints.
