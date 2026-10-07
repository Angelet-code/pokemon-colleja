/**
 * Prepares the vendored Pokémon Showdown simulator (git submodule at vendor/pokemon-showdown):
 *
 *   1. Syncs the submodule to the commit pinned in this repository (shallow clone).
 *   2. Installs Showdown's own dependencies, skipping install scripts so that optional native
 *      modules (SQLite drivers used only by the Showdown server) are never compiled.
 *   3. Builds `dist/` (CommonJS) and emits type declarations for the modules we consume.
 *
 * Idempotent: a stamp file records the commit that was built, so re-runs are no-ops until the
 * pinned commit changes. Pass `--force` to rebuild anyway.
 *
 * Runs automatically on `npm install` (root `postinstall`) and manually with `npm run setup`.
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SHOWDOWN_DIR = join(ROOT, 'vendor', 'pokemon-showdown');
const STAMP_FILE = join(SHOWDOWN_DIR, 'dist', '.colleja-build');

/** Entry points whose type declarations we need (index + tools used by our packages). */
const DECLARATION_ENTRIES = [
  'sim/global-types.ts',
  'sim/index.ts',
  'sim/tools/random-player-ai.ts',
];

const force = process.argv.includes('--force');

function log(message: string): void {
  console.log(`[setup] ${message}`);
}

function run(command: string, args: string[], cwd: string): void {
  if (command === 'npm' && process.platform === 'win32') {
    // npm is a .cmd shim on Windows and can only be spawned through a shell.
    // Arguments are constants from this file, so joining them is safe.
    execSync(`npm ${args.join(' ')}`, { cwd, stdio: 'inherit' });
    return;
  }
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

function capture(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, encoding: 'utf8' }).trim();
}

function syncSubmodule(): void {
  try {
    run('git', ['submodule', 'update', '--init', '--depth', '1', 'vendor/pokemon-showdown'], ROOT);
  } catch (error) {
    // Not fatal when the submodule is already present (e.g. offline, or a non-git copy).
    if (!existsSync(join(SHOWDOWN_DIR, 'package.json'))) throw error;
    log('No se pudo sincronizar el submódulo; se usa la copia existente.');
  }
}

function readStamp(): string | null {
  return existsSync(STAMP_FILE) ? readFileSync(STAMP_FILE, 'utf8').trim() : null;
}

function main(): void {
  log('Sincronizando vendor/pokemon-showdown…');
  syncSubmodule();

  const commit = capture('git', ['rev-parse', 'HEAD'], SHOWDOWN_DIR);
  if (!force && readStamp() === commit) {
    log(`Showdown ${commit.slice(0, 7)} ya está compilado. Nada que hacer.`);
    return;
  }

  log(`Instalando dependencias de Showdown ${commit.slice(0, 7)}…`);
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], SHOWDOWN_DIR);

  log('Compilando Showdown (dist/)…');
  run(process.execPath, ['build'], SHOWDOWN_DIR);

  log('Generando declaraciones de tipos…');
  const tsc = join(SHOWDOWN_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
  run(
    process.execPath,
    [
      tsc,
      ...DECLARATION_ENTRIES,
      '--declaration',
      '--emitDeclarationOnly',
      '--declarationDir',
      'dist/',
      '--target',
      'es2020',
      '--strict',
      '--moduleResolution',
      'node',
      '--types',
      'node',
      '--lib',
      'es2020',
    ],
    SHOWDOWN_DIR,
  );

  writeFileSync(STAMP_FILE, `${commit}\n`);
  log(`Listo: Showdown ${commit.slice(0, 7)} compilado.`);
}

main();
