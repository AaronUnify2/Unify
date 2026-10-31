/* ===========================================================================
   connector/worker.js — Unify as a Claude connector.

   A small MCP server (Model Context Protocol, "Streamable HTTP", stateless)
   that runs as a Cloudflare Worker. Added to claude.ai as a custom
   connector, it lets Claude — in a typed chat or in voice mode — see what's
   in Unify and add problems, goals, steps, tasks, sessions and journal
   entries as a result of the conversation.

   It reads and writes the same data file the app does (SPEC.md), in
   whichever place it's kept:

     a Google account   the Firebase Realtime Database, /users/<uid>/file,
                        reached with a service account
     GitHub             data/unify.json in the private data repository,
                        reached with a fine-grained token

   Every change is made the way store.js makes it: new records get an id,
   createdAt and updatedAt; changed fields are stamped in fieldsAt; deleted
   ids go in `deleted`. So when the app next syncs, merge.js combines the
   connector's changes with the device's own, field by field, and nothing is
   lost on either side. A write that finds the file has changed since it was
   read (GitHub 409, Firebase 412) reads it again and tries again.

   No libraries and no build step: paste this file into a Worker. The
   settings it needs are listed in connector/README.md. Nothing secret is in
   this file; the token, service account and connector key are the
   Worker's secrets.
   =========================================================================== */

var VERSION = '1.0.0';
var PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

// ---- the data model (as js/model.js) ------------------------------------------------

var KINDS = ['problems', 'goals', 'tasks', 'journal', 'sessions'];
var PREFIX = { problems: 'p', goals: 'g', tasks: 't', journal: 'j', sessions: 's' };
var KIND_OF = { p: 'problems', g: 'goals', t: 'tasks', j: 'journal', s: 'sessions' };

var AREAS = ['Diet', 'Family', 'Fitness', 'Health', 'Home', 'Parenting', 'Personal',
  'Relationship', 'Sleep', 'Social Life', 'Study', 'Work'];

var EMOTIONS = ['Annoyed', 'Anxious', 'Bored', 'Depressed', 'Distracted', 'Disapproving',
  'Disassociated', 'Embarrassed', 'Envy', 'Guilty', 'Impatient', 'Insecure',
  'Let Down', 'Lonely', 'Offended', 'Physical Pain', 'Stressed', 'Tired', 'Vulnerable'];

var PROBLEM_DIFFICULTY = {
  1: 'Fixable now',
  2: 'Fixable soon',
  3: 'Fixable with the right resources',
  4: 'Fixable with the right resources and cooperation from others',
  5: 'I do not know how to fix this problem'
};

var GOAL_DIFFICULTY = {
  1: 'Achievable now',
  2: 'Achievable soon',
  3: 'Achievable with the right resources',
  4: 'Achievable with the right resources and cooperation from others',
  5: 'I do not know how to achieve this goal'
};

