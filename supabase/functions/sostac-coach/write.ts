// Phase B1: Claude writes single text fields into a plan — only when the
// student asks for it. Every other key of the plan stays untouched, the write
// is conditional on last_saved (like the tool's own saves), and each write is
// logged in the plan under __ai_log__ so the team can label AI support.
import { parse } from 'node-html-parser';
import { CATALOG } from './catalog.ts';
import type { FieldItem } from './types.ts';
import type { PlanRow } from './render.ts';

export type PatchPlan = (code: string, data: Record<string, unknown>, expected: string | null, stamp: string) => Promise<boolean>;
export type LoadPlan = (code: string) => Promise<PlanRow | null>;

const WRITABLE: Map<string, { label: string; section: string }> = new Map();
for (const sec of CATALOG.sections) {
  for (const b of sec.blocks) {
    for (const it of b.items) {
      if (it.kind !== 'field') continue;
      const f = it as FieldItem;
      // free text only; settings, dropdowns and the cover sheet stay with the students
      if (!['text', 'textarea'].includes(f.type) || sec.key === 'overview' || f.id === 'groupIdInput') continue;
      WRITABLE.set(f.id, { label: f.label, section: sec.key });
    }
  }
}
export const WRITABLE_IDS = [...WRITABLE.keys()];
export const MAX_LEN = 3000;
const LOG_MAX = 200;

export type WriteResult = { written: string[]; kept: string[]; rejected: string[]; error?: string };

export async function writeFields(
  load: LoadPlan, patch: PatchPlan, code: string, fields: Record<string, string>, overwrite: boolean, now: () => Date = () => new Date(),
): Promise<WriteResult> {
  const result: WriteResult = { written: [], kept: [], rejected: [] };
  const wanted = Object.entries(fields).filter(([id, v]) => {
    if (!WRITABLE.has(id) || typeof v !== 'string' || v.length > MAX_LEN) { result.rejected.push(id); return false; }
    return true;
  });
  if (!wanted.length) return result;
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await load(code);
    if (!row) return { ...result, error: 'no plan under this code' };
    const data = { ...row.data };
    const meta = (data.__meta__ && typeof data.__meta__ === 'object') ? { ...(data.__meta__ as Record<string, unknown>) } : {};
    if (meta.app !== 'sostac-smm-hhn') return { ...result, error: 'plan saved by an older tool version' };
    const written: string[] = [], kept: string[] = [];
    for (const [id, v] of wanted) {
      const cur = data[id] === undefined || data[id] === null ? '' : String(data[id]).trim();
      if (cur && !overwrite && cur !== v.trim()) { kept.push(id); continue; }
      data[id] = v;
      written.push(id);
    }
    if (!written.length) return { ...result, kept };
    const stamp = now().toISOString();
    const log = Array.isArray(data.__ai_log__) ? [...(data.__ai_log__ as unknown[])] : [];
    log.push({ at: stamp, by: 'SOSTAC Coach (Claude)', fields: written });
    data.__ai_log__ = log.slice(-LOG_MAX);
    data.__meta__ = { ...meta, saved: stamp, editor: 'SOSTAC Coach (Claude)' };
    if (await patch(code, data, row.last_saved, stamp)) return { ...result, written, kept };
    // somebody saved in between: read again and retry
  }
  return { ...result, error: 'the plan kept changing while writing — try again in a moment' };
}

export function fieldLabel(id: string): string {
  const f = WRITABLE.get(id);
  return f ? `${f.label} (${f.section})` : id;
}

// ── Content calendar (phase B3): posts go into the first empty rows, then new rows ──

