# Changelog

Version steht in [`manifest.json`](manifest.json). Nach größeren Änderungen
anheben: größere neue Funktion → Minor (0.**x**.0), Fehlerbehebung oder
kleine Ergänzung wie ein Link → Patch (0.x.**y**). Danach
`python firefox.py` neu laufen lassen.

## 0.6.3 — 2026-11-17

- To-dos „Pipeline fehlgeschlagen“, „lässt sich nicht mehr mergen“ und „aus
  dem Merge-Train genommen“ ohne Namen davor. Der „Autor“ ist dort meist man
  selbst; „Ben Pipeline fehlgeschlagen“ las sich wie die Tat eines anderen.
- README neu gegliedert: erst was die Erweiterung bietet (alle Meldungsarten,
  Popup, Einstellungen, Sicherheit und Datenschutz), dann die Technik.

## 0.6.2 — 2026-11-16

- **Draft entfernt wird zuverlässig gemeldet:** bei MRs, an denen du beteiligt
  bist (Reviewer, Assignee, kommentiert), erkennt die Erweiterung den Wechsel
  jetzt am Feld `draft` statt am Notiztext. Vorher fiel die Meldung durch, weil
  GitLab „marked this merge request as **ready**“ mit Sternchen schreibt. Wer
  es war, kommt aus der Notiz („Draft entfernt, bereit für Review von Anna“);
  eigene und Bot-Aktionen bleiben still.
- „Neue MRs“: Ein MR, der schon vor der letzten Abfrage als Draft angelegt war
  und jetzt bereit ist, heißt „Bereit für Review in …“ statt „Neuer MR in …“.

## 0.6.1 — 2026-11-13

- **Wichtige Labels mit Platzhalter:** `*` steht für beliebig viele Zeichen,
  Groß/klein egal — z. B. `workflow::*` für alle Workflow-Stufen oder `*SLA*`.
  Ohne RegExp verglichen, damit viele Sterne auf langen Labels nicht ausufern.

## 0.6.0 — 2026-11-13

- **Ruhezeit:** in den Einstellungen ein Zeitfenster (auch über Mitternacht)
  und/oder das ganze Wochenende ohne Pop-ups, nach der Uhr des Rechners.
  Meldungen landen weiter in Liste und Badge; danach kommt eine
  Sammelmeldung. Die Glocke im Popup schaltet für eine Stunde stumm.
- **Für dich zuerst:** To-dos (Review-Anfrage, Erwähnung, rote Pipeline …)
  stehen im Popup oben, getrennt durch eine kräftigere Linie.
- **Labels in der Liste:** die Labels des MRs/Issues als kleine Umriss-Chips
  hinter der Zeit, immer genau eine Zeile: was nicht passt, wird als „+N“
  gezählt statt halb abgeschnitten; alle stehen im Tooltip. Gespeichert
  werden höchstens 8 (je 40 Zeichen), damit der Verlauf klein bleibt.
  Meldungen von vor dem Update haben keine.
- **Wichtige Labels:** in den Einstellungen eine Liste (Groß/klein egal, an/aus
  pro Eintrag). Solche Labels stehen an jeder Meldung vorn, sind gefüllt, fett
  und in Akzentfarbe hervorgehoben und fallen beim Kürzen nie zuerst weg.
  Passt eins doch nicht mehr in die Zeile, wird das „+N“ hervorgehoben.
- Popup-Feinschliff nach Design-Review: wichtige Labels mit dunkler Schrift
  (10,8:1 statt 4,1:1); die Glocke ist ein Knopf ohne Füllung in voller
  Deckkraft (vorher 2,5:1, wirkte deaktiviert) und hebt sich so vom
  Prüfen-Knopf ab; ältere Zeiten kurz („12.11., 12:32“), damit Labels Platz
  haben.
- **Echte Zeitpunkte:** Meldungen zeigen, wann es in GitLab passiert ist, nicht
  wann geprüft wurde — nach dem Standby steht der Kommentar von 3 Uhr nicht
  mehr auf „gerade eben“. Ältere mit Uhrzeit, die genaue Zeit im Tooltip.
- **Keine Kommentare mehr verloren:** statt nur der letzten 50 Notizen pro MR
  wird geblättert, bis Bekanntes kommt (höchstens 1000). Nach einer lauten
  Nacht mit vielen Pushes und Label-Änderungen fehlten sonst Kommentare.

## 0.5.1 — 2026-11-13

