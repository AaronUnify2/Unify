/* ===========================================================================
   github.js — reading and writing the data file in the private repository.

   The token is a fine-grained personal access token with Contents read and
   write on the data repository only. It is kept in this browser's
   localStorage under "unify.github" and sent only to api.github.com — never
   written into the data, an export or a log.
   =========================================================================== */

(function (global) {
  'use strict';

  var KEY = 'unify.github';
  var API = 'https://api.github.com';

  var DEFAULTS = {
    owner: 'AaronUnify2',
    repo: 'Unify-data',
    branch: '',          // the repository's default branch, filled in on connecting
    path: 'data/unify.json'
  };

  /** The saved connection ({ token, owner, repo, branch, path }), or null. */
  function config() {
    var saved = U.readJson(KEY, null);
    if (!saved || !saved.token) return null;
    var cfg = {};
    Object.keys(DEFAULTS).forEach(function (k) { cfg[k] = saved[k] || DEFAULTS[k]; });
    cfg.token = saved.token;
    return cfg;
  }

  function save(cfg) {
    U.writeJson(KEY, cfg);
  }

  function clear() {
    U.removeKey(KEY);
  }

  function request(cfg, method, path, body, keepalive) {
    var options = {
      method: method,
      cache: 'no-store',
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    if (keepalive) options.keepalive = true;
    return fetch(API + path, options);
  }

  function repoPath(cfg) {
    return '/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo);
  }

  function contentsPath(cfg) {
    return repoPath(cfg) + '/contents/' + cfg.path.split('/').map(encodeURIComponent).join('/');
  }

  /** A readable Error for a failed response. */
  function errorFrom(res, cfg) {
    return res.json().catch(function () { return {}; }).then(function (json) {
      var text;
      if (res.status === 401) {
        text = 'GitHub didn’t accept the token. It may have expired — make a new one and connect again.';
      } else if (res.status === 403) {
        text = 'The token isn’t allowed to do this. It needs Contents: Read and write on ' + cfg.owner + '/' + cfg.repo + '.';
      } else if (res.status === 404) {
        text = 'Repository ' + cfg.owner + '/' + cfg.repo + ' wasn’t found, or the token can’t see it.';
      } else {
        text = 'GitHub said: ' + (json.message || ('error ' + res.status));
      }
      var err = new Error(text);
      err.status = res.status;
      err.fatal = res.status === 401 || res.status === 403 || res.status === 404;
      return err;
    });
  }

  /**
   * Check the token can write to the repository, and that the repository is
   * private. Resolves to the repository's default branch.
   */
  function verify(cfg) {
    return request(cfg, 'GET', repoPath(cfg)).then(function (res) {
      if (!res.ok) return errorFrom(res, cfg).then(function (e) { throw e; });
      return res.json();
    }).then(function (repo) {
      if (!repo.private) {
        var err = new Error(cfg.owner + '/' + cfg.repo + ' is a public repository, so anyone could read your data. ' +
          'Make it private on GitHub (Settings → General → Danger zone → Change visibility), then connect again.');
        err.fatal = true;
        throw err;
      }
      if (repo.permissions && !repo.permissions.push) {
        var err2 = new Error('The token can read ' + cfg.owner + '/' + cfg.repo + ' but not write to it. ' +
          'Give it Contents: Read and write.');
        err2.fatal = true;
        throw err2;
      }
      return repo.default_branch || 'main';
    });
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

  /** The data file: { exists: false } or { exists: true, sha, text }. */
  function getFile(cfg) {
    var path = contentsPath(cfg) + (cfg.branch ? '?ref=' + encodeURIComponent(cfg.branch) : '');
    return request(cfg, 'GET', path).then(function (res) {
      if (res.status === 404) return { exists: false };
      if (!res.ok) return errorFrom(res, cfg).then(function (e) { throw e; });
      return res.json().then(function (json) {
        if (Array.isArray(json) || json.type !== 'file') {
          var err = new Error('"' + cfg.path + '" is a folder in the repository, not a file.');
          err.fatal = true;
          throw err;
        }
        if (json.content) return { exists: true, sha: json.sha, text: base64ToUtf8(json.content) };
        // Files over 1 MB come back without their content: read the blob instead
        return request(cfg, 'GET', repoPath(cfg) + '/git/blobs/' + json.sha).then(function (blobRes) {
          if (!blobRes.ok) return errorFrom(blobRes, cfg).then(function (e) { throw e; });
          return blobRes.json();
        }).then(function (blob) {
          return { exists: true, sha: json.sha, text: base64ToUtf8(blob.content) };
        });
      });
    });
  }

  /**
   * Write the data file. sha is the version being replaced (null for a new
   * file). Resolves to the new sha; a rejection with .conflict set means the
   * file changed on GitHub since that version was read.
   */
  function putFile(cfg, text, sha, keepalive) {
    var body = {
      message: 'Update Unify data',
      content: utf8ToBase64(text)
    };
    if (cfg.branch) body.branch = cfg.branch;
    if (sha) body.sha = sha;
    var bodyText = JSON.stringify(body);
    // keepalive lets a save finish while the page closes, but only for small bodies
    var useKeepalive = !!keepalive && bodyText.length < 60000;
    return request(cfg, 'PUT', contentsPath(cfg), bodyText, useKeepalive).then(function (res) {
      if (res.ok) return res.json().then(function (json) { return json.content.sha; });
      return errorFrom(res, cfg).then(function (err) {
        if (res.status === 409 || (res.status === 422 && /sha/i.test(err.message))) err.conflict = true;
        throw err;
      });
    });
  }

  global.GitHub = {
    DEFAULTS: DEFAULTS,
    config: config,
    save: save,
    clear: clear,
    verify: verify,
    getFile: getFile,
    putFile: putFile
  };
}(window));
