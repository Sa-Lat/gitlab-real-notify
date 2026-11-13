// GitLab Real Notify – Service Worker
//
// Bildet GitLabs Benachrichtigungsstufe „Participate“ als Browser-
// Benachrichtigungen nach. GitLab hat dafür keine API, also wird jede Minute
// abgefragt, was dich betrifft:
//   1. Todos: Erwähnungen, Zuweisungen, Review-Anfragen, rote Pipelines …
//   2. Threads, in denen du kommentiert hast (/events?action=commented)
//   3. MRs und Issues, die du angelegt hast, die dir zugewiesen sind oder in
//      denen du Reviewer bist
// Für alles aus 2 und 3, was sich seit der letzten Abfrage geändert hat,
// werden die neuen Kommentare geholt und Statuswechsel (gemergt, geschlossen)
// erkannt. Optional dazu: neue MRs (ohne Draft) in ausgewählten Gruppen und
// Projekten, siehe checkNewMrs().
//
// Nur lesen: Jede Anfrage an GitLab läuft über get(), und get() kennt nur
// GET. Der Token braucht deshalb nur read_api. Keinen Schreibzugriff
// ergänzen, auch keinen bequemen — die Suite „Nur lesen“ wacht darüber.

// Texte (I18N, tr, langOf). Chrome: Service Worker lädt nach; Firefox lädt
// i18n.js vorher als eigenes background-Script, dort gibt es kein importScripts.
if (typeof I18N === "undefined" && typeof importScripts === "function") importScripts("i18n.js");

const POLL = "poll";
// Wählbare Abfrage-Abstände in Minuten (Einstellungen). Unter 1 Minute lassen
// Chrome und Firefox wiederkehrende Alarme nicht zuverlässig zu.
const INTERVALS = [1, 2, 5, 10, 15, 30];
const DEFAULT_INTERVAL = 1;
const DAY = 86400000;
// shortcut: Threads, in denen du nur kommentiert hast, fallen nach 30 Tagen
// ohne Aktivität aus der Beobachtung. Hochsetzen, wenn alte Threads fehlen —
// jedes Projekt darin kostet pro Abfrage einen Aufruf.
const WATCH_DAYS = 30;
const OVERLAP_MS = 2 * 60000; // Uhrenversatz zwischen Rechner und GitLab abfangen
const HISTORY_MAX = 200; // ein Tag Abwesenheit mit viel Betrieb passt rein
// Kurz nach dem Entsperren steht das Netz (WLAN, VPN) oft noch nicht. Solche
// Aussetzer zeigen wir erst, wenn der letzte Erfolg so lange her ist —
// mindestens 5 Minuten, bei langsamem Takt zwei verpasste Abfragen.
const NET_GRACE_MS = 5 * 60000;
// shortcut: bekannte MRs ohne Aktivität seit 180 Tagen werden vergessen;
// tauchen sie danach wieder auf, kommen sie einmal als „neu“.
const SEEN_DAYS = 180;
const BURST_MAX = 5; // mehr neue Ereignisse auf einmal -> eine Sammelmeldung
const IIDS_PER_CALL = 50; // hält die URL kurz

// Systemnotizen, für die GitLab bei „Participate“ auch eine Mail schickt.
// Label-, Meilenstein- und Beschreibungsänderungen gehören nicht dazu.
// Gemergt/geschlossen kommen nicht als Notiz, sondern aus dem Statuswechsel.
const SYSTEM_NOTE_RE = /^(added \d+ (new )?commits?|approved this merge request|unapproved this merge request|marked this merge request as ready|requested review from|assigned to)/i;

// Sprache der Meldungen; pollNow() setzt sie aus den Einstellungen. Läuft
// alles über serial(), also kein Durcheinander zwischen zwei Abfragen.
let lang = "en";
function tx(key, vars) {
  return tr(lang, key, vars);
}

// Alternative Bot-Nutzer (z. B. ein Bot, der für dich kommentiert): ihre
// Aktivität wird nicht gemeldet, ihre Antworten zählen bei „Erledigte
// entfernen“ als deine. Setzen pollNow() und dismissDone() über loadIgnored().
let ignored = new Set();
function loadIgnored(settings) {
  ignored = new Set(((settings && settings.ignoreUsers) || []).filter((u) => u.on).map((u) => u.name.toLowerCase()));
}
function muted(user) {
  return !!user && ignored.has(String(user.username || "").toLowerCase());
}

// ---------- GitLab, nur lesend ----------