- **Sicherheit:** Beim Speichern mit leerem Token-Feld wird der alte Token nur
  noch für dieselbe Adresse übernommen. Vorher ging er bei einer neuen oder
  vertippten Adresse an den fremden Server. Beim Wechsel auf eine andere
  Instanz gibt die Erweiterung außerdem den Zugriff auf die alte wieder ab.
- **Sicherheit:** Ein riesiger Kommentar (z. B. 1 MB voller `<`) konnte die
  Text-Bereinigung minutenlang beschäftigen und damit jede Abfrage dauerhaft
  blockieren. Kommentartexte werden jetzt vorher auf 2000 Zeichen gekürzt.
- Kommentare mit `@name.nachname` gelten nicht mehr als Erwähnung von `@name`
  und werden wieder gemeldet, statt lautlos zu verschwinden.
- Popup: Öffnen markiert nur die angezeigten Meldungen als gelesen, „Alle
  entfernen“ löscht nur die angezeigten. Was währenddessen ankommt, bleibt.
- Stand und Verlauf werden in einem Schritt gespeichert. Beendet der Browser
  den Service Worker mitten in der Abfrage, gehen keine Meldungen mehr verloren.
- „Erledigte entfernen“ vergleicht nur noch den Pfad der Links, nicht den
  Host. Es funktioniert jetzt auch, wenn GitLab einen anderen Hostnamen liefert
  als den eingetragenen.

## 0.5.0 — 2026-11-13

- **Erledigte entfernen:** neuer Button im Popup nimmt alle Meldungen zu MRs
  und Issues raus, die inzwischen gemergt oder geschlossen sind. Fragt dafür
  GitLab live nach dem Stand (eine Anfrage pro Projekt, nur lesend), damit nur
  noch Offenes übrig bleibt. Meldungen ohne MR/Issue-Link bleiben stehen.
- Dabei fliegen auch **beantwortete Kommentare** raus: Thread aufgelöst oder
  du hast im Thread danach geantwortet. Bei einem Einzelkommentar ohne Thread
  zählt jede spätere Antwort von dir im selben MR/Issue. Kostet eine Anfrage
  pro offenem MR/Issue mit Kommentar-Meldung.
- Außerdem fliegen „Neuer MR in …“-Meldungen raus, sobald der MR einen
  Reviewer hat — dann kümmert sich schon jemand. Andere Meldungen zu MRs mit
  Reviewer (etwa Kommentare in deinen eigenen) bleiben.
- Gebündelte Meldungen (ein Review mit mehreren Anmerkungen) merken sich alle
  ihre Kommentare und verschwinden erst, wenn jeder davon erledigt ist.
  Meldungen von vor 0.5.0 kennen nur den verlinkten ersten Kommentar.
- **Alternative Bot-Nutzer:** neue Liste in den Einstellungen für Konten, die
  für dich handeln (z. B. ein Bot, der in deinem Namen kommentiert). Von ihnen
  kommen keine Meldungen mehr (Kommentare, To-dos, Merges/Schließen, neue
  MRs), und ihre Antworten zählen bei „Erledigte entfernen“ als deine.
  Eingabe mit oder ohne @, auch als Profil-Link; ohne Häkchen pausiert.
- **Alle öffnen:** öffnet jede Meldung mit Link in einem Hintergrund-Tab,
  einen Tab pro MR/Issue (mit dem Link der neuesten Meldung), älteste zuerst.
  Wie beim Klick auf eine Meldung verschwinden sie danach aus dem Verlauf.
- „Alle öffnen“, „Erledigte entfernen“ und „Alle entfernen“ stehen jetzt in einer eigenen
  Zeile unter der Liste.

## 0.4.1 — 2026-10-30

- **Eine Meldung pro MR/Issue und Abfrage:** Statuswechsel, Kommentare und
  Systemnotizen zum selben MR werden zusammengefasst, z. B. „Merged by Anna ·
  approved by Ben · Anna: Looks good · Ben added 3 commits“. Mehrere Pushes
  werden zusammengezählt. Kommt nur eine Sorte, bleibt die ausführliche Form.
- Freigabe und Merge in derselben Abfrage: die Freigabe geht in der
  Merge-Meldung auf. Freigaben ohne Merge kommen wie bisher.
- Deutsche Texte an GitLabs eigene Begriffe angeglichen: „genehmigt von“,
  „braucht deine Genehmigung“, Benachrichtigungsstufe „Beteiligt“.

## 0.4.0 — 2026-10-30

