# SOSTAC® coach — connector for claude.ai (phase B0, read-only)

A remote MCP server that lets Claude read a team's SOSTAC® plan by its group code
and coach the team. It **cannot change** the plan. It runs as the Supabase Edge
Function `sostac-coach` in project `earwxoxayapshwgnuxds`, next to the table the
tool already uses (`sostac_plans`). Table, data format and group codes stay as they are.

## Files

| Path | What |
|---|---|
| `supabase/functions/sostac-coach/index.ts` | Entry point on Supabase (database read, HTTP) |
| `supabase/functions/sostac-coach/server.ts` | MCP server: tools `open_plan`, `get_section`, `get_guidance` |
| `supabase/functions/sostac-coach/render.ts` | Turns the stored plan into readable text |
| `supabase/functions/sostac-coach/guidance.ts` | Coaching rules per section and server instructions |
| `supabase/functions/sostac-coach/catalog.ts` | **Generated** list of all fields, labels and hints |
| `connector/build_catalog.py` | Builds `catalog.ts` from `SOSTAC_Strategy_Framework.html` |

After every change to the tool's HTML: `python3 connector/build_catalog.py`, then deploy again.

## Deploy (lecturer)

Supabase CLI, once: `brew install supabase/tap/supabase` and `supabase login`. Then, in this repository:

```bash
supabase functions deploy sostac-coach --project-ref earwxoxayapshwgnuxds --no-verify-jwt --use-api
```

`--no-verify-jwt` is required: claude.ai sends no Supabase login. Do **not** run
`supabase config push`. It would overwrite the project settings.

URL afterwards: `https://earwxoxayapshwgnuxds.supabase.co/functions/v1/sostac-coach`

Remove again: `supabase functions delete sostac-coach --project-ref earwxoxayapshwgnuxds`

## Add it in claude.ai (students and lecturer)

Settings › Connectors › **Add custom connector** › Name `SOSTAC Coach`, URL as above, no further settings.
Then in a chat: *"Open our SOSTAC plan, code group-04, and help me with Persona 1."*
Free plans allow one custom connector.

## Test locally (no Deno needed)

The server code has no Deno-specific parts outside `index.ts`. A Node test calls
the MCP handler directly with a stored plan, without any network.
See the session notes of 22.10.2026. Node ≥ 22 with
`--experimental-strip-types`, packages `@modelcontextprotocol/server@2.3.1`, `zod@4.6.7`, `node-html-parser@9.0.5`.
