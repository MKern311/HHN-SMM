// MCP server of the SOSTAC® coach connector (read-only, phase B0).
// Kept free of runtime specifics so it runs on Supabase Edge (Deno) and in the
// local Node test alike; index.ts supplies the database access.
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { CATALOG } from './catalog.ts';
import { GUIDANCE, SERVER_INSTRUCTIONS } from './guidance.ts';
import {
  isToolPlan, normaliseCode, renderOverview, renderSection, SECTION_KEYS, findSection,
} from './render.ts';
import type { PlanRow } from './render.ts';
import { fieldLabel, MAX_LEN, writeCalendarPosts, writeFields } from './write.ts';
import type { PatchPlan } from './write.ts';

export type LoadPlan = (code: string) => Promise<PlanRow | null>;

export const VERSION = '0.3.0';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const sectionEnum = z.enum(SECTION_KEYS as [string, ...string[]]);

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] };
}

async function withPlan(loadPlan: LoadPlan, rawCode: string, fn: (code: string, row: PlanRow) => string) {
  const code = normaliseCode(rawCode);
  if (!code) return text('Please give the group code of your plan (the code you use to open the SOSTAC® tool).');
  let row: PlanRow | null;
  try {
    row = await loadPlan(code);
  } catch (e) {
    console.error('loadPlan failed', e);
    return { ...text('The plan could not be loaded right now (database not reachable). Please try again in a minute.'), isError: true };
  }
  if (!row) {
    return text(`No plan found for the group code "${code}". Check the spelling: it is the code you type into the SOSTAC® tool (upper/lower case does not matter, spaces count as dashes).`);
  }
  if (!isToolPlan(row.data)) {
    return text(`The plan under "${code}" was saved by an older version of the tool and cannot be read here.`);
  }
  return text(fn(code, row));
}

