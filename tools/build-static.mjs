import { cp, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
const check = spawnSync(process.execPath, [resolve(root, 'tools/check.mjs')], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status ?? 1);

// Only this fixed build directory is replaced. Sources remain in the repository.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const entries = [
  'index.html', 'game.js', 'render3d.js', 'effects.js', 'mission.js', 'sound.js',
  'style.css', 'battle.css', 'hud.css', 'title.js', 'title.css', 'assets', 'vendor',
];
for (const entry of entries) await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
console.log('Static game built in dist/');
