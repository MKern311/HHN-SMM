// Scenario tests for the SOSTAC® tool against the fake PostgREST (run from runner.html).
// Each suite returns {name: true|false|detail}. Suites: runV8Suite (saving), runV9Suite (merge,
// links, content), runV10Suite (rows, connector posts, hints).
window.PAGE = 'build/tool.html';
window.set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
window.fresh = async function (code, row) {
  localStorage.clear();
  const w = await loadFrame(PAGE + '?' + Date.now());
  if (row) w.__fake.setRow(code, row.data, row.ms);
  w.__fake.clearLog(); w.__fake.cfg({ delay: 0, offline: false });
  w.document.getElementById('groupIdInput').value = code;
  await w.initGroup(); await sleep(600);
  return w;
};
window.relogin = async function (code) {
  const w = await loadFrame(PAGE + '?' + Date.now());
  w.document.getElementById('groupIdInput').value = code;
  await w.initGroup(); await sleep(800);
  return w;
};
window.srv = (w, code) => (w.__fake.db()[code] || {}).data || {};
window.msg = w => w.document.getElementById('syncMsg').textContent;
window.banner = w => w.document.getElementById('conflictWarn').style.display === 'block';
window.mateWrites = (w, code, patch, plusMs) => {
  const r = w.__fake.db()[code]; Object.assign(r.data, patch); w.__fake.setRow(code, r.data, Date.now() + (plusMs || 1000));
};

window.runV8Suite = async function () {
  const R = {};
  let w = await fresh('t2');
  set(w, w.document.querySelector('#tools-create input'), 'Canva Pro');
  set(w, w.document.getElementById('arch-tg2'), 'Students');
  await sleep(3500);
  w = await relogin('t2');
  R.tools_arch = w.document.querySelector('#tools-create input').value === 'Canva Pro' && w.document.getElementById('arch-tg2').value === 'Students';

  w = await fresh('t3');
  set(w, w.document.querySelector('#competitor-table input'), 'Comp A');
  w.addCompetitorRow(); set(w, w.document.querySelectorAll('#competitor-table tr')[1].querySelector('input'), 'Comp B');
  await sleep(3500);
  w.document.querySelectorAll('#competitor-table .del-btn')[0].click(); await sleep(2500);
  const html = srv(w, 't3')['__table__competitor-table'];
  R.delete_saved = !html.includes('Comp A') && html.includes('Comp B');
  R.undo_offered = w.document.getElementById('undoBar').classList.contains('show');
  w.undoRemoval(); await sleep(2500);
  R.undo_restores_and_saves = srv(w, 't3')['__table__competitor-table'].includes('Comp A') && w.document.querySelectorAll('#competitor-table tr').length === 2;

  w = await fresh('t5'); w.__fake.cfg({ delay: 4000 });
  const f = w.document.getElementById('p1-goals');
  set(w, f, 'A'); await sleep(2900); set(w, f, 'A B'); await sleep(2000); set(w, f, 'A B C'); await sleep(16000);
  R.slow_net = !banner(w) && srv(w, 't5')['p1-goals'] === 'A B C' && !w.document.getElementById('mergeModal').classList.contains('open');
  w.__fake.cfg({ delay: 1500 });
  set(w, f, 'D'); await w.manualSave(); set(w, f, 'D E'); await w.manualSave(); await sleep(5000);
  R.save_now = !banner(w) && srv(w, 't5')['p1-goals'] === 'D E';
  w.__fake.cfg({ delay: 0 });

  w = await fresh('t7');
  set(w, w.document.getElementById('p1-pain'), 'first'); await sleep(3000);
  w.__fake.cfg({ offline: true });
  set(w, w.document.getElementById('p1-pain'), 'typed before closing'); await sleep(1800);
  w = await loadFrame(PAGE + '?' + Date.now()); w.__fake.cfg({ offline: false });
  w.document.getElementById('groupIdInput').value = 't7'; await w.initGroup(); await sleep(3000);
  R.pending_sent_at_login = srv(w, 't7')['p1-pain'] === 'typed before closing';

  // unsent local edit + team-mate edit of ANOTHER field -> merged without asking
  w.__fake.cfg({ offline: true });
  set(w, w.document.getElementById('p1-pain'), 'my offline edit'); await sleep(1800);
  w = await loadFrame(PAGE + '?' + Date.now());
  mateWrites(w, 't7', { 'p1-trust': 'team-mate entry' });
  w.__fake.cfg({ offline: false });
  w.document.getElementById('groupIdInput').value = 't7'; await w.initGroup(); await sleep(3500);
  R.login_merge_auto = srv(w, 't7')['p1-pain'] === 'my offline edit' && srv(w, 't7')['p1-trust'] === 'team-mate entry' && !w.document.getElementById('mergeModal').classList.contains('open');

  const plans = await (await fetch('fixtures/plans.json', { cache: 'no-store' })).json();
  const big = plans.reduce((a, p) => JSON.stringify(p.data).length > JSON.stringify(a.data).length ? p : a);
  const data = JSON.parse(JSON.stringify(big.data));
  data['zz-from-connector'] = 'keep me'; data.__meta__.custom = 42;
  w = await fresh('t9', { data, ms: Date.now() });
  set(w, w.document.getElementById('p2-name'), 'edited'); await sleep(3500);
  const s9 = srv(w, 't9');
  R.unknown_keys_kept = s9['zz-from-connector'] === 'keep me' && s9.__meta__.custom === 42 && s9['p2-name'] === 'edited';
  w.__fake.clearLog(); set(w, w.document.getElementById('p2-name'), 'again'); w.flushNow(); await sleep(800);
  const e = w.__fake.log().filter(x => x.m !== 'GET')[0];
  R.flush_big_without_keepalive = !!e && !e.keepalive;

  w = await fresh('t10');
  w.prepPrint(); set(w, w.document.getElementById('p1-demo'), 'after print'); await sleep(3500);
  R.print_guard = srv(w, 't10')['p1-demo'] === 'after print' && w.document.querySelectorAll('.field-hidden').length === 0;
  mateWrites(w, 't10', { 'p1-goals': 'from team-mate' }, 2000);
  await w.checkForRemoteChanges(); await sleep(400);
  R.quiet_update = w.document.getElementById('p1-goals').value === 'from team-mate' && !banner(w);

  localStorage.clear(); w = await loadFrame(PAGE + '?' + Date.now()); w.__fake.cfg({ delay: 800 }); w.__fake.clearLog();
  w.document.getElementById('groupIdInput').value = 't13';
  await Promise.all([w.initGroup(), w.initGroup()]); await sleep(500);
  R.double_enter_one_load = w.__fake.log().filter(x => x.m === 'GET').length === 1; w.__fake.cfg({ delay: 0 });
  return R;
};

