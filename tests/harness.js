// Test-Harness für GitLab Real Notify, nach dem Vorbild von ZeitBudget.
//
// Kein Node, kein Bundler: background.js wird geholt und in einer Sandbox
// ausgeführt — mit Chrome-Double, angehaltener Uhr und einem nachgebauten
// GitLab hinter fetch. Getestet wird also der Code, der ausgeliefert wird.
//
// Muss über http laufen (fetch kann kein file://), siehe tests/README.md.

"use strict";

const RN = (function () {
  const START = Date.parse("2026-10-29T10:00:00Z");
  const realDateNow = Date.now;
  const iso = (ms) => new Date(ms).toISOString();

  // ---------- GitLab-Double ----------
  //
  // Hält Todos, Events, MRs, Issues und Notizen als Listen. Filtert so, wie
  // GitLab es für unsere Anfragen tut (author_id, reviewer_id, iids[],
  // updated_after …) und blättert mit x-next-page. Jede Anfrage landet in
  // `calls`, damit Tests Methode, Header und Pfad prüfen können.
  function makeGitLab(me) {
    const gl = {
      me, todos: [], events: [], mrs: [], issues: [], notes: {},
      groups: [], projects: [], labels: {}, // labels: { "group:1": ["a", …] }
      calls: [], fail: null
    };
    const NOT_FOUND = {};
    const byIdOrPath = (list, key, raw) => {
      const v = decodeURIComponent(raw);
      return list.find((x) => String(x.id) === v || x[key] === v) || NOT_FOUND;
    };
    const projectPath = (pid) => (gl.projects.find((p) => p.id === pid) || {}).path_with_namespace || "";

    function list(path, q) {
      const after = q.get("updated_after");
      const fresh = (x) => (!after || Date.parse(x.updated_at) > Date.parse(after)) &&
        (!q.get("state") || x.state === q.get("state"));
      const mine = (x) =>
        (!q.get("author_id") || x.author.id === Number(q.get("author_id"))) &&
        (!q.get("assignee_id") || (x.assignee_ids || []).includes(Number(q.get("assignee_id")))) &&
        (!q.get("reviewer_id") || (x.reviewer_ids || []).includes(Number(q.get("reviewer_id"))));
      let m;
      if (path === "user") return gl.me;
      if (path === "todos") return gl.todos;
      if (path === "events") return gl.events;
      if (path === "merge_requests") return gl.mrs.filter((x) => fresh(x) && mine(x));
      if (path === "issues") return gl.issues.filter((x) => fresh(x) && mine(x));
      if ((m = path.match(/^groups\/([^/]+)$/))) return byIdOrPath(gl.groups, "full_path", m[1]);
      if ((m = path.match(/^projects\/([^/]+)$/))) return byIdOrPath(gl.projects, "path_with_namespace", m[1]);
      if ((m = path.match(/^groups\/(\d+)\/merge_requests$/))) {
        const g = gl.groups.find((x) => x.id === Number(m[1]));
        return gl.mrs.filter((x) => projectPath(x.project_id).startsWith(g.full_path + "/") && fresh(x));
      }
      if ((m = path.match(/^(groups|projects)\/(\d+)\/labels$/))) {
        return (gl.labels[m[1].slice(0, -1) + ":" + m[2]] || []).map((name) => ({ name }));
      }
      if ((m = path.match(/^projects\/(\d+)\/(merge_requests|issues)$/))) {
        const iids = q.getAll("iids[]").map(Number);
        return (m[2] === "merge_requests" ? gl.mrs : gl.issues).filter((x) =>
          x.project_id === Number(m[1]) && (!iids.length || iids.includes(x.iid)) && fresh(x));
      }
      if ((m = path.match(/^projects\/(\d+)\/(merge_requests|issues)\/(\d+)\/notes$/))) {
        const kind = m[2] === "merge_requests" ? "mr" : "issue";
        return (gl.notes[kind + ":" + m[1] + ":" + m[3]] || [])
          .slice().sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      }
      throw new Error("GitLab-Double kennt " + path + " nicht");
    }

    gl.fetch = async (url, init) => {
      const u = new URL(url);
      const path = u.pathname.replace(/^\/api\/v4\//, "");
      const headers = (init && init.headers) || {};
      gl.calls.push({ method: (init && init.method) || "GET", path, query: u.searchParams, headers });
      if (init && init.method && init.method !== "GET") throw new Error("Schreibzugriff: " + init.method + " " + path);
      if (gl.fail && gl.fail.network) throw new TypeError("Failed to fetch"); // so meldet Chrome „kein Netz“
      if (gl.fail) {
        const f = gl.fail;
        return { ok: false, status: f.status, headers: { get: (n) => n === "Retry-After" ? f.retryAfter : null } };
      }
      let body = list(path, u.searchParams);
      if (body === NOT_FOUND) return { ok: false, status: 404, headers: { get: () => null } };
      let next = "";
      if (Array.isArray(body)) {
        const per = Number(u.searchParams.get("per_page")) || 20;
        const page = Number(u.searchParams.get("page")) || 1;
        if (body.length > page * per) next = String(page + 1);
        body = body.slice((page - 1) * per, page * per);
      }
      const data = JSON.parse(JSON.stringify(body));
      return { ok: true, status: 200, headers: { get: (n) => n === "x-next-page" ? next : null }, json: async () => data };
    };
    return gl;
  }

  // ---------- Quelldateien laden ----------

  async function fetchSource(path) {
    // Cache-Buster: sonst testet man gern eine alte Fassung.
    const res = await fetch(path + "?t=" + realDateNow() + "-" + Math.random());
    if (!res.ok) throw new Error("Konnte " + path + " nicht laden (HTTP " + res.status + ")");
    return res.text();
  }

  function topLevelFunctions(src) {
    const out = [];
    const re = /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm;
    let m;
    while ((m = re.exec(src)) !== null) out.push(m[1]);
    return out;
  }

  async function loadBackground(opts) {
    const o = opts || {};
    const src = await fetchSource("../background.js");
    let now = START;
    const me = { id: 1, username: "lat", name: "Latz" };
    const gl = makeGitLab(me);
    const state = Object.assign({
      settings: { url: "https://gitlab.example.test", token: "glpat-test" }
    }, o.state || {});
    const notes = {};
    const opened = [];
    const badge = { text: null };
    const iconLog = []; // Icon-Wechsel und GitLab-Aufrufe in Reihenfolge
    const alarms = {};
    const listener = { addListener() {} };

    const chrome = {
      runtime: {
        getURL: (p) => "chrome-extension://testid/" + p,
        openOptionsPage: async () => {},
        onInstalled: listener, onStartup: listener, onMessage: listener
      },
      storage: { local: {
        get: async () => JSON.parse(JSON.stringify(state)),
        set: async (obj) => Object.assign(state, JSON.parse(JSON.stringify(obj)))
      } },
      alarms: {
        create: async (name, info) => { alarms[name] = info; },
        onAlarm: listener
      },
      notifications: {
        create: async (id, opt) => { notes[id] = opt; },
        clear: async (id) => { delete notes[id]; },
        onClicked: listener
      },
      tabs: { create: async (p) => { opened.push(p.url); } },
      action: {
        setBadgeText: async (x) => { badge.text = x.text; },
        setBadgeBackgroundColor: async () => {},
        setBadgeTextColor: async () => {},
        setIcon: async (x) => { iconLog.push(x.path[16].replace(/^icons\/|16\.png$/g, "")); }
      }
    };

    const names = topLevelFunctions(src);
    const factory = new Function("chrome", "fetch", "__now",
      src + "\n Date.now = () => __now();" +
      "\n return {" + names.map((n) => JSON.stringify(n) + ":" + n).join(",") + "};");
    const fetchLogged = (url, init) => { iconLog.push("fetch"); return gl.fetch(url, init); };
    const api = factory(chrome, fetchLogged, () => now);

    return {
      api, gl, state, notes, opened, badge, alarms, me, src, iconLog,
      other: { id: 2, username: "anna", name: "Anna" },
      now: () => now,
      iso: (ms) => iso(ms == null ? now : ms),
      advance: (ms) => { now += ms; },
      // Erstabruf erledigen und eine Minute weiterspringen — der Normalfall.
      warm: async () => { await api.poll(); now += 60000; },
      dispose: () => { Date.now = realDateNow; }
    };
  }

  // ---------- Registry und Runner ----------

  const suites = [];
  function suite(name, body) { suites.push({ name, body }); }

  function makeT(results) {
    const push = (ok, name, detail) => results.push({ ok, name, detail });
    return {
      ok: (cond, name, detail) => push(!!cond, name, detail),
      eq: (actual, expected, name) =>
        push(actual === expected, name,
          actual === expected ? actual : "erwartet " + JSON.stringify(expected) +
            ", war " + JSON.stringify(actual))
    };
  }

  async function run() {
    const report = [];
    for (const s of suites) {
      const results = [];
      try {
        await s.body(makeT(results));
      } catch (e) {
        results.push({ ok: false, name: "Suite abgebrochen", detail: e.message + "\n" + e.stack });
      }
      report.push({ name: s.name, results });
    }
    Date.now = realDateNow;
    return report;
  }

  return { suite, run, loadBackground, START };
})();
