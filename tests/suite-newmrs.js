// Neue MRs in ausgewählten Gruppen/Projekten, dazu Abwesenheit und Netzaussetzer.
// Nutzt mr() aus suite-poll.js.

const NAV = "queo.web/aok/navigatoren";

function newMrSetup(opts) {
  const o = opts || {};
  return RN.loadBackground({ state: { settings: {
    url: "https://gitlab.example.test", token: "glpat-test",
    newMrs: Object.assign({
      enabled: true,
      namespaces: [{ path: NAV, on: true }],
      ignoreLabels: [{ name: "dependencies", on: true }]
    }, o.newMrs)
  } } }).then((h) => {
    h.gl.groups.push({ id: 1, full_path: NAV });
    h.gl.projects.push(
      { id: 10, path_with_namespace: NAV + "/app" },
      { id: 30, path_with_namespace: "other/x" });
    return h;
  });
}

// MR im Navigatoren-Projekt; id muss eindeutig sein (GitLab-weite MR-ID).
function navMr(h, iid, extra) {
  return mr(h, iid, Object.assign({ id: 5000 + iid, labels: [], reviewers: [], assignees: [] }, extra));
}

const nsCalls = (h) => h.gl.calls.filter((c) => /^(groups|projects)\/(1|30)\/merge_requests$/.test(c.path)).length;

RN.suite("Neue MRs · Grundstand und neuer MR", async (t) => {
  const h = await newMrSetup();
  h.gl.mrs.push(navMr(h, 1, { title: "Schon da" }));
  await h.warm(); // Erstabruf: Grundstand still
  t.eq(shown(h).length, 0, "Bestehende MRs werden nicht gemeldet");
  t.ok(h.state.newMr.base[NAV], "Grundstand gemerkt");
  t.eq(h.state.nsResolved[NAV] && h.state.nsResolved[NAV].kind, "group", "Pfad als Gruppe aufgelöst");

  h.gl.mrs.push(navMr(h, 2, { title: "Login-Seite", author: h.other }));
  await h.api.poll();
  const n = shown(h);
  t.eq(n.length, 1, "Ein neuer MR gemeldet");
  t.eq(n[0] && n[0].title, "!2 Login-Seite", "Titel");
  t.eq(n[0] && n[0].message, "Neuer MR in " + NAV + " von Anna", "Text mit Pfad und Autor");
  t.eq(h.state.history[0].url, "https://gitlab.example.test/g/p/-/merge_requests/2", "Link auf den MR");

  for (const k of Object.keys(h.notes)) delete h.notes[k];
  h.advance(60000);
  h.gl.mrs[1].updated_at = h.iso();
  await h.api.poll();
  t.eq(shown(h).length, 0, "Bei weiterer Aktivität nicht noch einmal");
  h.dispose();
});

RN.suite("Neue MRs · Draft, dann Ready", async (t) => {
  const h = await newMrSetup();
  await h.warm();
  h.gl.mrs.push(navMr(h, 3, { draft: true }));
  await h.api.poll();
  t.eq(shown(h).length, 0, "Draft wird nicht gemeldet");
  h.advance(60000);
  Object.assign(h.gl.mrs[0], { draft: false, updated_at: h.iso() });
  await h.api.poll();
  t.eq(shown(h).length, 1, "Auf Ready gesetzt: jetzt gemeldet");
  h.dispose();
});

RN.suite("Neue MRs · Labels ignorieren", async (t) => {
  const h = await newMrSetup();
  await h.warm();
  h.gl.mrs.push(navMr(h, 4, { labels: ["Dependencies"], author: { id: 7, name: "renovate" } }));
  await h.api.poll();
  t.eq(shown(h).length, 0, "Label „dependencies“ (Groß/Klein egal) wird ignoriert");
  h.state.settings.newMrs.ignoreLabels[0].on = false;
  h.advance(60000);
  h.gl.mrs[0].updated_at = h.iso();
  await h.api.poll();
  t.eq(shown(h).length, 1, "Label abgewählt: wird gemeldet");
  h.dispose();
});

RN.suite("Neue MRs · eigene und als Reviewer nicht", async (t) => {
  const h = await newMrSetup();
  await h.warm();
  h.gl.mrs.push(navMr(h, 5, { author: h.me }), navMr(h, 6, { reviewers: [h.me] }), navMr(h, 7, { assignees: [h.me] }));
  await h.api.poll();
  t.eq(shown(h).length, 0, "Eigener, als Reviewer, als Assignee: nichts (kommt als Todo)");
  h.dispose();
});

RN.suite("Neue MRs · aus- und einschalten", async (t) => {
  {
    const h = await newMrSetup({ newMrs: { enabled: false } });
    h.gl.mrs.push(navMr(h, 1));
    await h.warm();
    h.gl.mrs.push(navMr(h, 2));
    await h.api.poll();
    t.eq(nsCalls(h), 0, "Feature aus: keine Anfrage an die Gruppe");
    t.eq(shown(h).length, 0, "und keine Meldung");
    h.state.settings.newMrs.enabled = true;
    h.advance(60000);
    await h.api.poll();
    t.eq(shown(h).length, 0, "Einschalten: erst still den Stand einlesen");
    h.gl.mrs.push(navMr(h, 3));
    h.advance(60000);
    await h.api.poll();
    t.eq(shown(h).length, 1, "danach neue MRs melden");
    h.dispose();
  }
  {
    const h = await newMrSetup({ newMrs: { namespaces: [{ path: NAV, on: false }] } });
    await h.warm();
    h.gl.mrs.push(navMr(h, 2));
    await h.api.poll();
    t.eq(nsCalls(h), 0, "Namespace abgewählt: keine Anfrage");
    t.eq(shown(h).length, 0, "und keine Meldung");
    h.dispose();
  }
});

