# GitLab Real Notify

Browser-Extension für Chrome und Firefox, die dir im Browser Bescheid gibt,
wenn GitLab dir bei der Benachrichtigungsstufe **„Participate“** eine Mail
schicken würde. Vor allem:

- jemand **kommentiert** in einem MR oder Issue, an dem du beteiligt bist
- dir wird etwas **zugewiesen**
- jemand **bittet um dein Review**

GitLab hat dafür keine API, also fragt die Extension regelmäßig nach —
standardmäßig jede Minute, einstellbar bis alle 30 Minuten. Sie
**liest nur** — sie kann in GitLab nichts ändern, und der Token braucht nur
`read_api`.

---

## Testen in 10 Minuten

### 1. Token anlegen (einmal, für Chrome und Firefox gleich)

1. In GitLab oben rechts auf dein Bild → **Edit profile** → **Access tokens**
   (oder `https://<eure-gitlab-adresse>/-/user_settings/personal_access_tokens`).
2. **Add new token**: Name z. B. `GitLab Real Notify`, Ablaufdatum nach Wunsch,
   Bereich **nur `read_api`** anhaken.
3. Token kopieren (`glpat-…`) — GitLab zeigt ihn nur einmal.

Bitte den Token **deines eigenen Kontos** nehmen, keinen Admin- oder
Projekt-Token: Die Extension meldet aus Sicht des Token-Inhabers und blendet
dessen eigene Aktionen aus. Nach dem Test kannst du den Token in GitLab
einfach widerrufen.

### 2a. Installieren in Chrome (auch Edge, Brave …)

1. Den Projektordner lokal ablegen (entpacken bzw. auschecken).
2. `chrome://extensions` öffnen, oben rechts **Entwicklermodus** einschalten.
3. **Entpackte Erweiterung laden** → den Projektordner wählen (den mit
   `manifest.json` darin).
4. Optional: Über das Puzzle-Symbol in der Toolbar die Extension anpinnen,
   damit das Branch-Icon sichtbar ist.

### 2b. Installieren in Firefox (ab Version 128)

Firefox braucht ein leicht anderes Manifest. Die fertige Fassung liegt in
`dist/firefox/`. Fehlt der Ordner, einmal im Projektordner bauen (braucht
Python 3):

```bash
python firefox.py
```

Dann:

1. `about:debugging#/runtime/this-firefox` öffnen.
2. **Temporäres Add-on laden …** → `dist/firefox/manifest.json` wählen.

