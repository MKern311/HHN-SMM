# Tests for the SOSTAC® tool and the SOSTAC Coach connector

Run them before every change goes to `main` (GitHub Pages publishes `main` immediately).
Nothing here touches the real database.

## 1. Tool (browser)

```bash
python3 tests/build_test_copy.py      # tool wired to the fake database -> tests/build/tool.html
python3 -m http.server 8765           # in the repository root
```

Open `http://127.0.0.1:8765/tests/runner.html` and press **Run all tests** (about 6 minutes).

| Suite | What it checks |
|---|---|
| Saving (v8) | tools and architecture saved, delete saved and undo, slow network without self-conflict, "Save now", unsent edits sent at the next login, unknown keys kept, keepalive limit, print guard, quiet update, double Enter |
| Merge, links, content (v9) | merge without asking, dialog for the same field and the same table row, "take theirs / keep mine", editor saved, take over sketch, fill architecture, platform KPIs, suggestions, SMART → KPI, progress and completion, objectives echo, old fields, "Purchase" → "Donation", markup sanitised, no write on login |
| Rows, connector posts, hints (v10) | row ids, row-level merge (different rows / same row / delete and add), posts written by the connector load, long hints, `#code=` prefill |
| Round trip | every plan in `fixtures/plans.json` loads, is collected again and means the same, with no write on login |

## 2. Connector (Node ≥ 22)

```bash
npm install
npm run test:connector    # MCP tools, writing rules, calendar posts; refreshes fixtures/calendar_from_connector.json
npm run typecheck
```

## Fixtures

`fixtures/plans.json` holds the stored plans with every typed text replaced by `T<n>`
(structure, keys and dropdown choices unchanged). Refresh it from a local dump —
never commit the dump itself:

```bash
python3 tests/anonymise_plans.py <dump.json> tests/fixtures/plans.json
```

`fake_postgrest.js` imitates the parts of PostgREST the tool uses: conditional PATCH on
`last_saved`, 409 on a duplicate insert, upsert, plus delay and offline switches
(`__fake.cfg({delay, offline})`).
