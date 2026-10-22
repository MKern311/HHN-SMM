// Turns a stored SOSTAC® plan (the `data` column of sostac_plans) into text
// Claude can read. Read-only: nothing here writes to the plan.
//
// Storage format, as written by the tool (SOSTAC_Strategy_Framework.html):
//   data[<field id>]            plain value of a form field
//   data['__table__' + <id>]    innerHTML of a dynamic table or card list,
//                               with live values copied into value attributes,
//                               textarea text and <option selected>
import { parse } from 'node-html-parser';
import type { HTMLElement } from 'node-html-parser';
import { CATALOG } from './catalog.ts';
import type { FieldItem, Item } from './types.ts';

export type PlanRow = { data: Record<string, unknown>; last_saved: string | null };

type Cell = { text: string; isDefault: boolean };

export const SECTION_KEYS = CATALOG.sections.map((s) => s.key);

/** Same rule as the tool's login: trim, lower case, spaces to dashes. */
export function normaliseCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '-');
}

export function isToolPlan(data: unknown): boolean {
  const meta = (data as { __meta__?: { app?: string } } | null)?.__meta__;
  return !!meta && meta.app === 'sostac-smm-hhn';
}

// "—", "— phase —", "— select —", "— rate —", "— status —": an unanswered dropdown
const UNANSWERED = /^—(\s.*\s—)?$/;
// Columns that carry no content of their own
const SKIP_COLUMNS = new Set(['', '#', 'Student No. (Matrikelnr.)']);

