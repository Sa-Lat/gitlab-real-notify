// GitLab Real Notify – Texte der Oberfläche, Englisch und Deutsch.
// Geteilt von Service Worker, Popup und Einstellungen (klassisches Script,
// keine Module). Sprache: settings.lang = "auto" | "en" | "de"; „auto“ folgt
// der Browsersprache.

const I18N = {
  en: {
    // Benachrichtigungen (background.js)
    "todo.assigned": "assigned you",
    "todo.mentioned": "mentioned you",
    "todo.directly_addressed": "addressed you directly",
    "todo.review_requested": "requested your review",
    "todo.review_submitted": "submitted a review",
    "todo.approval_required": "needs your approval",
    "todo.build_failed": "pipeline failed",
    "todo.unmergeable": "can no longer be merged",
    "todo.merge_train_removed": "was removed from the merge train",
    "todo.member_access_requested": "requested access",
    "todo.marked": "added a todo for you",
    comments: "{n} new comments",
    merged: "Merged",
    closed: "Closed",
    reopened: "Reopened",
    by: " by {name}",
    approvedBy: " · approved by {names}",
    addedCommits: "{name} added {n} commits",
    newMr: "New MR in {path}",
    burst: "{n} new events in GitLab",
    err401: "Token invalid or expired. Please enter a new one in the settings.",
    err403: "No access. The token needs the read_api scope.",
    err429: "GitLab is rate limiting (too many requests). Retrying shortly.",
    errNet: "GitLab unreachable: {msg}",
    noSetup: "No GitLab URL or token set yet.",

    // Popup
    checkNow: "Check now",
    nothingNew: "Nothing new yet",
    clearAll: "Clear all",
    mrList: "MR list",
    settings: "Settings",
    remove: "Remove",
    removeNotification: "Remove notification: {title}",
    noToken: "No token set yet.",
    openSettings: "Open settings",
    justNow: "just now",
    minAgo: "{n} min ago",
    hAgo: "{n} h ago",

    // Einstellungen
    pageTitle: "GitLab Real Notify · Settings",
    lede: "Notifications like GitLab’s “Participate”, right in your browser",
    save: "Save & check",
    urlLabel: "GitLab URL",
    tokenLabel: "Personal access token",
    tokenHint1: "From your own account; the ",
    tokenHint2: " scope is enough — the extension only reads.",
    tokenLink: "Create a token in GitLab",
    tokenHint3: "It stays local in this browser.",
    tokenSaved: "saved – leave empty to keep",
    intervalLabel: "Check interval",
    intervalHint: "Notifications arrive at most this fast. Less often means fewer requests to GitLab; the refresh button in the popup checks right away at any time.",
    everyMinute: "every minute",
    everyN: "every {n} minutes",
    langLabel: "Language",
    langAuto: "Browser language",
    mrHead: "Notify about new MRs",
    mrHint: "Reports non-draft MRs in these groups and projects — newly created or marked as ready. Your own and those you review are reported anyway.",
    nsLabel: "Groups and projects",
    nsPlaceholder: "e.g. example-group/team",
    nsHint: "Path or link from GitLab. Groups include subgroups. Unchecked: paused.",
    add: "Add",
    lblLabel: "Ignore labels",
    lblPlaceholder: "e.g. dependencies",
    lblHint: "MRs with any of these labels are not reported, e.g. Renovate MRs labeled “dependencies”.",
    removeItem: "Remove {name}",
    group: "Group",
    project: "Project",
    notFound: "not found",
    notSaved: "Not saved yet — click “Save & check” at the top.",
    connectedAs: "Connected as @{user}",
    connectedNow: "Connected as @{user}. Checking {interval} from now on.",
    missing: " Not found: {list} — typo or no access?",
    urlInvalid: "The URL must start with https://, e.g. https://gitlab.example.com.",
    noAccess: "Without access to {url} the extension cannot check anything.",
    checking: "Checking the connection …",
    unknownError: "Unknown error."
  },
  de: {
    "todo.assigned": "hat dich zugewiesen",
    "todo.mentioned": "hat dich erwähnt",
    "todo.directly_addressed": "spricht dich direkt an",
    "todo.review_requested": "bittet um dein Review",
    "todo.review_submitted": "hat ein Review abgegeben",
    "todo.approval_required": "braucht deine Genehmigung",
    "todo.build_failed": "Pipeline fehlgeschlagen",
    "todo.unmergeable": "lässt sich nicht mehr mergen",
    "todo.merge_train_removed": "wurde aus dem Merge Train genommen",
    "todo.member_access_requested": "bittet um Zugriff",
    "todo.marked": "hat ein Todo für dich angelegt",
    comments: "{n} neue Kommentare",
    merged: "Gemergt",
    closed: "Geschlossen",
    reopened: "Wieder geöffnet",
    by: " von {name}",
    approvedBy: " · genehmigt von {names}",
    addedCommits: "{name} hat {n} Commits hinzugefügt",
    newMr: "Neuer MR in {path}",
    burst: "{n} neue Ereignisse in GitLab",
    err401: "Token ungültig oder abgelaufen. Bitte in den Einstellungen neu eintragen.",
    err403: "Kein Zugriff. Der Token braucht den Bereich read_api.",
    err429: "GitLab bremst gerade (zu viele Anfragen). Neuer Versuch gleich.",
    errNet: "GitLab nicht erreichbar: {msg}",
    noSetup: "Noch keine GitLab-Adresse oder kein Token eingetragen.",

    checkNow: "Jetzt prüfen",
    nothingNew: "Noch nichts Neues",
    clearAll: "Alle entfernen",
    mrList: "MR-Liste",
    settings: "Einstellungen",
    remove: "Entfernen",
    removeNotification: "Meldung entfernen: {title}",
    noToken: "Noch kein Token eingetragen.",
    openSettings: "Einstellungen öffnen",
    justNow: "gerade eben",
    minAgo: "vor {n} Min",
    hAgo: "vor {n} Std",

    pageTitle: "GitLab Real Notify · Einstellungen",
    lede: "Benachrichtigungen wie bei „Beteiligt“, nur im Browser",
    save: "Speichern & prüfen",
    urlLabel: "GitLab-Adresse",
    tokenLabel: "Persönlicher Zugriffstoken",
    tokenHint1: "Aus deinem eigenen Konto, Bereich ",
    tokenHint2: " genügt — die Erweiterung liest nur.",
    tokenLink: "Token in GitLab anlegen",
    tokenHint3: "Er bleibt lokal in diesem Browser.",
    tokenSaved: "gespeichert – leer lassen zum Behalten",
    intervalLabel: "Wie oft prüfen",
    intervalHint: "So schnell kommen Meldungen höchstens. Seltener heißt weniger Anfragen an GitLab; der Aktualisieren-Knopf im Popup prüft jederzeit sofort.",
    everyMinute: "jede Minute",
    everyN: "alle {n} Minuten",
    langLabel: "Sprache",
    langAuto: "Browsersprache",
    mrHead: "Bei neuen MRs benachrichtigen",
    mrHint: "Meldet MRs ohne Draft in diesen Gruppen und Projekten — neu angelegt oder auf Ready gesetzt. Deine eigenen und solche, in denen du Reviewer bist, kommen ohnehin.",
    nsLabel: "Gruppen und Projekte",
    nsPlaceholder: "z. B. example-group/team",
    nsHint: "Pfad oder Link aus GitLab. Gruppen schließen Untergruppen ein. Ohne Häkchen: pausiert.",
    add: "Hinzufügen",
    lblLabel: "Labels ignorieren",
    lblPlaceholder: "z. B. dependencies",
    lblHint: "MRs mit einem dieser Labels werden nicht gemeldet, etwa Renovate-MRs mit „dependencies“.",
    removeItem: "{name} entfernen",
    group: "Gruppe",
    project: "Projekt",
    notFound: "nicht gefunden",
    notSaved: "Noch nicht gespeichert — oben auf „Speichern & prüfen“ klicken.",
    connectedAs: "Verbunden als @{user}",
    connectedNow: "Verbunden als @{user}. Ab jetzt wird {interval} geprüft.",
    missing: " Nicht gefunden: {list} — Tippfehler oder kein Zugriff?",
    urlInvalid: "Die Adresse muss mit https:// beginnen, etwa https://gitlab.example.com.",
    noAccess: "Ohne Zugriff auf {url} kann die Erweiterung nichts abfragen.",
    checking: "Prüfe die Verbindung …",
    unknownError: "Unbekannter Fehler."
  }
};

// „auto“ (oder nichts) -> Browsersprache, sonst die gewählte; unbekannt -> Englisch.
function langOf(setting) {
  const l = setting === "en" || setting === "de" ? setting
    : String((typeof navigator !== "undefined" && navigator.language) || "en").slice(0, 2).toLowerCase();
  return I18N[l] ? l : "en";
}

// Fehlt ein Text in einer Sprache, gilt der englische — nie ein leeres Feld.
function tr(lang, key, vars) {
  const s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
}

// Statische Texte im HTML: data-i18n (Text), data-i18n-placeholder, -title, -aria.
function applyI18n(lang) {
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = tr(lang, el.dataset.i18n);
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) el.placeholder = tr(lang, el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll("[data-i18n-title]")) el.title = tr(lang, el.dataset.i18nTitle);
  for (const el of document.querySelectorAll("[data-i18n-aria]")) el.setAttribute("aria-label", tr(lang, el.dataset.i18nAria));
}
