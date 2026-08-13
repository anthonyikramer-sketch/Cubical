'use strict';
/**
 * Cross-platform preinstall guard (runs on Windows, Linux, macOS).
 * - Removes stray lockfiles left by npm/yarn
 * - Enforces pnpm as the only allowed package manager
 */
const fs = require('fs');

// Remove accidental lockfiles from other package managers
for (const file of ['package-lock.json', 'yarn.lock']) {
  try { fs.unlinkSync(file); } catch { /* not present — fine */ }
}

// Enforce pnpm usage (npm_config_user_agent is set by all package managers)
const agent = process.env.npm_config_user_agent ?? '';
if (agent && !agent.startsWith('pnpm/')) {
  console.error('Error: This project must be installed with pnpm.');
  console.error('       Install it at https://pnpm.io, then re-run the install.');
  process.exit(1);
}
