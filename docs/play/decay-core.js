/* decay-core — the engine behind Decay.
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * ONE JOB: a thing you write has a life, and time plus attention decide how long it
 * lasts. Everything in this file is that one rule seen at different ages:
 *
 *   firing   a note that must sit at temperature before it can be acted on (the Kiln
 *            half). It is locked, it can accrue additions, and it cools on schedule.
 *   live     it has cooled. Attention — reopening it, linking it — raises its vitality;
 *            neglect lowers it.
 *   fading   vitality is low. Still readable, on its way out.
 *   soil     decayed. Out of the living view, still searchable, re-seedable with its
 *            links intact (the Mycelium half).
 *
 * There is no second job here: no tags system, no sync, no model. One object, one clock.
 *
 * Pure functions: no DOM, no network, no storage. The page does the wiring.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DecayCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VERSION = "1.0.0";
  var DAY = 86400000;

  /* The rot rule, in one place so the app can name it when it refuses a note. */
  var RULE = {
    halfLifeDays: 7,        /* recency: how fast attention fades */
    soilBelow: 20,          /* vitality under which a note leaves the living view */
    fadingBelow: 45,
    maxTouches: 10,
    maxLinks: 5,
    reseedVitality: 55,
    defaultFireDays: 3
  };

  /* ---------------------------------------------------------------- time */

  function parseDate(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    var d = Number(m[1]), mo = Number(m[2]), y = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCDate() !== d || dt.getUTCMonth() !== mo - 1) return null;
    return dt.getTime();
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
  }

  /* --------------------------------------------------------------- notes */

  function normalise(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  /* A note with no body is refused. A note the rot rule would compost on the day it
   * is written is refused too, with the rule named — the person sees the rule before
   * they lose the note, which is the whole point of naming it. */
  function validateNote(input, now) {
    var at = now == null ? 0 : now;
    var body = normalise(input && input.body);
    if (!body) {
      return { ok: false, field: "body", reason: "a note with no body is refused: there is nothing to keep" };
    }
    var fireDays = input && input.fireDays != null && input.fireDays !== "" ? Number(input.fireDays) : null;
    if (fireDays != null) {
      if (isNaN(fireDays)) return { ok: false, field: "fireDays", reason: "the firing time \u201c" + input.fireDays + "\u201d is not a number of days" };
      if (fireDays <= 0) {
        var wouldCool = at + fireDays * DAY;
        return {
          ok: false, field: "fireDays",
          reason: "an idea that never comes due is not at temperature: a firing time of " + fireDays +
            " day(s) would cool on " + fmtDate(wouldCool) + ", which is not in the future \u2014 refused with the date shown"
        };
      }
      var coolsOn = at + fireDays * DAY;
      if (coolsOn <= at) {
        return { ok: false, field: "fireDays", reason: "that firing time would cool on " + fmtDate(coolsOn) + ", which is already past — refused with the date shown" };
      }
    }
    return {
      ok: true,
      note: {
        id: "n" + at + "-" + Math.floor(Math.random() * 100000),
        body: body,
        created: at,
        lastTouched: at,
        touches: 0,
        links: [],
        firing: fireDays != null,
        fireDays: fireDays,
        coolsOn: fireDays != null ? at + fireDays * DAY : 0,
        additions: [],
        seeded: false
      }
    };
  }

  /* Reopening a note is attention: it raises vitality. Called once per open. */
  function touch(note, now) {
    var next = clone(note);
    next.touches = (next.touches || 0) + 1;
    next.lastTouched = now;
    return next;
  }

  /* A link is mutual, and it is explicit: no inferred edges, no embeddings, no model. */
  function link(store, aId, bId) {
    var a = find(store, aId), b = find(store, bId);
    if (!a || !b) return { ok: false, reason: "both notes have to exist before they can be linked" };
    if (aId === bId) return { ok: false, reason: "a note cannot be linked to itself" };
    if (a.links.indexOf(bId) >= 0) return { ok: false, reason: "they are already linked", already: true };
    a.links.push(bId);
    b.links.push(aId);
    return { ok: true, says: "Linked. Both notes now carry the other, which is what raises their vitality." };
  }

  function unlink(store, aId, bId) {
    var a = find(store, aId), b = find(store, bId);
    if (!a || !b) return { ok: false, reason: "one of those notes is not in the store" };
    a.links = a.links.filter(function (x) { return x !== bId; });
    b.links = b.links.filter(function (x) { return x !== aId; });
    return { ok: true };
  }

  /* ------------------------------------------------------------ vitality */

  /* Recency + attention + links, 0..100. Deterministic: same note, same clock, same
   * number — which is what makes "five reopens beat none" a test rather than a claim. */
  function vitality(note, now) {
    if (!note) return 0;
    var days = Math.max(0, (now - (note.lastTouched || note.created || now)) / DAY);
    var recency = 40 * (1 / (1 + days / RULE.halfLifeDays));
    var attention = 30 * (Math.min(note.touches || 0, RULE.maxTouches) / RULE.maxTouches);
    var links = 30 * (Math.min((note.links || []).length, RULE.maxLinks) / RULE.maxLinks);
    return Math.round((recency + attention + links) * 10) / 10;
  }

  function stage(note, now) {
    if (note.firing && now < note.coolsOn) return "firing";
    var v = vitality(note, now);
    if (v < RULE.soilBelow) return "soil";
    if (v < RULE.fadingBelow) return "fading";
    return "live";
  }

  /* The kiln's rule: while it is firing you cannot act on it, but you may add to it. */
  function canAct(note, now) {
    if (!note.firing) return { ok: true };
    if (now >= note.coolsOn) return { ok: true, cooled: true };
    return {
      ok: false,
      reason: "this is still firing until " + fmtDate(note.coolsOn) + " (" + daysLeft(note, now) + " day(s)). " +
        "Waiting is the feature: you can add to it, but you cannot act on it yet.",
      coolsOn: note.coolsOn
    };
  }

  function daysLeft(note, now) {
    return Math.max(0, Math.ceil((note.coolsOn - now) / DAY));
  }

  function addToIdea(note, text, now) {
    var t = normalise(text);
    if (!t) return { ok: false, reason: "an empty addition was refused" };
    if (!note.firing) return { ok: false, reason: "this note has cooled; add a new note instead" };
    if (now >= note.coolsOn) return { ok: false, reason: "this note cooled on " + fmtDate(note.coolsOn) + "; it takes no more additions \u2014 write a new note instead" };
    var next = clone(note);
    next.additions = (next.additions || []).concat([{ at: now, text: t }]);
    return { ok: true, note: next, says: "Added. It is still firing: the addition sits with it until it cools." };
  }

  /* ------------------------------------------------------------- the clock */

  /* One tick moves every note to where it now belongs. Nothing is deleted: a note that
   * passes the threshold becomes soil, and the store keeps it. */
  function tick(store, now) {
    var changes = { cooled: [], faded: [], composted: [], revived: [] };
    (store.notes || []).forEach(function (n) {
      var was = n.stage || (n.firing ? "firing" : "live");
      if (n.firing && now >= n.coolsOn) { n.firing = false; changes.cooled.push(n.id); }
      var nowStage = stage(n, now);
      if (nowStage !== was) {
        if (nowStage === "soil" && was !== "soil") changes.composted.push(n.id);
        else if (nowStage === "fading" && was !== "fading") changes.faded.push(n.id);
        else if (was === "soil" && nowStage !== "soil") changes.revived.push(n.id);
      }
      n.stage = nowStage;
    });
    return changes;
  }

  function living(store, now) {
    return (store.notes || []).filter(function (n) {
      var s = stage(n, now);
      return s === "live" || s === "fading" || s === "firing";
    }).sort(function (a, b) { return vitality(b, now) - vitality(a, now); });
  }

  function soil(store, now) {
    return (store.notes || []).filter(function (n) { return stage(n, now) === "soil"; })
      .sort(function (a, b) { return (b.lastTouched || 0) - (a.lastTouched || 0); });
  }

  function firing(store, now) {
    return (store.notes || []).filter(function (n) { return n.firing && now < n.coolsOn; })
      .sort(function (a, b) { return a.coolsOn - b.coolsOn; });
  }

  /* --------------------------------------------------------------- search */

  /* Search spans the living notes AND the soil: a word that only a composted note holds
   * is still findable. That is the point of composting rather than deleting. */
  function search(store, query, now) {
    var q = normalise(query).toLowerCase();
    if (!q) return { ok: false, reason: "an empty search was refused", hits: [] };
    var hits = [];
    (store.notes || []).forEach(function (n) {
      var hay = (n.body + " " + (n.additions || []).map(function (a) { return a.text; }).join(" ")).toLowerCase();
      if (hay.indexOf(q) < 0) return;
      var s = stage(n, now);
      hits.push({ id: n.id, body: n.body, stage: s, inSoil: s === "soil", vitality: vitality(n, now), at: n.lastTouched });
    });
    hits.sort(function (a, b) { return (b.inSoil ? 0 : 1) - (a.inSoil ? 0 : 1) || b.vitality - a.vitality; });
    return {
      ok: true, hits: hits, query: q,
      says: hits.length
        ? hits.length + " hit(s): " + hits.filter(function (h) { return !h.inSoil; }).length + " living, " +
          hits.filter(function (h) { return h.inSoil; }).length + " in the soil."
        : "Nothing in the colony or the soil matches \u201c" + q + "\u201d."
    };
  }

  /* ------------------------------------------------------------- re-seed */

  /* Re-seeding returns the note to the living view WITH ITS LINKS INTACT — the links are
   * the reason it was worth keeping. */
  function reseed(note, now) {
    if (!note) return { ok: false, reason: "there is no such note" };
    var next = clone(note);
    next.seeded = true;
    next.lastTouched = now;
    next.touches = (next.touches || 0) + 1;
    next.reseededAt = now;
    var v = vitality(next, now);
    return {
      ok: true, note: next,
      says: "Re-seeded. Its " + (next.links || []).length + " link(s) came back with it, and it is alive at vitality " + v + "."
    };
  }

  /* The spore: a forgotten note comes back on its own, chosen deterministically so the
   * same colony and the same seed give the same spore. */
  function spore(store, now, seed) {
    var dead = soil(store, now);
    if (!dead.length) return { ok: false, reason: "the soil is empty, so there is no spore to send" };
    var i = Math.abs(Math.floor(Number(seed) || 0)) % dead.length;
    return { ok: true, note: dead[i], says: "A spore from the soil: \u201c" + dead[i].body.slice(0, 80) + "\u201d" };
  }

  /* ------------------------------------------------------------- storage */

  function clone(n) {
    return {
      id: n.id, body: n.body, created: n.created, lastTouched: n.lastTouched,
      touches: n.touches || 0, links: (n.links || []).slice(),
      firing: !!n.firing, fireDays: n.fireDays || null, coolsOn: n.coolsOn || 0,
      additions: (n.additions || []).map(function (a) { return { at: a.at, text: a.text }; }),
      seeded: !!n.seeded, reseededAt: n.reseededAt || 0, stage: n.stage || ""
    };
  }

  function serializeStore(store) {
    return JSON.stringify({
      version: VERSION,
      savedOn: store.savedOn || 0,
      notes: (store.notes || []).map(function (n) {
        return {
          id: n.id, body: n.body, created: n.created, lastTouched: n.lastTouched,
          touches: n.touches, links: n.links, firing: n.firing, fireDays: n.fireDays,
          coolsOn: n.coolsOn, additions: n.additions, seeded: n.seeded, reseededAt: n.reseededAt
        };
      })
    }, null, 2);
  }

  /* An unreadable store is REPORTED, never treated as an empty one: an empty colony
   * would decay the difference away, which is the worst possible failure here. */
  function parseStore(text) {
    var raw = String(text == null ? "" : text);
    if (!raw.trim()) return { ok: false, reason: "there is no saved colony", raw: raw };
    var data;
    try { data = JSON.parse(raw); }
    catch (e) {
      return { ok: false, reason: "the saved colony is not readable JSON. It was not treated as an empty one: an empty colony would decay the difference away. Export it to keep it, or start a new colony deliberately.", raw: raw };
    }
    if (!data || !Array.isArray(data.notes)) {
      return { ok: false, reason: "the saved colony has no notes list, so it was not used \u2014 and it was not replaced with an empty colony.", raw: raw };
    }
    var notes = [];
    data.notes.forEach(function (n, i) {
      if (!n || !n.body) return;
      notes.push({
        id: String(n.id || "n" + i),
        body: String(n.body),
        created: Number(n.created) || 0,
        lastTouched: Number(n.lastTouched) || Number(n.created) || 0,
        touches: Number(n.touches) || 0,
        links: Array.isArray(n.links) ? n.links.map(String) : [],
        firing: !!n.firing,
        fireDays: n.fireDays == null ? null : Number(n.fireDays),
        coolsOn: Number(n.coolsOn) || 0,
        additions: Array.isArray(n.additions) ? n.additions.filter(function (a) { return a && a.text; }).map(function (a) { return { at: Number(a.at) || 0, text: String(a.text) }; }) : [],
        seeded: !!n.seeded,
        reseededAt: Number(n.reseededAt) || 0,
        stage: ""
      });
    });
    return { ok: true, store: { version: data.version || VERSION, savedOn: Number(data.savedOn) || 0, notes: notes }, raw: raw };
  }

  function find(store, id) {
    var list = (store && store.notes) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /* ---------------------------------------------------------------- export */

  function stamp(when) {
    var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(when || ""));
    return m ? m[3] + "-" + m[2] + "-" + m[1] : "undated";
  }

  function storeMarkdown(store, now, when) {
    var lines = ["# Decay \u2014 the colony", ""];
    if (when) lines.push("Exported " + when + ".");
    lines.push("");
    lines.push("## Firing");
    var f = firing(store, now);
    if (!f.length) lines.push("", "Nothing is firing.");
    f.forEach(function (n) { lines.push("- \u201c" + n.body.slice(0, 70) + "\u201d \u2014 cools " + fmtDate(n.coolsOn) + " (" + daysLeft(n, now) + " d)"); });
    lines.push("", "## Living");
    var l = living(store, now).filter(function (n) { return !n.firing; });
    if (!l.length) lines.push("", "Nothing is living.");
    l.forEach(function (n) { lines.push("- \u201c" + n.body.slice(0, 70) + "\u201d \u2014 vitality " + vitality(n, now) + ", " + (n.links || []).length + " link(s)"); });
    lines.push("", "## Soil");
    var s = soil(store, now);
    if (!s.length) lines.push("", "The soil is empty.");
    s.forEach(function (n) { lines.push("- \u201c" + n.body.slice(0, 70) + "\u201d \u2014 composted, " + (n.links || []).length + " link(s) kept"); });
    lines.push("", "Nothing was deleted: the soil keeps what the living view has let go of.");
    return lines.join("\n");
  }

  function exportFile(what, payload, meta, writer) {
    meta = meta || {};
    if (typeof writer !== "function") return { ok: false, reason: "the file was not written: no writer is available in this browser" };
    var name, body, mime = "text/plain;charset=utf-8";
    if (what === "colony-json") { name = "decay-colony-" + stamp(meta.when) + ".json"; body = serializeStore(payload.store); mime = "application/json"; }
    else if (what === "colony-md") { name = "decay-colony-" + stamp(meta.when) + ".md"; body = storeMarkdown(payload.store, payload.now, meta.when); mime = "text/markdown;charset=utf-8"; }
    else if (what === "raw") { name = "decay-unreadable-colony-" + stamp(meta.when) + ".txt"; body = String(payload.raw || ""); }
    else return { ok: false, reason: "nothing was written: unknown export \u201c" + what + "\u201d" };
    try {
      var wrote = writer(name, body, mime);
      if (wrote === false) return { ok: false, filename: name, reason: "the file was not written: the browser refused the save" };
      return { ok: true, filename: name, bytes: body.length };
    } catch (e) {
      var why = e && e.name === "QuotaExceededError" ? "storage is full" : (e && e.message ? e.message : "storage is unavailable");
      return { ok: false, filename: name, reason: "the file was not written: " + why };
    }
  }

  return {
    version: VERSION,
    DAY: DAY,
    RULE: RULE,
    parseDate: parseDate,
    fmtDate: fmtDate,
    validateNote: validateNote,
    touch: touch,
    link: link,
    unlink: unlink,
    vitality: vitality,
    stage: stage,
    canAct: canAct,
    daysLeft: daysLeft,
    addToIdea: addToIdea,
    tick: tick,
    living: living,
    soil: soil,
    firing: firing,
    search: search,
    reseed: reseed,
    spore: spore,
    find: find,
    clone: clone,
    serializeStore: serializeStore,
    parseStore: parseStore,
    storeMarkdown: storeMarkdown,
    exportFile: exportFile
  };
});