- **Sprache wählbar:** Englisch oder Deutsch in den Einstellungen, Standard
  folgt der Browsersprache. Gilt für Popup, Einstellungen, Benachrichtigungen
  und Fehlermeldungen; alle Texte stehen in `i18n.js`. Systemnotizen aus
  GitLab („added 1 commit“) bleiben so, wie GitLab sie schreibt.
- README auf Englisch, mit Hinweis auf Installation im Entwicklermodus.
- Social-Preview für GitHub (`.github/social-preview.png`, erzeugt von
  `icons/make.py`).

## 0.3.2 — 2026-10-29

- Popup-Fußzeile: Link **MR-Liste** öffnet die MR-Übersicht in GitLab
  (`/dashboard/merge_requests`).

## 0.3.1 — 2026-10-29

- „Alle entfernen“ räumt wieder sofort ab, ohne Rückfrage.
- Schriftzug „GitLab Real Notify“ in Popup und Einstellungen sowie die
  Fußzeile im Popup („vor 1 Min · @name“, „Alle entfernen“, „Einstellungen“)
  wieder schlank mit 12px; alles andere bleibt ab 14px.

## 0.3.0 — 2026-10-29

- **Neu: Abfrage-Takt einstellbar.** In den Einstellungen „Wie oft prüfen“:
  jede Minute (Standard), alle 2, 5, 10, 15 oder 30 Minuten. Gilt sofort
  nach dem Speichern, ohne dass der Stand verloren geht.
- **Kommentare gebündelt:** Mehrere neue Kommentare im selben MR/Issue (z. B.
  ein abgeschicktes Review) kommen als eine Meldung „Name: 3 neue Kommentare ·
  erster Kommentar“, der Link springt zum ersten. Commits, Freigaben usw.
  bleiben einzeln.
- Die Schwelle für „GitLab nicht erreichbar“ wächst mit dem Takt mit
  (mindestens 5 Minuten, sonst zwei verpasste Abfragen).
- Größere Schrift: kein Text mehr unter 14px in Popup und Einstellungen;
  das Popup ist dafür etwas breiter (380px).
- Design-Überarbeitung:
  - Einstellungen: Eingabefelder mit sichtbarem Rand und Mint-Fokusring,
    Kopf mit „Speichern & prüfen“ bleibt beim Scrollen stehen, Hinweis „Noch
    nicht gespeichert“, kein seitliches Scrollen mehr bei langen Pfaden,
    Branding wie im Popup, Bestätigung in Grün.
  - Popup: ohne Token kein „Noch nichts Neues“, ↻ gesperrt, direkter Link zu
    den Einstellungen; „Alle entfernen“ fragt erst nach; gelesene Titel
    dezenter, ungelesener Punkt kräftiger, deutlicherer Hover, voller Titel
    als Tooltip.
- Keine firmenspezifischen Beispiele mehr; Pfade heißen jetzt z. B.
  `example-group/team`. Neue, neutrale Firefox-Add-on-ID (GUID) — ein
  temporär geladenes Add-on in Firefox einmal neu laden.

## 0.2.0 — 2026-10-29

- **Neu: Bei neuen MRs benachrichtigen.** Gruppen/Projekte eintragen; meldet
  MRs ohne Draft (neu oder auf Ready gesetzt). Labels wie `dependencies`
  ignorierbar, mit Vorschlägen aus GitLab. Einträge einzeln pausierbar,
  Hauptschalter zum Abschalten.
- Kurze Netzaussetzer nach dem Entsperren werden nicht mehr als Fehler
  angezeigt (erst nach 5 Minuten ohne Antwort).
- Neuer Token fürs selbe Konto und geänderte Optionen setzen den Stand nicht
  mehr zurück — nichts geht verloren.
- Eigene Kommentare werden über die ganze Abwesenheit nachgeholt, nicht nur
  2 Tage.
- Verlauf im Popup hält 200 statt 50 Meldungen.

## 0.1.0 — 2026-10-29

Erste Fassung zum Testen:

- Benachrichtigungen wie bei GitLabs „Participate“: Kommentare in deinen
  Threads, Zuweisungen, Review-Anfragen, Todos, gemergt/geschlossen.
- Popup mit Verlauf: Klick öffnet und entfernt, × entfernt, Alle leeren,
  ↻ prüft sofort.
- Texte ohne HTML/Markdown, Git-Branch-Icon, lila während der Abfrage.
- Chrome und Firefox (`python firefox.py`).
