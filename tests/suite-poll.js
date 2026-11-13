// Der Participate-Beobachter: was meldet er, was nicht, und meldet er nichts doppelt.

function mr(h, iid, extra) {
  return Object.assign({
    iid, project_id: 10, title: "MR " + iid, state: "opened",
    web_url: "https://gitlab.example.test/g/p/-/merge_requests/" + iid,
    author: h.other, updated_at: h.iso()
  }, extra);
}

function note(h, id, author, body, extra) {
  return Object.assign({ id, author, body, system: false, created_at: h.iso() }, extra);
}

// Ich habe in !5 kommentiert -> !5 wird beobachtet.
function commentedOn(h, iid) {
  h.gl.events.push({
    project_id: 10, created_at: h.iso(),
    note: { noteable_type: "MergeRequest", noteable_iid: iid }
  });
}

const shown = (h) => Object.values(h.notes);

RN.suite("Nur lesen", async (t) => {
  const h = await RN.loadBackground();
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  await h.api.poll();
  t.ok(h.gl.calls.length > 5, "Es wurde abgefragt", h.gl.calls.length);
  t.ok(h.gl.calls.every((c) => c.method === "GET"), "Jede Anfrage ist GET");
  t.ok(h.gl.calls.every((c) => c.headers["PRIVATE-TOKEN"] === "glpat-test"), "Token im Header PRIVATE-TOKEN");
  t.ok(!/method:\s*"(POST|PUT|PATCH|DELETE)"/i.test(h.src), "Kein Schreibverb im Quelltext");
  t.eq((h.src.match(/fetch\(/g) || []).length, 1, "Genau eine fetch-Stelle (in get)");
  h.dispose();
});

RN.suite("Erstabruf merkt sich den Stand, meldet nichts", async (t) => {
  const h = await RN.loadBackground();
  commentedOn(h, 5);
  h.gl.todos.push({ id: 900, action_name: "mentioned", target_type: "Issue",
    target: { iid: 3, title: "Alt" }, project: { id: 11 }, author: h.other });
  h.gl.mrs.push(mr(h, 5));
  h.gl.notes["mr:10:5"] = [note(h, 1, h.other, "alter Kommentar")];
  const res = await h.api.poll();
  t.ok(res.ok, "Abruf ok", res.error);
  t.eq(shown(h).length, 0, "Keine Benachrichtigung");
  t.ok(!!h.state.items["mr:10:5"], "Kommentierter MR wird beobachtet");
  t.ok(!!h.state.items["issue:11:3"], "Todo-Ziel wird beobachtet");
  t.eq(h.state.todoIds.join(), "900", "Bestehende Todos als gesehen gemerkt");
  t.eq(h.state.lastPoll, RN.START, "lastPoll gesetzt");
  t.eq(h.state.me.username, "lat", "Eigener Nutzer gemerkt");
  h.dispose();
});

RN.suite("Neue Kommentare im beobachteten Thread", async (t) => {
  const h = await RN.loadBackground();
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5, { title: "Login reparieren" }));
  await h.warm();

  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:5"] = [
    note(h, 11, h.other, "Sieht gut aus,\n  aber bitte Tests"),
    note(h, 12, h.me, "Mache ich"),
    note(h, 13, h.other, "@lat schau mal"),
    note(h, 14, h.other, "added 2 commits\n\n* abc", { system: true }),
    note(h, 15, h.other, "changed the description", { system: true }),
    note(h, 16, h.other, "@latte ist nicht gemeint")
  ];
  await h.api.poll();
  const msgs = shown(h).map((n) => n.message);
  t.eq(msgs.length, 1, "Eine Meldung für den MR", msgs);
  t.eq(msgs[0], "Anna: 2 new comments · Anna added 2 commits * abc",
    "Kommentare (zwei, @latte zählt mit) und Commits zusammen", msgs);
  t.ok(!msgs.some((m) => m.includes("Mache ich")), "Eigener Kommentar nicht gemeldet");
  t.ok(!msgs.some((m) => m.includes("@lat schau")), "Erwähnung nicht doppelt (kommt als Todo)");
  t.ok(!msgs.some((m) => m.includes("description")), "Beschreibungsänderung nicht gemeldet");
  t.eq(shown(h)[0].title, "!5 Login reparieren", "Titel mit MR-Referenz");
  t.eq(h.state.history[0].url, "https://gitlab.example.test/g/p/-/merge_requests/5#note_11", "Link springt zum ersten neuen Kommentar");
  t.eq(h.badge.text, "1", "Badge zählt ungelesene");

  // Nächste Minute: MR liegt noch im Überlappungsfenster, darf aber nichts doppelt melden.
  for (const k of Object.keys(h.notes)) delete h.notes[k];
  h.advance(60000);
  await h.api.poll();
  t.eq(shown(h).length, 0, "Keine Doppelmeldung in der nächsten Minute");
  h.dispose();
});

RN.suite("Batch-Review: Kommentare pro MR gebündelt", async (t) => {
  const h = await RN.loadBackground();
  h.gl.mrs.push(mr(h, 8315, { title: "Standardwerte", author: h.me }));
  await h.warm();
  const ben = { id: 3, username: "ben", name: "Ben" };
  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:8315"] = [
    note(h, 31, h.other, "Fehlt hier der Field-Name?"),
    note(h, 32, h.other, "Hier nur der Client?"),
    note(h, 33, ben, "Und die Query?")
  ];
  await h.api.poll();
  const n = shown(h);
  t.eq(n.length, 1, "Drei Kommentare -> eine Meldung");
  t.eq(n[0] && n[0].message, "Anna, Ben: 3 new comments · Fehlt hier der Field-Name?", "Alle Autoren, Anzahl, erster Kommentar");
  t.eq(h.state.history.length, 1, "Ein Eintrag im Verlauf");
  h.dispose();
});

