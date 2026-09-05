#!/usr/bin/env node
import { spawn } from 'node:child_process';

const journeys = [
  'scripts/browser_saved_meeting_e2e.mjs',
  'scripts/browser_meeting_preparation_e2e.mjs',
];

async function runJourney(script) {
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) {
    throw new Error(`${script} exited with code ${code}`);
  }
}

for (const journey of journeys) {
  await runJourney(journey);
}