var MOODS = { 1: 'Very low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

var DEFAULTS = {
  problems: { text: '', area: '', emotion: '', difficulty: 0, status: 'open', resolvedAt: null },
  goals: { title: '', why: '', area: '', difficulty: 0, problemIds: [], status: 'active', doneAt: null },
  tasks: { text: '', goalId: null, area: '', notes: '', done: false, doneAt: null, calendar: null },
  journal: { text: '', mood: 0, emotions: [], problemIds: [], goalIds: [], taskId: null, kind: 'entry' },
  sessions: { title: '', date: '', taskIds: [], status: 'open', finishedAt: null, shareId: null, sharedAt: null, shareGoals: false }
};

// As the app writes a task reflection (views-tasks.js)
var WELL = 'What went well';
var DIFFERENTLY = 'What I’d do differently';

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function empty() {
  return { app: 'Unify', schema: 1, updatedAt: null, problems: [], goals: [], tasks: [], journal: [], sessions: [], deleted: {} };
}

function normaliseRecord(kind, raw) {
  var rec = copy(DEFAULTS[kind]);
  Object.keys(raw || {}).forEach(function (k) { rec[k] = raw[k]; });
  if (!rec.createdAt) rec.createdAt = rec.updatedAt || nowIso();
  if (!rec.updatedAt) rec.updatedAt = rec.createdAt;
  if (!rec.fieldsAt || typeof rec.fieldsAt !== 'object' || Array.isArray(rec.fieldsAt)) rec.fieldsAt = {};
  ['problemIds', 'goalIds', 'emotions', 'taskIds'].forEach(function (k) {
    if (k in rec && !Array.isArray(rec[k])) rec[k] = [];
  });
  return rec;
}

function normalise(raw) {
  var data = empty();
  raw = raw && typeof raw === 'object' ? raw : {};
  data.updatedAt = raw.updatedAt || null;
  data.deleted = raw.deleted && typeof raw.deleted === 'object' ? copy(raw.deleted) : {};
  KINDS.forEach(function (kind) {
    var seen = {};
    (Array.isArray(raw[kind]) ? raw[kind] : []).forEach(function (r) {
      if (!r || !r.id || seen[r.id]) return;
      seen[r.id] = true;
      data[kind].push(normaliseRecord(kind, r));
    });
  });
  return data;
}

// ---- changing the data (as js/store.js) ------------------------------------------------

/** The data, and the changes made to it in one tool call. */
function Changes(data) {
  this.data = data;
  this.now = nowIso();
  this.changed = false;
}

Changes.prototype.get = function (kind, id) {
  var arr = this.data[kind];
  for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
  return null;
};

Changes.prototype.add = function (kind, fields) {
  var rec = normaliseRecord(kind, fields);
  rec.id = uid(PREFIX[kind]);
  rec.createdAt = this.now;
  rec.updatedAt = this.now;
  this.data[kind].push(rec);
  this.changed = true;
  return rec;
};

Changes.prototype.update = function (kind, id, patch) {
  var rec = this.get(kind, id);
  if (!rec) return null;
  var now = this.now;
  Object.keys(patch).forEach(function (k) {
    rec[k] = patch[k];
    rec.fieldsAt[k] = now;
  });
  rec.updatedAt = now;
  this.changed = true;
  return rec;
};

/** Delete a record for good, and the links to it (as Store.remove). */
Changes.prototype.remove = function (kind, id) {
  var self = this;
  var data = this.data;
  var without = function (list) { return list.filter(function (x) { return x !== id; }); };
  data[kind] = data[kind].filter(function (r) { return r.id !== id; });
  data.deleted[id] = this.now;
  if (kind === 'problems') {
    data.goals.forEach(function (g) {
      if (g.problemIds.indexOf(id) >= 0) self.update('goals', g.id, { problemIds: without(g.problemIds) });
    });
    data.journal.forEach(function (e) {
      if (e.problemIds.indexOf(id) >= 0) self.update('journal', e.id, { problemIds: without(e.problemIds) });
    });
  } else if (kind === 'goals') {
    data.tasks.forEach(function (t) {
      if (t.goalId === id) self.update('tasks', t.id, { goalId: null });
    });
    data.journal.forEach(function (e) {
      if (e.goalIds.indexOf(id) >= 0) self.update('journal', e.id, { goalIds: without(e.goalIds) });
    });
  } else if (kind === 'tasks') {
    data.journal.forEach(function (e) {
      if (e.taskId === id) self.update('journal', e.id, { taskId: null });
    });
    data.sessions.forEach(function (s) {
      if (s.taskIds.indexOf(id) >= 0) self.update('sessions', s.id, { taskIds: without(s.taskIds) });
    });
  }
  this.changed = true;
};

Changes.prototype.tasksForGoal = function (goalId) {
  return this.data.tasks.filter(function (t) { return t.goalId === goalId; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
};

Changes.prototype.goalsForProblem = function (problemId) {
  return this.data.goals.filter(function (g) { return g.problemIds.indexOf(problemId) >= 0; });
};

/** The open session (the newest, as Store.openSession), or null. */
Changes.prototype.openSession = function () {
  var open = this.data.sessions.filter(function (s) { return s.status === 'open'; })
    .sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  return open[0] || null;
};

// ---- where the file is kept ----------------------------------------------------------------

function conflictError(message) {
  var err = new Error(message);
  err.conflict = true;
  return err;
}

function utf8ToBase64(text) {
  var bytes = new TextEncoder().encode(text);
  var s = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function base64ToUtf8(b64) {
  var s = atob(String(b64).replace(/\s/g, ''));
  var bytes = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64url(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** data/unify.json in the private GitHub repository (as js/github.js). */
function githubStore(env) {
  var repo = env.GITHUB_REPO || 'AaronUnify2/Unify-data';
  var path = env.GITHUB_PATH || 'data/unify.json';
  var branch = env.GITHUB_BRANCH || '';
  var url = 'https://api.github.com/repos/' + repo.split('/').map(encodeURIComponent).join('/') +
    '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  var headers = {
    'Authorization': 'Bearer ' + env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'unify-connector'
  };

  function failed(res) {
    return res.text().then(function (body) {
      var message = '';
      try { message = JSON.parse(body).message || ''; } catch (e) { /* not JSON */ }
      if (res.status === 401) return new Error('GitHub didn’t accept the connector’s token (it may have expired).');
      if (res.status === 403) return new Error('The connector’s token isn’t allowed to do this: it needs Contents read and write on ' + repo + '.');
      return new Error('GitHub said: ' + (message || 'error ' + res.status));
    });
  }

  return {
    name: 'GitHub (' + repo + ')',
    read: function () {
      return fetch(url + (branch ? '?ref=' + encodeURIComponent(branch) : ''), { headers: headers }).then(function (res) {
        if (res.status === 404) return { exists: false, version: null, text: '' };
        if (!res.ok) return failed(res).then(function (e) { throw e; });
        return res.json().then(function (json) {
          if (json.content) return { exists: true, version: json.sha, text: base64ToUtf8(json.content) };
          // Over 1 MB the content comes back empty: read the blob instead
          var blobUrl = 'https://api.github.com/repos/' + repo + '/git/blobs/' + json.sha;
          return fetch(blobUrl, { headers: headers }).then(function (blobRes) {
            if (!blobRes.ok) return failed(blobRes).then(function (e) { throw e; });
            return blobRes.json();
          }).then(function (blob) {
            return { exists: true, version: json.sha, text: base64ToUtf8(blob.content) };
          });
        });
      });
    },
    write: function (text, version) {
      var body = { message: 'Update Unify data (from Claude)', content: utf8ToBase64(text) };
      if (branch) body.branch = branch;
      if (version) body.sha = version;
      return fetch(url, {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body)
      }).then(function (res) {
        if (res.ok) return;
        if (res.status === 409 || res.status === 422) throw conflictError('The file changed on GitHub since it was read.');
        return failed(res).then(function (e) { throw e; });
      });
    }
  };
}

/**
 * /users/<uid>/file in the Firebase Realtime Database (as js/account.js),
 * reached with a service account. A service account isn't bound by the
 * database's rules, so the connector can read and write the one user's file.
 */
function firebaseStore(env) {
  var account;
  try {
    account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT isn’t the service account’s JSON key file.');
  }
  if (!env.FIREBASE_UID) throw new Error('FIREBASE_UID isn’t set: it’s the user’s UID from Firebase → Authentication → Users.');
  var database = (env.FIREBASE_DATABASE_URL || 'https://unify-sessions-default-rtdb.asia-southeast1.firebasedatabase.app').replace(/\/+$/, '');
  var fileUrl = database + '/users/' + encodeURIComponent(env.FIREBASE_UID) + '/file.json';

  /** An OAuth access token for the service account (a signed JWT, exchanged). */
  function accessToken() {
    var tokenUri = account.token_uri || 'https://oauth2.googleapis.com/token';
    var iat = Math.floor(Date.now() / 1000);
    var enc = new TextEncoder();
    var header = base64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
    var claims = base64url(enc.encode(JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: tokenUri,
      iat: iat,
      exp: iat + 3600
    })));
    var pem = String(account.private_key || '').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    var der = Uint8Array.from(atob(pem), function (c) { return c.charCodeAt(0); });
    return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
      .then(function (key) {
        return crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(header + '.' + claims));
      }).then(function (sig) {
        var jwt = header + '.' + claims + '.' + base64url(new Uint8Array(sig));
        return fetch(tokenUri, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt
        });
      }).then(function (res) {
        if (!res.ok) throw new Error('Google didn’t accept the service account (' + res.status + ').');
        return res.json();
      }).then(function (json) {
        return json.access_token;
      });
  }

  var tokenPromise = null;
  function withToken() {
    if (!tokenPromise) tokenPromise = accessToken();
    return tokenPromise;
  }

  return {
    name: 'your Unify account',
    read: function () {
      return withToken().then(function (token) {
        return fetch(fileUrl + '?access_token=' + encodeURIComponent(token), { headers: { 'X-Firebase-ETag': 'true' } });
      }).then(function (res) {
        if (!res.ok) throw new Error('Reading your Unify account didn’t work (' + res.status + ').');
        var etag = res.headers.get('ETag');
        return res.json().then(function (value) {
          if (typeof value !== 'string') return { exists: false, version: etag, text: '' };
          return { exists: true, version: etag, text: value };
        });
      });
    },
    write: function (text, version) {
      return withToken().then(function (token) {
        var headers = { 'Content-Type': 'application/json', 'X-Firebase-ETag': 'true' };
        if (version) headers['if-match'] = version;
        return fetch(fileUrl + '?access_token=' + encodeURIComponent(token), {
          method: 'PUT', headers: headers, body: JSON.stringify(text)
        });
      }).then(function (res) {
        if (res.status === 412) throw conflictError('The file changed in your account since it was read.');
        if (!res.ok) throw new Error('Saving to your Unify account didn’t work (' + res.status + ').');
      });
    }
  };
}

