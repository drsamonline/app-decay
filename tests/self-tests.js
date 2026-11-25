#!/usr/bin/env node
/* self-tests — Decay. No framework, no dependencies.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The Mycelium spec's "done means" is countable, so it is counted:
 *
 *   "A note linked and reopened five times has a strictly higher vitality score than one
 *    never opened, and a note ignored past the decay threshold leaves the living view and
 *    appears in the soil. A search for a word that occurs only in a composted note finds
 *    it. Re-seeding that note returns it to the living view with its links intact."
 *
 * The Kiln half's refusals are here too: no firing time, a firing time that has already
 * passed, and an unreadable shelf that is never treated as an empty one.
 *
 *   node tests/self-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");

var ROOT = path.join(__dirname, "..");
var D = require(path.join(ROOT, "docs", "play", "decay-core.js"));

var passed = 0;
var failed = [];
var group = "";

function section(n) { group = n; }
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(group + " :: " + name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }
function read(f) { return fs.readFileSync(path.join(ROOT, f), "utf8"); }

var DAY = D.DAY;
var T0 = Date.UTC(2026, 10, 1);

function note(body, fireDays, at) {
  return D.validateNote({ body: body, fireDays: fireDays == null ? "" : fireDays }, at == null ? T0 : at).note;
}

/* ================================================ the spec's own "done means" */

section("done means — five reopens beat none");
var touched = note("the roof leak comes back every monsoon");
var ignored = note("an idea about a walking club for the colony");
for (var i = 0; i < 5; i++) touched = D.touch(touched, T0 + i * 60000);
ok("a note reopened five times has a higher vitality than one never opened",
  D.vitality(touched, T0) > D.vitality(ignored, T0),
  D.vitality(touched, T0) + " vs " + D.vitality(ignored, T0));
eq("the five reopens are recorded", touched.touches, 5);
ok("linking raises vitality further", (function () {
  var store = { notes: [touched, ignored] };
  var before = D.vitality(store.notes[0], T0);
  D.link(store, store.notes[0].id, store.notes[1].id);
  return D.vitality(store.notes[0], T0) > before;
})());
ok("vitality is deterministic", D.vitality(touched, T0) === D.vitality(touched, T0));
ok("vitality is bounded to 0..100", D.vitality(touched, T0) <= 100 && D.vitality(touched, T0) >= 0);

section("done means — neglect past the threshold moves a note to the soil");
var store = { notes: [touched, ignored] };
D.link(store, store.notes[0].id, store.notes[1].id);
eq("both are living at the start", D.living(store, T0).length, 2);
var later = T0 + 25 * DAY;
eq("the neglected one is soil", D.stage(store.notes[1], later), "soil");
eq("it has left the living view", D.living(store, later).length, 1);
eq("and it appears in the soil", D.soil(store, later).length, 1);
var changes = D.tick(store, later);
ok("the tick reports what it composted", changes.composted.length >= 1, JSON.stringify(changes));
ok("nothing was deleted — the store still holds both", store.notes.length, 2);

section("done means — a word only a composted note holds is still found");
var soilStore = { notes: [note("the water drum has a hairline crack near the tap"), note("buy a second drum before April")] };
var future = T0 + 40 * DAY;
eq("both have gone to soil by then", D.soil(soilStore, future).length, 2);
var found = D.search(soilStore, "hairline", future);
eq("the search succeeds", found.ok, true);
eq("it finds exactly one note", found.hits.length, 1);
eq("and that note is in the soil", found.hits[0] && found.hits[0].inSoil, true);
ok("the result says where it was found", /1 in the soil/.test(found.says), found.says);
var livingHit = D.search(soilStore, "April", T0);
eq("a living note is found too", livingHit.hits.length, 1);
eq("and is not marked as soil", livingHit.hits[0] && livingHit.hits[0].inSoil, false);
eq("an empty search is refused", D.search(soilStore, "  ", future).ok, false);

