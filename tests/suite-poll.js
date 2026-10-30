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
