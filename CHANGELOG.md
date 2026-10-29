# Changelog

Version steht in [`manifest.json`](manifest.json). Nach größeren Änderungen
anheben: neue Funktion → Minor (0.**x**.0), nur Fehlerbehebung → Patch
(0.x.**y**). Danach `python firefox.py` neu laufen lassen.

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
