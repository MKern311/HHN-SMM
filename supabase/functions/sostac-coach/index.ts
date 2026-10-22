// SOSTAC® coach — remote MCP server for claude.ai custom connectors (read-only).
// Deploy:  supabase functions deploy sostac-coach --no-verify-jwt --project-ref earwxoxayapshwgnuxds
// URL:     https://earwxoxayapshwgnuxds.supabase.co/functions/v1/sostac-coach
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildServer } from './server.ts';
import type { PlanRow } from './render.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? 'https://earwxoxayapshwgnuxds.supabase.co';
// The tool's publishable key: public by design (it sits in the tool's HTML).
// This function only ever reads with it.
const PUBLISHABLE_KEY = 'sb_publishable_dVGG0SMGTs08ct5R1jPaPA_bjPMRlin';

async function loadPlan(code: string): Promise<PlanRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sostac_plans?group_id=eq.${encodeURIComponent(code)}&select=data,last_saved`,
    { headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` } },
  );
  if (!res.ok) throw new Error(`database HTTP ${res.status}`);
  const rows = await res.json() as PlanRow[];
  return rows.length ? rows[0] : null;
}

const handler = createMcpHandler(() => buildServer(loadPlan), {
  onerror: (e) => console.error('mcp', e.message),
});

Deno.serve((req) => handler.fetch(req));