function storeFor(env) {
  if (env.FIREBASE_SERVICE_ACCOUNT) return firebaseStore(env);
  if (env.GITHUB_TOKEN) return githubStore(env);
  throw new Error('The connector has nowhere to keep data: set FIREBASE_SERVICE_ACCOUNT and FIREBASE_UID, or GITHUB_TOKEN.');
}

/**
 * Read the file, let change(c) make changes, and write it back if anything
 * changed. If the file changed in between, read it again and redo the
 * changes on the newer copy (up to four times). Resolves to what change()
 * returned.
 */
function withData(store, change) {
  var attempt = 0;
  function run() {
    attempt++;
    return store.read().then(function (file) {
      var raw = null;
      if (file.exists) {
        try {
          raw = JSON.parse(file.text);
        } catch (e) {
          throw new Error('The Unify data file isn’t valid JSON, so the connector won’t touch it.');
        }
      }
      var c = new Changes(normalise(raw));
      var result = change(c);
      if (!c.changed) return result;
      c.data.updatedAt = c.now;
      return store.write(JSON.stringify(c.data, null, 2) + '\n', file.version).then(function () {
        return result;
      }, function (err) {
        if (err.conflict && attempt < 4) return run();
        throw err;
      });
    });
  }
  return run();
}

// ---- reading and checking what Claude sends ---------------------------------------------------

/** A mistake in what was asked for: told back to Claude to put right. */
function Problem(message) {
  this.message = message;
}

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 2000);
}

function required(value, what, max) {
  var s = text(value, max);
  if (!s) throw new Problem(what + ' is needed.');
  return s;
}

function pick(value, list, what) {
  if (value == null || value === '') return '';
  var want = String(value).trim().toLowerCase();
  for (var i = 0; i < list.length; i++) if (list[i].toLowerCase() === want) return list[i];
  throw new Problem('"' + value + '" isn’t one of the ' + what + ': ' + list.join(', ') + '.');
}

function difficulty(value) {
  if (value == null || value === '') return 0;
  var n = parseInt(value, 10);
  if (!(n >= 0 && n <= 5)) throw new Problem('difficulty is 1 (easiest) to 5 (don’t know how), or 0 for not set.');
  return n;
}

function mood(value) {
  if (value == null || value === '') return 0;
  var n = parseInt(value, 10);
  if (!(n >= 0 && n <= 5)) throw new Problem('mood is 1 (very low) to 5 (great), or 0 for not set.');
  return n;
}

function list(value) {
  if (value == null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function ids(c, kind, value, what) {
  var out = [];
  list(value).forEach(function (id) {
    id = String(id).trim();
    if (!c.get(kind, id)) throw new Problem('There’s no ' + what + ' with id ' + id + '. get_overview lists them.');
    if (out.indexOf(id) < 0) out.push(id);
  });
  return out;
}

function kindOf(id) {
  var kind = KIND_OF[String(id || '').split('_')[0]];
  if (!kind) throw new Problem('"' + id + '" isn’t a Unify id (they start p_, g_, t_, j_ or s_).');
  return kind;
}

/** Today's date as YYYY-MM-DD, in the TIMEZONE setting. */
function today(env) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: env.TIMEZONE || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date());
  } catch (e) {
    return nowIso().slice(0, 10);
  }
}