RN.suite("Kein HTML und Markdown im Text", async (t) => {
  const h = await RN.loadBackground();
  const txt = (s) => h.api.plain(h.api.bodyText(s), 500);
  t.eq(txt("added 1 commit\n\n<ul><li>1134a182 - fix #EXAMPLE-7238: address MR review feedback</li></ul>\n\n[Compare with previous version](/g/p/-/merge_requests/8379/diffs?diff_id=1&start_sha=2)"),
    "added 1 commit · 1134a182 - fix #EXAMPLE-7238: address MR review feedback",
    "Commit-Systemnotiz wie aus GitLab");
  t.eq(txt("added 2 commits\n\n<ul><li>aaa - eins</li><li>bbb - zwei</li></ul>"),
    "added 2 commits · aaa - eins · bbb - zwei", "Mehrere Commits");
  t.eq(txt("Siehe [die Doku](https://x.test/doc) und ![Bild](a.png)"), "Siehe die Doku und Bild", "Links und Bilder als Text");
  t.eq(txt("Das ist **wichtig** mit `code`"), "Das ist wichtig mit code", "Fett und Inline-Code");
  t.eq(txt("Vorher\n```js\nconst x = 1;\n```\nnachher"), "Vorher … nachher", "Codeblock gekürzt");
  t.eq(txt("a &lt;b&gt; &amp; c"), "a <b> & c", "Entities aufgelöst");
  t.eq(txt("fix_snake_case in #123"), "fix_snake_case in #123", "_ und # bleiben");
  t.eq(h.api.plain("Fix <Button> focus", 80), "Fix <Button> focus", "Titel bleiben unangetastet");
  h.dispose();
});

RN.suite("Neu entdeckter MR als Reviewer", async (t) => {
  const h = await RN.loadBackground();
  await h.warm();
  h.gl.mrs.push(mr(h, 7, { reviewer_ids: [1] }));
  h.gl.notes["mr:10:7"] = [
    note(h, 20, h.other, "Vor der letzten Abfrage", { created_at: h.iso(RN.START - 10 * 60000) }),
    note(h, 21, h.other, "Bitte drüberschauen")
  ];
  await h.api.poll();
  const msgs = shown(h).map((n) => n.message);
  t.eq(msgs.length, 1, "Nur der neue Kommentar", msgs);
  t.eq(msgs[0], "Anna: Bitte drüberschauen", "Text stimmt");
  h.dispose();
});

RN.suite("Todos", async (t) => {
  const h = await RN.loadBackground();
  h.gl.todos.push({ id: 1, action_name: "assigned", target_type: "Issue",
    target: { iid: 3, title: "Alt" }, project: { id: 11 }, author: h.other });
  await h.warm();
  h.gl.todos.push({ id: 2, action_name: "review_requested", target_type: "MergeRequest",
    target: { iid: 8, title: "Neues Feature" }, project: { id: 10 }, author: h.other,
    target_url: "https://gitlab.example.test/g/p/-/merge_requests/8", body: "Neues Feature" });
  await h.api.poll();
  const n = shown(h);
  t.eq(n.length, 1, "Nur das neue Todo");
  t.eq(n[0] && n[0].title, "!8 Neues Feature", "Titel");
  t.eq(n[0] && n[0].message, "Anna requested your review: Neues Feature", "Text");
  t.eq(h.state.history[0].url, "https://gitlab.example.test/g/p/-/merge_requests/8", "Link aufs Ziel");
  h.advance(60000);
  for (const k of Object.keys(h.notes)) delete h.notes[k];
  await h.api.poll();
  t.eq(shown(h).length, 0, "Schon gemeldetes Todo kommt nicht wieder");
  h.dispose();
});

RN.suite("Statuswechsel", async (t) => {
  const h = await RN.loadBackground();
  h.gl.mrs.push(mr(h, 5, { author: h.me }), mr(h, 6, { author: h.me }));
  await h.api.poll(); // Erstabruf sieht beide als „opened“
  h.advance(60000);
  Object.assign(h.gl.mrs[0], { state: "merged", merge_user: h.other, updated_at: h.iso() });
  Object.assign(h.gl.mrs[1], { state: "closed", closed_by: h.me, updated_at: h.iso() });
  await h.api.poll();
  const msgs = shown(h).map((n) => n.title + " | " + n.message);
  t.eq(msgs.length, 1, "Nur der fremde Statuswechsel", msgs);
  t.eq(msgs[0], "!5 MR 5 | Merged by Anna", "Gemergt von Anna");
  h.dispose();
});

RN.suite("Freigabe und Merge in einer Abfrage", async (t) => {
  const ben = { id: 3, username: "ben", name: "Ben" };
  {
    const h = await RN.loadBackground();
    h.gl.mrs.push(mr(h, 5, { author: h.me }));
    await h.warm();
    Object.assign(h.gl.mrs[0], { state: "merged", merge_user: h.other, updated_at: h.iso() });
    h.gl.notes["mr:10:5"] = [
      note(h, 41, ben, "approved this merge request", { system: true }),
      note(h, 42, h.other, "approved this merge request", { system: true })
    ];
    await h.api.poll();
    const msgs = shown(h).map((n) => n.message);
    t.eq(msgs.length, 1, "Eine Meldung statt drei", msgs);
    t.eq(msgs[0], "Merged by Anna · approved by Ben", "Merge nennt die anderen Freigebenden, nicht den Mergenden");
    h.dispose();
  }
  {
    const h = await RN.loadBackground();
    h.gl.mrs.push(mr(h, 5, { author: h.me }));
    await h.warm();
    h.gl.mrs[0].updated_at = h.iso();
    h.gl.notes["mr:10:5"] = [note(h, 43, ben, "approved this merge request", { system: true })];
    await h.api.poll();
    t.eq(shown(h).map((n) => n.message).join(), "Ben approved this merge request", "Freigabe ohne Merge kommt wie bisher");
    h.dispose();
  }
  {
    const h = await RN.loadBackground();
    h.gl.mrs.push(mr(h, 5, { author: h.me }));
    await h.warm();
    Object.assign(h.gl.mrs[0], { state: "merged", merge_user: h.me, updated_at: h.iso() });
    h.gl.notes["mr:10:5"] = [note(h, 44, ben, "approved this merge request", { system: true })];
    await h.api.poll();
    t.eq(shown(h).length, 0, "Selbst gemergt: auch die Freigabe davor nicht melden");
    h.dispose();
  }
});

