# SOSTAC® coach — connector for claude.ai, lecturer overview, SQL

## Connector (MCP server)

A remote MCP server that lets Claude read a team's SOSTAC® plan by its group code
and coach the team. Since 0.2.0 (phase B1) it can also write text into single
fields, but only when a student asks for it. It runs as the Supabase Edge
Function `sostac-coach` in project `earwxoxayapshwgnuxds`, next to the table the
tool already uses (`sostac_plans`). Table, data format and group codes stay as they are.

| Tool | What it does |
|---|---|
| `open_plan(code)` | Overview: team, organisation, members, last save, posts, fill state per section |
| `get_section(code, section, block?)` | One section with labels, task texts, field ids and entries |
| `get_guidance(section)` | What the section asks for, what it builds on, criteria, coaching questions |
| `update_fields(code, {id: text}, overwrite?)` | Writes free-text fields (no tables, no dropdowns, no cover sheet). Keeps existing text unless `overwrite`. Conditional write with retry; logged in the plan under `__ai_log__`, shown in the tool under Situation › Our Approach. |

Writing needs tool v9 or later in the students' browsers: v9 merges a write by
Claude with unsaved edits in an open tab, older versions would show a conflict.

### Files

| Path | What |
|---|---|
| `supabase/functions/sostac-coach/index.ts` | Entry point on Supabase (database read and conditional write, HTTP) |
| `supabase/functions/sostac-coach/server.ts` | MCP server and its tools |
| `supabase/functions/sostac-coach/render.ts` | Turns the stored plan into readable text |
| `supabase/functions/sostac-coach/write.ts` | Field writes for `update_fields` |
| `supabase/functions/sostac-coach/guidance.ts` | Coaching rules per section and server instructions |
| `supabase/functions/sostac-coach/catalog.ts` | **Generated** list of all fields, labels and hints |
| `connector/build_catalog.py` | Builds `catalog.ts` and `dozent-catalog.js` from `SOSTAC_Strategy_Framework.html` |
| `connector/add_claude_button.py` | Source of the B0 test copy in `beta/`; the button is part of the tool since v8 |

After every change to the tool's HTML: `python3 connector/build_catalog.py`, then deploy again.

### Deploy (lecturer)

Supabase CLI, once: `brew install supabase/tap/supabase` and `supabase login`. Then, in this repository:

```bash
supabase functions deploy sostac-coach --project-ref earwxoxayapshwgnuxds --no-verify-jwt --use-api
```

`--no-verify-jwt` is required: claude.ai sends no Supabase login. Do **not** run
`supabase config push`, which would overwrite the project settings.

URL: `https://earwxoxayapshwgnuxds.supabase.co/functions/v1/sostac-coach`
Remove: `supabase functions delete sostac-coach --project-ref earwxoxayapshwgnuxds`

### Add it in claude.ai (students and lecturer)

Settings › Connectors › **Add custom connector** › Name `SOSTAC Coach`, URL as above, nothing else.
In the tool, the button "Discuss with Claude" opens a chat with the right first message.
Free plans allow one custom connector.

## Lecturer overview

`dozent.html` (next to the tool on GitHub Pages) lists every plan with team,
organisation, members, last save, tool version, posts and filled blocks per phase,
and shows which blocks of a group are still empty. Read only; test codes
(`zz-…`, `__…`) are hidden unless ticked.

## SQL (run by the lecturer in the Supabase SQL editor)

| File | What |
|---|---|
| `connector/sql/01_history.sql` | Version history of every plan (trigger, students have no access) — before any rollout |
| `connector/sql/02_hardening.sql` | Revokes rights the API never uses; group codes can no longer be renamed |

Both change nothing for the tool or the connector and contain their rollback.
