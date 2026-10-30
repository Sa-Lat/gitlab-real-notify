// GitLab Real Notify – Einstellungen
// Adresse und Token speichern, danach sofort einmal abfragen: so steht direkt
// da, ob es klappt, statt dass später lautlos nichts kommt.

const urlEl = document.getElementById("url");
const tokenEl = document.getElementById("token");
const notiz = document.getElementById("notiz");
const saveBtn = document.getElementById("save");
const mrOn = document.getElementById("mrOn");
const intervalEl = document.getElementById("interval");
const langEl = document.getElementById("lang");

let L = "en"; // angezeigte Sprache; „auto“ löst langOf() zur Browsersprache auf
const t = (key, vars) => tr(L, key, vars);

function minutes(n) {
  return n === 1 ? t("everyMinute") : t("everyN", { n });
}

let intervals = [];
let hasToken = false;
// Alle Texte der Seite in L neu setzen — beim Laden und sofort beim Umstellen.
function relabel() {
  applyI18n(L);
  const keep = intervalEl.value;
  intervalEl.textContent = "";
  for (const n of intervals) {
    const o = document.createElement("option");
    o.value = String(n);
    o.textContent = minutes(n);
    intervalEl.appendChild(o);
  }
  if (keep) intervalEl.value = keep;
  tokenEl.placeholder = hasToken ? t("tokenSaved") : "glpat-…";
  renderMr();
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
  if (loaded && !saveBtn.disabled) say(t("notSaved"));
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
    x.title = t("remove");
    x.setAttribute("aria-label", t("removeItem", { name: item[key] }));
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
  return r ? { text: r.kind === "group" ? t("group") : t("project") } : { text: t("notFound"), bad: true };
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
  hasToken = status.hasToken;
  setTokenLink();
  intervals = status.intervals;
  intervalEl.value = "";
  langEl.value = status.langSetting;
  L = status.lang;
  mrOn.checked = !!status.newMrs.enabled;
  namespaces = status.newMrs.namespaces.map((n) => Object.assign({}, n));
  ignoreLabels = status.newMrs.ignoreLabels.map((l) => Object.assign({}, l));
  resolved = status.nsResolved;
  relabel();
  intervalEl.value = String(status.interval);
  if (status.me) say(t("connectedAs", { user: status.me.username }), true);
  else if (status.error) say(status.error);
  loadLabels();
  loaded = true;
}

urlEl.addEventListener("input", setTokenLink);
// Sprache gleich in der Seite zeigen; gespeichert wird sie wie alles andere.
langEl.addEventListener("change", () => {
  L = langOf(langEl.value);
  relabel();
});
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
    say(t("urlInvalid"));
    return;
  }
  // Zugriff auf die Instanz gibt es nur per Freigabe — die muss als Erstes
  // im Klick passieren, vor jedem await.
  const granted = await chrome.permissions.request({ origins: [url + "/*"] });
  if (!granted) {
    say(t("noAccess", { url }));
    return;
  }

  // Noch Getipptes, aber nicht Hinzugefügtes nicht verlieren.
  for (const [id, add] of [["nsInput", addNs], ["lblInput", addLabel]]) {
    const input = document.getElementById(id);
    if (add(input.value)) input.value = "";
  }

  saveBtn.disabled = true;
  say(t("checking"), true);
  const res = await chrome.runtime.sendMessage({
    type: "save",
    settings: { url, token: tokenEl.value, interval: Number(intervalEl.value), lang: langEl.value,
      newMrs: { enabled: mrOn.checked, namespaces, ignoreLabels } }
  });
  saveBtn.disabled = false;
  tokenEl.value = "";
  resolved = (res && res.nsResolved) || {};
  renderMr();
  if (res && res.ok) {
    hasToken = true;
    tokenEl.placeholder = t("tokenSaved");
    const missing = namespaces.filter((n) => resolved[n.path] === null).map((n) => n.path);
    say(t("connectedNow", { user: res.me.username, interval: minutes(Number(intervalEl.value)) }) +
      (missing.length ? t("missing", { list: missing.join(", ") }) : ""), !missing.length);
    loadLabels();
  } else {
    say((res && res.error) || t("unknownError"));
  }
});

load();
