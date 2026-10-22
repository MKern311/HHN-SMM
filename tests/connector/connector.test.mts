// Connector tests without network: the MCP handler is called directly, the
// database is an in-memory row. Run: npm run test:connector
import { readFileSync, writeFileSync } from 'node:fs';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { buildServer } from '../../supabase/functions/sostac-coach/server.ts';
import { writeCalendarPosts } from '../../supabase/functions/sostac-coach/write.ts';

const plans = JSON.parse(readFileSync(new URL('../fixtures/plans.json', import.meta.url), 'utf8'));
const full = plans.reduce((a: any, p: any) => (Object.keys(p.data).length > Object.keys(a.data).length ? p : a));
let failed = 0;
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${ok ? '' : '  ' + detail}`); if (!ok) failed++; };

let row: any = { data: JSON.parse(JSON.stringify(full.data)), last_saved: '2026-10-22T10:00:00.000+00:00' };
let interfere = 0;
const load = async (c: string) => (c === 'g' ? JSON.parse(JSON.stringify(row)) : null);
const patch = async (_c: string, data: any, expected: string | null, stamp: string) => {
  if (interfere > 0) { interfere--; row.last_saved = new Date(Date.now() + 999).toISOString(); row.data['p2-name'] = 'mate'; return false; }
  if (expected !== row.last_saved) return false;
  row = { data, last_saved: stamp }; return true;
};
const h = createMcpHandler(() => buildServer(load, patch));
async function rpc(method: string, params: any = {}) {
  const r = await h.fetch(new Request('http://x/', { method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));
  const t = await r.text(); const l = t.split('\n').find((x) => x.startsWith('data:'));
  return JSON.parse(l ? l.slice(5) : t);
}
const call = async (name: string, args: any) => { const j = await rpc('tools/call', { name, arguments: args }); return { err: !!j.result?.isError, text: j.result?.content?.[0]?.text ?? JSON.stringify(j) }; };

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
check('initialize returns instructions', !!init.result?.instructions);
const names = (await rpc('tools/list')).result.tools.map((t: any) => t.name).sort().join(',');
check('five tools', names === 'add_calendar_posts,get_guidance,get_section,open_plan,update_fields', names);

const ov = await call('open_plan', { code: ' G ' });
check('open_plan normalises the code and reads the plan', ov.text.includes('# SOSTAC® plan "g"'), ov.text.slice(0, 80));
check('unknown code is reported', (await call('open_plan', { code: 'nope' })).text.startsWith('No plan found'));
for (const s of ['overview', 'situation', 'objectives', 'strategy', 'tactics', 'action', 'control', 'architecture', 'notes']) {
  const r = await call('get_section', { code: 'g', section: s });
  check(`get_section ${s}`, !r.err && r.text.startsWith('# '), r.text.slice(0, 80));
}
check('student numbers are never shown', !(await call('get_section', { code: 'g', section: 'overview' })).text.includes('Matrikelnr'));
check('get_guidance', (await call('get_guidance', { section: 'strategy' })).text.includes('Criteria'));

row.data['p1-goals'] = ''; row.data['p1-pain'] = 'team text';
const w1 = await call('update_fields', { code: 'g', fields: { 'p1-goals': 'Help locally', 'p1-pain': 'replace?', 'reg-group': 'x' } });
check('writes an empty field', row.data['p1-goals'] === 'Help locally');
check('keeps a field the team filled', row.data['p1-pain'] === 'team text' && w1.text.includes('Not written'));
check('rejects the cover sheet', w1.text.includes('reg-group'));
await call('update_fields', { code: 'g', fields: { 'p1-pain': 'replaced' }, overwrite: true });
check('overwrites only when asked', row.data['p1-pain'] === 'replaced');
interfere = 2;
await call('update_fields', { code: 'g', fields: { 'p1-hook': 'A face' } });
check('retries when the plan changed meanwhile, keeps the other change', row.data['p1-hook'] === 'A face' && row.data['p2-name'] === 'mate');
check('every write is logged', Array.isArray(row.data.__ai_log__) && row.data.__ai_log__.length === 3);

const before = (String(row.data['__table__calendar-table'] || '').match(/<tr/g) || []).length;
const p = await call('add_calendar_posts', { code: 'g', posts: [
  { date: '02.12.', platform: 'Instagram', format: 'Reel', persona: 'Persona 1', hook: 'What does 20 € buy? "Quotes" & <tags>' },
  { date: '04.12.', platform: 'TikTok', hook: 'Second post' }] });
const cal = String(row.data['__table__calendar-table']);
check('calendar posts are added', !p.err && cal.includes('02.12.') && cal.includes('Second post'), p.text);
check('calendar text is escaped', cal.includes('&quot;Quotes&quot; &amp; &lt;tags&gt;'));
check('empty rows are used first', (cal.match(/<tr/g) || []).length === Math.max(before, 2));
const many = Array.from({ length: 10 }, (_, i) => ({ date: `1${i}.12.`, platform: 'Instagram', hook: 'Post ' + i }));
await writeCalendarPosts(load, patch, 'g', many as any); await writeCalendarPosts(load, patch, 'g', many as any);
check('rows are added when the calendar is full', (String(row.data['__table__calendar-table']).match(/<tr/g) || []).length >= 22);
// the tool loads this plan in runner.html (v10 suite)
writeFileSync(new URL('../fixtures/calendar_from_connector.json', import.meta.url), JSON.stringify(row.data));

console.log(failed ? `\n${failed} FAILED` : '\nall connector tests passed');
process.exit(failed ? 1 : 0);