section("done means — re-seeding returns it with its links intact");
var reseedStore = { notes: [note("the water drum has a hairline crack near the tap"), note("buy a second drum before April")] };
D.link(reseedStore, reseedStore.notes[0].id, reseedStore.notes[1].id);
var buried = D.soil(reseedStore, future)[0];
ok("a note reached the soil to be re-seeded", !!buried);
if (buried) {
  ok("the buried note has a link", buried.links.length === 1);
  var back = D.reseed(buried, future);
  eq("re-seeding works", back.ok, true);
  eq("the links came back with it", back.note && back.note.links.length, 1);
  eq("it is in the living view again", back.note && D.stage(back.note, future), "live");
  ok("the app says the links came back", /link\(s\) came back with it/.test(back.says), back.says);
}

section("done means — the spore resurfaces a buried note");
var spores = D.spore(soilStore, future, 0);
eq("a spore comes out of the soil", spores.ok, true);
if (!spores.ok) spores = { says: "", note: {} };
ok("it names the note it surfaced", /A spore from the soil/.test(spores.says), spores.says);
eq("the same seed gives the same spore",
  (D.spore(soilStore, future, 3).note || {}).id, (D.spore(soilStore, future, 3).note || {}).id);
eq("an empty soil has no spore", D.spore({ notes: [note("still fresh")] }, T0, 0).ok, false);

/* ================================================== the Kiln half's rules */

section("must-not — an idea that never comes due is not at temperature");
var noTime = D.validateNote({ body: "an idea", fireDays: 0 }, T0);
eq("a firing time of zero is refused", noTime.ok, false);
eq("the field is named", noTime.field, "fireDays");
ok("and the reason says why", /never comes due/.test(noTime.reason), noTime.reason);
eq("a firing time that is not a number is refused", D.validateNote({ body: "x", fireDays: "soon" }, T0).field, "fireDays");
ok("a plain note needs no firing time", D.validateNote({ body: "just a note" }, T0).ok);

section("must-not — a date in the past is refused, with the date shown");
var pastIdea = D.validateNote({ body: "x", fireDays: -3 }, T0);
eq("a negative firing time is refused", pastIdea.ok, false);
ok("the refusal shows the date", /\/2026/.test(pastIdea.reason) || /past/.test(pastIdea.reason), pastIdea.reason);

section("must-not — a firing idea cannot be acted on, but can accrue");
var idea = note("build a kiln for the colony's ideas", 5);
var early = D.canAct(idea, T0);
eq("it cannot be acted on while firing", early.ok, false);
ok("the refusal says when it cools", /still firing until/.test(early.reason), early.reason);
eq("it cools after the firing time", D.canAct(idea, T0 + 6 * DAY).ok, true);
var added = D.addToIdea(idea, "note the cost of bricks", T0 + DAY);
eq("an addition is accepted while firing", added.ok, true);
eq("the addition is kept", added.note.additions.length, 1);
ok("the addition says it stays firing", /still firing/.test(added.says), added.says);
eq("an empty addition is refused", D.addToIdea(idea, "   ", T0).ok, false);
var cooled = note("short idea", 2);
eq("a cooled note takes no more additions", D.addToIdea(cooled, "late", T0 + 3 * DAY).ok, false);
ok("the tick reports cooling", D.tick({ notes: [cooled] }, T0 + 3 * DAY).cooled.length, 1);

section("must-not — a note with no body is refused");
var empty = D.validateNote({ body: "   " }, T0);
eq("an empty note is refused", empty.ok, false);
eq("the body field is named", empty.field, "body");

section("must-not — an unreadable store is never treated as an empty one");
var bad = D.parseStore("{ broken colony");
eq("a corrupt store is reported", bad.ok, false);
ok("the reason says it was not treated as empty", /not treated as an empty one/.test(bad.reason), bad.reason);
ok("and says why: an empty colony would decay the difference away", /decay the difference away/.test(bad.reason), bad.reason);
eq("the raw text is kept for export", bad.raw, "{ broken colony");
eq("a store with no notes list is refused", D.parseStore('{"a":1}').ok, false);
eq("an empty save is reported", D.parseStore("").ok, false);

