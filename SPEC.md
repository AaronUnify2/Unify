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
  "deleted": {}
}
```

## Every record

| Field | |
|---|---|
| `id` | `p_…`, `g_…`, `t_…` or `j_…`: a prefix, the time in base 36, a little randomness |
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