function dateValue(value, env) {
  if (value == null || value === '') return today(env);
  var s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Problem('date is YYYY-MM-DD.');
  return s;
}

// ---- describing things for Claude --------------------------------------------------------------

function describeProblem(c, p) {
  var bits = [p.id + ': ' + p.text];
  var extra = [];
  if (p.area) extra.push(p.area);
  if (p.emotion) extra.push('feeling ' + p.emotion);
  if (p.difficulty) extra.push('difficulty ' + p.difficulty + ' (' + PROBLEM_DIFFICULTY[p.difficulty] + ')');
  var goals = c.goalsForProblem(p.id).filter(function (g) { return g.status === 'active'; });
  extra.push(goals.length ? 'goal: ' + goals.map(function (g) { return g.title; }).join('; ') : 'no goal yet');
  if (extra.length) bits.push('[' + extra.join(', ') + ']');
  return bits.join(' ');
}

function describeTask(t) {
  return (t.done ? '[x] ' : '[ ] ') + t.id + ': ' + t.text + (t.notes ? ' — notes: ' + text(t.notes, 200) : '');
}

function describeGoal(c, g) {
  var steps = c.tasksForGoal(g.id);
  var done = steps.filter(function (t) { return t.done; }).length;
  var lines = [g.id + ': ' + g.title + (g.area ? ' [' + g.area + ']' : '') +
    (g.difficulty ? ' [difficulty ' + g.difficulty + ' (' + GOAL_DIFFICULTY[g.difficulty] + ')]' : '') +
    ' — ' + done + ' of ' + steps.length + ' steps done'];
  if (g.why) lines.push('  why: ' + g.why);
  var problems = g.problemIds.map(function (id) { return c.get('problems', id); }).filter(Boolean);
  if (problems.length) lines.push('  solves: ' + problems.map(function (p) { return p.id + ' ' + p.text; }).join('; '));
  steps.filter(function (t) { return !t.done; }).forEach(function (t) { lines.push('  ' + describeTask(t)); });
  return lines.join('\n');
}

function describeSession(c, s) {
  var lines = [s.id + ': ' + (s.title || 'Session') + ' for ' + (s.date || 'no date set') + (s.shareId ? ' (shared by link)' : '')];
  s.taskIds.forEach(function (id, i) {
    var t = c.get('tasks', id);
    if (t) lines.push('  ' + (i + 1) + '. ' + describeTask(t));
  });
  if (!s.taskIds.length) lines.push('  (no tasks yet)');
  return lines.join('\n');
}

function overview(c, env, includeFinished) {
  var d = c.data;
  var out = ['Today is ' + today(env) + '.', ''];

  var openProblems = d.problems.filter(function (p) { return p.status === 'open'; });
  out.push('OPEN PROBLEMS (' + openProblems.length + ')');
  openProblems.forEach(function (p) { out.push('- ' + describeProblem(c, p)); });
  if (!openProblems.length) out.push('- none');
  out.push('');

  var goals = d.goals.filter(function (g) { return g.status === 'active'; });
  out.push('ACTIVE GOALS (' + goals.length + '), with the steps still to do');
  goals.forEach(function (g) { out.push('- ' + describeGoal(c, g)); });
  if (!goals.length) out.push('- none');
  out.push('');

  var standalone = d.tasks.filter(function (t) { return !t.goalId && !t.done; });
  out.push('OTHER TASKS TO DO (' + standalone.length + ')');
  standalone.forEach(function (t) { out.push('- ' + describeTask(t) + (t.area ? ' [' + t.area + ']' : '')); });
  if (!standalone.length) out.push('- none');
  out.push('');

  var s = c.openSession();
  out.push('CURRENT SESSION');
  out.push(s ? describeSession(c, s) : '- none open');
  out.push('');

  var recent = d.journal.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; }).slice(0, 5);
  out.push('RECENT JOURNAL');
  recent.forEach(function (e) {
    out.push('- ' + e.id + ' (' + e.createdAt.slice(0, 10) + (e.kind === 'reflection' ? ', reflection' : '') +
      (e.mood ? ', mood ' + MOODS[e.mood] : '') + '): ' + text(e.text, 240).replace(/\s+/g, ' '));
  });
  if (!recent.length) out.push('- nothing yet');

  if (includeFinished) {
    out.push('');
    out.push('RESOLVED PROBLEMS');
    d.problems.filter(function (p) { return p.status !== 'open'; }).forEach(function (p) { out.push('- ' + p.id + ': ' + p.text); });
    out.push('FINISHED GOALS');
    d.goals.filter(function (g) { return g.status !== 'active'; }).forEach(function (g) { out.push('- ' + g.id + ': ' + g.title); });
    out.push('DONE TASKS');
    d.tasks.filter(function (t) { return t.done; }).forEach(function (t) { out.push('- ' + t.id + ': ' + t.text); });
  } else {
    var finished = d.problems.length - openProblems.length + d.goals.length - goals.length;
    if (finished) out.push('', '(' + finished + ' resolved problems and finished goals not shown: get_overview with include_finished to see them.)');
  }
  return out.join('\n');
}

// ---- the tools ----------------------------------------------------------------------------------

var areaSchema = { type: 'string', enum: [''].concat(AREAS), description: 'Life area, or "" if none fits.' };
var emotionSchema = { type: 'string', enum: [''].concat(EMOTIONS), description: 'The main feeling, or "".' };

