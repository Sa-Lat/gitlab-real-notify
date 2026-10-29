// GitLab Real Notify – Einstellungen
// Adresse und Token speichern, danach sofort einmal abfragen: so steht direkt
// da, ob es klappt, statt dass später lautlos nichts kommt.

const urlEl = document.getElementById("url");
const tokenEl = document.getElementById("token");
const notiz = document.getElementById("notiz");
const saveBtn = document.getElementById("save");
const mrOn = document.getElementById("mrOn");
const intervalEl = document.getElementById("interval");

function minutes(n) {
  return n === 1 ? "jede Minute" : "alle " + n + " Minuten";
}

// Neue MRs: Listen mit an/aus pro Eintrag. Gespeichert wird mit „Speichern & prüfen“.
let namespaces = [];   // [{ path, on }]
let ignoreLabels = []; // [{ name, on }]
let resolved = {};     // path -> { kind, id } | null (nicht gefunden)

function cleanUrl(s) {
  const u = s.trim().replace(/\/+$/, "");
  return /^https:\/\/[^/\s]+/i.test(u) ? u : null;
}

// „https://gitlab.example.com/example-group/team/-/merge_requests“ -> „example-group/team“
function cleanPath(s) {
  return s.trim()
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/\/-\/.*$/, "")
    .replace(/^\/+|\/+$/g, "");
}

function setTokenLink() {
  const base = cleanUrl(urlEl.value);
  document.getElementById("tokenLinkWrap").hidden = !base; // ohne Adresse kein Ziel
  if (base) {
    document.getElementById("tokenLink").href =
      base + "/-/user_settings/personal_access_tokens?name=GitLab%20Real%20Notify&scopes=read_api";
  }
}

function say(text, ok) {
  notiz.textContent = text;
  notiz.classList.toggle("ok", !!ok);
  notiz.hidden = false;
}

// Änderungen gelten erst nach „Speichern & prüfen“ — das soll man sehen.
let loaded = false;
function markDirty() {
  if (loaded && !saveBtn.disabled) say("Noch nicht gespeichert — oben auf „Speichern & prüfen“ klicken.");
}

// Eine Zeilenliste: Häkchen schaltet an/aus, × entfernt. tagOf liefert den
// Status rechts (oder nichts).
function renderRows(listEl, items, key, tagOf) {
  listEl.textContent = "";
  items.forEach((item, i) => {
    const li = document.createElement("li");
    li.classList.toggle("off", !item.on);
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = item.on;
    box.addEventListener("change", () => { item.on = box.checked; li.classList.toggle("off", !item.on); });
    const name = document.createElement("span");
    name.textContent = item[key];
    label.append(box, name);
    li.appendChild(label);

    const tag = tagOf && tagOf(item);
    if (tag) {
      const t = document.createElement("span");
      t.className = "tag" + (tag.bad ? " bad" : "");
      t.textContent = tag.text;
      li.appendChild(t);
    }

    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.textContent = "×";
    x.title = "Entfernen";
    x.setAttribute("aria-label", item[key] + " entfernen");
    x.addEventListener("click", () => {
      items.splice(i, 1);
      markDirty();
      renderRows(listEl, items, key, tagOf);
      // Fokus nicht ins Leere fallen lassen: nächste Zeile, sonst das Eingabefeld.
      const rest = listEl.querySelectorAll("button.x");
      (rest[Math.min(i, rest.length - 1)] || listEl.parentElement.querySelector(".add input")).focus();
    });
    li.appendChild(x);
    listEl.appendChild(li);
  });
}

function nsTag(n) {
  if (!(n.path in resolved)) return null; // noch nicht geprüft
  const r = resolved[n.path];
  return r ? { text: r.kind === "group" ? "Gruppe" : "Projekt" } : { text: "nicht gefunden", bad: true };
}

function renderMr() {
  document.getElementById("mrBox").hidden = !mrOn.checked;
  renderRows(document.getElementById("nsList"), namespaces, "path", nsTag);
  renderRows(document.getElementById("lblList"), ignoreLabels, "name");
}

function wireAdd(inputId, buttonId, add) {
  const input = document.getElementById(inputId);
  const go = () => {
    if (add(input.value)) { input.value = ""; renderMr(); markDirty(); }
    input.focus();
  };
  document.getElementById(buttonId).addEventListener("click", go);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
}

