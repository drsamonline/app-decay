#!/usr/bin/env node
/* ui-tests — the Decay page in a real DOM (jsdom).
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * The engine has its own suite, including the spec's countable done-means. This one proves
 * the page is wired to it: a note is written, a firing note shows its countdown and cannot
 * be opened, an empty note is refused, the colony survives a reload, search reaches the
 * soil, re-seeding brings a note back with its links, and a corrupt colony is reported
 * rather than treated as empty.
 *
 *   npm install --no-save jsdom && node tests/ui-tests.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var { JSDOM } = require("jsdom");

var ROOT = path.join(__dirname, "..");
var PLAY = path.join(ROOT, "docs", "play");
var PAGE = path.join(PLAY, "index.html");

var passed = 0;
var failed = [];
function ok(name, cond, detail) { if (cond) { passed++; return; } failed.push(name + (detail ? " — " + detail : "")); }
function eq(name, a, b) { ok(name, a === b, "expected " + JSON.stringify(b) + ", got " + JSON.stringify(a)); }

function build(seed) {
  var html = fs.readFileSync(PAGE, "utf8");
  var dom = new JSDOM(html, { url: "https://example.test/play/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  var w = dom.window;
  if (seed) Object.keys(seed).forEach(function (k) { w.localStorage.setItem(k, seed[k]); });
  w.URL.createObjectURL = function () { return "blob:x"; };
  w.URL.revokeObjectURL = function () {};
  w.HTMLAnchorElement.prototype.click = function () {};
  w.prompt = function () { return ""; };
  w.confirm = function () { return true; };
  ["web-kit.js", "export-kit.js", "decay-core.js", "app.js"].forEach(function (f) {
    w.eval(fs.readFileSync(path.join(PLAY, f), "utf8"));
  });
  return dom;
}

var dom = build(null);
var w = dom.window;
var d = w.document;
var $ = function (id) { return d.getElementById(id); };

ok("the engine loaded into the page", !!w.DecayCore);
eq("the colony starts empty", $("liveEmpty").hidden, false);

/* --------------------------------------------------------------- write */

$("body").value = "   ";
$("add").click();
ok("a note with no body is refused", /no body is refused/.test($("status").textContent), $("status").textContent);
eq("nothing was added", d.querySelectorAll("#liveGrid .note").length, 0);

$("body").value = "The roof leak comes back every monsoon.";
$("fireDays").value = "0";
$("add").click();
ok("a firing time of zero is refused", /never comes due/.test($("status").textContent), $("status").textContent);

$("fireDays").value = "";
$("add").click();
eq("a plain note is written", d.querySelectorAll("#liveGrid .note").length, 1);
ok("the note says it is alive", /It is alive/.test($("status").textContent), $("status").textContent);

/* --------------------------------------------------------------- firing */

$("body").value = "Build a kiln for the colony's ideas.";
$("fireDays").value = "5";
$("add").click();
eq("a firing idea appears on the kiln", d.querySelectorAll("#fireGrid .note").length, 1);
ok("the countdown is shown", /cools \d\d\/\d\d\/\d{4}/.test($("fireGrid").textContent), $("fireGrid").textContent);
ok("it is marked as firing", /firing/.test($("fireGrid").textContent));
ok("the app says it cannot be acted on", /not act on it/.test($("status").textContent), $("status").textContent);
eq("the firing note is not in the living grid", d.querySelectorAll("#liveGrid .note").length, 1);

var fireNote = d.querySelector("#fireGrid .note");
fireNote.click();
eq("clicking a firing note does not reopen it (it is locked)",
  w.DecayCore.parseStore(w.localStorage.getItem("decay:colony")).store.notes.filter(function (n) { return n.firing; })[0].touches, 0);

var addBox = d.querySelector("#fireGrid .addbox input");
addBox.value = "note the cost of bricks";
d.querySelector("#fireGrid .addbox button").click();
ok("an addition is accepted while firing", /still firing/.test($("status").textContent), $("status").textContent);
ok("the addition is shown", /1 added/.test($("fireGrid").textContent), $("fireGrid").textContent);

/* ------------------------------------------------------- attention */

var livingNote = d.querySelector("#liveGrid .note");
var beforeTouches = w.DecayCore.parseStore(w.localStorage.getItem("decay:colony")).store.notes.filter(function (n) { return !n.firing; })[0].touches;
livingNote.click();
var afterTouches = w.DecayCore.parseStore(w.localStorage.getItem("decay:colony")).store.notes.filter(function (n) { return !n.firing; })[0].touches;
eq("clicking a living note reopens it", afterTouches, beforeTouches + 1);
ok("the app says attention raised its vitality", /Reopened/.test($("status").textContent), $("status").textContent);