var TOOLS = [
  {
    name: 'get_overview',
    title: 'What’s in Unify',
    description: 'Everything open in Aaron’s Unify app: open problems, active goals with their remaining steps, other tasks, ' +
      'the current session and recent journal entries, each with its id. Call this first in a conversation about ' +
      'Unify, and before linking or changing anything, so you use real ids and don’t add duplicates.',
    inputSchema: {
      type: 'object',
      properties: {
        include_finished: { type: 'boolean', description: 'Also list resolved problems, finished goals and done tasks.' }
      }
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: function (args, c, env) {
      return overview(c, env, !!args.include_finished);
    }
  },
  {
    name: 'add_problem',
    title: 'Add a problem',
    description: 'Record a problem: something in Aaron’s life causing a negative emotion, in his own words ' +
      '(e.g. "The garage is so full I can’t park the car"). Use when he describes something bothering him. ' +
      'Check get_overview first so you don’t add one he already has.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The problem, short, in Aaron’s words.' },
        area: areaSchema,
        emotion: emotionSchema,
        difficulty: { type: 'integer', minimum: 0, maximum: 5, description: '1 fixable now, 2 fixable soon, 3 with the right resources, 4 with resources and cooperation from others, 5 don’t know how to fix it; 0 not set.' }
      },
      required: ['text']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: function (args, c) {
      var p = c.add('problems', {
        text: required(args.text, 'text', 500),
        area: pick(args.area, AREAS, 'life areas'),
        emotion: pick(args.emotion, EMOTIONS, 'emotions'),
        difficulty: difficulty(args.difficulty)
      });
      return 'Added problem ' + p.id + ': ' + p.text;
    }
  },
  {
    name: 'add_goal',
    title: 'Add a goal',
    description: 'Create a goal — what Aaron will do about one or more problems — with its first steps. ' +
      'Steps should be quick, concrete, meaningful actions (one each, e.g. "Book a skip bin for Saturday"). ' +
      'Link the problems it solves by their ids from get_overview.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What he’ll do, e.g. "Clear the garage".' },
        why: { type: 'string', description: 'Why it matters (optional).' },
        area: areaSchema,
        difficulty: { type: 'integer', minimum: 0, maximum: 5, description: '1 achievable now … 5 don’t know how to achieve it; 0 not set.' },
        problem_ids: { type: 'array', items: { type: 'string' }, description: 'Ids (p_…) of the problems it solves.' },
        steps: { type: 'array', items: { type: 'string' }, description: 'The first steps, in order.' }
      },
      required: ['title']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: function (args, c) {
      var problemIds = ids(c, 'problems', args.problem_ids, 'problem');
      var g = c.add('goals', {
        title: required(args.title, 'title', 300),
        why: text(args.why, 2000),
        area: pick(args.area, AREAS, 'life areas'),
        difficulty: difficulty(args.difficulty),
        problemIds: problemIds
      });
      var steps = list(args.steps).map(function (s) { return text(s, 300); }).filter(Boolean);
      steps.forEach(function (s) { c.add('tasks', { text: s, goalId: g.id }); });
      return 'Added goal ' + g.id + ': ' + g.title +
        (problemIds.length ? ', solving ' + problemIds.length + (problemIds.length === 1 ? ' problem' : ' problems') : '') +
        (steps.length ? ', with ' + steps.length + (steps.length === 1 ? ' step' : ' steps') : ', with no steps yet') + '.\n' +
        describeGoal(c, g);
    }
  },
  {
    name: 'add_tasks',
    title: 'Add tasks or steps',
    description: 'Add one or more tasks. With goal_id they’re steps of that goal; without, standalone tasks. ' +
      'Each should be a single, quick, concrete action. Set add_to_session to also put them on the current session.',
    inputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'The task.' },
              notes: { type: 'string', description: 'Details (optional).' }
            },
            required: ['text']
          }
        },
        goal_id: { type: 'string', description: 'The goal (g_…) these are steps of, or leave out for standalone tasks.' },
        area: Object.assign({}, areaSchema, { description: 'For standalone tasks only: the life area, or "".' }),
        add_to_session: { type: 'boolean', description: 'Also add them to the end of the current session (one is started for today if none is open).' }
      },
      required: ['tasks']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: function (args, c, env) {
      var goalId = args.goal_id ? ids(c, 'goals', args.goal_id, 'goal')[0] : null;
      var area = goalId ? '' : pick(args.area, AREAS, 'life areas');
      var items = list(args.tasks).map(function (t) {
        return typeof t === 'string' ? { text: t } : (t || {});
      }).filter(function (t) { return text(t.text); });
      if (!items.length) throw new Problem('tasks needs at least one task with text.');
      var added = items.map(function (t) {
        return c.add('tasks', { text: text(t.text, 300), notes: text(t.notes, 2000), goalId: goalId, area: area });
      });
      var msg = 'Added ' + added.length + (added.length === 1 ? ' task' : ' tasks') +
        (goalId ? ' to goal "' + c.get('goals', goalId).title + '"' : '') + ':\n' +
        added.map(function (t) { return '- ' + t.id + ': ' + t.text; }).join('\n');
      if (args.add_to_session) {
        var s = addToSession(c, env, added.map(function (t) { return t.id; }), null, null);
        msg += '\nAlso on session ' + s.id + ' (' + (s.title || 'Session') + ' for ' + s.date + ').';
      }
      return msg;
    }
  },
  {
    name: 'complete_task',
    title: 'Tick off a task',
    description: 'Mark a task done when Aaron says he’s done it. If he says what went well or what he’d do differently, ' +
      'pass those too: they’re saved to his journal as a reflection, as the app does when he ticks one off.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'The task (t_…).' },
        what_went_well: { type: 'string' },
        what_to_do_differently: { type: 'string' }
      },
      required: ['task_id']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: function (args, c) {
      var id = ids(c, 'tasks', args.task_id, 'task')[0];
      var t = c.get('tasks', id);
      if (!t.done) c.update('tasks', id, { done: true, doneAt: c.now });
      var well = text(args.what_went_well, 2000);
      var differently = text(args.what_to_do_differently, 2000);
      var msg = 'Done: ' + t.text + '.';
      if (well || differently) {
        var parts = [];
        if (well) parts.push(WELL + ': ' + well);
        if (differently) parts.push(DIFFERENTLY + ': ' + differently);
        var e = c.add('journal', { text: parts.join('\n\n'), kind: 'reflection', taskId: id, goalIds: t.goalId ? [t.goalId] : [] });
        msg += ' Reflection saved to the journal (' + e.id + ').';
      }
      if (t.goalId) {
        var steps = c.tasksForGoal(t.goalId);
        var left = steps.filter(function (x) { return !x.done; }).length;
        var g = c.get('goals', t.goalId);
        msg += ' Goal "' + g.title + '": ' + (left ? left + ' of ' + steps.length + ' steps left.' : 'every step is done — ask if he wants to finish the goal.');
      }
      return msg;
    }
  },
  {
    name: 'plan_session',
    title: 'Plan a session',
    description: 'Plan a session: a few tasks in the order Aaron will do them, for a morning or a day. ' +
      'Adds to the current open session if there is one (only one is worked on at a time), otherwise starts one. ' +
      'Give existing tasks by id, and/or new tasks to create (new ones are standalone unless given a goal_id). ' +
      'They go on in the order given: existing ones first, then new ones. Use set_order to reorder the whole list.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Its name, e.g. "Saturday jobs" (optional).' },
        date: { type: 'string', description: 'The day it’s for, YYYY-MM-DD. Leave out for today.' },
        task_ids: { type: 'array', items: { type: 'string' }, description: 'Existing tasks (t_…) to put on it, in order.' },
        new_tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              goal_id: { type: 'string', description: 'The goal it’s a step of (optional).' },
              notes: { type: 'string' }
            },
            required: ['text']
          },
          description: 'Tasks to create and put on it, in order.'
        },
        set_order: { type: 'array', items: { type: 'string' }, description: 'Optional: every task id on the session, in the new order (after adding).' },
        start_new: { type: 'boolean', description: 'Finish the current open session and start a new one instead of adding to it. Only if Aaron asks.' }
      }
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: function (args, c, env) {
      var existing = ids(c, 'tasks', args.task_ids, 'task');
      var fresh = list(args.new_tasks).map(function (t) {
        return typeof t === 'string' ? { text: t } : (t || {});
      }).filter(function (t) { return text(t.text); }).map(function (t) {
        var goalId = t.goal_id ? ids(c, 'goals', t.goal_id, 'goal')[0] : null;
        return { text: text(t.text, 300), notes: text(t.notes, 2000), goalId: goalId };
      });
      var date = args.date ? dateValue(args.date, env) : null;
      var title = args.title != null ? text(args.title, 120) : null;

      var before = c.openSession();
      if (before && args.start_new) {
        if (before.shareId) throw new Problem('The open session is shared by link: finish it in the app first, so the shared copy is taken down.');
        c.update('sessions', before.id, { status: 'finished', finishedAt: c.now, shareId: null });
        before = null;
      }
      var created = fresh.map(function (t) { return c.add('tasks', t).id; });
      var s = addToSession(c, env, existing.concat(created), title, date);

      if (args.set_order) {
        var order = list(args.set_order).map(function (id) { return String(id).trim(); });
        var missing = s.taskIds.filter(function (id) { return order.indexOf(id) < 0; });
        var extra = order.filter(function (id) { return s.taskIds.indexOf(id) < 0; });
        if (missing.length || extra.length) {
          throw new Problem('set_order must list exactly the session’s tasks. ' +
            (missing.length ? 'Missing: ' + missing.join(', ') + '. ' : '') +
            (extra.length ? 'Not on the session: ' + extra.join(', ') + '.' : ''));
        }
        c.update('sessions', s.id, { taskIds: order });
      }
      return (before ? 'Added to the open session.\n' : 'Started a session.\n') + describeSession(c, s) +
        (s.shareId ? '\n(It’s shared by link: the shared copy catches up when Unify is next open.)' : '');
    }
  },
  {
    name: 'add_journal_entry',
    title: 'Write in the journal',
    description: 'Add an entry to Aaron’s journal: how things are going, in his words (lightly tidied, first person). ' +
      'Only when he wants something journalled. Link the problems and goals it’s about by id.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        mood: { type: 'integer', minimum: 0, maximum: 5, description: '1 very low, 2 low, 3 okay, 4 good, 5 great; 0 not set.' },
        emotions: { type: 'array', items: { type: 'string', enum: EMOTIONS } },
        problem_ids: { type: 'array', items: { type: 'string' } },
        goal_ids: { type: 'array', items: { type: 'string' } }
      },
      required: ['text']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    run: function (args, c) {
      var emotions = [];
      list(args.emotions).forEach(function (e) {
        var name = pick(e, EMOTIONS, 'emotions');
        if (name && emotions.indexOf(name) < 0) emotions.push(name);
      });
      var e = c.add('journal', {
        text: required(args.text, 'text', 20000),
        kind: 'entry',
        mood: mood(args.mood),
        emotions: emotions,
        problemIds: ids(c, 'problems', args.problem_ids, 'problem'),
        goalIds: ids(c, 'goals', args.goal_ids, 'goal')
      });
      return 'Saved to the journal (' + e.id + ').';
    }
  },
  {
    name: 'update_item',
    title: 'Change something',
    description: 'Change a problem, goal, task or session by id: reword it, or set its fields. Also for: resolving a ' +
      'problem (status "resolved"), finishing a goal (status "done"), finishing a session (status "finished"), ' +
      'linking problems to a goal, moving a task to another goal, renaming a session. Only the fields given change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'p_…, g_…, t_… or s_…' },
        text: { type: 'string', description: 'Problem or task: the new wording.' },
        title: { type: 'string', description: 'Goal or session: the new title.' },
        why: { type: 'string', description: 'Goal: why it matters.' },
        notes: { type: 'string', description: 'Task: notes (replaces them).' },
        area: areaSchema,
        emotion: emotionSchema,
        difficulty: { type: 'integer', minimum: 0, maximum: 5 },
        status: { type: 'string', enum: ['open', 'resolved', 'active', 'done', 'finished'], description: 'Problem: open/resolved. Goal: active/done. Session: open/finished.' },
        done: { type: 'boolean', description: 'Task: done or not.' },
        goal_id: { type: 'string', description: 'Task: the goal it’s a step of, or "" for standalone.' },
        problem_ids: { type: 'array', items: { type: 'string' }, description: 'Goal: the problems it solves (replaces the list).' },
        date: { type: 'string', description: 'Session: its day, YYYY-MM-DD.' },
        resolve_problems: { type: 'boolean', description: 'When finishing a goal: also mark its problems resolved.' }
      },
      required: ['id']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    run: function (args, c, env) {
      var id = String(args.id || '').trim();
      var kind = kindOf(id);
      var rec = c.get(kind, id);
      if (!rec) throw new Problem('There’s nothing with id ' + id + '. get_overview lists what’s there.');
      if (kind === 'journal') throw new Problem('Journal entries are changed in the app.');
      var patch = {};
      var has = function (k) { return args[k] !== undefined && args[k] !== null; };
      var extra = [];

      if (kind === 'problems') {
        if (has('text')) patch.text = required(args.text, 'text', 500);
        if (has('area')) patch.area = pick(args.area, AREAS, 'life areas');
        if (has('emotion')) patch.emotion = pick(args.emotion, EMOTIONS, 'emotions');
        if (has('difficulty')) patch.difficulty = difficulty(args.difficulty);
        if (has('status')) {
          if (args.status !== 'open' && args.status !== 'resolved') throw new Problem('A problem’s status is open or resolved.');
          if (args.status !== rec.status) {
            patch.status = args.status;
            patch.resolvedAt = args.status === 'resolved' ? c.now : null;
          }
        }
      } else if (kind === 'goals') {
        if (has('title')) patch.title = required(args.title, 'title', 300);
        if (has('why')) patch.why = text(args.why, 2000);
        if (has('area')) patch.area = pick(args.area, AREAS, 'life areas');
        if (has('difficulty')) patch.difficulty = difficulty(args.difficulty);
        if (has('problem_ids')) patch.problemIds = ids(c, 'problems', args.problem_ids, 'problem');
        if (has('status')) {
          if (args.status !== 'active' && args.status !== 'done') throw new Problem('A goal’s status is active or done.');
          if (args.status !== rec.status) {
            patch.status = args.status;
            patch.doneAt = args.status === 'done' ? c.now : null;
          }
          if (args.status === 'done' && args.resolve_problems) {
            (patch.problemIds || rec.problemIds).forEach(function (pid) {
              var p = c.get('problems', pid);
              if (p && p.status !== 'resolved') {
                c.update('problems', pid, { status: 'resolved', resolvedAt: c.now });
                extra.push('resolved problem: ' + p.text);
              }
            });
          }
        }
      } else if (kind === 'tasks') {
        if (has('text')) patch.text = required(args.text, 'text', 300);
        if (has('notes')) patch.notes = text(args.notes, 2000);
        if (has('goal_id')) patch.goalId = args.goal_id ? ids(c, 'goals', args.goal_id, 'goal')[0] : null;
        if (has('area')) patch.area = pick(args.area, AREAS, 'life areas');
        if (has('done') && !!args.done !== rec.done) {
          patch.done = !!args.done;
          patch.doneAt = args.done ? c.now : null;
        }
      } else if (kind === 'sessions') {
        if (has('title')) patch.title = text(args.title, 120);
        if (has('date')) patch.date = dateValue(args.date, env);
        if (has('status')) {
          if (args.status !== 'open' && args.status !== 'finished') throw new Problem('A session’s status is open or finished.');
          if (args.status === 'finished' && rec.status !== 'finished' && rec.shareId) {
            throw new Problem('That session is shared by link: finish it in the app, so the shared copy is taken down.');
          }
          if (args.status !== rec.status) {
            patch.status = args.status;
            patch.finishedAt = args.status === 'finished' ? c.now : null;
          }
        }
      }

      if (!Object.keys(patch).length && !extra.length) {
        return 'Nothing to change on ' + id + ' (those fields don’t apply to it, or already have those values).';
      }
      if (Object.keys(patch).length) c.update(kind, id, patch);
      return 'Changed ' + id + ' (' + Object.keys(patch).join(', ') + ')' + (extra.length ? '; ' + extra.join('; ') : '') + '.';
    }
  },
  {
    name: 'delete_item',
    title: 'Delete something',
    description: 'Delete a problem, goal, task, journal entry or session for good, by id. Only when Aaron clearly asks ' +
      'to remove it, or to undo something you just added by mistake. Deleting a goal keeps its steps as standalone tasks.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id']
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: function (args, c) {
      var id = String(args.id || '').trim();
      var kind = kindOf(id);
      var rec = c.get(kind, id);
      if (!rec) return 'There’s nothing with id ' + id + ' (already deleted?).';
      if (kind === 'sessions' && rec.shareId) {
        throw new Problem('That session is shared by link: stop sharing or finish it in the app before deleting it.');
      }
      c.remove(kind, id);
      return 'Deleted ' + id + ': ' + (rec.text || rec.title || 'session for ' + rec.date).split('\n')[0].slice(0, 120);
    }
  }
];