// Liefern true, wenn das Feld danach leer sein darf (übernommen oder schon da).
function addNs(raw) {
  const path = cleanPath(raw);
  if (path && !namespaces.some((n) => n.path === path)) namespaces.push({ path, on: true });
  return !!path;
}

function addLabel(raw) {
  const name = raw.trim();
  if (name && !ignoreLabels.some((l) => l.name.toLowerCase() === name.toLowerCase())) ignoreLabels.push({ name, on: true });
  return !!name;
}

wireAdd("nsInput", "nsAdd", addNs);
wireAdd("lblInput", "lblAdd", addLabel);

mrOn.addEventListener("change", renderMr);

async function loadLabels() {
  const names = await chrome.runtime.sendMessage({ type: "labels" });
  const list = document.getElementById("lblSuggest");
  list.textContent = "";
  for (const n of names || []) {
    const o = document.createElement("option");
    o.value = n;
    list.appendChild(o);
  }
}

async function load() {
  const status = await chrome.runtime.sendMessage({ type: "status" });
  urlEl.value = status.url;
  tokenEl.placeholder = status.hasToken ? "gespeichert – leer lassen zum Behalten" : "glpat-…";
  setTokenLink();
  intervalEl.textContent = "";
  for (const n of status.intervals) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = minutes(n);
    intervalEl.appendChild(o);
  }
  intervalEl.value = String(status.interval);
  mrOn.checked = !!status.newMrs.enabled;
  namespaces = status.newMrs.namespaces.map((n) => Object.assign({}, n));
  ignoreLabels = status.newMrs.ignoreLabels.map((l) => Object.assign({}, l));
  resolved = status.nsResolved;
  renderMr();
  if (status.me) say("Verbunden als @" + status.me.username, true);
  else if (status.error) say(status.error);
  loadLabels();
  loaded = true;
}

urlEl.addEventListener("input", setTokenLink);
// Tippen in die Hinzufügen-Felder zählt nicht — das wird erst mit „Hinzufügen“ eine Änderung.
document.querySelector("main").addEventListener("input", (e) => {
  if (!e.target.closest(".add")) markDirty();
});
document.querySelector("main").addEventListener("change", (e) => {
  if (!e.target.closest(".add")) markDirty();
});

saveBtn.addEventListener("click", async () => {
  const url = cleanUrl(urlEl.value);
  if (!url) {
    say("Die Adresse muss mit https:// beginnen, etwa https://gitlab.example.com.");
    return;
  }
  // Zugriff auf die Instanz gibt es nur per Freigabe — die muss als Erstes
  // im Klick passieren, vor jedem await.
  const granted = await chrome.permissions.request({ origins: [url + "/*"] });
  if (!granted) {
    say("Ohne Zugriff auf " + url + " kann die Extension nichts abfragen.");
    return;
  }

  // Noch Getipptes, aber nicht Hinzugefügtes nicht verlieren.
  for (const [id, add] of [["nsInput", addNs], ["lblInput", addLabel]]) {
    const input = document.getElementById(id);
    if (add(input.value)) input.value = "";
  }

  saveBtn.disabled = true;
  say("Prüfe die Verbindung …", true);
  const res = await chrome.runtime.sendMessage({
    type: "save",
    settings: { url, token: tokenEl.value, interval: Number(intervalEl.value),
      newMrs: { enabled: mrOn.checked, namespaces, ignoreLabels } }
  });
  saveBtn.disabled = false;
  tokenEl.value = "";
  resolved = (res && res.nsResolved) || {};
  renderMr();
  if (res && res.ok) {
    tokenEl.placeholder = "gespeichert – leer lassen zum Behalten";
    const missing = namespaces.filter((n) => resolved[n.path] === null).map((n) => n.path);
    say("Verbunden als @" + res.me.username + ". Ab jetzt wird " + minutes(Number(intervalEl.value)) + " geprüft." +
      (missing.length ? " Nicht gefunden: " + missing.join(", ") + " — Tippfehler oder kein Zugriff?" : ""), !missing.length);
    loadLabels();
  } else {
    say((res && res.error) || "Unbekannter Fehler.");
  }
});

load();
