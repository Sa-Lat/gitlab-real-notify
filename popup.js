// GitLab Real Notify – Popup: Verlauf der letzten Meldungen.
// Beim Öffnen gilt alles als gelesen; hervorgehoben bleibt es bis zum
// nächsten Öffnen, damit man sieht, was neu war. Ein Klick öffnet das Ziel
// und nimmt die Meldung aus dem Verlauf, × nimmt sie nur raus.

let L = "en"; // Sprache, kommt mit dem Status vom Service Worker
let shownIds = []; // was gerade angezeigt wird — nur das gilt als gelesen bzw. wird geleert
const t = (key, vars) => tr(L, key, vars);

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return t("justNow");
  if (min < 60) return t("minAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("hAgo", { n: h });
  // Kurz („12.11., 12:32“), damit in der Zeile Platz für Labels bleibt.
  return new Date(ms).toLocaleString(L, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function clock(ms) {
  return new Date(ms).toLocaleTimeString(L, { hour: "2-digit", minute: "2-digit" });
}

// Labels, die nicht mehr in die Zeile passen, umbrechen in die abgeschnittene
// zweite Zeile. Die nehmen wir raus und zeigen stattdessen „+N“ — passt das
// selbst nicht mehr, muss noch ein Label davor weichen.
function fitLabels(row) {
  const top = row.getBoundingClientRect().top + 4;
  const wraps = (c) => c.getBoundingClientRect().top > top;
  const worth = (c) => (/^\+\d+$/.test(c.textContent) ? Number(c.textContent.slice(1)) : 1);
  let hidden = 0;
  let hotHidden = false; // steckt ein wichtiges Label im „+N“, wird es selbst hervorgehoben
  const drop = (c) => { hidden += worth(c); hotHidden = hotHidden || c.classList.contains("hot"); c.remove(); };
  for (const c of row.querySelectorAll(".label")) if (wraps(c)) drop(c);
  if (!hidden) return;
  const plus = document.createElement("span");
  row.appendChild(plus);
  for (;;) {
    plus.textContent = "+" + hidden;
    plus.className = "label" + (hotHidden ? " hot" : "");
    const chips = row.querySelectorAll(".label");
    if (!wraps(plus) || chips.length < 2) break;
    drop(chips[chips.length - 2]);
  }
  plus.title = row.closest("a").title.split("\n").pop(); // alle Labels
}

// Sofort aus der Liste nehmen, nicht erst auf den Service Worker warten.
function drop(li) {
  li.remove();
  const empty = !document.querySelector("#list li");
  document.getElementById("empty").hidden = !empty;
  document.getElementById("tools").hidden = empty;
}

function openOptions(ev) {
  ev.preventDefault();
  chrome.runtime.openOptionsPage();
}

function render(status) {
  L = status.lang || "en";
  applyI18n(L);
  const err = document.getElementById("error");
  const text = status.error || (status.hasToken ? "" : t("noToken"));
  err.textContent = text ? text + " " : "";
  err.hidden = !text;
  if (text) {
    const go = document.createElement("button");
    go.type = "button";
    go.className = "link";
    go.textContent = t("openSettings");
    go.addEventListener("click", openOptions);
    err.appendChild(go);
  }
  // Ohne Token gibt es nichts zu prüfen — und „Noch nichts Neues“ wäre gelogen.
  document.getElementById("check").disabled = !status.hasToken;

  // Glocke: manuell stumm -> Klick hebt auf; sonst Klick = 1 Stunde stumm.
  const mute = document.getElementById("mute");
  const label = status.muteUntil ? t("mutedUntil", { time: clock(status.muteUntil) })
    : status.quietNow ? t("quietActive") : t("mute");
  mute.classList.toggle("quiet", !!status.quietNow);
  mute.setAttribute("aria-pressed", String(!!status.muteUntil));
  mute.title = label;
  mute.setAttribute("aria-label", label);
  mute.hidden = !status.hasToken;

  // Sprung zur MR-Übersicht in GitLab (zugewiesen, Review, eigene).
  const mrLink = document.getElementById("mrLink");
  const base = /^https:\/\//i.test(status.url || "") ? status.url : null;
  mrLink.hidden = document.getElementById("mrSep").hidden = !base;
  if (base) mrLink.href = base + "/dashboard/merge_requests";

  const list = document.getElementById("list");
  list.textContent = "";
  shownIds = status.history.map((e) => e.id);
  const hot = importantMatcher(status.importantLabels); // „workflow::*“ usw.
  // To-dos (Review-Anfrage, Erwähnung, rote Pipeline …) warten auf dich: nach oben.
  const ordered = status.history.filter((e) => e.todo).concat(status.history.filter((e) => !e.todo));
  const firstRest = ordered.find((e) => !e.todo);
  for (const e of ordered) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "event" + (e.read ? "" : " unread");
    a.href = e.url || "#";
    // Titel ist einzeilig gekürzt; dazu die genaue Zeit.
    a.title = e.title + (e.message ? "\n" + e.message : "") + "\n" + new Date(e.at).toLocaleString(L) +
      (Array.isArray(e.labels) && e.labels.length ? "\n" + e.labels.join(", ") : "");
    for (const [cls, text] of [["title", e.title], ["message", e.message], ["when", ago(e.at)]]) {
      const div = document.createElement("div");
      div.className = cls;
      div.textContent = text;
      a.appendChild(div);
    }
    if (e === firstRest && ordered[0].todo) li.className = "rest-start"; // Linie nach dem letzten To-do
    // Labels leise hinter der Zeit; was nicht in die Zeile passt, wird abgeschnitten.
    // Wichtige zuerst (auch bei Meldungen von vor der Einstellung) — fitLabels kürzt von hinten.
    const labels = (Array.isArray(e.labels) ? e.labels : []).slice(0, 8).map(String);
    labels.sort((x, y) => hot(y) - hot(x));
    for (const name of labels) {
      const chip = document.createElement("span");
      chip.className = "label" + (hot(name) ? " hot" : "");
      chip.textContent = chip.title = String(name);
      a.lastChild.appendChild(chip);
    }
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      drop(li);
      chrome.runtime.sendMessage({ type: "open", id: e.id });
    });

    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "×";
    x.title = t("remove");
    x.setAttribute("aria-label", t("removeNotification", { title: e.title }));
    x.addEventListener("click", () => {
      // Fokus nicht ins Leere fallen lassen: nächste Zeile oder die vorige.
      const next = li.nextElementSibling || li.previousElementSibling;
      drop(li);
      if (next) next.querySelector("button.x").focus();
      chrome.runtime.sendMessage({ type: "dismiss", ids: [e.id] });
    });

    li.append(a, x);
    list.appendChild(li);
    fitLabels(a.lastChild); // erst im DOM lässt sich messen
  }
  const empty = status.history.length === 0;
  document.getElementById("empty").hidden = !empty || !status.hasToken;
  document.getElementById("tools").hidden = empty;
  document.getElementById("last").textContent = status.lastPoll
    ? ago(status.lastPoll) + (status.me ? " · @" + status.me.username : "")
    : "";
}

