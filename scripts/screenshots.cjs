// Regenerates the README screenshots (docs/screenshots/*.png) from a demo
// project with four sessions. Run: npm run build && npm run screenshots
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

export const routes = Router()

routes.get('/products', async (_req, res) => {
  res.json(await db.products.list())
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

// ---- Run the app ----
(async () => {
  const cfgDir = prepareConfigDir();
  fs.writeFileSync(path.join(cfgDir, 'config.toml'), withTestKeys('[font]\nfamily = "JetBrains Mono, monospace"\nsize = 13\n[app]\nrestoreSessions = false\nconfirmQuit = false\n'));
  const app = await _electron.launch({
    args: [path.join(root, 'out/main/index.js'), '--no-sandbox'], cwd: root,
    executablePath: require(path.join(root, 'node_modules/electron')),
    env: { ...process.env, HOME: home, SHELL: '/bin/bash', GRID_SHELL_CONFIG_DIR: cfgDir }
  });
  const w = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; b.unmaximize(); b.setBounds({ x: 0, y: 0, width: 1440, height: 880 }); });
  const key = async (accel) => {
    const parts = accel.split('+'); const k = parts.pop();
    const map = { Control: 'control', Shift: 'shift', Alt: 'alt' };
    await app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent(ev), { type: 'keyDown', keyCode: k, modifiers: parts.map((m) => map[m]) });
    await w.waitForTimeout(150);
  };
  const run = async (cmd, wait = 500) => { await w.keyboard.type(cmd + '\n'); await w.waitForTimeout(wait); };
  const rename = async (name) => { await w.dblclick('.tile.active .title'); await w.fill('.rename', name); await w.keyboard.press('Enter'); };

  await w.waitForSelector('.tile'); await waitForShell(w);
  // Session 1: api
  await rename('api');
  await run('cd ~/shop/api && clear');
  await run('vim server.ts', 1200); await w.keyboard.type(':q\n'); await w.waitForTimeout(400);
  await run('less README.md', 800); await w.keyboard.type('q'); await w.waitForTimeout(300);
  await run('cat routes.ts');
  await run('git log --oneline --decorate', 600);
  await run('ls -l');
  // Session 2: web
  await key('Control+Shift+T'); await waitForShell(w); await rename('web');
  await run('cd ~/shop/web && clear && ./dev.sh', 700);
  // Session 3: tests
  await key('Control+Shift+T'); await waitForShell(w); await rename('tests');
  await run('cd ~/shop/api && clear && ./test.sh', 900);
  // Session 4: logs
  await key('Control+Shift+T'); await waitForShell(w); await rename('logs');
  await run('cd ~/shop/logs && clear && tail -n 12 app.log', 600);

  fs.mkdirSync(outDir, { recursive: true });
  await key('Alt+1'); // make "api" active
  await w.mouse.move(2, 2);
  await w.waitForTimeout(600);
  await w.screenshot({ path: path.join(outDir, 'grid.png') });

  await key('Control+Shift+Enter'); // focus mode on "api"
  await w.waitForSelector('.context-panel');
  await w.waitForTimeout(700);
  await w.screenshot({ path: path.join(outDir, 'focus.png') });

  await app.close();
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`Saved ${path.relative(root, path.join(outDir, 'grid.png'))} and ${path.relative(root, path.join(outDir, 'focus.png'))}`);
})().catch((e) => { console.error(e); process.exit(1); });