section("must-not — it must not grow a second job");
var core = read("docs/play/decay-core.js");
ok("must_not_grow_a_second_job: there is no second store, no tags field and no sync call",
  !/\b(tags|labels|folders)\s*[:=]/i.test(core) && !/\bsync\s*[:(]/i.test(core));
ok("must_not_grow_a_second_job: links are explicit, never inferred",
  !/\b(inferLinks|inferredLinks|embedding|similarity)\s*[:(]/i.test(core) && !/\.related\s*=/.test(core));
ok("must_not_grow_a_second_job: no model, key or endpoint", !/\b(apiKey|endpoint|openai|gpt)\s*[:=]/i.test(core));

/* ================================================== the other mechanics */

section("mechanic — the clock only moves notes, never deletes");
var clockStore = { notes: [note("first"), note("second", 2)] };
var laterTick = D.tick(clockStore, T0 + 30 * DAY);
eq("both notes are still in the store", clockStore.notes.length, 2);
eq("both are in the soil", D.soil(clockStore, T0 + 30 * DAY).length, 2);
ok("the tick reported the cooling of the firing one", laterTick.cooled.length, 1);

section("mechanic — links are mutual and refuse nonsense");
var linkStore = { notes: [note("a"), note("b")] };
eq("a link is made", D.link(linkStore, linkStore.notes[0].id, linkStore.notes[1].id).ok, true);
eq("it is mutual", linkStore.notes[1].links.length, 1);
eq("the same link twice is refused", D.link(linkStore, linkStore.notes[0].id, linkStore.notes[1].id).ok, false);
eq("a self-link is refused", D.link(linkStore, linkStore.notes[0].id, linkStore.notes[0].id).ok, false);
eq("a link to nothing is refused", D.link(linkStore, linkStore.notes[0].id, "nope").ok, false);
eq("unlinking removes it from both", (function () {
  D.unlink(linkStore, linkStore.notes[0].id, linkStore.notes[1].id);
  return linkStore.notes[0].links.length + linkStore.notes[1].links.length;
})(), 0);

section("failure case — storage full or unavailable");
var thrown = D.exportFile("colony-json", { store: store }, { when: "25/11/2026" }, function () {
  var e = new Error("quota"); e.name = "QuotaExceededError"; throw e;
});
eq("a failed write is reported as failed", thrown.ok, false);
ok("a failed write says the file was not written", /not written/.test(thrown.reason), thrown.reason);
ok("a failed write names the cause", /storage is full/.test(thrown.reason));
eq("no writer means no file", D.exportFile("colony-json", { store: store }, {}, null).ok, false);
ok("the page refuses to run the rot on a store it could not write",
  /rot does not run on a store it could not write/.test(read("docs/play/app.js")));

section("failure case — no network");
["docs/play/decay-core.js", "docs/play/app.js", "docs/play/sw.js", "docs/play/web-kit.js", "docs/play/export-kit.js"].forEach(function (f) {
  var src = read(f);
  ok("no fetch call in " + f, !/\bfetch\s*\(/.test(src));
  ok("no XHR/WebSocket/beacon in " + f, !/XMLHttpRequest|WebSocket|sendBeacon|EventSource/.test(src));
});
ok("the page forbids connections in its CSP", /connect-src 'none'/.test(read("docs/play/index.html")));

section("export — the colony as it stands");
var md = D.storeMarkdown(store, T0, "25/11/2026");
ok("the export has the three stages", /Firing/.test(md) && /Living/.test(md) && /Soil/.test(md));
ok("the export says nothing was deleted", /Nothing was deleted/.test(md));

section("shape — every script the page loads exists beside it");
var page = read("docs/play/index.html");
var srcs = (page.match(/<script[^>]+src="([^"]+)"/g) || []).map(function (t) { return t.replace(/.*src="([^"]+)"/, "$1"); });
srcs.forEach(function (s) {
  ok("script src resolves: " + s, fs.existsSync(path.join(ROOT, "docs", "play", s.replace(/^\.\//, ""))));
});
ok("the landing page exists", fs.existsSync(path.join(ROOT, "docs", "index.html")));
ok("the page manifest exists", fs.existsSync(path.join(ROOT, "PAGES.json")));

/* ============================================================== summary */

var total = passed + failed.length;
if (!total) { console.error("self-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("self-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.slice(0, 12).forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("self-tests: " + passed + "/" + total + " assertions passed");