/** Put tasks at the end of the open session (starting one if needed). */
function addToSession(c, env, taskIds, title, date) {
  var s = c.openSession();
  if (!s) {
    s = c.add('sessions', { title: title || '', date: date || today(env), taskIds: [] });
  } else {
    var patch = {};
    if (title != null && title !== s.title) patch.title = title;
    if (date && date !== s.date) patch.date = date;
    if (Object.keys(patch).length) c.update('sessions', s.id, patch);
  }
  var add = taskIds.filter(function (id) { return s.taskIds.indexOf(id) < 0; });
  if (add.length) c.update('sessions', s.id, { taskIds: s.taskIds.concat(add) });
  return s;
}

var INSTRUCTIONS =
  'Unify is Aaron’s life-improvement app: problems (what’s causing a negative emotion) → goals (what he’ll do about them) ' +
  '→ steps (quick, concrete tasks), plus sessions (an ordered list of tasks for a morning or a day) and a journal. ' +
  'When a conversation turns up a problem, a goal, something to do or a plan for the day, offer to put it in Unify, ' +
  'and add it once he agrees (or straight away if he asks). Call get_overview first so you link to real ids and don’t ' +
  'duplicate. Keep wording short and in his words. In voice, confirm what you added in a sentence, without reading out ids. ' +
  'The app picks up changes the next time it opens or syncs.';

