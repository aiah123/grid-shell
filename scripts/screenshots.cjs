// Regenerates the README screenshots (docs/screenshots/*.png) from a demo
// project with four sessions, two of them running Claude Code.
// Needs the `claude` CLI installed and signed in: it sends two small real
// prompts (one edits a file in the throwaway demo project).
// Run: npm run build && npm run screenshots
// (headless Linux: xvfb-run -a npm run screenshots)
const { _electron } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { prepareConfigDir, withTestKeys, waitForShell } = require('../e2e/helpers.cjs');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gs-demo-')));
const shop = path.join(home, 'shop');

function write(rel, text, mode) {
  const file = path.join(home, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  if (mode) fs.chmodSync(file, mode);
}

// ---- Demo project ----
write('.bashrc', [
  "PS1='\\[\\e[38;5;75m\\]\\W\\[\\e[0m\\] \\[\\e[38;5;245m\\]❯\\[\\e[0m\\] '",
  "alias ls='ls --color=auto'",
  'export LESS=-R',
  'export GIT_PAGER=cat'
].join('\n') + '\n');
write('.profile', '. ~/.bashrc\n');
write('shop/api/server.ts', `import express from 'express'
import { routes } from './routes'

const app = express()
app.use(express.json())
app.use('/api', routes)

app.listen(3000, () => console.log('API on :3000'))
`);
write('shop/api/routes.ts', `import { Router } from 'express'
import { db } from './db'

export const routes = Router()

routes.get('/products', async (_req, res) => {
  res.json(await db.products.list())
})

routes.post('/cart', async (req, res) => {
  const { productId, quantity } = req.body
  const item = await db.cart.add(productId, quantity)
  res.status(201).json(item)
})
`);
write('shop/api/README.md', '# Shop API\n\nREST API for the shop front end.\n');
write('shop/api/package.json', '{\n  "name": "shop-api",\n  "scripts": { "test": "./test.sh" }\n}\n');
write('shop/api/test.sh', `#!/bin/sh
g='\\033[32m'; d='\\033[2m'; b='\\033[1m'; r='\\033[0m'
printf "\${b} RUN \${r} \${d}shop-api\${r}\\n\\n"
for t in "products › lists products" "products › 404 for unknown id" "cart › adds an item" "cart › computes totals" "checkout › rejects empty cart"; do
  printf " \${g}✓\${r} %s \${d}(%sms)\${r}\\n" "$t" $(( (\${#t} * 7) % 40 + 3 ))
done
printf "\\n \${b}Tests\${r}  \${g}5 passed\${r} (5)\\n \${b}Time\${r}   412ms\\n"
`, 0o755);
write('shop/web/dev.sh', `#!/bin/sh
g='\\033[32m'; c='\\033[36m'; d='\\033[2m'; b='\\033[1m'; r='\\033[0m'
printf "\\n  \${g}\${b}VITE\${r} \${g}v8.3.5\${r}  \${d}ready in\${r} \${b}284\${r} ms\\n\\n"
printf "  \${g}➜\${r}  \${b}Local\${r}:   \${c}http://localhost:5173/\${r}\\n"
printf "  \${g}➜\${r}  \${d}Network: use --host to expose\${r}\\n\\n"
printf "\${d}10:42:07\${r} \${c}[vite]\${r} hmr update \${d}/src/App.tsx\${r}\\n"
printf "\${d}10:42:19\${r} \${c}[vite]\${r} hmr update \${d}/src/Cart.tsx\${r}\\n"
`, 0o755);
write('shop/web/src/App.tsx', 'export function App() {\n  return <Shop />\n}\n');
write('shop/web/src/Cart.tsx', `import { useState } from 'react'
import type { Item } from './types'
import { CartRow } from './CartRow'

export function Cart({ items, onCheckout }: { items: Item[]; onCheckout(): void }) {
  const [coupon, setCoupon] = useState('')
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const discount = coupon === 'SAVE10' ? subtotal * 0.1 : 0
  return (
    <aside className="cart">
      {items.map((i) => <CartRow key={i.id} item={i} />)}
      <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon" />
      <p>Total: \${(subtotal - discount).toFixed(2)}</p>
      <button disabled={!items.length} onClick={onCheckout}>Checkout</button>
    </aside>
  )
}
`);
write('shop/logs/app.log', [
  ['10:41:52', 'INFO ', 'server started on :3000'],
  ['10:41:58', 'INFO ', 'GET /api/products 200 18ms'],
  ['10:42:03', 'INFO ', 'POST /api/cart 201 9ms'],
  ['10:42:11', 'WARN ', 'slow query products.list 412ms'],
  ['10:42:14', 'INFO ', 'GET /api/products/42 200 6ms'],
  ['10:42:20', 'ERROR', 'POST /api/checkout 400 empty cart'],
  ['10:42:26', 'INFO ', 'GET /api/cart 200 4ms']
].map(([t, l, m]) => {
  const color = l.startsWith('ERROR') ? '31' : l.startsWith('WARN') ? '33' : '32';
  return `\x1b[2m${t}\x1b[0m \x1b[${color}m${l}\x1b[0m ${m}`;
}).join('\n') + '\n');

// A little git history for the api session.
const git = (cmd) => execSync(`git ${cmd}`, { cwd: path.join(shop, 'api'), env: { ...process.env, HOME: home, GIT_AUTHOR_NAME: 'Demo', GIT_AUTHOR_EMAIL: 'demo@example.com', GIT_COMMITTER_NAME: 'Demo', GIT_COMMITTER_EMAIL: 'demo@example.com' }, stdio: 'ignore' });
git('init -q -b main');
for (const [file, msg] of [['package.json', 'Set up the shop API'], ['server.ts', 'Add Express server'], ['routes.ts', 'Add products route'], ['README.md', 'Document the API']]) {
  git(`add ${file}`);
  git(`commit -q -m "${msg}"`);
}

// Claude Code gets its own minimal config, so the demo doesn't show (or change)
// the real one; the login comes from the environment as usual.
const claudeDir = path.join(home, '.claude-demo');
fs.mkdirSync(claudeDir, { recursive: true });
fs.writeFileSync(path.join(claudeDir, '.claude.json'), JSON.stringify({
  hasCompletedOnboarding: true,
  theme: 'dark',
  autoUpdates: false,
  projects: Object.fromEntries(['shop/api', 'shop/web'].map((p) => [path.join(home, p), { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true }]))
}, null, 2));

// When this script itself runs inside Claude Code, don't pass on its
// child-session marker (it would make the demo sessions show a warning).
const demoEnv = { ...process.env, HOME: home, SHELL: '/bin/bash', CLAUDE_CONFIG_DIR: claudeDir };
delete demoEnv.CLAUDE_CODE_CHILD_SESSION;
delete demoEnv.CLAUDE_CODE_CHILD_NOTES_DIR;

// ---- Run the app ----
(async () => {
  const cfgDir = prepareConfigDir();
  demoEnv.GRID_SHELL_CONFIG_DIR = cfgDir;
  fs.writeFileSync(path.join(cfgDir, 'config.toml'), withTestKeys('[font]\nfamily = "JetBrains Mono, monospace"\nsize = 13\n[app]\nrestoreSessions = false\nconfirmQuit = false\n'));
  const app = await _electron.launch({
    args: [path.join(root, 'out/main/index.js'), '--no-sandbox'], cwd: root,
    executablePath: require(path.join(root, 'node_modules/electron')),
    env: demoEnv
  });
  const w = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.unmaximize(); b.setBounds({ x: 0, y: 0, width: 1600, height: 1000 }); });
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map((m) => map[m]) });
    await w.waitForTimeout(150);
  };
  const run = async (cmd, wait = 500) => { await w.keyboard.type(cmd + '\n'); await w.waitForTimeout(wait); };
  const rename = async (name) => { await w.dblclick('.tile.active .title'); await w.fill('.rename', name); await w.keyboard.press('Enter'); };

  const claude = async (prompt) => {
    await run('claude --permission-mode acceptEdits', 9000);
    await w.keyboard.type(prompt, { delay: 5 });
    await w.waitForTimeout(400);
    await w.keyboard.press('Enter');
  };

  await w.waitForSelector('.tile'); await waitForShell(w);
  // Session 1: Claude Code changing the API (after a look around, for the Context panel)
  await rename('claude · api');
  await run('cd ~/shop/api && clear');
  await run('cat routes.ts');
  await run('git log --oneline --decorate', 600);
  await claude('In routes.ts, validate the POST /cart body: quantity must be a positive integer, otherwise respond 400 with a short error message. Keep the change small and do not run any commands.');
  // Session 2: Claude Code explaining the front end
  await key('Control+Shift+T'); await waitForShell(w); await rename('claude · web');
  await run('cd ~/shop/web && clear');
  await claude('In two or three sentences, what does src/Cart.tsx do?');
  // Session 3: dev server
  await key('Control+Shift+T'); await waitForShell(w); await rename('dev server');
  await run('cd ~/shop/web && clear && ./dev.sh', 700);
  // Session 4: tests
  await key('Control+Shift+T'); await waitForShell(w); await rename('tests');
  await run('cd ~/shop/api && clear && ./test.sh', 900);

  // Let both Claude Code sessions finish (up to ~2 minutes).
  const screen = (id) => w.evaluate((id) => { const t = window.__gridShellTerminals.get(id); const b = t.buffer.active; let s = ''; for (let i = 0; i < b.length; i++) s += (b.getLine(i)?.translateToString(true) ?? '') + '\n'; return s; }, id);
  for (let i = 0; i < 60; i++) {
    const [a, b] = [await screen(1), await screen(2)];
    const busy = /esc to interrupt/i.test(a) || /esc to interrupt/i.test(b);
    if (!busy && i > 5) break;
    await w.waitForTimeout(2000);
  }
  if (process.env.DEBUG_SCREENSHOTS) for (const id of [1, 2]) console.log(`--- session ${id} ---\n` + (await screen(id)).split('\n').filter((l) => l.trim()).slice(-40).join('\n'));

  fs.mkdirSync(outDir, { recursive: true });
  await key('Alt+1'); // make "claude · api" active
  await w.mouse.move(2, 2);
  await w.waitForTimeout(600);
  await w.screenshot({ path: path.join(outDir, 'grid.png') });

  await key('Control+Shift+Enter'); // focus mode on "claude · api"
  await w.waitForSelector('.context-panel');
  await w.waitForTimeout(700);
  await w.screenshot({ path: path.join(outDir, 'focus.png') });

  await app.close();
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`Saved ${path.relative(root, path.join(outDir, 'grid.png'))} and ${path.relative(root, path.join(outDir, 'focus.png'))}`);
})().catch((e) => { console.error(e); process.exit(1); });
