// GitLab Real Notify – Popup: Verlauf der letzten Meldungen.
// Beim Öffnen gilt alles als gelesen; hervorgehoben bleibt es bis zum
// nächsten Öffnen, damit man sieht, was neu war. Ein Klick öffnet das Ziel
// und nimmt die Meldung aus dem Verlauf, × nimmt sie nur raus.

function ago(ms) {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return "vor " + min + " Min";
  const h = Math.round(min / 60);
  if (h < 24) return "vor " + h + " Std";
  return new Date(ms).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

// Sofort aus der Liste nehmen, nicht erst auf den Service Worker warten.
function drop(li) {
  li.remove();
  const empty = !document.querySelector("#list li");
  document.getElementById("empty").hidden = !empty;
  document.getElementById("clearAll").hidden = empty;
  document.getElementById("sep").hidden = empty;
}

function openOptions(ev) {
  ev.preventDefault();
  chrome.runtime.openOptionsPage();
}

function render(status) {
  const err = document.getElementById("error");
  const text = status.error || (status.hasToken ? "" : "Noch kein Token eingetragen.");
  err.textContent = text ? text + " " : "";
  err.hidden = !text;
  if (text) {
    const go = document.createElement("button");
    go.type = "button";
    go.className = "link";
    go.textContent = "Einstellungen öffnen";
    go.addEventListener("click", openOptions);
    err.appendChild(go);
  }
  // Ohne Token gibt es nichts zu prüfen — und „Noch nichts Neues“ wäre gelogen.
  document.getElementById("check").disabled = !status.hasToken;

  // Sprung zur MR-Übersicht in GitLab (zugewiesen, Review, eigene).
  const mrLink = document.getElementById("mrLink");
  const base = /^https:\/\//i.test(status.url || "") ? status.url : null;
  mrLink.hidden = document.getElementById("mrSep").hidden = !base;
  if (base) mrLink.href = base + "/dashboard/merge_requests";

  const list = document.getElementById("list");
  list.textContent = "";
  for (const e of status.history) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "event" + (e.read ? "" : " unread");
    a.href = e.url || "#";
    a.title = e.title + (e.message ? "\n" + e.message : ""); // Titel ist einzeilig gekürzt
    for (const [cls, text] of [["title", e.title], ["message", e.message], ["when", ago(e.at)]]) {
      const div = document.createElement("div");
      div.className = cls;
      div.textContent = text;
      a.appendChild(div);
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
    x.title = "Entfernen";
    x.setAttribute("aria-label", "Meldung entfernen: " + e.title);
    x.addEventListener("click", () => {
      // Fokus nicht ins Leere fallen lassen: nächste Zeile oder die vorige.
      const next = li.nextElementSibling || li.previousElementSibling;
      drop(li);
      if (next) next.querySelector("button.x").focus();
      chrome.runtime.sendMessage({ type: "dismiss", ids: [e.id] });
    });

    li.append(a, x);
    list.appendChild(li);
  }
  const empty = status.history.length === 0;
  document.getElementById("empty").hidden = !empty || !status.hasToken;
  document.getElementById("clearAll").hidden = empty;
  document.getElementById("sep").hidden = empty;
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

document.getElementById("clearAll").addEventListener("click", async () => {
  document.querySelectorAll("#list li").forEach(drop);
  await chrome.runtime.sendMessage({ type: "dismiss" });
});

document.getElementById("optionsLink").addEventListener("click", openOptions);

refresh().then(() => chrome.runtime.sendMessage({ type: "markRead" }));