export function buildServer(loadPlan: LoadPlan, patchPlan?: PatchPlan): McpServer {
  const server = new McpServer(
    { name: 'sostac-coach', version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool('open_plan', {
    title: 'Open a SOSTAC® plan',
    description: 'Open the team\'s SOSTAC® plan by its group code and show an overview: team, organisation, members, last save, posts planned, and how far each section is filled in. Call this first.',
    inputSchema: z.object({
      code: z.string().min(1).max(80).describe('The group code the team uses to open the SOSTAC® tool, e.g. "group-04".'),
    }),
    annotations: READ_ONLY,
  }, async ({ code }) => withPlan(loadPlan, code, (c, row) => renderOverview(c, row)));

  server.registerTool('get_section', {
    title: 'Read a section of the plan',
    description: 'Read one section of the team\'s plan with every field, its label, the task text from the tool and the team\'s current entries (tables as rows). Sections: '
      + CATALOG.sections.map((s) => `${s.key} = ${s.title}`).join('; ') + '.',
    inputSchema: z.object({
      code: z.string().min(1).max(80).describe('The group code of the plan.'),
      section: sectionEnum.describe('Section key, e.g. "strategy".'),
      block: z.string().max(80).optional().describe('Optional: only blocks whose title contains this text, e.g. "Personas" or "SWOT".'),
    }),
    annotations: READ_ONLY,
  }, async ({ code, section, block }) => withPlan(loadPlan, code, (_c, row) => renderSection(row, section, block)));

  server.registerTool('get_guidance', {
    title: 'Task and criteria of a section',
    description: 'What a section of the SOSTAC® plan asks for in this course, which earlier sections it builds on, the quality criteria and good coaching questions. Use it before giving feedback on a section.',
    inputSchema: z.object({ section: sectionEnum.describe('Section key, e.g. "strategy".') }),
    annotations: READ_ONLY,
  }, async ({ section }) => {
    const g = GUIDANCE[section];
    const sec = findSection(section);
    if (!g || !sec) return text(`Unknown section "${section}".`);
    const blocks = sec.blocks.map((b) => `- ${b.title}${b.hint ? ': ' + b.hint : ''}`).join('\n');
    return text([
      `# ${sec.title}`,
      `Purpose: ${g.purpose}`,
      g.buildsOn.length ? `\nBuilds on:\n${g.buildsOn.map((x) => '- ' + x).join('\n')}` : '',
      `\nBlocks and task texts in the tool:\n${blocks}`,
      `\nCriteria:\n${g.criteria.map((x) => '- ' + x).join('\n')}`,
      `\nCoaching questions:\n${g.questions.map((x) => '- ' + x).join('\n')}`,
    ].filter(Boolean).join('\n'));
  });

  if (patchPlan) {
    server.registerTool('update_fields', {
      title: 'Write into the plan (only when the student asks)',
      description: 'Write text into single fields of the team\'s plan, addressed by the field ids shown by get_section '
        + '(e.g. "p1-goals"). Use it ONLY after the student explicitly asked you to enter a text and confirmed the exact wording. '
        + 'Fields that already hold text are kept unless overwrite is true — set it only when the student confirmed replacing their text. '
        + 'Only free-text fields outside the cover sheet can be written; tables are written by the students in the tool. '
        + 'Every write is logged in the plan as AI support.',
      inputSchema: z.object({
        code: z.string().min(1).max(80).describe('The group code of the plan.'),
        fields: z.record(z.string(), z.string().max(MAX_LEN)).describe('Field id → new text, e.g. {"p1-goals": "…"}. At most 12 fields per call.'),
        overwrite: z.boolean().optional().describe('Replace text that is already there. Only after the student confirmed it.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ code: rawCode, fields, overwrite }) => {
      const code = normaliseCode(rawCode);
      if (Object.keys(fields).length > 12) return { ...text('Please write at most 12 fields at a time.'), isError: true };
      try {
        const r = await writeFields(loadPlan, patchPlan, code, fields, !!overwrite);
        const lines: string[] = [];
        if (r.written.length) lines.push(`Written: ${r.written.map(fieldLabel).join('; ')}. The team sees it in the tool after its next sync (switching back to the tab, or within a minute).`);
        if (r.kept.length) lines.push(`Not written, because the team already wrote something there (ask before replacing it): ${r.kept.map(fieldLabel).join('; ')}.`);
        if (r.rejected.length) lines.push(`Unknown or not writable (tables, dropdowns and the cover sheet stay with the students; max ${MAX_LEN} characters): ${r.rejected.join(', ')}.`);
        if (r.error) lines.push(`Could not write: ${r.error}.`);
        return { ...text(lines.join('\n') || 'Nothing to write.'), isError: !!r.error && !r.written.length };
      } catch (e) {
        console.error('update_fields failed', e);
        return { ...text('The plan could not be written right now (database not reachable). Nothing was changed.'), isError: true };
      }
    });

    server.registerTool('add_calendar_posts', {
      title: 'Add posts to the content calendar (only when the student asks)',
      description: 'Enter planned posts into the team\'s content calendar. Use it ONLY after the student asked for it and confirmed the posts. '
        + 'Posts fill the first empty calendar rows; new rows are added when none are left. Existing posts are never changed. '
        + 'persona is "Persona 1", "Persona 2" or "Both"; campaign should be the name of a campaign the team defined in Tactics. Logged as AI support.',
      inputSchema: z.object({
        code: z.string().min(1).max(80).describe('The group code of the plan.'),
        posts: z.array(z.object({
          date: z.string().max(20).describe('Date as the team writes it, e.g. "02.12."'),
          platform: z.string().max(60),
          format: z.string().max(60).optional(),
          pillar: z.string().max(80).optional(),
          campaign: z.string().max(120).optional(),
          persona: z.enum(['Persona 1', 'Persona 2', 'Both']).optional(),
          hook: z.string().max(1000).describe('First line / caption idea'),
          visual: z.string().max(1000).optional(),
        })).min(1).max(10),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ code: rawCode, posts }) => {
      const code = normaliseCode(rawCode);
      try {
        const r = await writeCalendarPosts(loadPlan, patchPlan, code, posts);
        if (r.error) return { ...text(`Could not add the posts: ${r.error}.`), isError: true };
        return text(`${r.added} post${r.added === 1 ? '' : 's'} added to the content calendar. The team sees them in the tool after its next sync.`);
      } catch (e) {
        console.error('add_calendar_posts failed', e);
        return { ...text('The calendar could not be written right now (database not reachable). Nothing was changed.'), isError: true };
      }
    });
  }

  return server;
}
