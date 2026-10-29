# Baut dist/firefox/: dieselben Dateien wie die Chrome-Extension, nur das
# Manifest bekommt, was Firefox braucht. Firefox kann bei MV3 keinen Service
# Worker (also background.scripts) und will zum Signieren eine feste ID —
# beides würde in Chrome eine Warnung auslösen, deshalb nur hier.
#
#   python firefox.py

import json
import pathlib
import shutil

root = pathlib.Path(__file__).resolve().parent
out = root / "dist" / "firefox"

shutil.rmtree(out, ignore_errors=True)
shutil.copytree(root, out, ignore=shutil.ignore_patterns(
    "dist", "tests", ".claude", ".git", ".gitignore", "*.py", "*.md"))

manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
manifest["background"] = {"scripts": ["background.js"]}
manifest["browser_specific_settings"] = {
    "gecko": {"id": "gitlab-real-notify@queo.de", "strict_min_version": "128.0"}
}
(out / "manifest.json").write_text(
    json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

print("Firefox-Fassung in", out)