window.runV9Suite = async function () {
  const R = {};
  // 1 team-mate edits another field while I type -> merged, no dialog, nothing lost
  let w = await fresh('m1');
  set(w, w.document.getElementById('p1-name'), 'Sarah'); await sleep(3500);
  mateWrites(w, 'm1', { 'p2-name': 'Ben (by mate)' });
  set(w, w.document.getElementById('p1-goals'), 'my goals'); await sleep(4500);
  let s = srv(w, 'm1');
  R.merge_auto = s['p2-name'] === 'Ben (by mate)' && s['p1-goals'] === 'my goals' && !banner(w)
    && w.document.getElementById('p2-name').value === 'Ben (by mate)' && !w.document.getElementById('mergeModal').classList.contains('open');
  // 2 both edit the same field -> dialog; take theirs
  mateWrites(w, 'm1', { 'p1-goals': 'mate goals' });
  set(w, w.document.getElementById('p1-goals'), 'my new goals'); await sleep(4500);
  R.dialog_on_same_field = w.document.getElementById('mergeModal').classList.contains('open') && w.document.querySelectorAll('#mergeList .merge-item').length === 1;
  R.dialog_label = (w.document.querySelector('#mergeList legend') || {}).textContent;
  w.finishMerge('theirs'); await sleep(4000);
  s = srv(w, 'm1');
  R.dialog_take_theirs = s['p1-goals'] === 'mate goals' && w.document.getElementById('p1-goals').value === 'mate goals' && !banner(w);
  // 3 both edit the same table: dialog, keep mine
  set(w, w.document.querySelector('#pillars-table input'), 'Mine pillar'); await sleep(3500);
  const r = w.__fake.db()['m1'];
  r.data['__table__pillars-table'] = r.data['__table__pillars-table'].replace('value="Mine pillar"', 'value="Mate pillar"');
  w.__fake.setRow('m1', r.data, Date.now() + 1500);
  set(w, w.document.querySelector('#pillars-table input'), 'Mine pillar 2'); await sleep(4500);
  R.table_conflict_dialog = w.document.getElementById('mergeModal').classList.contains('open');
  w.finishMerge('mine'); await sleep(4000);
  R.table_keep_mine = (srv(w, 'm1')['__table__pillars-table'] || '').includes('Mine pillar 2');
  // 4 who am I goes into the save
  w.setWhoAmI('Anna'); set(w, w.document.getElementById('p1-demo'), 'x'); await sleep(3500);
  R.editor_saved = (srv(w, 'm1').__meta__ || {}).editor === 'Anna';
  // 5 links: sketch -> persona, architecture, platform KPIs, suggestions
  w = await fresh('l1');
  set(w, w.document.getElementById('ps1-name'), 'Renate, 64'); set(w, w.document.getElementById('ps1-motives'), 'local help');
  set(w, w.document.getElementById('ps1-tg'), 'Local donors');
  w.copyFromSketch(1);
  R.copy_sketch = w.document.getElementById('p1-name').value === 'Renate, 64' && w.document.getElementById('p1-goals').value === 'local help'
    && w.document.getElementById('p1-demo').value === 'Target group: Local donors';
  const card = w.document.querySelector('#platform-list .plat-card');
  set(w, card.querySelector('.plat-body textarea'), 'reach young locals');
  const ps = card.querySelector('.persona-select'); ps.value = 'Persona 1'; ps.dispatchEvent(new w.Event('change', { bubbles: true }));
  const ins = card.querySelectorAll('.plat-body input[type=text]'); set(w, ins[0], 'Reels'); set(w, ins[3], 'shares per post');
  set(w, w.document.getElementById('obj-business'), 'Raise 2,500 €');
  w.fillArchitecture();
  R.fill_architecture = w.document.getElementById('arch-vision').value === 'Raise 2,500 €' && w.document.getElementById('arch-tg1').value.startsWith('Renate')
    && w.document.getElementById('arch-ch1').value.includes('Instagram') && w.document.getElementById('arch-op1').value.includes('shares per post');
  w.addPlatformKpis(); w.addPlatformKpis();
  R.platform_kpis_once = [...w.document.querySelectorAll('#kpi-table tr')].filter(tr => (tr.querySelector('input') || {}).value === 'shares per post').length === 1;
  const m = w.document.querySelectorAll('#member-table input'); set(w, m[0], 'Anna Müller');
  set(w, w.document.querySelector('#pillars-table input'), 'Impact stories');
  w.refresh(); await sleep(600);
  R.suggestions = [...w.document.querySelectorAll('#dl-members option')].some(o => o.value === 'Anna Müller')
    && [...w.document.querySelectorAll('#dl-pillars option')].some(o => o.value === 'Impact stories')
    && w.document.querySelector('#calendar-table tr td:nth-child(6) input').getAttribute('list') === 'dl-pillars'
    && w.document.querySelector('#pres1-table input').getAttribute('list') === 'dl-members';
  // 6 SMART -> KPI fills empty cells
  set(w, w.document.querySelector('#smart-tbody textarea'), 'Get 60 donations');
  const si = w.document.querySelectorAll('#smart-tbody tr')[0].querySelectorAll('input'); set(w, si[0], 'donations'); set(w, si[1], '60');
  w.syncSmartToKpis(false);
  const kr = [...w.document.querySelectorAll('#kpi-table tr')].find(tr => (tr.querySelector('input') || {}).value === 'donations');
  R.smart_to_kpi = !!kr && kr.querySelectorAll('input')[3].value === '60';
  // 7 progress by blocks, done box, echo, legacy rows
  w.updateProgress(); w.refreshDerived();
  R.phase_cards = w.document.querySelector('.ov-card[onclick="showTab(1)"] .ov-count').textContent;
  R.done_box_open = w.document.getElementById('done-box').classList.contains('open-items');
  set(w, w.document.getElementById('sit-opportunity'), 'Christmas peak'); w.refreshDerived();
  R.echo = w.document.getElementById('echo-objectives').textContent.includes('Christmas peak');
  R.legacy_hidden_when_empty = getComputedStyle(w.document.getElementById('brief-course').closest('.form-row')).display === 'none';
  // 8 old plan: legacy fields with content stay visible; "Purchase" becomes "Donation"; script in table markup removed
  const plans = await (await fetch('fixtures/plans.json', { cache: 'no-store' })).json();
  const old = plans.find(p => (p.data['__table__campaign-list'] || '').includes('<option selected="">Purchase'));
  const od = JSON.parse(JSON.stringify(old.data));
  od['brief-course'] = 'SMM WiSe';
  od['__table__team-table'] = (od['__table__team-table'] || '') + '<tr><td><input value="x" onfocus="alert(1)"></td><td><script>window.__pwned=1<\/script></td></tr>';
  w = await fresh('o1', { data: od, ms: Date.now() });
  R.legacy_visible_with_value = getComputedStyle(w.document.getElementById('brief-course').closest('.form-row')).display !== 'none';
  R.purchase_to_donation = [...w.document.querySelectorAll('#campaign-list .phase-select')].some(s => s.value === 'Donation');
  R.markup_sanitised = !w.__pwned && !w.document.querySelector('#team-table [onfocus]') && !w.document.querySelector('#team-table script');
  R.no_write_on_login_old_plan = w.__fake.log().filter(x => x.m !== 'GET').length === 0;
  return R;
};

