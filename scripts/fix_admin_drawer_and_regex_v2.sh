#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== A) Fix admin/index.js broken regex by forcing the exact line =="
python3 - <<'PY'
from pathlib import Path
p = Path("src/routes/admin/index.js")
s = p.read_text(encoding="utf-8").splitlines()

out = []
fixed = False
for line in s:
    if "viewName.replace(" in line and "admin" in line and "replace" in line:
        # Force the safe regex
        out.append("  const name = viewName.replace(/^admin\\/?/, '');")
        fixed = True
    else:
        out.append(line)

if not fixed:
    # If structure differs, do a raw replace as fallback
    txt = "\n".join(s)
    txt2 = txt.replace("viewName.replace(/^admin\\\\/?/, '')", "viewName.replace(/^admin\\/?/, '')")
    if txt2 == txt:
        raise SystemExit("Could not find/patch the viewName.replace(...) line in src/routes/admin/index.js")
    p.write_text(txt2, encoding="utf-8")
else:
    p.write_text("\n".join(out) + "\n", encoding="utf-8")
print("Patched:", p)
PY

echo "== B) Patch admin_drawer.ejs to eliminate __menuFiltered ReferenceError =="
python3 - <<'PY'
from pathlib import Path
p = Path("src/views/partials/admin_drawer.ejs")
txt = p.read_text(encoding="utf-8")

# If already patched, do nothing
if "__menuFilteredSafe" in txt:
    print("admin_drawer already patched.")
    raise SystemExit(0)

# Only patch if __menuFiltered is referenced
if "__menuFiltered" not in txt:
    print("admin_drawer does not contain __menuFiltered; nothing to patch.")
    raise SystemExit(0)

# Insert a safe variable near the top of the first EJS scriptlet
# Then replace usages of __menuFiltered with __menuFilteredSafe
needle = "<%"
idx = txt.find(needle)
if idx == -1:
    raise SystemExit("admin_drawer.ejs: cannot find opening <% block to patch")

# find end of first scriptlet close %>
end = txt.find("%>", idx)
if end == -1:
    raise SystemExit("admin_drawer.ejs: cannot find end of first <% %> block")

header = txt[idx:end]
rest = txt[end:]

inject = """
  // Safe fallback: some routes/tests don't provide __menuFiltered
  const __menuFilteredSafe =
    (typeof __menuFiltered !== 'undefined' && __menuFiltered) ? __menuFiltered :
    (typeof __menu !== 'undefined' && __menu) ? __menu :
    (typeof menu !== 'undefined' && menu) ? menu : [];
"""

patched_header = header + inject
patched_all = patched_header + rest

patched_all = patched_all.replace("__menuFiltered", "__menuFilteredSafe")

p.write_text(patched_all, encoding="utf-8")
print("Patched:", p)
PY

echo "== C) Verify =="
echo "-- grep __menuFiltered (should be empty) --"
grep -RIn "__menuFiltered" src/views/partials/admin_drawer.ejs || true

echo "-- show the regex line in src/routes/admin/index.js --"
grep -n "viewName.replace" -n src/routes/admin/index.js || true

echo "== D) Run tests =="
npm test --silent || node --test --test-reporter spec

echo "== E) Commit & push =="
git add src/routes/admin/index.js src/views/partials/admin_drawer.ejs
git commit -m "Fix admin drawer __menuFiltered and admin router regex" || true
git push
