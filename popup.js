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

function render(status) {
  const err = document.getElementById("error");
  err.textContent = status.error || (status.hasToken ? "" : "Noch kein Token eingetragen — ab in die Einstellungen.");
  err.hidden = !err.textContent;

  const list = document.getElementById("list");
  list.textContent = "";
  for (const e of status.history) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "event" + (e.read ? "" : " unread");
    a.href = e.url || "#";
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
  document.getElementById("empty").hidden = !empty;
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
  await chrome.runtime.sendMessage({ type: "pollNow" });
  await refresh();
  btn.disabled = false;
});

document.getElementById("clearAll").addEventListener("click", async () => {
  document.querySelectorAll("#list li").forEach(drop);
  await chrome.runtime.sendMessage({ type: "dismiss" });
});

document.getElementById("optionsLink").addEventListener("click", (ev) => {
  ev.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh().then(() => chrome.runtime.sendMessage({ type: "markRead" }));