function oneLine(s: string): string {
  return s.replace(/\r?\n+/g, ' / ').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function controlValue(el: HTMLElement): Cell {
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea') return { text: el.text.trim(), isDefault: false };
  if (tag === 'select') {
    const opts = el.querySelectorAll('option');
    let idx = opts.findIndex((o) => o.hasAttribute('selected'));
    if (idx < 0) idx = 0;
    const text = opts[idx] ? opts[idx].text.trim() : '';
    if (UNANSWERED.test(text)) return { text: '', isDefault: false };
    return { text, isDefault: idx === 0 };
  }
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  if (type === 'checkbox') {
    return { text: el.hasAttribute('checked') ? (el.getAttribute('value') || 'yes') : '', isDefault: false };
  }
  if (type === 'hidden' || type === 'file' || type === 'radio') return { text: '', isDefault: false };
  return { text: (el.getAttribute('value') || '').trim(), isDefault: false };
}

function cellValue(td: HTMLElement): Cell {
  const controls = td.querySelectorAll('input, textarea, select');
  if (!controls.length) {
    // the delete button (✕) is no content — in rows saved before a column was added it sits under a data column
    if (td.querySelector('button')) return { text: '', isDefault: false };
    return { text: td.text.trim(), isDefault: false };
  }
  const vals = controls.map(controlValue);
  return {
    text: vals.map((v) => v.text).filter(Boolean).join(', '),
    isDefault: vals.every((v) => v.isDefault || !v.text),
  };
}

/** A row counts only when it holds something other than untouched defaults. */
function hasContent(cells: Cell[]): boolean {
  return cells.some((c) => c.text && !c.isDefault);
}

function directRows(root: HTMLElement): HTMLElement[] {
  return root.querySelectorAll('tr').filter((tr) => !tr.parentNode || (tr.parentNode as HTMLElement).tagName !== 'THEAD');
}

function renderTable(html: string, columns: string[]): { md: string; rows: number } {
  const root = parse(html);
  const keep = columns.map((c, i) => ({ c, i })).filter(({ c }) => !SKIP_COLUMNS.has(c));
  const lines: string[] = [];
  let group = '';
  let rows = 0;
  for (const tr of directRows(root)) {
    if (tr.classList.contains('phase-row-header')) { group = tr.text.trim(); continue; }
    const tds = tr.querySelectorAll('td').filter((td) => td.parentNode === tr);
    const cells = tds.map(cellValue);
    // judge only the content columns: row numbers and the delete button are no answer
    if (!hasContent(keep.map(({ i }) => cells[i]).filter(Boolean))) continue;
    rows++;
    if (group) { lines.push(`| **${oneLine(group)}** |${' |'.repeat(keep.length - 1)}`); group = ''; }
    lines.push('| ' + keep.map(({ i }) => oneLine(cells[i] ? cells[i].text : '')).join(' | ') + ' |');
  }
  if (!rows) return { md: '_(no rows filled in)_', rows: 0 };
  const head = '| ' + keep.map(({ c }) => c).join(' | ') + ' |\n|' + keep.map(() => '---|').join('');
  return { md: head + '\n' + lines.join('\n'), rows };
}

function renderFormRows(box: HTMLElement): string[] {
  const out: string[] = [];
  for (const row of box.querySelectorAll('.form-row')) {
    const label = row.querySelector('.form-label');
    const ctrl = row.querySelector('input, textarea, select');
    if (!label || !ctrl) continue;
    const v = controlValue(ctrl);
    out.push(`- ${label.text.trim()}: ${v.text ? oneLine(v.text) : '_(empty)_'}`);
  }
  return out;
}

function renderPlatformCards(html: string): { md: string; rows: number } {
  const cards = parse(html).querySelectorAll('.plat-card');
  const parts: string[] = [];
  let rows = 0;
  for (const card of cards) {
    const nameEl = card.querySelector('.plat-head input');
    const name = nameEl ? controlValue(nameEl).text : '';
    const body = renderFormRows(card);
    if (body.some((l) => !l.endsWith('_(empty)_'))) rows++;
    const filled = body.filter((l) => !l.endsWith('_(empty)_'));
    parts.push(`**Platform: ${name || '(no name)'}**\n${filled.length ? filled.join('\n') : '_(nothing filled in yet)_'}`);
  }
  return { md: parts.join('\n\n') || '_(no platform cards)_', rows };
}

function renderCampaignCards(html: string): { md: string; rows: number } {
  const cards = parse(html).querySelectorAll('.camp-card');
  const parts: string[] = [];
  let rows = 0;
  for (const card of cards) {
    const nameEl = card.querySelector('.camp-head input');
    const name = nameEl ? controlValue(nameEl).text : '';
    const meta = card.querySelectorAll('.camp-meta label').map((l) => {
      const input = l.querySelector('input');
      const lab = l.childNodes.filter((n) => n.nodeType === 3).map((n) => n.text).join('').trim();
      const v = input ? controlValue(input).text : '';
      return `- ${lab}: ${v ? oneLine(v) : '_(empty)_'}`;
    });
    const table = card.querySelector('table');
    const cols = table ? table.querySelectorAll('thead th').map((th) => th.text.trim()) : [];
    const tbody = table ? table.querySelector('tbody') : null;
    const t = tbody ? renderTable(tbody.innerHTML, cols) : { md: '', rows: 0 };
    if (name || t.rows) rows++;
    parts.push(`**Campaign: ${name || '(no name)'}**\n${meta.join('\n')}\n\n${t.md}`);
  }
  return { md: parts.join('\n\n') || '_(no campaigns)_', rows };
}

function fieldValue(data: Record<string, unknown>, item: FieldItem): string {
  const raw = data[item.id];
  if (raw === undefined || raw === null) return '';
  let v = String(raw).trim();
  if (item.type === 'select' && UNANSWERED.test(v)) v = '';
  if (item.id.endsWith('-pillars')) v = v.split('|').filter(Boolean).join(', ');
  return v;
}

function renderItem(data: Record<string, unknown>, item: Item): { md: string; filled: number; total: number } {
  if (item.kind === 'field') {
    const v = fieldValue(data, item);
    // a setting with a default, not an answer: never counts towards progress
    const counts = item.id !== 'funnel-model';
    const empty = item.placeholder ? `_(empty; placeholder in the tool: "${oneLine(item.placeholder)}")_` : '_(empty)_';
    return { md: `- **${item.label}:** ${v ? oneLine(v) : empty}`, filled: counts && v ? 1 : 0, total: counts ? 1 : 0 };
  }
  const html = data['__table__' + item.id];
  if (typeof html !== 'string' || !html.trim()) {
    return { md: '_(nothing saved yet)_', filled: 0, total: 1 };
  }
  const r = item.kind === 'table'
    ? renderTable(html, item.columns)
    : item.kind === 'platform-cards' ? renderPlatformCards(html) : renderCampaignCards(html);
  return { md: r.md, filled: r.rows ? 1 : 0, total: 1 };
}

export function findSection(key: string) {
  return CATALOG.sections.find((s) => s.key === key);
}

/** One section as Markdown, optionally narrowed to blocks whose title contains `block`. */
export function renderSection(row: PlanRow, key: string, block?: string): string {
  const sec = findSection(key);
  if (!sec) return `Unknown section "${key}". Use one of: ${SECTION_KEYS.join(', ')}.`;
  const data = row.data;
  const want = block ? block.toLowerCase() : '';
  const blocks = sec.blocks.filter((b) => !want || b.title.toLowerCase().includes(want) || b.area.toLowerCase().includes(want));
  if (!blocks.length) {
    return `No block in "${sec.title}" matches "${block}". Blocks: ${sec.blocks.map((b) => b.title).join('; ')}.`;
  }
  const out: string[] = [`# ${sec.title}`];
  if (sec.intro) out.push(sec.intro);
  let area = '';
  for (const b of blocks) {
    if (b.area && b.area !== area) { area = b.area; out.push(`\n## ${area}`); }
    out.push(`\n### ${b.title}`);
    if (b.hint) out.push(`Task in the tool: ${b.hint}`);
    for (const item of b.items) out.push(renderItem(data, item).md);
    if (b.unsaved) {
      out.push(`_Note: ${b.unsaved} field(s) in this block are not stored by the current version of the tool, so they cannot be read here._`);
    }
  }
  return out.join('\n');
}

function countPosts(data: Record<string, unknown>): number {
  const html = data['__table__calendar-table'];
  if (typeof html !== 'string') return 0;
  // the tool counts a post once its row has any typed text (date, platform, hook …)
  return directRows(parse(html))
    .filter((tr) => tr.querySelectorAll('input, textarea').some((el) => controlValue(el).text))
    .length;
}

function memberNames(data: Record<string, unknown>): string[] {
  const html = data['__table__member-table'];
  if (typeof html !== 'string') return [];
  return directRows(parse(html))
    .map((tr) => { const i = tr.querySelector('input'); return i ? controlValue(i).text : ''; })
    .filter(Boolean);
}

function fmtTime(iso: string | null): string {
  if (!iso) return 'unknown';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin',
    }).format(new Date(iso));
  } catch { return iso; }
}

