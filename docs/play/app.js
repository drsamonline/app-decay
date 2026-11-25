/* app — the Decay page. SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 * (c) 2026 Dr Sohil Momin
 *
 * Wiring only: vitality, the stages, the clock, search, re-seeding and the spore all live
 * in decay-core.js, which the tests exercise directly.
 */
(function () {
  "use strict";

  var D = window.DecayCore;
  var $ = function (id) { return document.getElementById(id); };

  var K_STORE = "decay:colony";

  var els = {
    status: $("status"), body: $("body"), fireDays: $("fireDays"), add: $("add"), example: $("example"),
    exportJson: $("exportJson"), exportMd: $("exportMd"), colonyNote: $("colonyNote"),
    fireGrid: $("fireGrid"), fireEmpty: $("fireEmpty"), fireCount: $("fireCount"),
    liveGrid: $("liveGrid"), liveEmpty: $("liveEmpty"), liveCount: $("liveCount"),
    query: $("query"), doSearch: $("doSearch"), spore: $("spore"), searchGrid: $("searchGrid"), searchNote: $("searchNote"),
    soilGrid: $("soilGrid"), soilEmpty: $("soilEmpty"), soilCount: $("soilCount")
  };

  var state = { store: { notes: [], savedOn: 0 }, selected: null, when: "" };

  /* ------------------------------------------------------------- helpers */

  function now() { return Date.now(); }

  function today() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function setStatus(kind, msg) {
    els.status.className = "status show " + kind;
    els.status.textContent = msg;
  }
  function clearStatus() { els.status.className = "status"; els.status.textContent = ""; }

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* The rot must not run on a store we could not write: a decay that moved notes in
   * memory but not on disk would compost notes that were never saved. */
  function persist() {
    state.store.savedOn = now();
    try {
      window.localStorage.setItem(K_STORE, D.serializeStore(state.store));
      return true;
    } catch (e) {
      setStatus("warn", "This was not saved: " + (e && e.name === "QuotaExceededError" ? "storage is full" : "storage is unavailable") +
        ". The rot does not run on a store it could not write, so nothing was decayed either.");
      return false;
    }
  }

  /* ------------------------------------------------------------- render */

  function render() {
    var at = now();
    var changes = D.tick(state.store, at);

    renderFiring(at);
    renderLiving(at);
    renderSoil(at);

    if (changes.cooled.length) setStatus("ok", changes.cooled.length + " idea(s) cooled and came off the kiln.");
    else if (changes.composted.length) setStatus("warn", changes.composted.length + " note(s) fell into the soil — still searchable, and re-seedable.");
  }

  function noteCard(n, at, opts) {
    var st = D.stage(n, at);
    var v = D.vitality(n, at);
    var box = node("div", "note " + st + (v >= 70 ? " strong" : ""));
    box.dataset.id = n.id;
    var badge = node("span", "badge " + (st === "firing" ? "fire" : st === "soil" ? "soil" : st === "fading" ? "fading" : "live"), st);
    var head = node("div");
    head.appendChild(badge);
    box.appendChild(head);

    var body = node("p", "body", n.body.length > 220 ? n.body.slice(0, 220) + "\u2026" : n.body);
    body.style.fontSize = (12 + Math.round(v / 8)) + "px";
    box.appendChild(body);

    var meta = node("div", "meta");
    if (st === "firing") meta.appendChild(node("span", null, "cools " + D.fmtDate(n.coolsOn) + " · " + D.daysLeft(n, at) + " d"));
    else meta.appendChild(node("span", null, "vitality " + v));
    meta.appendChild(node("span", null, n.touches + " open" + (n.touches === 1 ? "" : "s")));
    meta.appendChild(node("span", null, (n.links || []).length + " link" + ((n.links || []).length === 1 ? "" : "s")));
    if (n.additions && n.additions.length) meta.appendChild(node("span", null, n.additions.length + " added"));
    if (n.seeded) meta.appendChild(node("span", null, "re-seeded"));
    box.appendChild(meta);

    var meter = node("div", "meter");
    var fill = node("i");
    fill.style.width = Math.max(2, Math.min(100, v)) + "%";
    if (st === "fading") fill.style.background = "var(--fading)";
    if (st === "firing") fill.style.background = "var(--fire)";
    if (st === "soil") fill.style.background = "var(--soil)";
    meter.appendChild(fill);
    box.appendChild(meter);

    if (st === "firing" && opts && opts.allowAdd) {
      var addBox = node("div", "addbox");
      var input = document.createElement("input");
      input.type = "text";
      input.placeholder = "add to it (it stays firing)";
      var btn = node("button", "small", "Add");
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var out = D.addToIdea(D.find(state.store, n.id), input.value, now());
        if (!out.ok) { setStatus("bad", out.reason); return; }
        replace(out.note);
        persist();
        render();
        setStatus("ok", out.says);
      });
      addBox.appendChild(input);
      addBox.appendChild(btn);
      box.appendChild(addBox);
    }

    if (st === "soil" && opts && opts.allowReseed) {
      var reseedBtn = node("button", "small", "Re-seed it");
      reseedBtn.style.marginTop = "8px";
      reseedBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        reseedNote(n.id);
      });
      box.appendChild(reseedBtn);
    }

    if (st !== "soil" && (!opts || !opts.noOpen)) {
      box.addEventListener("click", function () { openNote(n.id); });
    }
    return box;
  }

  function renderFiring(at) {
    var list = D.firing(state.store, at);
    els.fireGrid.textContent = "";
    els.fireCount.textContent = list.length ? "· " + list.length : "";
    els.fireEmpty.hidden = list.length > 0;
    list.forEach(function (n) { els.fireGrid.appendChild(noteCard(n, at, { allowAdd: true, noOpen: true })); });
  }

  function renderLiving(at) {
    var list = D.living(state.store, at).filter(function (n) { return !(n.firing && at < n.coolsOn); });
    els.liveGrid.textContent = "";
    els.liveCount.textContent = list.length ? "· " + list.length : "";
    els.liveEmpty.hidden = list.length > 0;
    list.forEach(function (n) { els.liveGrid.appendChild(noteCard(n, at, {})); });
  }

  function renderSoil(at) {
    var list = D.soil(state.store, at);
    els.soilGrid.textContent = "";
    els.soilCount.textContent = list.length ? "· " + list.length : "";
    els.soilEmpty.hidden = list.length > 0;
    list.forEach(function (n) { els.soilGrid.appendChild(noteCard(n, at, { allowReseed: true, noOpen: true })); });
  }

  function replace(note) {
    state.store.notes = state.store.notes.map(function (n) { return n.id === note.id ? note : n; });
  }

  /* --------------------------------------------------------------- acts */

  function addNote() {
    clearStatus();
    var out = D.validateNote({ body: els.body.value, fireDays: els.fireDays.value }, now());
    if (!out.ok) {
      setStatus("bad", out.reason);
      (out.field === "body" ? els.body : els.fireDays).focus();
      return;
    }
    state.store.notes.push(out.note);
    if (!persist()) {
      /* the note was not written: take it back out of memory too */
      state.store.notes = state.store.notes.filter(function (n) { return n.id !== out.note.id; });
      return;
    }
    els.body.value = "";
    els.fireDays.value = "";
    render();
    setStatus("ok", out.note.firing
      ? "Written. It is firing until " + D.fmtDate(out.note.coolsOn) + " — you can add to it, but not act on it."
      : "Written. It is alive, and neglect will start to show.");
  }

  function openNote(id) {
    var n = D.find(state.store, id);
    if (!n) return;
    var touched = D.touch(n, now());
    replace(touched);
    persist();
    state.selected = touched.id;
    render();
    var others = state.store.notes.filter(function (x) { return x.id !== id && D.stage(x, now()) !== "soil"; });
    if (!others.length) {
      setStatus("ok", "Reopened: attention raises its vitality. Write another note to be able to link this one.");
      return;
    }
    var pick = window.prompt("Reopened — vitality is now " + D.vitality(touched, now()) +
      ". Link it to which note? Type a number:\n\n" +
      others.map(function (x, i) { return (i + 1) + ". " + x.body.slice(0, 60); }).join("\n"), "1");
    if (!pick) { setStatus("ok", "Reopened. No link made."); return; }
    var target = others[Number(pick) - 1];
    if (!target) { setStatus("bad", "There is no note number " + pick + "."); return; }
    var linked = D.link(state.store, id, target.id);
    if (!linked.ok) { setStatus("bad", linked.reason); return; }
    persist();
    render();
    setStatus("ok", linked.says);
  }

  function reseedNote(id) {
    var n = D.find(state.store, id);
    if (!n) return;
    var out = D.reseed(n, now());
    if (!out.ok) { setStatus("bad", out.reason); return; }
    replace(out.note);
    persist();
    render();
    setStatus("ok", out.says);
  }

  function doSearch() {
    var out = D.search(state.store, els.query.value, now());
    els.searchGrid.textContent = "";
    if (!out.ok) { setStatus("bad", out.reason); return; }
    els.searchNote.textContent = out.says;
    out.hits.forEach(function (h) {
      var n = D.find(state.store, h.id);
      els.searchGrid.appendChild(noteCard(n, now(), { allowReseed: h.inSoil, noOpen: h.inSoil }));
    });
    setStatus("ok", out.says);
  }

  /* ------------------------------------------------------------- export */

  function writer(name, text, mime) {
    if (!window.Export || typeof window.Export.save !== "function") throw new Error("the export kit did not load");
    window.Export.save(name, text, mime);
    return true;
  }

  function doExport(what) {
    var out = D.exportFile(what, { store: state.store, now: now() }, { when: state.when || today() }, writer);
    if (out.ok) {
      els.colonyNote.textContent = "Wrote " + out.filename + " (" + out.bytes + " bytes).";
      setStatus("ok", "Wrote " + out.filename + ".");
    } else {
      setStatus("bad", out.reason + ".");
    }
  }

  /* ---------------------------------------------------------------- tabs */

  ["colony", "soil"].forEach(function (name) {
    $("tab-" + name).addEventListener("click", function () {
      ["colony", "soil"].forEach(function (other) {
        var on = other === name;
        $("tab-" + other).setAttribute("aria-selected", on ? "true" : "false");
        $("panel-" + other).hidden = !on;
      });
    });
  });

  /* ---------------------------------------------------------------- wire */

  els.add.addEventListener("click", addNote);
  els.doSearch.addEventListener("click", doSearch);
  els.query.addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch(); });
  els.spore.addEventListener("click", function () {
    var out = D.spore(state.store, now(), state.store.notes.length + Math.floor(now() / 60000));
    if (!out.ok) { setStatus("warn", out.reason); return; }
    els.query.value = out.note.body.split(" ").slice(0, 2).join(" ");
    doSearch();
    setStatus("ok", out.says + " — it is in the results below.");
  });
  els.exportJson.addEventListener("click", function () { doExport("colony-json"); });
  els.exportMd.addEventListener("click", function () { doExport("colony-md"); });

  var T0 = now();
  els.example.addEventListener("click", function () {
    var made = [];
    [
      { body: "The roof leak comes back every monsoon — ask the terrace neighbour how he sealed his.", fireDays: "" },
      { body: "A walking club for the colony at 6am, before the heat.", fireDays: 4 },
      { body: "Buy a second water drum before April.", fireDays: "" }
    ].forEach(function (spec, i) {
      var out = D.validateNote({ body: spec.body, fireDays: spec.fireDays }, T0 + i * 1000);
      if (out.ok) made.push(out.note);
    });
    state.store.notes = made;
    if (made.length >= 2) D.link(state.store, made[0].id, made[2].id);
    persist();
    render();
    setStatus("ok", "Example loaded: three invented notes, one of them firing for four days, and one link made.");
  });

  /* ------------------------------------------------------------ start up */

  var raw = null;
  try { raw = window.localStorage.getItem(K_STORE); } catch (e) { raw = null; }
  if (raw) {
    var parsed = D.parseStore(raw);
    if (parsed.ok) {
      state.store = parsed.store;
    } else {
      /* Reported, offered for export, and never treated as an empty colony. */
      setStatus("bad", parsed.reason);
      var keep = node("button", "small", "Export the unreadable colony");
      keep.addEventListener("click", function () {
        var out = D.exportFile("raw", parsed, { when: today() }, writer);
        setStatus(out.ok ? "ok" : "bad", out.ok ? "Wrote " + out.filename + "." : out.reason);
      });
      els.colonyNote.parentNode.insertBefore(keep, els.colonyNote);
      var fresh = node("button", "small", "Start a new colony");
      fresh.addEventListener("click", function () {
        try { window.localStorage.removeItem(K_STORE); } catch (e) { /* nothing to remove */ }
        state.store = { notes: [], savedOn: 0 };
        render();
        setStatus("ok", "Starting a new colony, deliberately. The unreadable file is gone.");
      });
      els.colonyNote.parentNode.insertBefore(fresh, els.colonyNote);
    }
  }

  render();
  if (window.Loom && window.Loom.pwa) window.Loom.pwa.register("sw.js");
})();