export type Post = {
  date: string; platform: string; format?: string; pillar?: string; campaign?: string;
  persona?: string; hook: string; visual?: string;
};
const PERSONAS = ['Persona 1', 'Persona 2', 'Both'];
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** A calendar row exactly as the tool builds it (v10), with the values filled in. */
export function calendarRowHTML(p: Post, rid: string): string {
  const v = (x?: string) => esc((x || '').slice(0, 500));
  const camp = (p.campaign || '').trim();
  const per = PERSONAS.includes((p.persona || '').trim()) ? (p.persona || '').trim() : '';
  return `<tr data-rid="${esc(rid)}">
      <td class="cal-num"></td>
      <td><input autocomplete="off" type="text" placeholder="dd.mm." value="${v(p.date)}"></td>
      <td><select autocomplete="off" class="campaign-select"><option value=""${camp ? '' : ' selected=""'}>—</option>${camp ? `<option value="${v(camp)}" selected="">${v(camp)}</option>` : ''}</select></td>
      <td><input autocomplete="off" type="text" placeholder="e.g. Instagram" value="${v(p.platform)}"></td>
      <td><input autocomplete="off" type="text" placeholder="e.g. Reel" value="${v(p.format)}"></td>
      <td><input autocomplete="off" type="text" placeholder="Pillar" list="dl-pillars" value="${v(p.pillar)}"></td>
      <td><select autocomplete="off" class="persona-select"><option value=""${per ? '' : ' selected=""'}>—</option>${PERSONAS.map((x) => `<option value="${x}"${x === per ? ' selected=""' : ''}>${x}</option>`).join('')}</select></td>
      <td><textarea autocomplete="off" placeholder="First line that stops the scroll">${esc((p.hook || '').slice(0, 1000))}</textarea></td>
      <td><textarea autocomplete="off" placeholder="Visual / asset">${esc((p.visual || '').slice(0, 1000))}</textarea></td>
      <td><button class="del-btn" onclick="delRow(this)" aria-label="Remove">&#10005;</button></td>
    </tr>`;
}

function rowIsEmpty(tr: ReturnType<typeof parse>): boolean {
  if (tr.querySelectorAll('input').some((i) => (i.getAttribute('value') || '').trim())) return false;
  if (tr.querySelectorAll('textarea').some((t) => t.text.trim())) return false;
  return !tr.querySelectorAll('select').some((s) => {
    const opts = s.querySelectorAll('option');
    const i = opts.findIndex((o) => o.hasAttribute('selected'));
    return i > 0;
  });
}

/** Fill the first empty calendar rows with the posts; add rows when none are left. */
export function addPostsToCalendar(html: string, posts: Post[], newId: () => string): string {
  const rows = parse(html || '').childNodes.filter((n) => (n as { tagName?: string }).tagName === 'TR') as ReturnType<typeof parse>[];
  const out = rows.map((r) => r.toString());
  let next = 0;
  for (let i = 0; i < rows.length && next < posts.length; i++) {
    if (!rowIsEmpty(rows[i])) continue;
    out[i] = calendarRowHTML(posts[next++], rows[i].getAttribute('data-rid') || newId());
  }
  while (next < posts.length) out.push(calendarRowHTML(posts[next++], newId()));
  return out.join('');
}

export async function writeCalendarPosts(
  load: LoadPlan, patch: PatchPlan, code: string, posts: Post[], now: () => Date = () => new Date(),
): Promise<{ added: number; error?: string }> {
  const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await load(code);
    if (!row) return { added: 0, error: 'no plan under this code' };
    const data = { ...row.data };
    const meta = (data.__meta__ && typeof data.__meta__ === 'object') ? { ...(data.__meta__ as Record<string, unknown>) } : {};
    if (meta.app !== 'sostac-smm-hhn') return { added: 0, error: 'plan saved by an older tool version' };
    const key = '__table__calendar-table';
    data[key] = addPostsToCalendar(typeof data[key] === 'string' ? data[key] as string : '', posts, newId);
    const stamp = now().toISOString();
    const log = Array.isArray(data.__ai_log__) ? [...(data.__ai_log__ as unknown[])] : [];
    log.push({ at: stamp, by: 'SOSTAC Coach (Claude)', fields: [key], posts: posts.length });
    data.__ai_log__ = log.slice(-LOG_MAX);
    data.__meta__ = { ...meta, saved: stamp, editor: 'SOSTAC Coach (Claude)' };
    if (await patch(code, data, row.last_saved, stamp)) return { added: posts.length };
  }
  return { added: 0, error: 'the plan kept changing while writing — try again in a moment' };
}
