import { cp, mkdir, rm, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, resolve, sep } from 'node:path';
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
  'circuit-model.js', 'circuit-editor.js', 'circuit.css',
];
for (const entry of entries) await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
// Validate the published entry point too: source checks cannot detect omitted build files.
const html = await readFile(resolve(output, 'index.html'), 'utf8');
for (const [, reference] of html.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']/g)) {
  if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!clean) continue;
  const target = resolve(output, clean);
  if (!target.startsWith(output + sep)) throw new Error(`Published reference escapes dist: ${reference}`);
  const file = await stat(target).catch(() => null);
  if (!file?.isFile()) throw new Error(`Missing published file: ${reference}`);
}
console.log('Static game built in dist/');
