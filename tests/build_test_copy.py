#!/usr/bin/env python3
"""Build tests/build/tool.html: the tool wired to the fake PostgREST (no network).

    python3 tests/build_test_copy.py
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
s = (ROOT / "SOSTAC_Strategy_Framework.html").read_text(encoding="utf-8")
fake = (ROOT / "tests" / "fake_postgrest.js").read_text(encoding="utf-8")
anchor = "<script>\n// ─── TAB NAVIGATION"
assert anchor in s, "script anchor not found"
s = s.replace(anchor, "<script>\n" + fake + "\n</script>\n" + anchor, 1)
url = "const SUPABASE_URL = 'https://earwxoxayapshwgnuxds.supabase.co'"
assert url in s, "SUPABASE_URL not found"
s = s.replace(url, "const SUPABASE_URL = 'https://fake.invalid'")
out = ROOT / "tests" / "build" / "tool.html"
out.parent.mkdir(exist_ok=True)
out.write_text(s, encoding="utf-8")
print(f"wrote {out.relative_to(ROOT)}")