/** Short status of the whole plan: who, what, how far. */
export function renderOverview(code: string, row: PlanRow): string {
  const d = row.data;
  const str = (id: string) => (d[id] === undefined || d[id] === null ? '' : String(d[id]).trim());
  const out: string[] = [
    `# SOSTAC® plan "${code}"`,
    `- Team: ${str('reg-group') || '_(not entered)_'}`,
    `- Organisation: ${str('brief-brand') || '_(not entered)_'}`,
    `- Campaign: ${str('brief-campaign') || '_(not entered)_'}`,
    `- Members: ${memberNames(d).join(', ') || '_(none registered)_'}`,
    `- Last saved: ${fmtTime(row.last_saved)} (Berlin time)`,
    `- Posts planned in the content calendar: ${countPosts(d)} of at least 20`,
    '',
    '| Section (key) | Filled | Blocks still empty |',
    '|---|---|---|',
  ];
  for (const sec of CATALOG.sections) {
    let filled = 0, total = 0;
    const emptyBlocks: string[] = [];
    for (const b of sec.blocks) {
      let bf = 0;
      for (const item of b.items) {
        const r = renderItem(d, item);
        filled += r.filled; total += r.total; bf += r.filled;
      }
      if (!bf) emptyBlocks.push(b.title);
    }
    const pct = total ? Math.round((filled / total) * 100) : 0;
    out.push(`| ${sec.title} (\`${sec.key}\`) | ${pct} % | ${emptyBlocks.join('; ') || '—'} |`);
  }
  out.push('', 'Read a section with `get_section`, and its task and criteria with `get_guidance`.');
  return out.join('\n');
}
