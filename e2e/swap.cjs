// End-to-end test for swapping sessions by dragging a title bar onto another.
// Run: npm run build && node e2e/swap.cjs
const { _electron } = require('playwright');
const fs = require('fs');
const path = require('path');
const { prepareConfigDir, waitForShell, dumpTerminals, screenText, eventually } = require('./helpers.cjs');
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) { process.exitCode = 1; if (info !== undefined) console.log('INFO ' + JSON.stringify(info)); } };
let page = null;

(async () => {
  const dir = path.resolve(__dirname, '..');
  const cfgDir = prepareConfigDir();
  const app = await _electron.launch({
    args: [path.join(dir, 'out/main/index.js'), '--no-sandbox'], cwd: dir,
    executablePath: require(path.join(dir, 'node_modules/electron')),
    env: { ...process.env, SHELL: '/bin/bash', GRID_SHELL_CONFIG_DIR: cfgDir }
  });
  const w = await app.firstWindow();
  page = w;
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map((m) => map[m]) });
    await w.waitForTimeout(150);
  };
  const order = () => w.$$eval('.tile', (els) => els.map((e) => Number(e.dataset.sessionId)));
  const box = (id) => w.$eval(`.tile[data-session-id="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y) }; });
  const titleCenter = async (id) => { const b = await w.$eval(`.tile[data-session-id="${id}"] .title-text`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); return b; };
  const termCenter = async (id) => w.$eval(`.tile[data-session-id="${id}"] .term`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  async function drag(fromId, to, { cancel = false } = {}) {
    const a = await titleCenter(fromId);
    await w.mouse.move(a.x, a.y);
    await w.mouse.down();
    await w.mouse.move(a.x + 20, a.y + 10, { steps: 3 });
    await w.mouse.move(to.x, to.y, { steps: 8 });
    await w.waitForTimeout(150);
    const during = await w.evaluate(() => ({ dragging: document.querySelector('.tile.dragging')?.dataset.sessionId, target: document.querySelector('.tile.drop-target')?.dataset.sessionId }));
    if (cancel) await w.keyboard.press('Escape');
    await w.mouse.up();
    await w.waitForTimeout(300);
    return during;
  }

  await w.waitForSelector('.tile'); await waitForShell(w);
  await w.keyboard.type('echo mark-one\n');
  for (const word of ['two', 'three']) { await key('Control+Shift+T'); await waitForShell(w); await w.keyboard.type(`echo mark-${word}\n`); }
  await w.waitForTimeout(400);
  ok('starts in creation order', JSON.stringify(await order()) === '[1,2,3]');
  const pos1 = await box(1), pos3 = await box(3);
  const term1 = await w.evaluate(() => { const t = window.__gridShellTerminals.get(1); t.__marker = 'same-terminal'; return true; });

  // Drag session 1's title onto session 3.
  const during = await drag(1, await termCenter(3));
  ok('while dragging, the session fades and the target is highlighted', during.dragging === '1' && during.target === '3', during);
  ok('dropping swaps the two sessions', JSON.stringify(await order()) === '[3,2,1]', await order());
  const now1 = await box(1), now3 = await box(3);
  ok('they trade places in the grid', now1.x === pos3.x && now1.y === pos3.y && now3.x === pos1.x && now3.y === pos1.y, { pos1, pos3, now1, now3 });
  ok('the terminal is the same one (not restarted)', await w.evaluate(() => window.__gridShellTerminals.get(1).__marker === 'same-terminal') && term1);
  ok('its scrollback is kept', (await screenText(w, '.tile[data-session-id="1"]')).includes('mark-one'));
  ok('Go to session 1 now selects the session in the first position', await (async () => { await key('Alt+1'); return (await w.$eval('.tile.active', (e) => e.dataset.sessionId)) === '3'; })());

  // Things that must not swap.
  await drag(2, await termCenter(1), { cancel: true });
  ok('Esc cancels a drag', JSON.stringify(await order()) === '[3,2,1]');
  await drag(2, await termCenter(2));
  ok('dropping a session on itself does nothing', JSON.stringify(await order()) === '[3,2,1]');
  const t2 = await titleCenter(2);
  await w.mouse.click(t2.x, t2.y); await w.waitForTimeout(200);
  ok('a plain click on a title activates without swapping', JSON.stringify(await order()) === '[3,2,1]' && (await w.$eval('.tile.active', (e) => e.dataset.sessionId)) === '2');
  await w.dblclick('.tile[data-session-id="2"] .title-text'); await w.waitForTimeout(200);
  ok('double-click still renames', (await w.$('.rename')) !== null && JSON.stringify(await order()) === '[3,2,1]');
  await w.keyboard.press('Escape');

  // The new order is what gets saved for next launch.
  const saved = await eventually(() => {
    const st = JSON.parse(fs.readFileSync(path.join(cfgDir, 'state.json'), 'utf8'));
    return JSON.stringify(st.sessions.map((s) => s.name)) === JSON.stringify(['bash 3', 'bash 2', 'bash 1']);
  }, 4000);
  ok('the swapped order is saved', saved);

  if (process.exitCode) await dumpTerminals(w);
  await app.close();
})().catch(async (e) => { console.error(e); if (page) await dumpTerminals(page).catch(() => {}); process.exit(1); });
