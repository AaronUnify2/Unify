# vendor/ — self-hosted copies

Two things are kept here: the language model for Probe, and the Firebase
library for signing in with Google.

## Probe

Unify's Probe section and the "sounds like" hints match what you write by
meaning, with a small language model that runs in the browser
(`js/semantic.js`, `js/semantic-worker.js`). Everything it needs is kept here,
in this repository, so the page fetches nothing from anyone else's servers and
keeps working whatever happens to the original sources. Nothing here changes
unless someone deliberately replaces it.

These are unmodified copies, kept exactly as published — the same files as
Process Hub's `vendor/`.

### What is here

| Folder | What | Version | Source | Licence |
|---|---|---|---|---|
| `transformers-3.0.2/` | Transformers.js — loads the model and runs it in the browser. `transformers.min.js` includes ONNX Runtime Web; `ort-wasm-simd-threaded.jsep.wasm` is its engine | 3.0.2 (ONNX Runtime Web 1.21.0-dev.20241024-d9ca84ef96) | npm package `@huggingface/transformers@3.0.2`, `dist/`, via cdn.jsdelivr.net | Apache 2.0 (`LICENSE`); ONNX Runtime: MIT (`LICENSE-onnxruntime`) |
| `models/Xenova/all-MiniLM-L6-v2/` | The model: all-MiniLM-L6-v2 sentence embeddings, 8-bit quantised ONNX weights, and its tokenizer | Hugging Face commit `751bff37182d3f1213fa05d7196b954e230abad9` | https://huggingface.co/Xenova/all-MiniLM-L6-v2 (converted from https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) | Apache 2.0 (see the model card, `README.md`; licence text as in `transformers-3.0.2/LICENSE`) |

Copied on 2026-10-25 for Process Hub; copied unchanged from Process Hub into Unify on 2026-10-29 (checksums below verified).

### Checksums (SHA-256)

```
495b03b846b315baab6ff2e2f048085e45684b910799e36c4d7f2b4be00cff72  transformers-3.0.2/transformers.min.js
0f6fe5c40378504d1a25a77f766133464bb15705af23e01c994f185719fb080e  transformers-3.0.2/ort-wasm-simd-threaded.jsep.wasm
7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7  models/Xenova/all-MiniLM-L6-v2/config.json
da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0  models/Xenova/all-MiniLM-L6-v2/tokenizer.json
9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3  models/Xenova/all-MiniLM-L6-v2/tokenizer_config.json
afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1  models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx
```

Check them with `cd vendor && sha256sum -c` and the block above.

### Fingerprints depend on the model

Each browser keeps the fingerprints it has worked out in IndexedDB
(`unify-vectors`), under the model's name. They only mean anything to the
model that made them.

### Upgrading

Only if there is a reason to — a browser stops running it, or a clearly
better model. Put the new version in its own folder (e.g.
`transformers-3.x.y/`), change the paths in `js/semantic-worker.js`, test
with outside network access blocked, and update this file. Remove the old
folder afterwards. A different model also needs a new model name in
`js/semantic.js` (`MODEL`), which tells each browser to work its fingerprints
out again. `sw.js` needs no change: it caches anything under `vendor/` as
it is first read.

## Firebase (signing in)

`firebase-12.19.0/` holds the two files of the Firebase JavaScript library
that signing in with Google needs, loaded by `js/account.js` only on the
first screen, in Settings, and for someone who has signed in. The data
itself is read and written with plain `fetch` (no Firebase database
library).

| File | What | Version | Source | Licence |
|---|---|---|---|---|
| `firebase-app-compat.js` | Firebase core | 12.19.0 | npm package `firebase@12.19.0`, package root (the same files Google serves from www.gstatic.com/firebasejs/12.19.0/) | Apache 2.0 (`LICENSE`) |
| `firebase-auth-compat.js` | Firebase Authentication | 12.19.0 | as above | Apache 2.0 |

Copied unmodified on 2026-10-31. They end with a `sourceMappingURL`
comment for `.map` files that aren't copied; browsers only look for those
with developer tools open.

```
11354507ecdd4a0f56f989800ccc8925baf120864d0b8fdd9c372e4c7ec059a6  firebase-12.19.0/firebase-app-compat.js
13ff243c467f542d591d7caf11b4dcce32414e1119d458d71293eb606197f0ec  firebase-12.19.0/firebase-auth-compat.js
```

To upgrade: copy the same two files from a newer `firebase` package into
a new folder, change `SCRIPTS` in `js/account.js`, test signing in against
the emulators (README, Testing), and remove the old folder.
