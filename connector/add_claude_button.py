#!/usr/bin/env python3
"""Add the "Discuss with Claude" button to a copy of the SOSTAC® tool.

    python3 connector/add_claude_button.py SOSTAC_Strategy_Framework.html beta/sostac-claude-test.html

The button saves the plan, then opens claude.ai with a ready first message that
asks the SOSTAC Coach connector to open this group's plan at the section the
student is working on. The plan data and its storage are not touched.
"""
import sys
from pathlib import Path

CONNECTOR_URL = "https://earwxoxayapshwgnuxds.supabase.co/functions/v1/sostac-coach"

CSS = """
  /* ─── CLAUDE COACH BUTTON ─────────────────────────────────── */
  #claudeBtn { display: none; position: fixed; right: 20px; bottom: 20px; z-index: 900;
               background: var(--mk-navy); color: #fff; border: none; border-radius: 22px;
               padding: 11px 18px; font: 700 13px Arial, sans-serif; cursor: pointer;
               box-shadow: 0 6px 18px rgba(0,0,0,.25); }
  #claudeBtn:hover { background: var(--mk-blue); }
  #claudeBtn:focus-visible { outline: 3px solid var(--mk-gold); outline-offset: 2px; }
  body.logged-in #claudeBtn { display: inline-flex; align-items: center; gap: 8px; }
  .toast { bottom: 76px; }
  #claudeModal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 10002;
                 align-items: center; justify-content: center; padding: 20px; }
  #claudeModal.open { display: flex; }
  #claudeModal .diag-box { max-width: 560px; }
  #claudeModal p, #claudeModal li { font-size: 13px; line-height: 1.55; margin-bottom: 8px; }
  #claudeModal ol { margin: 0 0 10px 18px; }
  #claudeModal code { background: var(--mk-light); padding: 2px 5px; border-radius: 3px; font-size: 12px;
                      word-break: break-all; }
  #claudeModal .cm-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; margin-top: 14px; }
  #claudeModal .cm-actions button { border: 1px solid var(--border); background: var(--mk-light); color: var(--mk-blue);
                                    border-radius: 4px; padding: 8px 14px; font: 700 12px Arial, sans-serif; cursor: pointer; }
  #claudeModal .cm-actions .cm-go { background: var(--mk-navy); color: #fff; border-color: var(--mk-navy); }
  @media print { #claudeBtn, #claudeModal { display: none !important; } }
  @media screen and (max-width: 680px) { #claudeBtn { right: 12px; bottom: 12px; } .toast { bottom: 70px; } }
"""

HTML = f"""
<!-- ===== CLAUDE COACH ===== -->
<button id="claudeBtn" type="button" onclick="openClaudeCoach()" aria-haspopup="dialog">
  <span aria-hidden="true">💬</span> Discuss with Claude
</button>
<div id="claudeModal" role="dialog" aria-modal="true" aria-labelledby="claudeModalTitle">
  <div class="diag-box">
    <h3 id="claudeModalTitle">Discuss this section with Claude</h3>
    <p>Claude opens in a new tab with your own Claude account. It reads your plan through the
    <strong>SOSTAC Coach</strong> connector and coaches you: it asks questions and checks your entries,
    it does not change your plan.</p>
    <p><strong>Once only:</strong> add the connector in Claude.</p>
    <ol>
      <li>claude.ai › Settings › Connectors › <em>Add custom connector</em></li>
      <li>Name: <code>SOSTAC Coach</code> · URL: <code id="claudeConnUrl">{CONNECTOR_URL}</code></li>
      <li>In the chat, make sure the connector is switched on.</li>
    </ol>
    <p id="claudeSection" style="color:var(--grey)"></p>
    <p style="color:var(--grey);font-size:12px">Label AI support in Situation › Our Approach.</p>
    <div class="cm-actions">
      <button type="button" onclick="copyClaudeText(document.getElementById('claudeConnUrl').textContent, 'Connector URL copied')">Copy connector URL</button>
      <button type="button" onclick="closeClaudeCoach()">Cancel</button>
      <button type="button" class="cm-go" onclick="launchClaudeCoach()">Open Claude →</button>
    </div>
  </div>
</div>
"""

