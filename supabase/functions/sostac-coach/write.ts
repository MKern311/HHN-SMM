// Phase B1: Claude writes single text fields into a plan — only when the
// student asks for it. Every other key of the plan stays untouched, the write
// is conditional on last_saved (like the tool's own saves), and each write is
// logged in the plan under __ai_log__ so the team can label AI support.
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