RN.suite("Eine Meldung pro MR und Abfrage", async (t) => {
  const ben = { id: 3, username: "ben", name: "Ben" };
  {
    const h = await RN.loadBackground();
    h.gl.mrs.push(mr(h, 5, { author: h.me }));
    await h.warm();
    Object.assign(h.gl.mrs[0], { state: "merged", merge_user: h.other, updated_at: h.iso() });
    h.gl.notes["mr:10:5"] = [
      note(h, 51, ben, "added 1 commit\n\n* aaa", { system: true }),
      note(h, 52, ben, "added 2 commits\n\n* bbb", { system: true }),
      note(h, 53, h.other, "Sieht gut aus"),
      note(h, 54, ben, "approved this merge request", { system: true })
    ];
    await h.api.poll();
    const msgs = shown(h).map((n) => n.message);
    t.eq(msgs.length, 1, "Merge, Kommentar, Pushes und Freigabe: eine Meldung", msgs);
    t.eq(msgs[0], "Merged by Anna · approved by Ben · Anna: Sieht gut aus · Ben added 3 commits",
      "Status zuerst, dann Kommentar, dann Commits zusammengezählt");
    t.eq(h.state.history[0].url, "https://gitlab.example.test/g/p/-/merge_requests/5#note_53", "Link auf den Kommentar");
    h.dispose();
  }
  {
    const h = await RN.loadBackground();
    h.gl.mrs.push(mr(h, 5, { author: h.me }));
    await h.warm();
    h.gl.mrs[0].updated_at = h.iso();
    h.gl.notes["mr:10:5"] = [
      note(h, 61, ben, "added 1 commit\n\n* aaa", { system: true }),
      note(h, 62, ben, "added 1 commit\n\n* bbb", { system: true })
    ];
    await h.api.poll();
    t.eq(shown(h).map((n) => n.message).join(), "Ben added 2 commits", "Zwei Pushes -> zusammengezählt");
    t.eq(h.state.history[0].url, "https://gitlab.example.test/g/p/-/merge_requests/5#note_61", "Link auf den ersten Push");
    h.dispose();
  }
  {
    const h = await RN.loadBackground({ state: { settings: { url: "https://gitlab.example.test", token: "glpat-test", lang: "de" } } });
    h.gl.mrs.push(mr(h, 5, { author: h.me }));
    await h.warm();
    h.gl.mrs[0].updated_at = h.iso();
    h.gl.notes["mr:10:5"] = [
      note(h, 71, ben, "added 1 commit", { system: true }),
      note(h, 72, ben, "added 4 commits", { system: true }),
      note(h, 73, h.other, "Eins"),
      note(h, 74, h.other, "Zwei")
    ];
    await h.api.poll();
    t.eq(shown(h).map((n) => n.message).join(), "Anna: 2 neue Kommentare · Ben hat 5 Commits hinzugefügt", "Auf Deutsch");
    h.dispose();
  }
});

RN.suite("Sammelmeldung nach Standby", async (t) => {
  const h = await RN.loadBackground();
  // Sieben verschiedene MRs, weil alles zum selben MR eine Meldung würde.
  const iids = [1, 2, 3, 4, 5, 6, 7];
  for (const i of iids) h.gl.mrs.push(mr(h, i, { author: h.me }));
  await h.warm();
  h.advance(8 * 3600000);
  for (const x of h.gl.mrs) {
    x.updated_at = h.iso();
    h.gl.notes["mr:10:" + x.iid] = [note(h, 100 + x.iid, h.other, "Nr " + x.iid)];
  }
  await h.api.poll();
  const n = shown(h);
  t.eq(n.length, 1, "Eine Sammelmeldung statt sieben");
  t.eq(n[0] && n[0].title, "7 new events in GitLab", "Titel nennt die Zahl");
  t.eq(h.state.history.length, 7, "Verlauf hat alle sieben");
  t.ok(h.state.history.every((e) => /^Anna: Nr \d$/.test(e.message)), "Jede einzeln im Verlauf");
  t.eq(h.badge.text, "7", "Badge 7");
  h.dispose();
});

RN.suite("Fehler", async (t) => {
  {
    const h = await RN.loadBackground();
    h.gl.fail = { status: 401 };
    const res = await h.api.poll();
    t.ok(!res.ok, "401 meldet Fehler");
    t.ok(/Token invalid/.test(h.state.error), "Verständliche Meldung", h.state.error);
    t.ok(!h.state.lastPoll, "lastPoll bleibt leer");
    t.eq(h.badge.text, "!", "Badge zeigt !");
    h.gl.fail = null;
    await h.api.poll();
    t.eq(h.state.error, null, "Nach Erfolg ist der Fehler weg");
    h.dispose();
  }
  {
    const h = await RN.loadBackground();
    h.gl.fail = { status: 429, retryAfter: "120" };
    await h.api.poll();
    t.eq(h.state.pauseUntil, RN.START + 120000, "429: Pause laut Retry-After");
    h.gl.fail = null;
    const before = h.gl.calls.length;
    h.advance(60000);
    await h.api.poll();
    t.eq(h.gl.calls.length, before, "Während der Pause keine Anfrage");
    h.advance(61000);
    await h.api.poll();
    t.ok(h.gl.calls.length > before, "Danach wieder");
    h.dispose();
  }
  {
    const h = await RN.loadBackground({ state: { settings: { url: "https://x.test", token: "" } } });
    const res = await h.api.poll();
    t.ok(!res.ok && h.gl.calls.length === 0, "Ohne Token keine Anfrage");
    h.dispose();
  }
});

