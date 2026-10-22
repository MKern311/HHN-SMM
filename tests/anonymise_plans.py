#!/usr/bin/env python3
"""Turn a dump of sostac_plans into anonymous test fixtures.

    python3 tests/anonymise_plans.py <dump.json> tests/fixtures/plans.json

The dump is the JSON of `GET /rest/v1/sostac_plans?select=group_id,data,last_saved`
(it stays local — never commit it). Every text a team typed becomes "T<n>"
(the same text always gets the same number, so a campaign name still matches
across tables); the structure — keys, table markup, row counts, dropdown choices
of the tool itself — stays exactly as stored. That is what the tests need.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOOL = (ROOT / "SOSTAC_Strategy_Framework.html").read_text(encoding="utf-8")

# option texts and values the tool itself offers are not personal data
KEEP = {html.unescape(t).strip() for t in re.findall(r"<option[^>]*>([^<]*)</option>", TOOL)}
KEEP |= {html.unescape(v) for v in re.findall(r'<option[^>]*value="([^"]*)"', TOOL)}
# journey phases come from the tool's script (FUNNEL_MODELS), not from static options
for model in re.findall(r"(?:AIDA|AICPURA): \[([^\]]*)\]", TOOL):
    KEEP |= set(re.findall(r"'([^']+)'", model))
KEEP |= {"", "AIDA", "AICPURA", "Persona 1", "Persona 2", "Both", "Purchase", "Donation",
         "Not Started", "In Progress", "Done", "Weekly", "Bi-weekly", "Monthly"}

mapping = {}


def anon(text):
    t = text.strip()
    if t in KEEP:
        return text
    if t not in mapping:
        mapping[t] = f"T{len(mapping) + 1}"
    return mapping[t]


def anon_markup(s):
    s = re.sub(r'value="([^"]*)"', lambda m: f'value="{anon(html.unescape(m.group(1)))}"' if m.group(1) else m.group(0), s)
    s = re.sub(r"(<textarea[^>]*>)([^<]*)(</textarea>)",
               lambda m: m.group(1) + (anon(html.unescape(m.group(2))) if m.group(2).strip() else m.group(2)) + m.group(3), s)
    s = re.sub(r"(<option[^>]*>)([^<]*)(</option>)",
               lambda m: m.group(1) + html.escape(anon(html.unescape(m.group(2))), quote=False) + m.group(3), s)
    # platform and campaign names typed into card headers are values too (handled above)
    return s


def anon_value(key, v):
    if key == "__meta__" and isinstance(v, dict):
        return {k: v[k] for k in ("app", "version", "tool") if k in v}
    if key.startswith("__table__") and isinstance(v, str):
        return anon_markup(v)
    if key == "__ai_log__":
        return v
    if isinstance(v, str):
        if key.endswith("-pillars"):
            return "|".join(anon(x) for x in v.split("|") if x)
        return anon(v) if v.strip() else v
    return v


def main():
    rows = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    out = []
    for i, r in enumerate(sorted(rows, key=lambda r: r["group_id"])):
        if r["group_id"].startswith("__"):
            continue
        out.append({"group_id": f"plan-{i + 1:02d}", "last_saved": r["last_saved"],
                    "data": {k: anon_value(k, v) for k, v in r["data"].items()}})
    Path(sys.argv[2]).parent.mkdir(parents=True, exist_ok=True)
    Path(sys.argv[2]).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out)} plans anonymised, {len(mapping)} distinct texts replaced")


if __name__ == "__main__":
    main()