// ---- MCP over HTTP ------------------------------------------------------------------------------

function toolList() {
  return TOOLS.map(function (t) {
    return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations };
  });
}

function callTool(params, env) {
  var tool = null;
  TOOLS.forEach(function (t) { if (t.name === params.name) tool = t; });
  if (!tool) return Promise.resolve({ error: { code: -32602, message: 'Unknown tool: ' + params.name } });
  var args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
  var store;
  try {
    store = storeFor(env);
  } catch (e) {
    return Promise.resolve({ result: { content: [{ type: 'text', text: e.message }], isError: true } });
  }
  return withData(store, function (c) { return tool.run(args, c, env); }).then(function (out) {
    return { result: { content: [{ type: 'text', text: out }] } };
  }, function (e) {
    var message = e instanceof Problem ? e.message : 'Couldn’t reach Unify’s data in ' + store.name + ': ' + (e && e.message);
    return { result: { content: [{ type: 'text', text: message }], isError: true } };
  });
}

/** One JSON-RPC message. Resolves to the response, or null for a notification. */
function handle(msg, env) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return Promise.resolve(msg && msg.id !== undefined && msg.method === undefined ? null :
      { jsonrpc: '2.0', id: msg && msg.id !== undefined ? msg.id : null, error: { code: -32600, message: 'Invalid request' } });
  }
  var isNotification = msg.id === undefined || msg.id === null;
  var params = msg.params || {};
  var work;
  switch (msg.method) {
    case 'initialize':
      var asked = params.protocolVersion;
      work = Promise.resolve({
        result: {
          protocolVersion: PROTOCOL_VERSIONS.indexOf(asked) >= 0 ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'unify', title: 'Unify', version: VERSION },
          instructions: INSTRUCTIONS
        }
      });
      break;
    case 'ping':
      work = Promise.resolve({ result: {} });
      break;
    case 'tools/list':
      work = Promise.resolve({ result: { tools: toolList() } });
      break;
    case 'tools/call':
      work = callTool(params, env);
      break;
    case 'resources/list':
      work = Promise.resolve({ result: { resources: [] } });
      break;
    case 'prompts/list':
      work = Promise.resolve({ result: { prompts: [] } });
      break;
    default:
      work = Promise.resolve(msg.method.indexOf('notifications/') === 0 ? null :
        { error: { code: -32601, message: 'Method not found: ' + msg.method } });
  }
  return work.then(function (out) {
    if (isNotification || !out) return null;
    var res = { jsonrpc: '2.0', id: msg.id };
    if (out.error) res.error = out.error; else res.result = out.result;
    return res;
  });
}

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id'
};