RN.suite("Neue MRs · Projekte, Tippfehler, fremde Projekte", async (t) => {
  const h = await newMrSetup({ newMrs: { namespaces: [
    { path: "other/x", on: true }, { path: "gibt/es/nicht", on: true }] } });
  await h.warm();
  t.eq(h.state.nsResolved["other/x"] && h.state.nsResolved["other/x"].kind, "project", "Projekt-Pfad aufgelöst");
  t.eq(h.state.nsResolved["gibt/es/nicht"], null, "Unbekannter Pfad: null, kein Abbruch");
  t.eq(h.state.error, null, "Abfrage lief trotzdem durch");
  h.gl.mrs.push(mr(h, 8, { id: 8008, project_id: 30, labels: [] }), navMr(h, 9));
  await h.api.poll();
  const n = shown(h);
  t.eq(n.length, 1, "Nur der MR im ausgewählten Projekt");
  t.eq(n[0] && n[0].message, "Neuer MR in other/x von Anna", "aus other/x");
  h.dispose();
});

RN.suite("Speichern behält den Stand", async (t) => {
  const h = await newMrSetup();
  await h.warm();
  const lastPoll = h.state.lastPoll;
  const res = await h.api.saveSettings({ url: "https://gitlab.example.test", token: "",
    newMrs: { enabled: true, namespaces: [{ path: NAV, on: true }, { path: " " + NAV + " ", on: true }], ignoreLabels: [] } });
  t.ok(res.ok, "Speichern ok", res.error);
  t.eq(h.state.lastPoll, h.now(), "Gleiche Adresse, gleiches Konto: weiter mit Stand (kein Erstabruf)");
  t.ok(h.state.lastPoll !== null && lastPoll !== null, "lastPoll nicht zurückgesetzt");
  t.eq(h.state.settings.token, "glpat-test", "Leeres Token-Feld behält den Token");
  t.eq(h.state.settings.newMrs.namespaces.length, 1, "Doppelte Pfade zusammengefasst");
  t.eq(res.nsResolved[NAV] && res.nsResolved[NAV].kind, "group", "Antwort enthält den Status je Pfad");

  h.gl.me = { id: 99, username: "jemand", name: "Jemand" };
  h.advance(60000);
  await h.api.saveSettings({ url: "https://gitlab.example.test", token: "glpat-anderer" });
  t.eq(h.state.me.id, 99, "Anderes Konto: neu angemeldet");
  t.eq(Object.keys(h.state.newMr.seen).length, 0, "und alter Stand verworfen");
  t.eq(h.state.settings.newMrs.namespaces.length, 1, "MR-Optionen bleiben beim Token-Wechsel erhalten");
  h.dispose();
});

RN.suite("Label-Vorschläge", async (t) => {
  const h = await newMrSetup();
  h.gl.labels["group:1"] = ["dependencies", "Bug", "backend"];
  await h.warm();
  const names = await h.api.labelSuggestions();
  t.eq(names.join(), "backend,Bug,dependencies", "Labels der Gruppe, sortiert");
  h.dispose();
});

RN.suite("Abwesenheit", async (t) => {
  const h = await newMrSetup();
  await h.warm();
  h.advance(3 * 86400000); // Freitagabend -> Montagmorgen
  h.gl.mrs.push(navMr(h, 11), navMr(h, 12));
  commentedOn(h, 13);
  const before = h.gl.calls.length;
  await h.api.poll();
  const ev = h.gl.calls.slice(before).find((c) => c.path === "events");
  t.eq(ev && ev.query.get("after"), new Date(RN.START - 2 * 86400000).toISOString().slice(0, 10),
    "Events reichen bis 2 Tage vor die letzte Abfrage zurück");
  t.ok(!!h.state.items["mr:10:13"], "Am Wochenende kommentierter Thread wird beobachtet");
  t.eq(shown(h).length, 2, "MRs vom Wochenende werden nachgemeldet");

  const many = [];
  for (let i = 0; i < 210; i++) many.push({ title: "x" + i, message: "", url: null });
  await h.api.notify(many, h.now());
  t.eq(h.state.history.length, 200, "Verlauf hält 200 Einträge");
  h.dispose();
});

RN.suite("Netzaussetzer nach dem Entsperren", async (t) => {
  const h = await newMrSetup();
  await h.warm();
  h.gl.fail = { network: true };
  const res = await h.api.poll();
  t.ok(!res.ok && res.transient, "Kurz nach Erfolg: still");
  t.eq(h.state.error, null, "kein Fehlertext");
  t.ok(h.badge.text !== "!", "kein rotes !");

  h.gl.fail = null;
  h.gl.mrs.push(navMr(h, 20));
  h.advance(60000);
  await h.api.poll();
  t.eq(shown(h).length, 1, "Nächste Minute holt nach, was in der Lücke kam");

  h.gl.fail = { network: true };
  h.advance(6 * 60000);
  await h.api.poll();
  t.ok(/nicht erreichbar/.test(h.state.error || ""), "Länger als 5 Min: Fehler wird angezeigt", h.state.error);
  t.eq(h.badge.text, "!", "mit rotem !");

  h.gl.fail = null;
  h.advance(60000);
  await h.api.poll(); // Erfolg setzt lastPoll
  h.gl.fail = { status: 401 };
  h.advance(60000);
  await h.api.poll();
  t.ok(/Token ungültig/.test(h.state.error || ""), "401 auch direkt nach Erfolg sofort", h.state.error);
  h.dispose();
});