window.runV10Suite = async function () {
  const R = {};
  const rowsOf = (w, sel) => [...w.document.querySelectorAll(sel)];
  // row ids are given and saved
  let w = await fresh('r1');
  set(w, w.document.querySelector('#calendar-table input'), '01.12.'); await sleep(3500);
  R.rids_saved = /data-rid="r/.test(srv(w, 'r1')['__table__calendar-table'] || '');
  // team-mate edits row 2 while I edit row 3 of the calendar -> merged, no dialog
  const r = w.__fake.db()['r1'];
  const t = document.createElement('template'); t.innerHTML = r.data['__table__calendar-table'];
  const trs = [...t.content.children];
  trs[1].querySelectorAll('input')[0].setAttribute('value', '05.12. (mate)');
  r.data['__table__calendar-table'] = trs.map(x => x.outerHTML).join(''); w.__fake.setRow('r1', r.data, Date.now() + 1500);
  set(w, rowsOf(w, '#calendar-table > tr')[2].querySelector('input'), '07.12. (me)'); await sleep(5000);
  let h = srv(w, 'r1')['__table__calendar-table'];
  R.row_merge_auto = h.includes('05.12. (mate)') && h.includes('07.12. (me)') && h.includes('01.12.')
    && !w.document.getElementById('mergeModal').classList.contains('open');
  // both edit the SAME row -> dialog
  const r2 = w.__fake.db()['r1'];
  r2.data['__table__calendar-table'] = r2.data['__table__calendar-table'].replace('07.12. (me)', '07.12. (mate)');
  w.__fake.setRow('r1', r2.data, Date.now() + 3000);
  set(w, rowsOf(w, '#calendar-table > tr')[2].querySelector('input'), '07.12. (me, again)'); await sleep(5000);
  R.same_row_dialog = w.document.getElementById('mergeModal').classList.contains('open');
  w.finishMerge('mine'); await sleep(3500);
  // team-mate deletes a row while I add one -> both happen
  const r3 = w.__fake.db()['r1'];
  const t3 = document.createElement('template'); t3.innerHTML = r3.data['__table__calendar-table'];
  const del = [...t3.content.children][5].dataset.rid; [...t3.content.children][5].remove();
  r3.data['__table__calendar-table'] = [...t3.content.children].map(x => x.outerHTML).join(''); w.__fake.setRow('r1', r3.data, Date.now() + 4500);
  w.addCalendarRow(); set(w, rowsOf(w, '#calendar-table > tr').slice(-1)[0].querySelector('input'), '24.12. (new)'); await sleep(5000);
  h = srv(w, 'r1')['__table__calendar-table'];
  R.delete_and_add_merge = !h.includes(del) && h.includes('24.12. (new)') && !w.document.getElementById('mergeModal').classList.contains('open');
  // posts written by the connector load in the tool
  const cal = await (await fetch('fixtures/calendar_from_connector.json', { cache: 'no-store' })).json();
  w = await fresh('c1', { data: cal, ms: Date.now() });
  R.connector_posts_load = w.countPosts() >= 22 && w.__fake.log().filter(x => x.m !== 'GET').length === 0;
  // hints, prefill
  w.showTab(1); w.refreshDerived();
  R.hints_clamped = w.document.querySelectorAll('#tab-1 p.hint.clamped').length > 0 && w.document.querySelectorAll('#tab-1 .hint-more').length > 0;
  const w2 = await loadFrame(PAGE + '?' + Date.now() + '#code=Group%2007');
  R.code_prefill = w2.document.getElementById('groupIdInput').value === 'Group 07';
  return R;
};
