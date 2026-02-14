import * as fs from 'fs';
import { initEngine, startCycleLoop } from './agents/engine';
import { startServer } from './server';

// Ensure data directory exists
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data', { recursive: true });
}

async function main() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║         GENESIS — AI CIVILIZATION            ║
  ║    Same world. Better outcomes. Why?         ║
  ╚══════════════════════════════════════════════╝
  `);

  // Initialize agent wallets and load state
  await initEngine();

  // Start the Express server (dashboard + API)
  startServer();

  // Start the autonomous cycle loop
  startCycleLoop();

  console.log('[GENESIS] Civilization is LIVE. Watch the dashboard.');
}

main().catch(err => {
  console.error('[GENESIS] Fatal error:', err);
  process.exit(1);
});
