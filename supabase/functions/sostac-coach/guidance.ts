// Coaching guidance per section: what the section asks for, what it builds
// on, and the questions a good coach asks. The task texts of each block come
// from the tool itself (catalog.ts); this file adds the course logic.
// Course: Social Media Management (SMM), HHN — every team runs a donation
// campaign on betterplace.org and plans it with SOSTAC®.

export type Guidance = {
  purpose: string;
  buildsOn: string[];
  criteria: string[];
  questions: string[];
};

export const GUIDANCE: Record<string, Guidance> = {
  overview: {
    purpose: 'Cover sheet and project brief: who the team is, which organisation and which betterplace project the campaign supports, and the one main goal.',
    buildsOn: [],
    criteria: [
      'Every member is registered with full name (student numbers are entered in the tool, not discussed here).',
      'The brief names the real organisation and the campaign period.',
      'The overall goal is one sentence and names an amount or a number of donations.',
    ],
    questions: [
      'Which betterplace project do you support, and what exactly does the money pay for?',
      'Can you say your main goal in one sentence that a stranger understands?',
    ],
  },
  situation: {
    purpose: 'Describe the organisation as it is today — no plans yet. Three areas (Organisation = monitoring; Audience and Environment = listening), then together: approach, SWOT and key findings.',
    buildsOn: ['Own research: the organisation\'s channels, its betterplace page, listening results'],
    criteria: [
      'Every statement has a source (link, date, number) or is marked as an assumption ("We assume …").',
      'Current Social Media Presence lists every channel, inactive ones too, with engagement rate = interactions of the last ten posts / 10 / followers × 100.',
      'Content Audit compares the five best with the five weakest of the last 20 posts.',
      'Persona sketches describe people the organisation reaches today, not the campaign\'s target personas.',
      'Competitor Benchmarking compares three projects that ask the same people for money, same channel, same 90 days, and decides adopt / avoid / occupy a gap.',
      'SWOT: strengths and weaknesses are internal, opportunities and threats external; every point has evidence from the areas above.',
      'Key findings name the single biggest opportunity and the single biggest challenge.',
    ],
    questions: [
      'Where does this point come from — can you show the source?',
      'Is this something the organisation controls (S/W) or something outside it (O/T)?',
      'Which finding surprised you most, and what does it mean for the campaign?',
    ],
  },
  objectives: {
    purpose: 'State where the campaign wants to be: the fundraising goal and the role of social media, broken down into SMART goals.',
    buildsOn: ['situation › Key Findings Summary', 'situation › The Organisation Today (current goals with figures)'],
    criteria: [
      'The business objective is the fundraising goal on betterplace (amount or number of donations, deadline).',
      'Each SMART goal is specific, measurable (one metric), achievable given the baseline in Situation, relevant to the fundraising goal and time-bound.',
      'Each goal names its metric and target; every SMART goal later appears as a KPI in Control.',
    ],
    questions: [
      'What is your baseline today, and how did you choose the target?',
      'How does this goal help the donation goal — what is the chain from post to donation?',
      'Which of the five SMART criteria is weakest in this goal?',
    ],
  },
  strategy: {
    purpose: 'Decide how to get there: campaign personas (target state), positioning per persona, content pillars and the platform mix.',
    buildsOn: [
      'situation › Current Target Groups and Persona sketches (who is reached today)',
      'situation › Social Listening and Competitor Benchmarking',
      'situation › SWOT Analysis and Key Findings',
      'objectives › SMART Goals',
    ],
    criteria: [
      'Personas go beyond demographics: social media usage, role in the feed, trusted accounts, emotional drivers, barriers and the trigger to act.',
      'Each persona is backed by evidence from Situation (target groups, listening, experience), not invented.',
      'Positioning is written per persona: core message, value proposition, proof, differentiator against the benchmarked projects.',
      '3–5 content pillars; each persona uses named pillars.',
      'Every platform in the mix has a distinct role, a persona and one primary KPI — otherwise it is dropped.',
    ],
    questions: [
      'Which finding from Situation supports this persona detail?',
      'What would make this persona stop scrolling — and what would make them distrust you?',
      'Why does this platform deserve a place in the mix, and how will you know it worked?',
    ],
  },
  tactics: {
    purpose: 'Turn the strategy into campaigns, a content calendar of at least 20 real posts, partnerships and tools.',
    buildsOn: ['strategy › Personas, Content Pillars and Platform Strategy', 'objectives › SMART Goals'],
    criteria: [
      'Each campaign runs through the phases of the chosen journey model (AIDA or AICPURA) with a persona, content and an objective per phase.',
      'The calendar plans actual posts (date, platform, format, pillar, persona, hook) — at least 20 — and links each post to a campaign.',
      'Hooks name the persona\'s problem or a surprising fact in the first line.',
      'Influencers or partners are judged by fit, not reach.',
    ],
    questions: [
      'Which phase of the journey does this post serve, and for which persona?',
      'Read the hook out loud: would your persona stop scrolling?',
      'Is the mix of pillars in the calendar the mix you planned in Strategy?',
    ],
  },
  action: {
    purpose: 'Who does what and when: presentations, roles, the five-phase timeline (pre-launch, launch, momentum, final push, thank you) and the approval process.',
    buildsOn: ['tactics › Campaign Overview and Content Calendar', 'overview › Group Members'],
    criteria: [
      'At least one presenter per presentation; every member appears somewhere.',
      'Every milestone has a phase, a date and an owner.',
      'The timeline plans the mid-campaign dip and the final push before the deadline.',
      'There is a crisis protocol and a response time for comments.',
    ],
    questions: [
      'What happens in the week after launch when donations slow down?',
      'Who answers a critical comment on a Sunday evening?',
    ],
  },
  control: {
    purpose: 'Measure success: KPIs (every SMART goal), the mid-project review, reporting cadence, optimisation and the definition of success.',
    buildsOn: ['objectives › SMART Goals', 'situation › Current Social Media Presence (baselines)', 'strategy › Platform Strategy (primary KPI per platform)'],
    criteria: [
      'Every SMART goal appears as a KPI with baseline, target, tool and frequency.',
      'The funnel is measured up to the donation (betterplace), not only reach and likes.',
      'The mid-project review names causes and one concrete measure per KPI that is behind.',
      'Success is defined in two or three sentences before the campaign starts.',
    ],
    questions: [
      'Which number tells you on day 10 that you need to change something?',
      'How will you see on betterplace which donations came from social media?',
    ],
  },
  architecture: {
    purpose: 'Summarise the whole strategy on one page: vision, target groups, channels per target group and how each channel is run.',
    buildsOn: ['strategy › Personas and Platform Strategy', 'control › KPIs'],
    criteria: ['The architecture repeats nothing new — it condenses decisions already made in the earlier phases, consistently.'],
    questions: ['Does every channel here appear in your platform strategy with the same role?'],
  },
  notes: {
    purpose: 'The team\'s own notes: definitions, learnings, open questions — five sections of at most 1,500 characters, written in the team\'s own words.',
    buildsOn: [],
    criteria: ['Own words, not copied text; each section has a headline that says what it holds.'],
    questions: ['What would you explain differently now than at the start of the project?'],
  },
};

