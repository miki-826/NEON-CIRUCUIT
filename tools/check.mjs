import { readdir, readFile, stat, open } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, relative, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'out', 'preview', '__pycache__'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
for (const file of files) {
  const handle = await open(file, 'r');
  const header = Buffer.alloc(128);
  await handle.read(header, 0, header.length, 0);
  await handle.close();
  if (header.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) {
    errors.push(`LFS実体が未取得です: ${relative(root, file)}。git lfs pull を実行してください。`);
    continue;
  }

  if (['.js', '.cjs', '.mjs'].includes(extname(file))) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) errors.push(result.stderr || `構文確認に失敗: ${relative(root, file)}`);
  }
}

const sourceFiles = files.filter(file => ['.html', '.css'].includes(extname(file)));
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const references = [
    ...source.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']/g),
    ...source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g),
  ];
  for (const [, reference] of references) {
    if (/^(?:[a-z]+:|\/\/|#)/i.test(reference)) continue;
    const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
    if (!clean) continue;
    const path = resolve(dirname(file), clean);
    if (path !== root && !path.startsWith(root + sep)) {
      errors.push(`リポジトリ外への参照: ${reference}`);
      continue;
    }
    try { await stat(path); }
    catch { errors.push(`参照先がありません: ${relative(root, file)} -> ${reference}`); }
  }
}

const skills = ['pulse','volley','beam','blast','seeker','arc','orbital','slash','orbit','repair',
  'shock','dash','barrier','haste','frost','magnet','aegis'];
const required = [
  'assets/movie/opening.mp4', 'assets/movie/title-loop.mp4', 'assets/audio/Metal_and_Nerve.mp3',
  'assets/audio/core-lockdown.mp3', 'vendor/models.js', 'vendor/three-LICENSE.txt',
  ...skills.map(id => `assets/skills/${id}.webp`),
];
for (const name of required) {
  try { if (!(await stat(resolve(root, name))).size) errors.push(`空の素材: ${name}`); }
  catch { errors.push(`必須素材がありません: ${name}`); }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  console.log(`OK: ${files.length} files, JavaScript syntax, local references and required assets.`);
}