RN.suite("Icon während der Abfrage", async (t) => {
  {
    const h = await RN.loadBackground();
    await h.api.poll();
    const log = h.iconLog;
    t.eq(log[0], "busy", "Erst lila Icon");
    t.eq(log[1], "fetch", "dann GitLab fragen");
    t.eq(log[log.length - 1], "icon", "danach wieder normal");
    t.eq(log.filter((x) => x === "busy").length, 1, "Nur einmal umgeschaltet");
    h.dispose();
  }
  {
    const h = await RN.loadBackground();
    h.gl.fail = { status: 500 };
    await h.api.poll();
    t.eq(h.iconLog[h.iconLog.length - 1], "icon", "Auch nach Fehler wieder normal");
    h.dispose();
  }
  {
    const h = await RN.loadBackground({ state: { settings: { url: "", token: "" } } });
    await h.api.poll();
    t.eq(h.iconLog.length, 0, "Ohne Zugangsdaten kein Flackern");
    h.dispose();
  }
});

RN.suite("Aufräumen und Seiten", async (t) => {
  const h = await RN.loadBackground();
  h.gl.events.push({ project_id: 10, created_at: h.iso(RN.START - 31 * 86400000),
    note: { noteable_type: "MergeRequest", noteable_iid: 1 } });
  for (let i = 0; i < 150; i++) {
    h.gl.events.push({ project_id: 20, created_at: h.iso(),
      note: { noteable_type: "Issue", noteable_iid: 1000 + i } });
  }
  await h.api.poll();
  t.ok(!h.state.items["mr:10:1"], "Thread ohne Aktivität seit 31 Tagen fällt raus");
  t.ok(!!h.state.items["issue:20:1149"], "Zweite Seite der Events gelesen (x-next-page)");
  const iidCalls = h.gl.calls.filter((c) => c.path === "projects/20/issues");
  t.eq(iidCalls.length, 3, "150 Issues in Häppchen zu 50 abgefragt");
  h.dispose();
});

RN.suite("Klick, Gelesen, Einstellungen", async (t) => {
  const h = await RN.loadBackground();
  h.state.history = [
    { id: "a", title: "x", message: "y", url: "https://gitlab.example.test/a", at: 1, read: false },
    { id: "b", title: "x", message: "y", url: null, at: 1, read: false }
  ];
  h.notes.a = {}; // die Systemmeldung dazu steht noch
  await h.api.openEvent("a");
  t.eq(h.opened[0], "https://gitlab.example.test/a", "Klick öffnet den Link");
  t.eq(h.state.history.map((e) => e.id).join(), "b", "und nimmt die Meldung aus dem Verlauf");
  t.ok(!h.notes.a, "Systemmeldung verschwindet mit");
  t.eq(h.badge.text, "1", "Badge zählt runter");
  await h.api.openEvent("burst-123");
  t.eq(h.opened[1], "chrome-extension://testid/popup.html", "Sammelmeldung öffnet den Verlauf");
  await h.api.markRead();
  t.eq(h.badge.text, "", "Alles gelesen: Badge leer");

  h.state.history = ["c", "d", "e"].map((id) => ({ id, title: id, message: "", url: null, at: 1, read: false }));
  await h.api.dismiss(["d"]);
  t.eq(h.state.history.map((e) => e.id).join(), "c,e", "Einzeln wegdrücken");
  t.eq(h.opened.length, 2, "Wegdrücken öffnet nichts");
  await h.api.dismiss(null);
  t.eq(h.state.history.length, 0, "Alle leeren");
  t.eq(h.badge.text, "", "Badge danach leer");

  t.eq(h.api.safeUrl("javascript:alert(1)"), null, "Nur http(s)-Links");

  await h.warm();
  t.ok(Object.keys(h.state.items).length >= 0 && h.state.lastPoll, "Vorher: Stand vorhanden");
  await h.api.saveSettings({ url: "https://gitlab.example.test/", token: "" });
  t.eq(h.state.settings.token, "glpat-test", "Leeres Token-Feld behält den alten Token");
  t.eq(h.state.settings.url, "https://gitlab.example.test", "Schrägstrich am Ende entfernt");
  t.eq(h.state.lastPoll, h.now(), "Neu gestartet: frischer Erstabruf");
  h.dispose();
});

