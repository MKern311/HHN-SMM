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

export type LoadPlan = (code: string) => Promise<PlanRow | null>;

export const VERSION = '0.1.0';

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

export function buildServer(loadPlan: LoadPlan): McpServer {
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

  return server;
}