/* --------------------------------------------------------------- reload */

var saved = w.localStorage.getItem("decay:colony");
ok("the colony was written to the device", !!saved);
var dom2 = build({ "decay:colony": saved });
var d2 = dom2.window.document;
eq("the reload keeps the living note", d2.querySelectorAll("#liveGrid .note").length, 1);
eq("the reload keeps the firing idea", d2.querySelectorAll("#fireGrid .note").length, 1);
ok("the reload keeps the addition", /1 added/.test(d2.getElementById("fireGrid").textContent));

/* ------------------------------------------------------- soil & search */

/* age the colony so everything composts, then reload: that is what time does */
var aged = JSON.parse(saved);
aged.notes.forEach(function (n) {
  n.lastTouched = Date.now() - 60 * 86400000;
  n.created = Date.now() - 60 * 86400000;
  n.touches = 0;
  n.links = [];
  n.firing = false;
});
var dom3 = build({ "decay:colony": JSON.stringify(aged) });
var w3 = dom3.window;
var d3 = dom3.window.document;
eq("the aged notes are all in the soil", d3.querySelectorAll("#soilGrid .note").length, 2);
eq("and none is living", d3.querySelectorAll("#liveGrid .note").length, 0);

d3.getElementById("tab-soil").click();
eq("the soil panel shows", d3.getElementById("panel-soil").hidden, false);
d3.getElementById("query").value = "monsoon";
d3.getElementById("doSearch").click();
eq("a word only a composted note holds is found", d3.querySelectorAll("#searchGrid .note").length, 1);
ok("the result says it is in the soil", /in the soil/.test(d3.getElementById("searchNote").textContent),
  d3.getElementById("searchNote").textContent);

d3.querySelector("#soilGrid .note button").click();
ok("re-seeding is announced", /Re-seeded/.test(d3.getElementById("status").textContent), d3.getElementById("status").textContent);
eq("the re-seeded note is living again", d3.querySelectorAll("#liveGrid .note").length, 1);
eq("and has left the soil", d3.querySelectorAll("#soilGrid .note").length, 1);

/* --------------------------------------------------------------- spore */

d3.getElementById("spore").click();
ok("a spore names a buried note", /A spore from the soil/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);

/* -------------------------------------------------------------- export */

d3.getElementById("tab-colony").click();
d3.getElementById("exportJson").click();
ok("the export names the file it wrote", /Wrote decay-colony-\d{4}-\d\d-\d\d\.json/.test(d3.getElementById("colonyNote").textContent),
  d3.getElementById("colonyNote").textContent);
w3.URL.createObjectURL = function () { throw new Error("storage is full"); };
d3.getElementById("exportMd").click();
ok("a failed export says the file was not written", /not written/.test(d3.getElementById("status").textContent),
  d3.getElementById("status").textContent);

/* ------------------------------------------- a corrupt colony on reload */

var dom4 = build({ "decay:colony": "{ broken colony" });
var d4 = dom4.window.document;
ok("a corrupt colony is reported", /not readable JSON/.test(d4.getElementById("status").textContent),
  d4.getElementById("status").textContent);
ok("the reason says it was not treated as empty", /not treated as an empty one/.test(d4.getElementById("status").textContent));
ok("it offers an export of the unreadable colony",
  Array.prototype.some.call(d4.querySelectorAll("button"), function (b) { return /Export the unreadable colony/.test(b.textContent); }));
ok("and a deliberate new colony",
  Array.prototype.some.call(d4.querySelectorAll("button"), function (b) { return /Start a new colony/.test(b.textContent); }));
ok("the corrupt colony is not overwritten", /broken colony/.test(dom4.window.localStorage.getItem("decay:colony")),
  dom4.window.localStorage.getItem("decay:colony"));
eq("nothing is shown as living from a corrupt colony", d4.querySelectorAll("#liveGrid .note").length, 0);

var total = passed + failed.length;
if (!total) { console.error("ui-tests: 0 assertions ran. That is a failure, not a pass."); process.exit(1); }
if (failed.length) {
  console.error("ui-tests: " + passed + "/" + total + " passed, " + failed.length + " FAILED");
  failed.forEach(function (f) { console.error("  FAIL " + f); });
  process.exit(1);
}
console.log("ui-tests: " + passed + "/" + total + " assertions passed");
dom.window.close(); dom2.window.close(); dom3.window.close(); dom4.window.close();