// Die einzige Stelle, die GitLab anfragt. Methode fest auf GET.
async function get(settings, path, params) {
  const url = new URL("api/v4/" + path, settings.url.replace(/\/*$/, "/"));
  for (const [k, v] of Object.entries(params || {})) {
    for (const x of [].concat(v)) url.searchParams.append(k, x);
  }
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "PRIVATE-TOKEN": settings.token }
  });
  if (!res.ok) {
    const err = new Error("GET " + path + " -> " + res.status);
    err.status = res.status;
    err.retryAfter = Number(res.headers.get("Retry-After")) || 0;
    throw err;
  }
  return { data: await res.json(), next: res.headers.get("x-next-page") };
}

// x-next-page folgen. maxPages deckelt den Erstabruf von 30 Tagen Kommentaren.
async function pages(settings, path, params, maxPages) {
  const out = [];
  let page = 1;
  for (let i = 0; i < (maxPages || 5) && page; i++) {
    const res = await get(settings, path, Object.assign({ per_page: 100, page }, params));
    out.push(...res.data);
    page = Number(res.next) || 0;
  }
  return out;
}

// ---------- Kleinkram ----------

function kindOf(type) {
  return type === "MergeRequest" ? "mr" : type === "Issue" ? "issue" : null;
}

function keyOf(pid, kind, iid) {
  return kind + ":" + pid + ":" + iid;
}

function refOf(kind, iid) {
  return (kind === "mr" ? "!" : "#") + iid;
}

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Eine Erwähnung erzeugt bei GitLab ein Todo, das wir ohnehin melden —
// die Notiz dazu also nicht zusätzlich.
function mentions(body, username) {
  return new RegExp("@" + escapeRegex(username) + "(?![\\w-]|\\.[\\w-])", "i").test(body || "");
}

// Notiz-Texte sind Markdown mit eingestreutem HTML (Systemnotizen zu Commits
// etwa „<ul><li>sha - msg</li></ul> [Compare with previous version](…)“).
// Die Meldung zeigt nur Text. Titel laufen nicht hier durch: „Fix <Button>“
// ist dort Inhalt, kein Markup.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", nbsp: " " };
// Erst kürzen: die Muster unten brauchen bei vielen „<“ oder „[“ quadratisch
// lange — ein 1-MB-Kommentar legte sonst jede Abfrage lahm. Gezeigt werden
// ohnehin höchstens 160 Zeichen.
function bodyText(md) {
  return String(md || "").slice(0, 2000)
    .replace(/\[Compare with previous version\]\([^)]*\)/gi, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // Links und Bilder -> ihr Text
    .replace(/```[\s\S]*?```/g, " … ")          // Codeblöcke sprengen jede Meldung
    .replace(/\*\*|__|`/g, "")                  // fett und Code; # und _ bleiben (#123, snake_case)
    .replace(/<li[^>]*>/gi, " · ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) => ENTITIES[e]);
}

function plain(text, max) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Nur http(s) als Ziel — die Links kommen aus der API und landen in Tabs.
function safeUrl(u) {
  return /^https?:\/\//i.test(u || "") ? u : null;
}

function remember(items, pid, kind, iid, at) {
  if (!kind || !pid || !iid) return;
  const k = keyOf(pid, kind, iid);
  const it = items[k] || (items[k] = { pid, kind, iid, touched: 0 });
  it.touched = Math.max(it.touched, at);
}

// ---------- Was zählt als Ereignis ----------

function relevantNote(note, me) {
  if (!note.author || note.author.id === me.id || muted(note.author)) return false;
  if (mentions(note.body, me.username)) return false;
  return !note.system || SYSTEM_NOTE_RE.test(note.body || "");
}

function noteEvent(note, item) {
  const who = note.author.name;
  return {
    title: refOf(item.kind, item.iid) + " " + plain(item.title, 80),
    message: who + (note.system ? " " : ": ") + plain(bodyText(note.body), 160),
    url: safeUrl(item.url && item.url + "#note_" + note.id)
  };
}

// Mehrere neue Kommentare in einem MR/Issue (typisch: ein abgeschicktes Review
// mit vielen Anmerkungen) -> eine Meldung, Link auf den ersten.
function commentsEvent(notes, item) {
  const who = [...new Set(notes.map((n) => n.author.name))].join(", ");
  return {
    title: refOf(item.kind, item.iid) + " " + plain(item.title, 80),
    message: who + ": " + tx("comments", { n: notes.length }) + " · " + plain(bodyText(notes[0].body), 120),
    url: safeUrl(item.url && item.url + "#note_" + notes[0].id),
    notes: notes.map((n) => n.id) // für „Erledigte entfernen“: alle, nicht nur der verlinkte
  };
}

// Alles, was eine Abfrage zu einem MR/Issue findet, wird eine Meldung:
// Statuswechsel, dann Kommentare, dann Systemnotizen, verbunden mit „ · “.
// Gibt es nur eine Sorte, bleibt es bei der bisherigen, ausführlicheren Form.
function itemEvent(item, stateEv, comments, system) {
  const commits = new Map(); // Autor -> Anzahl; mehrere Pushes zählen zusammen
  const commitNotes = new Map();
  const others = [];
  const seen = new Set();
  for (const n of system) {
    const m = /^added (\d+) (?:new )?commits?/i.exec(n.body || "");
    if (m) {
      commits.set(n.author.name, (commits.get(n.author.name) || 0) + Number(m[1]));
      commitNotes.set(n.author.name, (commitNotes.get(n.author.name) || []).concat(n));
    } else {
      const text = noteEvent(n, item).message;
      if (!seen.has(text)) { seen.add(text); others.push(n); }
    }
  }
  const sysParts = [];
  for (const [name, notes] of commitNotes) {
    sysParts.push({ note: notes[0], text: notes.length === 1 ? noteEvent(notes[0], item).message
      : tx("addedCommits", { name, n: commits.get(name) }) });
  }
  for (const n of others) sysParts.push({ note: n, text: noteEvent(n, item).message });

  const kinds = (stateEv ? 1 : 0) + (comments.length ? 1 : 0) + (sysParts.length ? 1 : 0);
  if (!kinds) return null;
  if (kinds === 1 && stateEv) return stateEv;
  if (kinds === 1 && comments.length) return comments.length === 1 ? noteEvent(comments[0], item) : commentsEvent(comments, item);
  if (kinds === 1 && sysParts.length === 1) return Object.assign(noteEvent(sysParts[0].note, item), { message: sysParts[0].text });

  const parts = [];
  if (stateEv) parts.push(stateEv.message);
  if (comments.length === 1) parts.push(plain(noteEvent(comments[0], item).message, 90));
  else if (comments.length) {
    parts.push([...new Set(comments.map((n) => n.author.name))].join(", ") + ": " + tx("comments", { n: comments.length }));
  }
  for (const p of sysParts) parts.push(p.text);
  const first = comments[0] || (sysParts[0] && sysParts[0].note);
  return {
    title: refOf(item.kind, item.iid) + " " + plain(item.title, 80),
    message: parts.join(" · "),
    url: safeUrl(item.url && (first ? item.url + "#note_" + first.id : item.url)),
    notes: comments.map((n) => n.id)
  };
}

function todoEvent(todo) {
  const kind = kindOf(todo.target_type);
  const t = todo.target || {};
  const what = I18N.en["todo." + todo.action_name] ? tx("todo." + todo.action_name) : todo.action_name;
  const body = todo.body && todo.action_name !== "build_failed" ? ": " + plain(bodyText(todo.body), 120) : "";
  return {
    title: (kind ? refOf(kind, t.iid) + " " : "") + plain(t.title || todo.project && todo.project.name, 80),
    message: (todo.author ? todo.author.name + " " : "") + what + body,
    url: safeUrl(todo.target_url)
  };
}

// Statuswechsel, die nicht von dir selbst kamen.
function stateEvent(x, kind, me) {
  const actor = x.state === "merged" ? (x.merge_user || x.merged_by)
    : x.state === "closed" ? x.closed_by : null;
  if (actor && (actor.id === me.id || muted(actor))) return null;
  const key = { merged: "merged", closed: "closed", opened: "reopened" }[x.state];
  if (!key) return null;
  return {
    title: refOf(kind, x.iid) + " " + plain(x.title, 80),
    message: tx(key) + (actor ? tx("by", { name: actor.name }) : ""),
    url: safeUrl(x.web_url)
  };
}

function newMrEvent(x, path) {
  return {
    title: refOf("mr", x.iid) + " " + plain(x.title, 80),
    message: tx("newMr", { path }) + (x.author ? tx("by", { name: x.author.name }) : ""),
    url: safeUrl(x.web_url),
    newMr: true // für „Erledigte entfernen“: mit Reviewer kümmert sich schon jemand
  };
}

function errorText(e) {
  return e.status === 401 ? tx("err401")
    : e.status === 403 ? tx("err403")
    : e.status === 429 ? tx("err429")
    : tx("errNet", { msg: e.message });
}

// ---------- Neue MRs in ausgewählten Gruppen/Projekten ----------

// Pfad wie „example-group/team“ -> Gruppe oder Projekt. null = gibt es
// nicht (oder kein Zugriff); andere Fehler gehen nach oben.
async function resolveNamespace(settings, path) {
  for (const kind of ["group", "project"]) {
    try {
      const { data } = await get(settings, (kind === "group" ? "groups/" : "projects/") + encodeURIComponent(path));
      return { kind, id: data.id };
    } catch (e) {
      if (e.status !== 404) throw e;
    }
  }
  return null;
}

function nsApi(ns, what) {
  return (ns.kind === "group" ? "groups/" : "projects/") + ns.id + "/" + what;
}

// Meldet MRs, die zum ersten Mal ohne Draft auftauchen — neu angelegt oder
// gerade auf Ready gesetzt. Drafts kommen deshalb nie in `seen`.
// resolved und state werden verändert und am Ende von pollNow() gespeichert.
async function checkNewMrs(settings, me, since, now, resolved, state, events) {
  const cfg = settings.newMrs || {};
  const active = cfg.enabled ? (cfg.namespaces || []).filter((n) => n.on).map((n) => n.path) : [];
  // Ausgeschaltet heißt vergessen: beim Wiedereinschalten erst still neu einlesen.
  for (const p of Object.keys(state.base)) if (!active.includes(p)) delete state.base[p];
  const ignore = new Set((cfg.ignoreLabels || []).filter((l) => l.on).map((l) => l.name.toLowerCase()));

  for (const path of active) {
    if (!(path in resolved)) resolved[path] = await resolveNamespace(settings, path);
    const ns = resolved[path];
    if (!ns) continue;
    const baseline = !state.base[path]; // erster Blick: Stand merken, nichts melden
    const mrs = await pages(settings, nsApi(ns, "merge_requests"),
      baseline ? { state: "opened" } : { state: "opened", updated_after: since }, baseline ? 10 : 2);
    for (const x of mrs) {
      if (x.draft || x.work_in_progress) continue;
      if (state.seen[x.id]) { state.seen[x.id] = now; continue; }
      if (!baseline && (x.labels || []).some((l) => ignore.has(String(l).toLowerCase()))) continue;
      state.seen[x.id] = now;
      const involved = (x.author && x.author.id === me.id) ||
        (x.reviewers || []).concat(x.assignees || []).some((u) => u.id === me.id); // kommt schon als Todo
      if (!baseline && !involved && !muted(x.author)) events.push(newMrEvent(x, path));
    }
    state.base[path] = true;
  }
  for (const [id, at] of Object.entries(state.seen)) {
    if (at < now - SEEN_DAYS * DAY) delete state.seen[id];
  }
}

async function labelSuggestions() {
  const s = await chrome.storage.local.get(["settings", "nsResolved"]);
  const cfg = (s.settings && s.settings.newMrs) || {};
  const names = new Set();
  for (const n of cfg.namespaces || []) {
    const ns = (s.nsResolved || {})[n.path];
    if (!ns) continue;
    try {
      for (const l of await pages(s.settings, nsApi(ns, "labels"), {}, 3)) names.add(l.name);
    } catch (e) {
      // Nur Vorschläge — ohne geht es auch.
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, "en"));
}

// ---------- Abfrage ----------

// Nacheinander: Alarm und „Jetzt prüfen“ dürfen nicht gleichzeitig lesen und
// schreiben, sonst kommen Meldungen doppelt oder gehen verloren.
let ops = Promise.resolve();
function serial(fn) {
  const run = () => fn();
  ops = ops.then(run, run);
  return ops;
}

function poll() {
  return serial(pollNow);
}

async function pollNow() {
  const s = await chrome.storage.local.get(null);
  const settings = s.settings;
  lang = langOf(settings && settings.lang);
  loadIgnored(settings);
  if (!settings || !settings.url || !settings.token) return { ok: false, error: tx("noSetup") };
  const started = Date.now();
  if (s.pauseUntil && started < s.pauseUntil) return { ok: false, error: s.error };

  await setIcon("busy");
  try {
    const me = s.me || (await get(settings, "user")).data;
    const first = !s.lastPoll; // Erstabruf: Stand merken, nichts melden
    const since = new Date((first ? started : s.lastPoll) - OVERLAP_MS).toISOString();
    const sinceMs = Date.parse(since);
    const items = s.items || {};
    const events = [];

    // 1. Todos
    const known = new Set(s.todoIds || []);
    const todos = await pages(settings, "todos", { state: "pending" });
    for (const t of todos) {
      if (t.project && t.target) remember(items, t.project.id, kindOf(t.target_type), t.target.iid, started);
      if (!first && !known.has(t.id) && !muted(t.author)) events.push(todoEvent(t));
    }

    // 2. Threads, in denen du kommentiert hast. `after` ist tagesgenau und
    //    exklusiv, deshalb großzügig zurück — über die ganze Abwesenheit, damit
    //    auch am Wochenende vom Handy kommentierte Threads mitkommen.
    //    Doppelte merkt remember().
    const after = isoDate(Math.max(started - WATCH_DAYS * DAY, first ? 0 : s.lastPoll - 2 * DAY));
    for (const e of await pages(settings, "events", { action: "commented", after }, first ? 10 : 3)) {
      const n = e.note;
      if (n) remember(items, e.project_id, kindOf(n.noteable_type), n.noteable_iid, Date.parse(e.created_at));
    }

    // 3. Was hat sich geändert?
    const changed = new Map();
    const take = (x, kind) => changed.set(keyOf(x.project_id, kind, x.iid), { x, kind });
    for (const f of ["author_id", "assignee_id", "reviewer_id"]) {
      for (const x of await pages(settings, "merge_requests", { scope: "all", [f]: me.id, updated_after: since })) take(x, "mr");
    }
    for (const f of ["author_id", "assignee_id"]) {
      for (const x of await pages(settings, "issues", { scope: "all", [f]: me.id, updated_after: since })) take(x, "issue");
    }
    const groups = {};
    for (const [k, it] of Object.entries(items)) {
      if (changed.has(k)) continue;
      const g = groups[it.pid + "/" + it.kind] || (groups[it.pid + "/" + it.kind] = { pid: it.pid, kind: it.kind, iids: [] });
      g.iids.push(it.iid);
    }
    for (const g of Object.values(groups)) {
      const path = "projects/" + g.pid + (g.kind === "mr" ? "/merge_requests" : "/issues");
      for (let i = 0; i < g.iids.length; i += IIDS_PER_CALL) {
        const iids = g.iids.slice(i, i + IIDS_PER_CALL);
        for (const x of await pages(settings, path, { "iids[]": iids, updated_after: since })) take(x, g.kind);
      }
    }

    // 4. Neue Kommentare und Statuswechsel
    for (const [k, { x, kind }] of changed) {
      const it = items[k] || (items[k] = { pid: x.project_id, kind, iid: x.iid, touched: 0 });
      it.touched = Math.max(it.touched, Date.parse(x.updated_at) || started);
      it.title = x.title;
      it.url = x.web_url;
      const from = it.state;
      it.state = x.state;
      if (first) continue;

      const changedState = from && from !== x.state;
      const stateEv = changedState ? stateEvent(x, kind, me) : null;
      const merged = changedState && x.state === "merged";

      // shortcut: nur die letzten 50 Notizen. Reicht für eine Minute (oder
      // eine Nacht im Standby) — sonst hier pages() nehmen.
      const path = "projects/" + it.pid + (kind === "mr" ? "/merge_requests/" : "/issues/") + it.iid + "/notes";
      const notes = (await get(settings, path, { sort: "desc", order_by: "created_at", per_page: 50 })).data;
      const fresh = notes.filter((n) => it.noteId ? n.id > it.noteId : Date.parse(n.created_at) > sinceMs);
      // Freigabe und Merge in derselben Abfrage: die Freigabe geht in der
      // Merge-Meldung auf („Merged by Anna · approved by Ben“).
      const comments = [];
      const system = [];
      const approvers = [];
      for (const n of fresh.sort((a, b) => a.id - b.id)) { // IDs steigen, Zeitstempel können gleich sein
        if (!relevantNote(n, me)) continue;
        if (merged && n.system && /^approved this merge request/i.test(n.body || "")) approvers.push(n.author.name);
        else (n.system ? system : comments).push(n);
      }
      if (stateEv) {
        const merger = x.merge_user || x.merged_by;
        const others = [...new Set(approvers)].filter((a) => !merger || a !== merger.name);
        if (others.length) stateEv.message += tx("approvedBy", { names: others.join(", ") });
      }
      const ev = itemEvent(it, stateEv, comments, system);
      if (ev) events.push(ev);
      if (notes.length) it.noteId = Math.max(it.noteId || 0, ...notes.map((n) => n.id));
    }

    for (const [k, it] of Object.entries(items)) {
      if (it.touched < started - WATCH_DAYS * DAY) delete items[k];
    }

    // 5. Neue MRs in ausgewählten Gruppen/Projekten (falls eingeschaltet)
    const nsResolved = s.nsResolved || {};
    const newMr = s.newMr || { base: {}, seen: {} };
    await checkNewMrs(settings, me, since, started, nsResolved, newMr, events);

    // Erst ganz am Ende speichern: bricht die Abfrage ab, wird sie beim
    // nächsten Mal komplett wiederholt, statt Meldungen zu verlieren.
    // Verlauf im selben set wie lastPoll — stirbt der Worker dazwischen, wären die Meldungen sonst weg.
    const stamped = events.map((e, i) => Object.assign({ id: "n" + started + "-" + i, at: started, read: false }, e));
    const update = {
      me, items, todoIds: todos.map((t) => t.id), nsResolved, newMr,
      lastPoll: started, error: null, pauseUntil: 0
    };
    if (stamped.length) update.history = stamped.slice().reverse().concat(s.history || []).slice(0, HISTORY_MAX);
    await chrome.storage.local.set(update);
    await notify(stamped, started);
    return { ok: true, me, count: events.length };
  } catch (e) {
    // Netz weg oder Server-Schluckauf kurz nach einem Erfolg: still bleiben,
    // der nächste Minuten-Alarm versucht es wieder und holt alles nach.
    const grace = Math.max(NET_GRACE_MS, 2 * intervalOf(settings) * 60000 + 30000);
    if ((!e.status || e.status >= 500) && s.lastPoll && started - s.lastPoll < grace) {
      return { ok: false, error: null, transient: true };
    }
    const error = errorText(e);
    const pauseUntil = e.status === 429 ? started + Math.max(60, e.retryAfter) * 1000 : 0;
    await chrome.storage.local.set({ error, pauseUntil });
    await updateBadge();
    return { ok: false, error };
  } finally {
    await setIcon("icon");
  }
}

// ---------- Melden ----------

// Zeigt die schon gespeicherten Meldungen an.
async function notify(stamped, at) {
  await updateBadge();
  if (!stamped.length) return;

  // Nach dem Standby kommt sonst eine Lawine — dann eine Sammelmeldung.
  const shown = stamped.length > BURST_MAX
    ? [{ id: "burst-" + at, title: tx("burst", { n: stamped.length }),
         message: stamped.slice(-3).map((e) => e.title).join("\n") }]
    : stamped;
  for (const e of shown) {
    try {
      await chrome.notifications.create(e.id, {
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: e.title,
        message: e.message
      });
    } catch (err) {
      // Keine Berechtigung oder vom System blockiert — der Verlauf hat es trotzdem.
    }
  }
}

async function updateBadge() {
  const { history = [], error } = await chrome.storage.local.get(["history", "error"]);
  const unread = history.filter((e) => !e.read).length;
  await chrome.action.setBadgeText({ text: error ? "!" : unread ? String(unread) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: error ? "#dc1661" : "#F0679B" });
  await chrome.action.setBadgeTextColor({ color: "#2A1F35" });
}

// Lila Icon, solange GitLab gefragt wird; die Badge-Zahl bleibt stehen.
async function setIcon(name) {
  try {
    await chrome.action.setIcon({ path: { 16: "icons/" + name + "16.png", 48: "icons/" + name + "48.png", 128: "icons/" + name + "128.png" } });
  } catch (e) {
    // Nur Anzeige — eine Abfrage darf daran nicht scheitern.
  }
}

// Klick auf eine Meldung (System oder Popup): Ziel öffnen, Meldung ist erledigt.
async function openEvent(id) {
  const { history = [] } = await chrome.storage.local.get("history");
  const hit = history.find((e) => e.id === id);
  const url = hit ? hit.url : chrome.runtime.getURL("popup.html"); // Sammelmeldung -> Verlauf
  if (url) await chrome.tabs.create({ url });
  if (hit) await dismiss([id]);
  else try { await chrome.notifications.clear(id); } catch (e) { /* egal */ }
}

// Alle Meldungen mit Link in Hintergrund-Tabs öffnen: ein Tab pro MR/Issue
// (Link der neuesten Meldung dazu), älteste zuerst. Geöffnet heißt erledigt,
// wie beim Klick. Meldungen ohne Link (Sammelmeldung) bleiben stehen.
async function openAll() {
  const { history = [] } = await chrome.storage.local.get("history"); // neueste zuerst
  const urls = new Map(); // Link ohne #… -> Link
  const ids = [];
  for (const e of history) {
    if (!e.url) continue;
    ids.push(e.id);
    const base = e.url.replace(/#.*$/, "");
    if (!urls.has(base)) urls.set(base, e.url);
  }
  for (const url of [...urls.values()].reverse()) await chrome.tabs.create({ url, active: false });
  if (ids.length) await dismiss(ids);
  return urls.size;
}

// Über serial(): eine laufende Abfrage schreibt den Verlauf sonst mit dem
// gerade gelöschten Eintrag zurück.
function dismiss(ids) {
  return serial(async () => {
    const { history = [] } = await chrome.storage.local.get("history");
    const drop = ids ? new Set(ids) : new Set(history.map((e) => e.id)); // ohne ids: alle
    await chrome.storage.local.set({ history: history.filter((e) => !drop.has(e.id)) });
    await updateBadge();
    for (const id of drop) {
      try { await chrome.notifications.clear(id); } catch (e) { /* schon weg */ }
    }
  });
}

// Erledigtes aus dem Verlauf nehmen: Meldungen zu MRs/Issues, die inzwischen
// gemergt oder geschlossen sind, zu Kommentaren, deren Thread aufgelöst ist
// oder auf die du (oder dein Bot) danach geantwortet hast, und „Neuer MR“-
// Meldungen, deren MR schon einen Reviewer hat. Fragt GitLab live (der Verlauf
// kennt nur die URL): pro Projekt eine Anfrage für den Stand, pro offenem
// MR/Issue mit Kommentar-Meldung eine für die Threads. Meldungen ohne
// MR/Issue-Link bleiben stehen.
async function dismissDone() {
  const { settings, me, history = [] } = await chrome.storage.local.get(["settings", "me", "history"]);
  loadIgnored(settings);
  // Nur der Pfad zählt: GitLabs Links können einen anderen Host tragen als die eingetragene Adresse.
  const base = new URL(settings.url).pathname.replace(/\/*$/, "/");
  const keyOfEvent = (e) => {
    let p;
    try { p = new URL(e.url).pathname; } catch (err) { return null; }
    const m = p.startsWith(base) && /^(.+?)\/-\/(merge_requests|issues)\/(\d+)(?!\d)/.exec(p.slice(base.length));
    return m ? m[1] + "|" + m[2] + "|" + m[3] : null;
  };
  const groups = {}; // "pfad|art" -> iids
  for (const e of history) {
    const k = keyOfEvent(e);
    if (!k) continue;
    const [path, kind, iid] = k.split("|");
    (groups[path + "|" + kind] = groups[path + "|" + kind] || new Set()).add(iid);
  }
  const done = new Set(); // "pfad|art|iid", gemergt oder geschlossen
  const reviewed = new Set(); // "pfad|art|iid", offener MR mit Reviewer
  const answered = new Set(); // Meldungs-IDs
  await setIcon("busy");
  try {
    for (const [g, iids] of Object.entries(groups)) {
      const [path, kind] = g.split("|");
      const all = [...iids];
      for (let i = 0; i < all.length; i += IIDS_PER_CALL) {
        try {
          const list = await pages(settings, "projects/" + encodeURIComponent(path) + "/" + kind, { "iids[]": all.slice(i, i + IIDS_PER_CALL) });
          for (const x of list) {
            if (x.state !== "opened") done.add(path + "|" + kind + "|" + x.iid);
            else if ((x.reviewers || []).length) reviewed.add(path + "|" + kind + "|" + x.iid);
          }
        } catch (e) {
          if (e.status !== 404) throw e; // Projekt weg oder kein Zugriff: stehen lassen
        }
      }
    }
    // Kommentar-Meldungen zu noch offenen MRs/Issues. Gebündelte kennen alle
    // ihre Kommentare (notes), ältere und einzelne nur den aus dem Link.
    const byItem = {};
    for (const e of history) {
      const k = keyOfEvent(e);
      const m = /#note_(\d+)$/.exec(e.url || "");
      const notes = e.notes && e.notes.length ? e.notes : m ? [Number(m[1])] : [];
      if (k && notes.length && me && !done.has(k)) (byItem[k] = byItem[k] || []).push({ id: e.id, notes });
    }
    for (const [k, evs] of Object.entries(byItem)) {
      const [path, kind, iid] = k.split("|");
      let threads;
      try {
        threads = await pages(settings, "projects/" + encodeURIComponent(path) + "/" + kind + "/" + iid + "/discussions");
      } catch (e) {
        if (e.status !== 404) throw e;
        continue;
      }
      const isAnswered = (id) => {
        const thread = threads.find((d) => d.notes.some((n) => n.id === id));
        const n = thread && thread.notes.find((x) => x.id === id);
        if (!n || n.system) return false; // Commits, Freigaben … beantwortet man nicht
        const resolvable = thread.notes.filter((x) => x.resolvable);
        if (resolvable.length && resolvable.every((x) => x.resolved)) return true;
        // Einzelkommentar ohne Thread: jede spätere Antwort von dir im MR zählt.
        const scope = thread.individual_note ? threads.flatMap((d) => d.notes) : thread.notes;
        return scope.some((x) => !x.system && x.author && (x.author.id === me.id || muted(x.author)) && x.id > id);
      };
      // Gebündelt: erst weg, wenn jeder Kommentar darin erledigt ist.
      for (const ev of evs) if (ev.notes.every(isAnswered)) answered.add(ev.id);
    }
  } finally {
    await setIcon("icon");
  }
  // Meldungen von vor 0.5.0 kennen newMr nicht: dann am Text erkennen, in jeder Sprache.
  const isNewMr = (e) => e.newMr || Object.values(I18N).some((d) => (e.message || "").startsWith(d.newMr.split("{")[0]));
  const ids = history.filter((e) => done.has(keyOfEvent(e)) || answered.has(e.id) ||
    (isNewMr(e) && reviewed.has(keyOfEvent(e)))).map((e) => e.id);
  if (ids.length) await dismiss(ids);
  return ids;
}

// ids: was das Popup gezeigt hat — eine währenddessen eingetroffene Meldung bleibt ungelesen.
function markRead(ids) {
  return serial(async () => {
    const { history = [] } = await chrome.storage.local.get("history");
    const seen = ids ? new Set(ids) : null;
    for (const e of history) if (!seen || seen.has(e.id)) e.read = true;
    await chrome.storage.local.set({ history });
    await updateBadge();
  });
}

function cleanList(list, key) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).map((x) => ({ [key]: String(x[key] || "").trim(), on: x.on !== false }))
    .filter((x) => x[key] && !seen.has(x[key]) && seen.add(x[key]));
}

// Speichern. Der Polling-Stand wird nur verworfen, wenn sich Instanz oder
// Konto ändern — ein neuer Token fürs selbe Konto (abgelaufen über Nacht)
// oder geänderte MR-Optionen dürfen nichts verlieren.
async function saveSettings(input) {
  const { settings: old = {}, me: oldMe } = await chrome.storage.local.get(["settings", "me"]);
  const nm = input.newMrs || old.newMrs || {};
  const url = String(input.url || "").trim().replace(/\/+$/, "");
  const settings = {
    url,
    // Alter Token nur für dieselbe Adresse — sonst ginge er an einen fremden (vertippten) Server.
    token: String(input.token || "").trim() || (old.url === url && old.token) || "",
    interval: intervalOf({ interval: input.interval != null ? input.interval : old.interval }),
    lang: ["auto", "en", "de"].includes(input.lang) ? input.lang : old.lang || "auto",
    ignoreUsers: cleanList((input.ignoreUsers || old.ignoreUsers || []).map((u) => ({ name: String(u.name || "").replace(/^@/, "").toLowerCase(), on: u.on })), "name"),
    newMrs: {
      enabled: !!nm.enabled,
      namespaces: cleanList(nm.namespaces, "path"),
      ignoreLabels: cleanList(nm.ignoreLabels, "name")
    }
  };

  let user = null;
  const nsResolved = {};
  try {
    user = (await get(settings, "user")).data;
    for (const n of settings.newMrs.namespaces) nsResolved[n.path] = await resolveNamespace(settings, n.path);
  } catch (e) {
    // Fehler zeigt gleich die Abfrage an; ungeprüfte Pfade löst sie später auf.
  }
  const sameAccount = old.url === settings.url && (!user || (oldMe && oldMe.id === user.id));

  await serial(() => chrome.storage.local.set(Object.assign(
    { settings, nsResolved, error: null, pauseUntil: 0 },
    sameAccount ? {} : { me: null, items: {}, todoIds: [], lastPoll: null, newMr: { base: {}, seen: {} } }
  )));
  await armAlarm(settings);
  return Object.assign(await poll(), { nsResolved });
}

// ---------- Verdrahtung ----------

// Nur Werte aus INTERVALS; alles andere (alt, kaputt, fehlt) -> Standard.
function intervalOf(settings) {
  const n = Number(settings && settings.interval);
  return INTERVALS.includes(n) ? n : DEFAULT_INTERVAL;
}

// create() ersetzt einen bestehenden Alarm gleichen Namens — neuer Takt gilt sofort.
async function armAlarm(settings) {
  await chrome.alarms.create(POLL, { periodInMinutes: intervalOf(settings) });
}

async function start() {
  const { settings } = await chrome.storage.local.get("settings");
  await armAlarm(settings);
  await poll();
}

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: { url: "", token: "" } });
    chrome.runtime.openOptionsPage();
  }
  await start();
});

chrome.runtime.onStartup.addListener(start);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL) poll();
});

chrome.notifications.onClicked.addListener(openEvent);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "status") {
      const s = await chrome.storage.local.get(["settings", "me", "lastPoll", "error", "history", "nsResolved"]);
      const settings = s.settings || { url: "", token: "" };
      sendResponse({
        url: settings.url,
        hasToken: !!settings.token, // der Token selbst verlässt den Service Worker nicht
        interval: intervalOf(settings), intervals: INTERVALS,
        langSetting: settings.lang || "auto", lang: langOf(settings.lang),
        newMrs: settings.newMrs || { enabled: false, namespaces: [], ignoreLabels: [] },
        ignoreUsers: settings.ignoreUsers || [],
        nsResolved: s.nsResolved || {},
        me: s.me, lastPoll: s.lastPoll, error: s.error, history: s.history || []
      });
    } else if (msg.type === "labels") {
      sendResponse(await labelSuggestions());
    } else if (msg.type === "pollNow") {
      sendResponse(await poll());
    } else if (msg.type === "markRead") {
      await markRead(msg.ids || null);
      sendResponse({ ok: true });
    } else if (msg.type === "open") {
      await openEvent(msg.id);
      sendResponse({ ok: true });
    } else if (msg.type === "dismiss") {
      await dismiss(msg.ids || null); // null = alle
      sendResponse({ ok: true });
    } else if (msg.type === "openAll") {
      sendResponse({ ok: true, tabs: await openAll() });
    } else if (msg.type === "dismissDone") {
      try {
        sendResponse({ ok: true, ids: await dismissDone() });
      } catch (e) {
        sendResponse({ ok: false, error: errorText(e) });
      }
    } else if (msg.type === "save") {
      sendResponse(await saveSettings(msg.settings));
    }
  })();
  return true; // async sendResponse
});
