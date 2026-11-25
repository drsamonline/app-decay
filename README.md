# Decay

Notes with a life. They **fire** for a set number of days before you can act on them, they grow with
attention, and when they are neglected they **compost** into a soil you can still search.

- **Demo (the app itself):** https://drsamonline.github.io/app-decay/play/index.html
- **Landing page:** https://drsamonline.github.io/app-decay/
- **Release:** https://github.com/drsamonline/app-decay/releases/tag/app-latest
- **Plan row:** #7 of 37 in `drsamonline/forge` → `QUEUE/PLAN.json`
- **Specs absorbed:** `app-mycelium` (lead), `app-kiln`
- **Licence:** PolyForm Noncommercial 1.0.0

## Status

| | |
|---|---|
| **Built** | One lifecycle — firing, living, fading, soil — for one kind of object; vitality from recency, reopens and links; the rot into soil; search across living and soil; re-seeding with links intact; the spore; export of the whole colony. |
| **Release** | Windows EXE, Android APK and Linux binary, built from this source by `app-builder` in CI. |
| **Not built** | **Inferred links.** The Mycelium prompt asks for on-device embeddings to guess connections. There is no embedding model in this estate, so every link is one you made — and the app says so rather than shipping a similarity heuristic and calling it inference. |
| **Untested** | The service worker and install prompt (jsdom implements neither), and the growth visual on a colony of 200+ notes — the ordering and the numbers are tested, the feel of a big colony is not. |

## Rule 0 — the collision check

The prompt says to check `KILN` first, in case an existing app already does this job. **KILN is a
deterministic compiler** — spec in, single-file app out — not a note store. No overlap: nothing in
Decay compiles anything, and KILN has no notes, no vitality and no soil.

## The Mycelium spec's "done means", counted

> "A note linked and reopened five times has a strictly higher vitality score than one never
> opened, and a note ignored past the decay threshold leaves the living view and appears in the
> soil. A search for a word that occurs only in a composted note finds it. Re-seeding that note
> returns it to the living view with its links intact."

| The spec says | The test |
|---|---|
| five reopens beat none | `vitality(touched) > vitality(ignored)`, and a link raises it further |
| neglect past the threshold → soil | `stage === "soil"`, out of `living()`, in `soil()`, and the tick reports it |
| a word only a composted note holds is found | `search()` returns it with `inSoil: true` |
| re-seeding keeps the links | the returned note has the same link count and is `live` again |

## Two specs, one job

Mycelium is *notes that live and rot*; Kiln is *ideas that must sit at temperature*. Both are the
same rule seen at different ages — **time and attention decide what survives** — so there is one
object (a note) and one clock. Firing is its first stage, decay is its later one. There is no tags
system, no second store, no sync: both specs' must-not ("don't grow a second job") is asserted.

## What it will not do

- **Infer your links.** No embeddings, no similarity, no model.
- **Delete anything.** The soil keeps what the living view let go of.
- **Run the rot on a store it could not write.** A decay that moved notes in memory but not on disk would compost notes that were never saved.
- **Treat an unreadable colony as an empty one.** That would decay the difference away; it is reported and offered for export.
- **Use a model, a key or a network.** No `fetch`, no endpoint; CSP `connect-src 'none'`.

## When things go wrong

| Case | Behaviour |
|---|---|
| **Bad input** | No body → refused. A firing time of zero ("an idea that never comes due") → refused with the rule named. A firing time that would cool in the past → refused with the date shown. |
| **No network** | Nothing changes. The colony is on the device. |
| **Storage full or unavailable** | The note is not written and the app says so; the rot does not run on a store it could not write. |
| **Corrupt saved state** | Reported, offered for export, never treated as an empty colony. |

## How vitality works

Three inputs, nothing else:

```
recency   = 40 × 1 / (1 + daysSinceTouched / 7)
attention = 30 × min(reopens, 10) / 10
links     = 30 × min(links, 5) / 5
vitality  = round(recency + attention + links, 1)     → 0..100
```

Below 20 a note is **soil**; below 45 it is **fading**. The numbers are in one `RULE` object so the
app can name the rule when it refuses a note, and so a test can hold the threshold still.

## Tests

```bash
npm test                      # all three suites
node tests/self-tests.js      # engine — 89 assertions, including the done-means
node tests/ui-tests.js        # the page in jsdom — 38 assertions (needs the dev-only jsdom)
node tests/page-smoke.js      # every local src/href resolves, nothing off-origin
```

Mutation-tested five ways on 25/11/2026: attention no longer raising vitality (3 failures), a soil
threshold nothing can cross (11), search skipping the soil (3), re-seeding dropping the links (2),
and a corrupt colony becoming an empty one (3) — each turned the suite red; restored, 89/89.

## Layout

```
docs/index.html            landing page
docs/play/index.html       the app (Colony and Soil & search tabs)
docs/play/app.js           DOM wiring: write, kiln, attention, links, soil, search, spore
docs/play/decay-core.js    the engine — vitality, stages, clock, search, re-seed, storage
docs/play/web-kit.js       vendored kit (unmodified)
docs/play/export-kit.js    vendored kit (unmodified)
tests/self-tests.js        engine suite (89)
tests/ui-tests.js          page suite (38, jsdom)
tests/page-smoke.js        shape on disk
PAGES.json                 landing = docs/index.html, app = docs/play/index.html
```

## Where the spec was silent, and what was chosen

- **No inferred links.** The prompt wants embeddings; without a model, a similarity heuristic would be a guess dressed as a connection. Explicit links only, and the vitality model counts only those.
- **Reopening is the attention signal.** Not scrolling, not hovering — an open is a decision, and it is the one thing a page can honestly count.
- **The rot never deletes.** Composting is the mechanic; deletion would make the soil a lie.
- **A firing note cannot even be reopened.** "Locked from being worked on" is taken literally: you can add to it, nothing else.
- **The spore is deterministic given a seed**, so "it resurfaces a buried note" is a test rather than a mood.

## What is not built, and why

**Inferred links (embeddings).** No sentence-embedding model exists in this estate — `lm-kit` is a
pipeline whose own badge reads "pipeline built, models not trained". Shipping a hand-rolled
similarity score and calling it inference would overstate what the app knows.

**The prompt's stack (React Native / Flutter, SQLite).** The house rule is a single-file web app
that runs from `file://`, as a PWA and as an APK. The store is `localStorage` and the export is
JSON, which is what the same job looks like in this shape.
