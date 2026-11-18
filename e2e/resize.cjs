// End-to-end test for resizing sessions by dragging the borders between them.
// Run: npm run build && node e2e/resize.cjs
const { _electron } = require('playwright');
const path = require('path');
const { prepareConfigDir, waitForShell, dumpTerminals } = require('./helpers.cjs');
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) { process.exitCode = 1; if (info !== undefined) console.log('INFO ' + JSON.stringify(info)); } };
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;
let page = null;

(async () => {
  const dir = path.resolve(__dirname, '..');
  const app = await _electron.launch({
    args: [path.join(dir, 'out/main/index.js'), '--no-sandbox'], cwd: dir,
    executablePath: require(path.join(dir, 'node_modules/electron')),
    env: { ...process.env, SHELL: '/bin/bash', GRID_SHELL_CONFIG_DIR: prepareConfigDir() }
  });
  const w = await app.firstWindow();
  page = w;
  await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.unmaximize(); b.setBounds({ x: 0, y: 0, width: 1000, height: 640 }); });
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map((m) => map[m]) });
    await w.waitForTimeout(150);
  };
  const box = (id) => w.$eval(`.tile[data-session-id="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const cols = (id) => w.evaluate((id) => window.__gridShellTerminals.get(id)?.cols, id);
  const active = () => w.$eval('.tile.active', (e) => Number(e.dataset.sessionId));
  async function dragBy(testId, dx, dy) {
    const r = await w.$eval(`[data-testid="${testId}"]`, (e) => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await w.mouse.move(r.x, r.y);
    await w.mouse.down();
    await w.mouse.move(r.x + dx, r.y + dy, { steps: 8 });
    await w.mouse.up();
    await w.waitForTimeout(250);
  }

  await w.waitForSelector('.tile'); await waitForShell(w);
  for (let i = 0; i < 3; i++) { await key('Control+Shift+T'); await waitForShell(w); }
  await key('Alt+1');
  await w.waitForTimeout(300);
  // 2 x 2 grid: [1][2] / [3][4]
  const b1 = await box(1), b2 = await box(2), b3 = await box(3), b4 = await box(4);
  const cols1 = await cols(1);
  ok('starts as an even 2x2 grid', near(b1.w, b2.w, 1) && near(b1.h, b3.h, 1) && near(b3.w, b4.w, 1), { b1, b2, b3 });

  // Drag the border between 1 and 2 to the right.
  await dragBy('resizer-col-0-0', 200, 0);
  const a1 = await box(1), a2 = await box(2), a3 = await box(3);
  ok('dragging a border widens the left session', near(a1.w, b1.w + 200), { before: b1.w, after: a1.w });
  ok('and narrows the right one by the same amount', near(a2.w, b2.w - 200) && near(a2.x, b2.x + 200), { before: b2, after: a2 });
  ok('other rows keep their sizes', near(a3.w, b3.w, 1));
  ok('dragging does not change the active session', (await active()) === 1);
  await w.waitForTimeout(300);
  ok('terminal gets more columns', (await cols(1)) > cols1 + 10, { before: cols1, after: await cols(1) });

  // Drag the border between rows up.
  await dragBy('resizer-row-0', 0, -120);
  const r1 = await box(1), r3 = await box(3);
  ok('dragging the row border resizes both rows', near(r1.h, b1.h - 120) && near(r3.h, b3.h + 120) && near(r3.y, b3.y - 120), { before: [b1.h, b3.h], after: [r1.h, r3.h] });

  // Can't shrink below the minimum.
  await dragBy('resizer-col-0-0', 2000, 0);
  ok('sessions keep a minimum width', near((await box(2)).w, 160, 2), { w: (await box(2)).w });

  // Navigation follows real widths: tile 4's centre now lies under the wide tile 1.
  await key('Alt+4'); await key('Control+Alt+Up');
  ok('up/down navigation uses the resized widths', (await active()) === 1, { active: await active() });

  // Double-click resets that row to equal widths.
  await w.dblclick('[data-testid="resizer-col-0-0"]'); await w.waitForTimeout(250);
  const e1 = await box(1), e2 = await box(2);
  ok('double-click makes the row equal again', near(e1.w, e2.w, 1) && near(e1.h, r1.h, 1), { e1, e2 });

  // Focus mode still enlarges, and returns to the resized place afterwards.
  await dragBy('resizer-col-0-0', 150, 0);
  const before = await box(1);
  await w.dblclick('.tile[data-session-id="1"] .term');
  await w.waitForSelector('.tile.focused');
  const f = await box(1);
  ok('focus mode enlarges the session', f.w * f.h > before.w * before.h * 1.5, { before, f });
  await w.mouse.click(3, 3); await w.waitForTimeout(250);
  const after = await box(1);
  ok('leaving focus mode keeps the resized place', near(after.w, before.w, 1) && near(after.x, before.x, 1), { before, after });

  // Typing still works after all that.
  await w.keyboard.type('echo resized-$((6*7))\n'); await w.waitForTimeout(500);
  const text = await w.evaluate(() => { const t = window.__gridShellTerminals.get(1); const b = t.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\n'; return s; });
  ok('the session still gets keys', text.includes('resized-42'));

  // Adding a session changes the grid's shape, so sizes reset.
  await key('Control+Shift+T'); await waitForShell(w); await w.waitForTimeout(300);
  const n1 = await box(1), n2 = await box(2);
  ok('a new session resets to an even grid', near(n1.w, n2.w, 1), { n1, n2 });

  if (process.exitCode) await dumpTerminals(w);
  await app.close();
})().catch(async (e) => { console.error(e); if (page) await dumpTerminals(page).catch(() => {}); process.exit(1); });