RN.suite("Erledigte entfernen", async (t) => {
  const h = await RN.loadBackground();
  h.gl.projects.push({ id: 10, path_with_namespace: "g/p" });
  h.gl.mrs.push(mr(h, 5, { state: "merged" }), mr(h, 6), mr(h, 7, { state: "closed" }));
  h.gl.issues.push({ iid: 8, project_id: 10, state: "closed" });
  const ev = (id, url) => ({ id, title: id, message: "", url, at: 1, read: true });
  const base = "https://gitlab.example.test/g/p/-/";
  h.state.history = [
    ev("a", base + "merge_requests/5#note_1"), ev("b", base + "merge_requests/5"),
    ev("c", base + "merge_requests/6"), ev("d", base + "merge_requests/7"),
    ev("e", base + "issues/8"), ev("f", null),
    ev("g", "https://gitlab.example.test/weg/x/-/merge_requests/1"),
    ev("h", base + "merge_requests/50")
  ];
  const ids = await h.api.dismissDone();
  t.eq(ids.join(), "a,b,d,e", "Gemergt und geschlossen raus, auch mit #note");
  t.eq(h.state.history.map((e) => e.id).join(), "c,f,g,h", "Offen, ohne Link, unbekanntes Projekt, !50 bleiben");
  t.ok(h.gl.calls.every((c) => c.method === "GET"), "Nur lesend");
  t.eq(h.iconLog[0] + "," + h.iconLog[h.iconLog.length - 1], "busy,icon", "Lila Icon, solange gefragt wird");
  t.eq(h.gl.calls.filter((c) => /^projects\/g%2Fp\//.test(c.path)).length, 2, "Eine Anfrage pro Projekt und Art");
  h.dispose();
});

RN.suite("Erledigte entfernen · beantwortete Kommentare", async (t) => {
  const h = await RN.loadBackground({ state: { me: { id: 1, username: "lat", name: "Latz" } } });
  h.gl.projects.push({ id: 10, path_with_namespace: "g/p" });
  h.gl.mrs.push(mr(h, 5));
  const ben = { id: 3, name: "Ben" };
  h.gl.notes["mr:10:5"] = [
    note(h, 1, h.other, "Frage?", { discussion_id: "A" }),
    note(h, 2, h.me, "Antwort", { discussion_id: "A" }),          // A: von mir beantwortet
    note(h, 3, ben, "Noch eine?", { discussion_id: "B" }),
    note(h, 4, h.other, "Auch?", { discussion_id: "B" }),          // B: nur andere, offen
    note(h, 5, ben, "Fix das", { discussion_id: "C", resolvable: true, resolved: true }), // C: aufgelöst
    note(h, 6, h.other, "Lose Bemerkung"),                         // einzeln, später von mir beantwortet
    note(h, 7, h.other, "added 2 commits", { system: true }),
    note(h, 8, h.me, "Danke"),
    note(h, 9, h.other, "Nach meiner Antwort")                     // einzeln, danach nichts von mir
  ];
  const base = "https://gitlab.example.test/g/p/-/merge_requests/5";
  const ev = (id, frag) => ({ id, title: id, message: "", url: base + frag, at: 1, read: true });
  h.state.history = [ev("a", "#note_1"), ev("b", "#note_3"), ev("c", "#note_5"),
    ev("d", "#note_6"), ev("e", "#note_7"), ev("f", "#note_9"), ev("g", "")];
  const ids = await h.api.dismissDone();
  t.eq(ids.join(), "a,c,d", "Beantwortet, aufgelöst und später erwidert raus");
  t.eq(h.state.history.map((e) => e.id).join(), "b,e,f,g", "Offener Thread, Systemnotiz, unbeantwortet, MR-Link bleiben");
  t.eq(h.gl.calls.filter((c) => /discussions$/.test(c.path)).length, 1, "Threads einmal pro MR geholt");
  h.dispose();
});

RN.suite("Erledigte entfernen · gebündelte Kommentare", async (t) => {
  const h = await RN.loadBackground({ state: { me: { id: 1, username: "lat", name: "Latz" } } });
  h.gl.projects.push({ id: 10, path_with_namespace: "g/p" });
  h.gl.mrs.push(mr(h, 5, { author: h.me }));
  commentedOn(h, 5);
  await h.warm();
  // Review mit zwei Anmerkungen in zwei Threads -> eine gebündelte Meldung
  h.gl.notes["mr:10:5"] = [
    note(h, 11, h.other, "Erstens", { discussion_id: "A" }),
    note(h, 12, h.other, "Zweitens", { discussion_id: "B" })
  ];
  h.gl.mrs[0].updated_at = h.iso();
  await h.api.poll();
  t.eq(h.state.history.length, 1, "Eine gebündelte Meldung");
  t.eq((h.state.history[0].notes || []).join(), "11,12", "kennt beide Kommentare");

  h.advance(60000);
  h.gl.notes["mr:10:5"].push(note(h, 13, h.me, "Zu erstens", { discussion_id: "A" }));
  t.eq((await h.api.dismissDone()).length, 0, "Nur einer beantwortet: bleibt");
  h.gl.notes["mr:10:5"].push(note(h, 14, h.me, "Zu zweitens", { discussion_id: "B" }));
  t.eq((await h.api.dismissDone()).length, 1, "Beide beantwortet: weg");
  h.dispose();
});

RN.suite("Nutzer ignorieren", async (t) => {
  const h = await RN.loadBackground({ state: { settings: { url: "https://gitlab.example.test", token: "glpat-test",
    ignoreUsers: [{ name: "anna", on: true }, { name: "ben", on: false }] } } });
  const ben = { id: 3, username: "ben", name: "Ben" };
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:5"] = [note(h, 11, h.other, "Bot-Review"), note(h, 12, ben, "Echter Kommentar")];
  h.gl.todos.push({ id: 9, action_name: "mentioned", target_type: "MergeRequest",
    target: { iid: 5, title: "MR 5" }, project: { id: 10 }, author: h.other });
  await h.api.poll();
  const msgs = shown(h).map((n) => n.message);
  t.eq(msgs.join(" | "), "Ben: Echter Kommentar", "Anna (ignoriert) weder Kommentar noch Todo; Ben (pausiert) kommt");

  await h.api.saveSettings({ url: "https://gitlab.example.test", token: "",
    ignoreUsers: [{ name: "@Claude-Bot", on: true }, { name: "claude-bot", on: true }, { name: " ", on: true }] });
  t.eq(JSON.stringify(h.state.settings.ignoreUsers), '[{"name":"claude-bot","on":true}]', "@ weg, klein, leer und doppelt raus");
  await h.api.saveSettings({ url: "https://gitlab.example.test", token: "" });
  t.eq(h.state.settings.ignoreUsers.length, 1, "Speichern ohne Liste behält sie");
  h.dispose();
});

RN.suite("Erledigte entfernen · Antwort vom Bot zählt", async (t) => {
  const bot = { id: 7, username: "claude-bot", name: "Claude" };
  const h = await RN.loadBackground({ state: { me: { id: 1, username: "lat", name: "Latz" },
    settings: { url: "https://gitlab.example.test", token: "glpat-test", ignoreUsers: [{ name: "claude-bot", on: true }] } } });
  h.gl.projects.push({ id: 10, path_with_namespace: "g/p" });
  h.gl.mrs.push(mr(h, 5));
  h.gl.notes["mr:10:5"] = [
    note(h, 1, h.other, "Frage?", { discussion_id: "A" }),
    note(h, 2, bot, "Antwort vom Bot", { discussion_id: "A" }),
    note(h, 3, h.other, "Andere Frage?", { discussion_id: "B" })
  ];
  const base = "https://gitlab.example.test/g/p/-/merge_requests/5";
  h.state.history = ["1", "3"].map((n) => ({ id: "n" + n, title: "", message: "", url: base + "#note_" + n, at: 1, read: true }));
  t.eq((await h.api.dismissDone()).join(), "n1", "Bot-Antwort erledigt den Thread, der andere bleibt");
  h.dispose();
});

RN.suite("Alle öffnen", async (t) => {
  const h = await RN.loadBackground();
  const base = "https://gitlab.example.test/g/p/-/merge_requests/";
  const ev = (id, url) => ({ id, title: id, message: "", url, at: 1, read: true });
  h.state.history = [ev("a", base + "5#note_3"), ev("b", base + "6"), ev("c", null), ev("d", base + "5#note_1")]; // neueste zuerst
  const n = await h.api.openAll();
  t.eq(n, 2, "Ein Tab pro MR");
  t.eq(h.opened.join(" "), base + "6 " + base + "5#note_3", "Älteste zuerst, je MR der neueste Link");
  t.eq(h.state.history.map((e) => e.id).join(), "c", "Geöffnete raus, ohne Link bleibt");
  h.dispose();
});

RN.suite("Erledigte entfernen · neue MRs mit Reviewer", async (t) => {
  const h = await RN.loadBackground();
  h.gl.projects.push({ id: 10, path_with_namespace: "g/p" });
  const ben = { id: 3, username: "ben", name: "Ben" };
  h.gl.mrs.push(mr(h, 5, { reviewers: [ben] }), mr(h, 6, { reviewers: [] }), mr(h, 7, { reviewers: [ben] }));
  const base = "https://gitlab.example.test/g/p/-/merge_requests/";
  const ev = (id, iid, extra) => Object.assign({ id, title: id, message: "Anna: Kommentar", url: base + iid, at: 1, read: true }, extra);
  h.state.history = [
    ev("a", 5, { message: "New MR in g by Anna", newMr: true }),  // Reviewer da -> raus
    ev("b", 6, { message: "New MR in g by Anna", newMr: true }),  // kein Reviewer -> bleibt
    ev("c", 7, { message: "Neuer MR in g von Anna" }),            // alte Meldung ohne Feld, deutsch -> raus
    ev("d", 7)                                                     // Kommentar im MR mit Reviewer -> bleibt
  ];
  t.eq((await h.api.dismissDone()).join(), "a,c", "Neue MRs mit Reviewer raus, auch alte am Text erkannt");
  t.eq(h.state.history.map((e) => e.id).join(), "b,d", "Ohne Reviewer und andere Meldungen bleiben");
  h.dispose();
});

RN.suite("Token bleibt bei der eigenen Adresse", async (t) => {
  const h = await RN.loadBackground();
  await h.warm();
  h.gl.calls.length = 0;
  await h.api.saveSettings({ url: "https://gitlab.vertippt.test", token: "" });
  t.ok(h.gl.calls.every((c) => c.headers["PRIVATE-TOKEN"] !== "glpat-test"), "Alter Token geht nicht an eine neue Adresse");
  t.eq(h.state.settings.token, "", "Neue Adresse ohne Token: Feld bleibt leer");
  h.dispose();
});

RN.suite("Erwähnung nur für genau mich", async (t) => {
  const h = await RN.loadBackground();
  t.ok(h.api.mentions("danke @lat.", "lat"), "@lat am Satzende zählt");
  t.ok(!h.api.mentions("frag mal @lat.mueller", "lat"), "@lat.mueller ist jemand anderes");
  t.ok(!h.api.mentions("@lat-bot", "lat"), "@lat-bot ist jemand anderes");
  h.dispose();
});

RN.suite("Popup wirkt nur auf Angezeigtes", async (t) => {
  const h = await RN.loadBackground();
  h.state.history = ["neu", "alt"].map((id) => ({ id, title: id, message: "", url: null, at: 1, read: false }));
  await h.api.markRead(["alt"]);
  t.eq(h.state.history.map((e) => e.id + ":" + e.read).join(), "neu:false,alt:true", "Erst nach dem Öffnen gekommene bleibt ungelesen");
  t.eq(h.badge.text, "1", "Badge zählt sie weiter");
  h.dispose();
});

RN.suite("Verlauf und Stand in einem Schreibvorgang", async (t) => {
  const h = await RN.loadBackground();
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:5"] = [note(h, 7, h.other, "neu")];
  const writes = [];
  const set = h.chrome.storage.local.set;
  h.chrome.storage.local.set = async (obj) => { writes.push(Object.keys(obj)); return set(obj); };
  await h.api.poll();
  t.ok(writes.some((k) => k.includes("lastPoll") && k.includes("history")), "lastPoll und history zusammen gespeichert", JSON.stringify(writes));
  t.eq(h.state.history.length, 1, "Meldung im Verlauf");
  h.dispose();
});

RN.suite("Erledigte entfernen · anderer Host in den Links", async (t) => {
  const h = await RN.loadBackground();
  h.gl.projects.push({ id: 10, path_with_namespace: "g/p" });
  h.gl.mrs.push(mr(h, 5, { state: "merged" }));
  h.state.history = [{ id: "a", title: "a", message: "", url: "https://gitlab.intern.test/g/p/-/merge_requests/5", at: 1, read: true }];
  t.eq((await h.api.dismissDone()).join(), "a", "Pfad zählt, nicht der Host");
  h.dispose();
});

RN.suite("Riesiger Kommentar blockiert die Abfrage nicht", async (t) => {
  const h = await RN.loadBackground();
  const t0 = performance.now();
  const out = h.api.bodyText("<".repeat(1000000));
  t.ok(performance.now() - t0 < 200, "1 MB „<“ in unter 200 ms", Math.round(performance.now() - t0) + " ms");
  t.ok(out.length <= 2000, "Text gekürzt");
  t.eq(h.api.bodyText("**fett** und [Link](https://x)"), "fett und Link", "Kurzer Text unverändert bereinigt");
  h.dispose();
});

RN.suite("Zeit der Meldung: wann es passiert ist", async (t) => {
  const h = await RN.loadBackground();
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5));
  await h.warm();
  h.advance(6 * 3600000); // Standby über Nacht
  const at = h.now() - 5 * 3600000;
  h.gl.mrs[0].updated_at = h.iso(at);
  h.gl.notes["mr:10:5"] = [note(h, 11, h.other, "nachts", { created_at: h.iso(at) })];
  h.gl.todos.push({ id: 7, action_name: "review_requested", target_type: "MergeRequest",
    target: { iid: 9, title: "Review" }, project: { id: 10 }, author: h.other, created_at: h.iso(at - 60000) });
  await h.api.poll();
  const byTodo = (x) => h.state.history.find((e) => !!e.todo === x);
  t.eq(byTodo(false) && byTodo(false).at, at, "Kommentar: Zeit des Kommentars, nicht der Abfrage");
  t.eq(byTodo(true) && byTodo(true).at, at - 60000, "To-do: Zeit des To-dos");
  t.ok(byTodo(true) && byTodo(true).todo === true, "To-do ist als solches markiert");
  h.gl.todos.push({ id: 8, action_name: "mentioned", target_type: "Issue",
    target: { iid: 4, title: "Zukunft" }, project: { id: 10 }, author: h.other, created_at: h.iso(h.now() + 3600000) });
  h.advance(60000);
  await h.api.poll();
  t.eq(h.state.history[0].at, h.now(), "Zeit in der Zukunft (Uhrenversatz): Abfragezeit");
  h.dispose();
});

