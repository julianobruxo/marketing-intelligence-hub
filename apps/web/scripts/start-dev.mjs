import { spawn } from 'child_process';
console.log('Starting Next.js Dev Server...');
const next = spawn('npm', ['run', 'dev:next'], {
  stdio: 'inherit',
  shell: true,
});
next.on('exit', (code) => process.exit(code));
