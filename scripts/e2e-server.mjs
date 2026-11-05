import { spawn, spawnSync } from 'node:child_process';

const build = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    SESSION_SECRET: 'playwright-session-secret-at-least-32',
    COOKIE_SECURE: 'false',
    ALLOWED_ORIGINS: 'http://localhost:4173',
    DATABASE_PATH: ':memory:',
  },
});
const preview = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    'apps/web',
    '--host',
    'localhost',
    '--port',
    '4173',
  ],
  { stdio: 'inherit' },
);

let shuttingDown = false;
let serverExited = false;
let previewExited = false;
let requestedExitCode = 0;

function finishWhenStopped() {
  if (shuttingDown && serverExited && previewExited)
    process.exit(requestedExitCode);
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = code;
  if (!serverExited) server.kill('SIGTERM');
  if (!previewExited) preview.kill('SIGTERM');
  const force = setTimeout(() => {
    if (!serverExited) server.kill('SIGKILL');
    if (!previewExited) preview.kill('SIGKILL');
    process.exit(requestedExitCode);
  }, 5_000);
  void force;
  finishWhenStopped();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
server.on('exit', (code) => {
  serverExited = true;
  if (!shuttingDown) shutdown(code ?? 1);
  finishWhenStopped();
});
preview.on('exit', (code) => {
  previewExited = true;
  if (!shuttingDown) shutdown(code ?? 1);
  finishWhenStopped();
});