RN.suite("Alle neuen Notizen, nicht nur die letzten 50", async (t) => {
  const h = await RN.loadBackground();
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  const list = [note(h, 100, h.other, "Wichtiger Kommentar", { created_at: h.iso(h.now() - 30000) })];
  for (let i = 0; i < 180; i++) list.push(note(h, 200 + i, h.other, "added ~123 label", { system: true }));
  h.gl.notes["mr:10:5"] = list;
  await h.api.poll();
  t.ok(h.state.history.some((e) => /Wichtiger Kommentar/.test(e.message)), "Kommentar hinter 180 Label-Notizen kommt an");
  t.eq(h.state.items["mr:10:5"].noteId, 379, "noteId auf der neuesten Notiz");
  const pagesRead = h.gl.calls.filter((c) => c.path === "projects/10/merge_requests/5/notes").length;
  t.eq(pagesRead, 2, "Zwei Seiten gelesen, dann bei Bekanntem gestoppt");
  h.dispose();
});

RN.suite("Ruhezeit", async (t) => {
  const h = await RN.loadBackground();
  const at = (d, hh, mm) => new Date(2026, 10, d, hh, mm).getTime(); // 13.11.2026 ist ein Freitag
  const q = { quiet: { enabled: true, from: "19:00", to: "08:00", weekend: true } };
  t.ok(h.api.quietNow(q, 0, at(13, 22, 0)), "22 Uhr: Ruhe (über Mitternacht)");
  t.ok(h.api.quietNow(q, 0, at(13, 7, 59)), "7:59: noch Ruhe");
  t.ok(!h.api.quietNow(q, 0, at(13, 8, 0)), "8:00: wieder Meldungen");
  t.ok(h.api.quietNow(q, 0, at(14, 12, 0)), "Samstag mittag: Wochenende");
  t.ok(!h.api.quietNow({ quiet: { enabled: false, from: "19:00", to: "08:00" } }, 0, at(13, 22, 0)), "Ausgeschaltet: keine Ruhe");
  t.ok(h.api.quietNow({ quiet: { enabled: true, from: "12:00", to: "13:00" } }, 0, at(13, 12, 30)), "Fenster am Tag");
  t.ok(h.api.quietNow({}, at(13, 13, 0), at(13, 12, 30)), "1 Std. stumm");

  h.gl.todos.push({ id: 1, action_name: "assigned", target_type: "Issue",
    target: { iid: 3, title: "Alt" }, project: { id: 11 }, author: h.other });
  await h.warm();
  h.state.muteUntil = h.now() + 3600000;
  h.gl.todos.push({ id: 2, action_name: "mentioned", target_type: "Issue",
    target: { iid: 4, title: "Leise" }, project: { id: 11 }, author: h.other, created_at: h.iso() });
  await h.api.poll();
  t.eq(shown(h).length, 0, "Stumm: nichts ploppt auf");
  t.eq(h.state.history.length, 1, "aber im Verlauf");
  t.eq(h.badge.text, "1", "und im Badge");
  h.advance(2 * 3600000);
  await h.api.poll();
  const n = shown(h);
  t.eq(n.length, 1, "Danach eine Sammelmeldung");
  t.eq(n[0] && n[0].message, "Collected during your quiet time", "mit Hinweis auf die Ruhezeit");
  t.ok(!h.state.held, "und nur einmal");

  await h.api.saveSettings({ url: "https://gitlab.example.test", token: "", quiet: { enabled: true, from: "25:99x", to: "06:30", weekend: 1 } });
  t.eq(JSON.stringify(h.state.settings.quiet), '{"enabled":true,"weekend":true,"from":"19:00","to":"06:30"}', "Ruhezeit gespeichert, Unsinn durch Standard ersetzt");
  h.dispose();
});

