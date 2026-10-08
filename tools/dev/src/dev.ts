/**
 * `npm run dev`: the local server (apps/server, with reload) and the web app (Vite) together.
 * Output is prefixed per process; Ctrl+C stops both. If one of them dies, the other stops too.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WEB_URL = `http://127.0.0.1:${process.env.WEB_PORT ?? 5173}`;

const PROCESSES = [
  // The server sends page requests to Vite instead of serving a possibly stale apps/web/dist.
  {
    name: 'server',
    color: 36,
    args: ['run', 'dev', '-w', '@colleja/server'],
    env: { WEB_DEV_URL: WEB_URL },
  },
  { name: 'web', color: 35, args: ['run', 'dev', '-w', '@colleja/web'], env: {} },
] as const;

const children: ChildProcess[] = [];
let stopping = false;

function prefix(name: string, color: number, chunk: Buffer): string {
  const label = `\x1b[${color}m[${name}]\x1b[0m `;
  return chunk
    .toString()
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => label + line)
    .join('\n');
}

function stop(code: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}

for (const { name, color, args, env } of PROCESSES) {
  // A single command string through the shell works the same on Windows (npm.cmd) and Unix.
  const child = spawn(`npm ${args.join(' ')}`, {
    cwd: ROOT,
    shell: true,
    env: { ...process.env, ...env },
  });
  child.stdout?.on('data', (chunk: Buffer) => console.log(prefix(name, color, chunk)));
  child.stderr?.on('data', (chunk: Buffer) => console.error(prefix(name, color, chunk)));
  child.on('exit', (code) => {
    if (!stopping) console.log(`[${name}] terminó (código ${code ?? '?'}); parando el resto.`);
    stop(code ?? 1);
  });
  children.push(child);
}

console.log(
  `Servidor en http://127.0.0.1:3001 · Web en \x1b[1m${WEB_URL}\x1b[0m (Ctrl+C para parar)`,
);
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