async function refresh() {
  render(await chrome.runtime.sendMessage({ type: "status" }));
}

document.getElementById("check").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget; // ev.target kann das SVG im Button sein
  btn.disabled = true;
  btn.classList.add("busy");
  await chrome.runtime.sendMessage({ type: "pollNow" });
  btn.classList.remove("busy");
  await refresh(); // setzt disabled passend zum Token zurück
});

document.getElementById("mute").addEventListener("click", async (ev) => {
  const on = ev.currentTarget.getAttribute("aria-pressed") === "true";
  await chrome.runtime.sendMessage({ type: "mute", minutes: on ? 0 : 60 });
  await refresh();
});

document.getElementById("clearAll").addEventListener("click", async () => {
  document.querySelectorAll("#list li").forEach(drop);
  await chrome.runtime.sendMessage({ type: "dismiss", ids: shownIds });
});

// Öffnet alles in Hintergrund-Tabs; der Service Worker räumt die Liste ab.
document.getElementById("openAll").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "openAll" });
  await refresh();
});

// Fragt GitLab, was inzwischen gemergt oder geschlossen ist, und räumt das ab.
document.getElementById("clearDone").addEventListener("click", async (ev) => {
  const btn = ev.currentTarget;
  const check = document.getElementById("check"); // dreht sich mit: GitLab wird gefragt
  btn.disabled = check.disabled = true;
  check.classList.add("busy");
  const res = await chrome.runtime.sendMessage({ type: "dismissDone" });
  check.classList.remove("busy");
  await refresh(); // setzt check.disabled passend zum Token zurück
  btn.disabled = false;
  if (!res.ok) {
    const err = document.getElementById("error");
    err.textContent = res.error;
    err.hidden = false;
  }
});

document.getElementById("optionsLink").addEventListener("click", openOptions);

refresh().then(() => chrome.runtime.sendMessage({ type: "markRead", ids: shownIds }));
