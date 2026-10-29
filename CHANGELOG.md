# Changelog

Version steht in [`manifest.json`](manifest.json). Nach größeren Änderungen
anheben: neue Funktion → Minor (0.**x**.0), nur Fehlerbehebung → Patch
(0.x.**y**). Danach `python firefox.py` neu laufen lassen.

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
