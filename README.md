# GitLab Real Notify

Browser-Extension (Chrome, Firefox), die GitLabs Benachrichtigungsstufe
**Participate** als Desktop-Benachrichtigung nachbildet: Kommentare in deinen
MRs/Issues und in Threads, in denen du kommentiert hast, dazu Zuweisungen,
Review-Anfragen, Todos, merged/closed. Optional auch neue MRs (ohne Draft) in
ausgewählten Gruppen/Projekten, mit Label-Filter.

Pollt die GitLab-REST-API, braucht nur einen persönlichen Token mit `read_api`
und schreibt nichts. Kein Backend, kein Build für Chrome.

## Installation

**Chrome:** `chrome://extensions` → Entwicklermodus → *Entpackte Erweiterung
laden* → Repo-Ordner.

**Firefox ≥ 128:**

```bash
python firefox.py
```

Dann `about:debugging#/runtime/this-firefox` → *Temporäres Add-on laden* →
`dist/firefox/manifest.json`. Hält bis zum Neustart. Für eine dauerhafte
Installation einmal signieren: `npx web-ext sign --channel=unlisted --source-dir dist/firefox`.

## Einrichten

Die Einstellungen öffnen sich nach der Installation:

- **GitLab-Adresse:** z. B. `https://gitlab.example.com`.
- **Token:** persönlicher Access Token des eigenen Kontos, Scope `read_api`.
- **Takt:** 1–30 Minuten, Standard 1.
- **Neue MRs** (optional): Gruppen- oder Projektpfade, Labels zum Ignorieren
  (z. B. `dependencies`).

**Speichern & prüfen** fragt einmal die Host-Berechtigung ab. Der erste Lauf
merkt sich nur den Stand und meldet nichts.

## Verhalten

- Mehrere neue Kommentare im selben MR werden zu einer Meldung gebündelt; ab 6
  Ereignissen auf einmal gibt es eine Sammelmeldung.
- Eigene Aktionen werden nicht gemeldet. Erwähnungen kommen als Todo, nicht
  doppelt.
- Nach Standby oder geschlossenem Browser wird ab der letzten erfolgreichen
  Abfrage nachgeholt. Kurze Netzaussetzer bleiben still.
- Pro Durchlauf etwa 10–20 meist leere Requests (`updated_after`).

**Grenzen:**

- In GitLab stummgeschaltete Threads werden trotzdem gemeldet.
- Threads, in denen man nur kommentiert hat, fallen nach 30 Tagen Inaktivität
  aus der Beobachtung.
- Systemnotizen werden am englischen Text erkannt.

## Entwicklung

| Datei | |
| --- | --- |
| `background.js` | Service Worker: Polling, Zustand, Benachrichtigungen. Alle Requests laufen über `get()`, das nur GET kennt. |
| `popup.*`, `options.*`, `theme.css` | UI, ohne Framework |
| `tests/` | Browser-Tests gegen die echte `background.js`, mit Chrome- und GitLab-Double |
| `firefox.py` | Baut `dist/firefox/` (`background.scripts`, Gecko-ID) |
| `icons/make.py` | Erzeugt die Icons (Pillow) |

Tests starten:

```bash
python -m http.server 8000
```

Dann `http://127.0.0.1:8000/tests/` öffnen. Der Seitentitel zeigt `PASS` oder
`FAIL n`.

**Release:** Version in `manifest.json` anheben, `CHANGELOG.md` ergänzen, Tag
`vX.Y.Z` setzen.