RN.suite("Labels an der Meldung, gedeckelt", async (t) => {
  const h = await RN.loadBackground();
  t.eq(JSON.stringify(h.api.labelsOf(["bug", { name: "backend" }])), '["bug","backend"]', "Namen, auch aus Label-Objekten");
  const real = ["Bug", "SLA-Relevant", "Ambulanzen (amb.Behandlungen)", "Heilmittel", "Feature", "QDVA"];
  t.eq(h.api.labelsOf(real).join("|"), real.join("|"), "Echte Labels kommen vollständig an");
  t.eq(h.api.labelsOf("abcdefghij".split("")).join(), "a,b,c,d,e,f,g,+3", "Mehr als 8: sieben und +N");
  t.eq(h.api.labelsOf(["x".repeat(500)])[0].length, 40, "Sehr lange Labels gekürzt");
  t.eq(JSON.stringify(h.api.labelsOf(null)), "[]", "Keine Labels: leer");

  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5, { labels: ["workflow::in review", "bug"] }));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:5"] = [note(h, 11, h.other, "Kommentar")];
  h.gl.todos.push({ id: 3, action_name: "review_requested", target_type: "MergeRequest",
    target: { iid: 9, title: "R", labels: ["frontend"] }, project: { id: 10 }, author: h.other, created_at: h.iso() });
  await h.api.poll();
  const find = (todo) => h.state.history.find((e) => !!e.todo === todo) || {};
  t.eq((find(false).labels || []).join(), "workflow::in review,bug", "Kommentar-Meldung trägt die MR-Labels");
  t.eq((find(true).labels || []).join(), "frontend", "To-do trägt die Labels des Ziels");
  h.dispose();
});