function reply(status, body, headers) {
  var h = Object.assign({}, CORS, headers || {});
  if (body !== null && body !== undefined && typeof body !== 'string') {
    body = JSON.stringify(body);
    h['Content-Type'] = 'application/json';
  }
  return new Response(body === undefined ? null : body, { status: status, headers: h });
}

/** Compare two strings in time that doesn't depend on where they differ. */
function sameSecret(a, b) {
  a = String(a || '');
  b = String(b || '');
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default {
  fetch: function (request, env) {
    var url = new URL(request.url);
    if (request.method === 'OPTIONS') return reply(204, null);

    // The connector's address is https://<worker>/mcp/<CONNECTOR_KEY>: the key is what keeps others out
    var parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'mcp') {
      return reply(200, 'Unify connector. Add its /mcp/<key> address to Claude as a custom connector.', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (!env.CONNECTOR_KEY || String(env.CONNECTOR_KEY).length < 24) {
      return reply(500, 'Set CONNECTOR_KEY (at least 24 random characters) in the Worker’s settings.', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (parts.length !== 2 || !sameSecret(parts[1], env.CONNECTOR_KEY)) {
      return reply(404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    // Stateless: no event stream to open, no session to end
    if (request.method === 'GET') return reply(405, null, { 'Allow': 'POST' });
    if (request.method === 'DELETE') return reply(405, null, { 'Allow': 'POST' });
    if (request.method !== 'POST') return reply(405, null, { 'Allow': 'POST' });

    return request.text().then(function (body) {
      var msg;
      try {
        msg = JSON.parse(body);
      } catch (e) {
        return reply(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
      var batch = Array.isArray(msg);
      return Promise.all((batch ? msg : [msg]).map(function (m) { return handle(m, env); })).then(function (results) {
        var answers = results.filter(Boolean);
        if (!answers.length) return reply(202, null);
        return reply(200, batch ? answers : answers[0]);
      });
    });
  }
};
