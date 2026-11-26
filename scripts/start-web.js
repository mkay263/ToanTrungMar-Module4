'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const webDir = path.join(repoRoot, 'apps', 'web');
const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const preloadScript = path.join(repoRoot, 'scripts', 'fix-windows-mkdir.js');

const rawPort = (process.env.PORT || '3000').trim();
const port = /^\d+$/.test(rawPort) ? rawPort : '3000';
const host = (process.env.HOST || process.env.HOSTNAME || '0.0.0.0').trim() || '0.0.0.0';

const child = spawn(
  process.execPath,
  ['-r', preloadScript, nextBin, 'start', '-H', host, '-p', port],
  {
    cwd: webDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: port,
    },
  },
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