export const SERVER_INSTRUCTIONS = `
You are a coach for student teams in the course Social Media Management (SMM) at Hochschule Heilbronn.
Each team plans and runs a donation campaign on betterplace.org with the SOSTAC® framework
(Situation, Objectives, Strategy, Tactics, Action, Control) in a web tool. This connector lets you READ the
team's plan. It cannot change the plan: the students enter everything in the tool themselves.

How to work:
1. Ask for the team's group code if you do not have it, then call open_plan to see where the team stands.
2. Ask which section or question the student wants to work on. Call get_guidance for that section and
   get_section for the section and for the sections it builds on.
3. Coach, do not write the plan for them. Ask one or two questions at a time, check entries against the
   criteria, point to evidence in their own Situation analysis, show gaps and contradictions between
   sections, and give short examples only when the student is stuck. If a student asks you to write a
   whole section, offer a structure and questions instead, and remind them that the team is the author.
4. Quote the team's own entries when you comment on them, so they know which field you mean.
5. Answer in the student's language. The tool and its field names are in English.
6. Remind the team to label AI support: they note it in Situation › Our Approach ("Links to your AI reports").

Rules: only open the plan of the code the student gives you. Do not ask for or repeat student numbers.
If a field is empty, say so instead of guessing what the team meant.
`.trim();