RN.suite("Wichtige Labels", async (t) => {
  const h = await RN.loadBackground({ state: { settings: { url: "https://gitlab.example.test", token: "glpat-test",
    importantLabels: [{ name: "qdva", on: true }, { name: "Feature", on: false }] } } });
  commentedOn(h, 5);
  const many = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "QDVA", "Feature"];
  h.gl.mrs.push(mr(h, 5, { labels: many }));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:5"] = [note(h, 11, h.other, "Kommentar")];
  await h.api.poll();
  const labels = h.state.history[0].labels;
  t.eq(labels[0], "QDVA", "Wichtiges Label vorn, Groß/klein egal — fällt beim Kürzen nicht weg");
  t.ok(!labels.includes("Feature"), "Ausgeschaltetes zählt nicht als wichtig");
  t.eq(labels[labels.length - 1], "+4", "Rest weiter als +N");

  await h.api.saveSettings({ url: "https://gitlab.example.test", token: "",
    importantLabels: [{ name: " Bug ", on: true }, { name: "Bug", on: true }, { name: "", on: true }] });
  t.eq(JSON.stringify(h.state.settings.importantLabels), '[{"name":"Bug","on":true}]', "Gespeichert, getrimmt, doppelte und leere raus");
  await h.api.saveSettings({ url: "https://gitlab.example.test", token: "" });
  t.eq(h.state.settings.importantLabels.length, 1, "Bleibt beim Speichern ohne Angabe erhalten");
  h.dispose();
});

RN.suite("Wichtige Labels mit Platzhalter", async (t) => {
  const h = await RN.loadBackground();
  const g = h.api.globMatch;
  t.ok(g("workflow::*", "Workflow::In Review"), "workflow::* trifft, Groß/klein egal");
  t.ok(!g("workflow::*", "my-workflow::x"), "Ohne Stern vorn muss es am Anfang passen");
  t.ok(g("*SLA*", "Prio-SLA-Relevant"), "*SLA* trifft mittendrin");
  t.ok(g("*", "irgendwas") && g("Bug", "bug") && !g("Bug", "Bugfix"), "* trifft alles, ohne Stern genau");
  t.ok(g("a*b*c", "a-x-b-y-c") && !g("a*b*c", "a-x-c-y-b"), "Mehrere Sterne, Reihenfolge zählt");
  const t0 = performance.now();
  g("*a*a*a*a*a*a*a*a*b", "a".repeat(255));
  t.ok(performance.now() - t0 < 50, "Viele Sterne auf 255 Zeichen: schnell", Math.round(performance.now() - t0) + " ms");
  const hot = h.api.importantMatcher([{ name: "workflow::*", on: true }, { name: "Bug", on: false }]);
  t.ok(hot("workflow::done") && !hot("Bug"), "Matcher: nur eingeschaltete");

  h.state.settings.importantLabels = [{ name: "*sla*", on: true }];
  commentedOn(h, 5);
  h.gl.mrs.push(mr(h, 5, { labels: ["a", "b", "c", "d", "e", "f", "g", "h", "SLA-Relevant"] }));
  await h.warm();
  h.gl.mrs[0].updated_at = h.iso();
  h.gl.notes["mr:10:5"] = [note(h, 11, h.other, "Kommentar")];
  await h.api.poll();
  t.eq(h.state.history[0].labels[0], "SLA-Relevant", "Treffer per Platzhalter steht vorn und fällt nicht weg");
  h.dispose();
});