JS = """
// ══════════════════════════════════════════════════════════════════════════
//  CLAUDE COACH — opens claude.ai with a first message for the SOSTAC Coach
//  connector. Reads nothing from claude.ai and writes nothing to the plan.
// ══════════════════════════════════════════════════════════════════════════
const COACH_SECTIONS = ['overview', 'situation', 'objectives', 'strategy', 'tactics',
                        'action', 'control', 'architecture', 'notes'];

/** Active tab and the block heading nearest the middle of the screen. */
function coachContext() {
  const panel = document.querySelector('.tab-panel.active');
  const idx = panel ? parseInt(panel.id.replace('tab-', ''), 10) : 0;
  const titleEl = panel && panel.querySelector('.section-header h2');
  const mid = window.innerHeight / 2;
  let block = '';
  let best = Infinity;
  (panel ? panel.querySelectorAll('.subsection > h3') : []).forEach(h => {
    const top = h.getBoundingClientRect().top;
    if (top <= mid && mid - top < best) { best = mid - top; block = h.childNodes[0].textContent.trim(); }
  });
  return { key: COACH_SECTIONS[idx] || 'overview', title: titleEl ? titleEl.textContent.trim() : '', block };
}

function coachPrompt(ctx) {
  const where = ctx.block ? `${ctx.title} › ${ctx.block}` : ctx.title;
  return `Please use the SOSTAC Coach connector to open our SOSTAC plan with the group code "${currentGroupId}". ` +
    `I am working on the section "${where}" (section key: ${ctx.key}${ctx.block ? `, block: ${ctx.block}` : ''}). ` +
    `Read this section, its guidance and the earlier sections it builds on, then coach me: ` +
    `tell me briefly what is good, ask me questions about what is missing or weak, and do not write the section for me.`;
}

function openClaudeCoach() {
  const ctx = coachContext();
  document.getElementById('claudeSection').textContent =
    'Section: ' + (ctx.block ? `${ctx.title} › ${ctx.block}` : ctx.title);
  document.getElementById('claudeModal').classList.add('open');
}

function closeClaudeCoach() {
  document.getElementById('claudeModal').classList.remove('open');
}

function copyClaudeText(text, msg) {
  const done = () => showToast(msg);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, () => window.prompt('Copy this text:', text));
  } else {
    window.prompt('Copy this text:', text);
  }
}

async function launchClaudeCoach() {
  const prompt = coachPrompt(coachContext());
  // open the tab first: browsers block pop-ups that come after an await
  const win = window.open('https://claude.ai/new?q=' + encodeURIComponent(prompt), '_blank', 'noopener');
  closeClaudeCoach();
  try { navigator.clipboard && await navigator.clipboard.writeText(prompt); } catch (e) { /* not essential */ }
  showToast('Saving your plan for Claude…');
  try { await manualSave(); } catch (e) { console.error('save before coach failed', e); }
  showToast(win ? 'Claude opened — the message is also on your clipboard' : 'Pop-up blocked — paste the copied message into Claude');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeClaudeCoach(); });
"""


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    s = src.read_text(encoding="utf-8")
    assert "</style>" in s and '<div class="toast" id="toast"></div>' in s and "</script>\n</body>" in s
    s = s.replace("</style>", CSS + "</style>", 1)
    s = s.replace('<div class="toast" id="toast"></div>', '<div class="toast" id="toast"></div>\n' + HTML, 1)
    s = s.replace("</script>\n</body>", JS + "</script>\n</body>", 1)
    # show the button only once a plan is open
    hook = "document.getElementById('syncBar').style.display = 'flex';"
    assert hook in s
    s = s.replace(hook, hook + "\n  document.body.classList.add('logged-in');", 1)
    s = s.replace("<title>SOSTAC® Social Media Strategy — SMM, Hochschule Heilbronn</title>",
                  "<title>SOSTAC® — TEST with Claude coach</title>", 1)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(s, encoding="utf-8")
    print(f"wrote {dst}")


if __name__ == "__main__":
    main()