Ein temporäres Add-on ist **nach einem Firefox-Neustart wieder weg** — für
den Test reicht das. Für eine dauerhafte Installation muss das Add-on
signiert werden (siehe [Für Entwickler](#für-entwickler)).

### 3. Einrichten

Nach der Installation öffnen sich die Einstellungen (sonst: Rechtsklick aufs
Icon → **Optionen** bzw. **Einstellungen**).

1. **GitLab-Adresse** eintragen, z. B. `https://gitlab.example.com`.
2. **Token** einfügen.
3. Optional **Wie oft prüfen** wählen: jede Minute (Standard), alle 2, 5, 10,
   15 oder 30 Minuten. Seltener heißt weniger Anfragen an GitLab, aber
   Meldungen kommen entsprechend später. **↻** im Popup prüft jederzeit sofort.
4. **Speichern & prüfen** klicken. Der Browser fragt einmal, ob die Extension
   auf diese Adresse zugreifen darf → **Zulassen**.
5. Erscheint **„Verbunden als @dein-name“**, läuft es.

Die erste Abfrage merkt sich nur den aktuellen Stand und meldet **absichtlich
nichts**. Ab dann wird im eingestellten Takt geprüft. Den Takt kannst du
jederzeit ändern; er gilt sofort nach dem Speichern, ohne dass etwas verloren
geht.

**Optional: Bei neuen MRs benachrichtigen.** Weiter unten auf derselben Seite
einschalten, dann Gruppen oder Projekte eintragen (Pfad wie
`example-group/team` oder einfach den Link aus GitLab) und Labels, die
ignoriert werden sollen (z. B. `dependencies` für Renovate — beim Tippen kommen
Vorschläge aus GitLab). Jeder Eintrag lässt sich per Häkchen pausieren oder
mit × entfernen; der Hauptschalter schaltet alles ab, wenn es zu viel wird.
Nach **Speichern & prüfen** steht neben jedem Pfad „Gruppe“, „Projekt“ oder
„nicht gefunden“.

### 4. Ausprobieren

Bitte eine Kollegin oder einen Kollegen, eins davon zu tun — die Meldung
sollte spätestens nach einem Takt kommen (bei „jede Minute“ also nach 1–2
Minuten; mit **↻** sofort):

- in einem MR oder Issue **kommentieren**, in dem du schon kommentiert hast,
  das du angelegt hast oder in dem du Reviewer bist
- dich als **Reviewer** eintragen
- dir ein Issue oder einen MR **zuweisen**
- dich in einem Kommentar **@erwähnen**
- falls „Neue MRs“ an ist: in einer eingetragenen Gruppe einen MR **ohne Draft**
  anlegen, oder einen Draft auf **Ready** setzen; ein MR mit ignoriertem Label
  sollte dagegen **nichts** auslösen

Was du sehen solltest:

- eine **Systembenachrichtigung** von Chrome bzw. Firefox; ein Klick öffnet die
  Stelle in GitLab
- eine **Zahl am Icon** für ungelesene Meldungen
- im **Popup** (Klick aufs Icon) den Verlauf der letzten 200 Meldungen:
  - Klick auf eine Meldung → öffnet sie in GitLab und nimmt sie aus der Liste
  - **×** → nimmt sie nur aus der Liste
  - **Alle leeren** unten → leert die Liste
  - **↻** oben rechts → sofort prüfen statt auf die nächste Abfrage zu warten
- während jeder Abfrage wird das Icon kurz **lila**

### 5. Rückmeldung

Am hilfreichsten:

- Browser und Version, Betriebssystem
- Was hättest du erwartet, was kam (oder kam nicht)? Am besten mit Link auf
  den MR/das Issue.
- Kamen Meldungen doppelt, oder mit seltsamem Text?
- Fehlermeldung aus den Einstellungen oder dem Popup (rotes **!** am Icon)

---

## Wenn nichts kommt

| Symptom | Ursache / Abhilfe |
| --- | --- |
| Rotes **!** am Icon, „Token ungültig oder abgelaufen“ | Token falsch kopiert, widerrufen oder abgelaufen → neuen anlegen und in den Einstellungen eintragen |
| „Kein Zugriff. Der Token braucht den Bereich read_api“ | Beim Token `read_api` vergessen |
| „GitLab nicht erreichbar“ | Erscheint erst, wenn GitLab seit über 5 Minuten (bei langsamem Takt: zwei Abfragen lang) nicht antwortet; kurze Aussetzer nach dem Entsperren bleiben still. Adresse falsch, VPN aus, oder die Zugriffsfreigabe abgelehnt → erneut **Speichern & prüfen** und **Zulassen** |
| Neue MRs: Pfad „nicht gefunden“ | Tippfehler, oder dein Konto sieht die Gruppe/das Projekt nicht |
| Zahl am Icon steigt, aber keine Systembenachrichtigung | Benachrichtigungen fürs Betriebssystem blockiert: **Windows** Einstellungen → System → Benachrichtigungen → Chrome/Firefox an, „Nicht stören“ aus; **macOS** Systemeinstellungen → Mitteilungen → Chrome/Firefox |
| Gar nichts, auch keine Zahl | Popup öffnen: Steht unten „vor … Min · @dein-name“? Wenn die Zeit nicht weiterläuft, auf **↻** klicken. Erste Abfrage meldet nie etwas (siehe oben). |
| Firefox: Add-on weg | Temporäre Add-ons verschwinden beim Neustart → erneut laden |

Wer genauer schauen will: Chrome `chrome://extensions` → bei der Extension
**Service Worker** → Tab **Network**; Firefox `about:debugging` →
**Untersuchen**. Dort ist jede Anfrage an `/api/v4/…` mit Statuscode zu sehen.

---

## Was gemeldet wird — und was nicht

Gemeldet wird, was andere tun in MRs und Issues, die du **angelegt** hast, die
dir **zugewiesen** sind, in denen du **Reviewer** bist, in denen du
**kommentiert** hast oder in denen du **erwähnt** wurdest:

- neue Kommentare — mehrere auf einmal im selben MR/Issue (z. B. ein
  abgeschicktes Review) als **eine** Meldung
- neue Commits, Freigaben, „ready“, Review-Anfragen, Zuweisungen
- gemergt, geschlossen, wieder geöffnet
- alle neuen GitLab-Todos (z. B. fehlgeschlagene Pipeline, Freigabe nötig)

Bewusst **nicht**: deine eigenen Aktionen, Label-, Meilenstein- und
Beschreibungsänderungen. Kommen nach dem Standby mehr als 5 Meldungen auf
einmal, gibt es eine Sammelmeldung; im Popup steht trotzdem jede einzeln.

**Neue MRs (optional):** In den eingetragenen Gruppen (inkl. Untergruppen)
und Projekten jeder offene MR, der zum ersten Mal **ohne Draft** auftaucht —
neu angelegt oder von Draft auf Ready gesetzt. Nicht gemeldet: MRs mit einem
ignorierten Label, deine eigenen, und solche, in denen du Reviewer oder
Assignee bist (die kommen schon als Todo). Beim Einschalten bzw. für einen neu
eingetragenen Pfad wird erst still der aktuelle Stand eingelesen.

**Abwesenheit** (Feierabend, Wochenende, Standby, Browser zu): Die erste
Abfrage danach holt alles seit der letzten erfolgreichen Abfrage nach. Ein
neuer Token für dasselbe Konto setzt dabei nichts zurück.

**Bekannte Grenzen**

- Threads, in denen du **nur kommentiert** hast, werden 30 Tage nach der
  letzten Aktivität nicht mehr beobachtet.
- In GitLab **stummgeschaltete** Threads („Unsubscribe“) meldet die Extension
  trotzdem — die API verrät das nicht.
- Erwähnungen einer **Gruppe**, in der du bist, kommen doppelt.
- Kein „Pipeline wieder grün“, kein „Issue morgen fällig“.

**Datenschutz:** Adresse, Token und Verlauf liegen nur lokal im Browserprofil
(`storage.local`, nicht synchronisiert, nicht verschlüsselt). Die Extension
spricht ausschließlich mit der eingetragenen GitLab-Adresse.

---

## Für Entwickler

Kein Build-Schritt für Chrome: der Ordner ist die Extension. Nach
Code-Änderungen auf `chrome://extensions` neu laden; für Firefox
`python firefox.py` neu laufen lassen. Nach größeren Änderungen die Version in
`manifest.json` anheben und in [`CHANGELOG.md`](CHANGELOG.md) eintragen.

| Datei | Rolle |
| --- | --- |
| [`manifest.json`](manifest.json) | MV3 für Chrome: `storage`, `alarms`, `notifications`, Hostzugriff nur per Freigabe |
| [`background.js`](background.js) | Service Worker: Abfrage, Beobachtungsliste, Meldungen, Badge, Icon |
| [`popup.html`](popup.html) / [`popup.js`](popup.js) | Verlauf, ↻, ×, Alle leeren |
| [`options.html`](options.html) / [`options.js`](options.js) | Adresse und Token mit Verbindungsprüfung; „Neue MRs“ mit Pfaden, Labels, Vorschlägen |
| [`theme.css`](theme.css), `fonts/` | Design aus ZeitBudget, ohne Maskottchen |
| `icons/` | Git-Branch-Symbol: `icon*` normal, `busy*` lila während der Abfrage; neu erzeugen mit `python icons/make.py` (Pillow) |
| [`firefox.py`](firefox.py) | Baut `dist/firefox/`: `background.scripts` statt Service Worker, feste Add-on-ID |
| [`tests/`](tests/) | Browser-Tests gegen die echte `background.js` |

**Firefox dauerhaft verteilen:** einmal über AMO als *unlisted* signieren
(kostenlos, braucht einen AMO-API-Key) und die `.xpi` weitergeben:

```bash
npx web-ext sign --channel=unlisted --source-dir dist/firefox
```

Die Add-on-ID (GUID in `firefox.py`) danach nicht mehr ändern — Firefox
erkennt Updates und gespeicherte Einstellungen daran.

### Abfragen pro Durchlauf

Ein Durchlauf pro eingestelltem Takt (`settings.interval`, erlaubt sind die
Werte in `INTERVALS` in `background.js`: 1, 2, 5, 10, 15, 30 Minuten; Standard
1). Der Takt ist ein `chrome.alarms`-Alarm, den Start und Speichern neu setzen.
Alle `GET`, Header `PRIVATE-TOKEN`:

1. `/todos?state=pending`
2. `/events?action=commented&after=<vorgestern>` — deine Kommentare → Beobachtungsliste
3. `/merge_requests?scope=all&{author_id|assignee_id|reviewer_id}=<du>&updated_after=…` (3×)
4. `/issues?scope=all&{author_id|assignee_id}=<du>&updated_after=…` (2×)
5. pro Projekt mit beobachteten Threads: `/projects/:id/{merge_requests|issues}?iids[]=…&updated_after=…`
6. pro tatsächlich geändertem MR/Issue: `…/:iid/notes?sort=desc&order_by=created_at&per_page=50`
7. nur mit „Neue MRs“: pro aktivem Pfad `/{groups|projects}/:id/merge_requests?state=opened&updated_after=…`

Typisch 10–20 Anfragen pro Durchlauf, fast alle mit leerer Antwort — bei
„jede Minute“ also 10–20 pro Minute, bei „alle 5 Minuten“ ein Fünftel davon.
Die Anzahl pro Durchlauf hängt nicht vom Takt ab, weil `updated_after` nur
Geändertes liefert. `/user` und das
Auflösen der Pfade (`/groups/:pfad`, sonst `/projects/:pfad`) beim Speichern;
Labels (`/…/:id/labels`) beim Öffnen der Einstellungen. Der Events-Rückblick
reicht bis 2 Tage vor die letzte erfolgreiche Abfrage (höchstens 30 Tage).

### Regeln, die im Code stecken

- **Nur lesen.** Jede Anfrage läuft über `get()`, und das kennt nur GET. Die
  Suite „Nur lesen“ prüft das. Keinen Schreibzugriff ergänzen.
- **Nacheinander.** Abfrage, Klick, ×, Leeren und „gelesen“ laufen über
  `serial()`, damit nichts einen gerade geänderten Verlauf überschreibt.
- **Alles oder nichts.** Der neue Stand wird erst am Ende einer Abfrage
  gespeichert. Bricht sie ab (Netz, 401, 429), wird die nächste ab dem alten
  Stand wiederholt — Meldungen gehen nicht verloren.
- **Keine Doppelmeldungen.** Pro Thread merkt sich die Extension die höchste
  gesehene Notiz-ID, offene Todo-IDs und den letzten Status; die
  Abfragefenster überlappen 2 Minuten für Uhrenversatz.
- **Nur Text.** Notizen sind Markdown mit HTML; `bodyText()` macht daraus
  Klartext. Titel bleiben unangetastet.
- **429** von GitLab: Pause laut `Retry-After` (mindestens 60 s).
- **Netzaussetzer** (fetch wirft, 5xx) bleiben still, solange der letzte
  Erfolg weniger als 5 Minuten bzw. zwei Takte (+30 s) her ist; der Alarm ist
  der Retry. 401/403/429 werden sofort angezeigt.
- **Speichern** verwirft den Stand nur bei anderer Adresse oder anderem Konto.
- **Neue MRs:** Drafts kommen nie in `newMr.seen`, damit „Ready“ später als neu
  auffällt; bekannte MRs werden nach 180 Tagen ohne Aktivität vergessen.

### Tests

```bash
python -m http.server 8000
```

Dann `http://127.0.0.1:8000/tests/` öffnen. Der Seitentitel steht auf `PASS`
bzw. `FAIL <n>`, das Ergebnis liegt als `window.__rnResult`.

`harness.js` lädt `background.js` in eine Sandbox mit Chrome-Double,
angehaltener Uhr und einem **GitLab-Double** hinter `fetch`, das Todos, Events,
MRs, Issues und Notizen hält und wie GitLab filtert und blättert.
