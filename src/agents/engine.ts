import { ethers } from 'ethers';
import * as fs from 'fs';
import { config } from '../config';
import { AgentRole, AGENT_ROLES, initWallets, getAgentWallet, getAgentAddress } from './wallets';
import { getPersonality } from './personalities';
import { AgentDecision, FeedEntry, CivilizationState, EconomyMetrics, AgentState } from './types';
import { getAgentDecision } from '../ai/brain';
import { getBalance, transferMON, txLink } from '../blockchain/monad';
import { recordTransaction, calculateMetrics } from '../economy/tracker';
import { updateMetrics } from '../economy/compare';
import { postToMoltbook } from '../social/moltbook';

const STATE_FILE = './data/state.json';
const MAX_FEED = 200;

let state: CivilizationState = {
  agents: [],
  feed: [],
  metrics: {
    gdp: 0, gdpGrowth: 0, giniCoefficient: 0, unemployment: 0,
    povertyRate: 0, corruptionIndex: 0, tradeVolume: 0,
    totalCirculation: 0, averageWealth: 0, cycleNumber: 0,
  },
  metricsHistory: [],
  cycleNumber: 0,
  startedAt: Date.now(),
};

let running = false;

function loadState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const loaded = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      state = {
        agents: loaded.agents || [],
        feed: loaded.feed || [],
        metrics: loaded.metrics || state.metrics,
        metricsHistory: loaded.metricsHistory || [],
        cycleNumber: typeof loaded.cycleNumber === 'number' ? loaded.cycleNumber : 0,
        startedAt: loaded.startedAt || Date.now(),
      };
      console.log(`[ENGINE] Loaded state: cycle ${state.cycleNumber}`);
    }
  } catch {
    console.log('[ENGINE] No existing state, starting fresh');
  }
}

function saveState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[ENGINE] Failed to save state:', err);
  }
}

function addFeed(entry: FeedEntry): void {
  state.feed.unshift(entry);
  if (state.feed.length > MAX_FEED) state.feed = state.feed.slice(0, MAX_FEED);
}

async function refreshAgentStates(): Promise<void> {
  const oldAgents = [...state.agents];
  state.agents = [];
  for (const role of AGENT_ROLES) {
    const address = getAgentAddress(role);
    const balance = await getBalance(address);
    const existing = oldAgents.find(a => a.role === role);
    state.agents.push({
      role,
      address,
      balance,
      totalSent: existing?.totalSent || 0,
      totalReceived: existing?.totalReceived || 0,
      lastAction: existing?.lastAction || 'Awaiting first cycle',
      lastStatement: existing?.lastStatement || '',
    });
  }
}

function buildStateContext(role: AgentRole): string {
  const agentBalances = state.agents
    .map(a => `  ${a.role}: ${a.balance} MON (${a.address.slice(0, 10)}...)`)
    .join('\n');

  const recentFeed = state.feed
    .slice(0, 10)
    .map(f => `  [${f.agent}] ${f.action}: ${f.detail}`)
    .join('\n');

  const m = state.metrics;

  return `CURRENT CYCLE: ${state.cycleNumber + 1}

AGENT BALANCES:
${agentBalances}

ECONOMY METRICS:
  GDP (last cycle): ${m.gdp} MON
  GDP Growth: ${m.gdpGrowth}%
  Gini Coefficient: ${m.giniCoefficient} (0=equal, 1=unequal)
  Unemployment: ${m.unemployment}%
  Poverty Rate: ${m.povertyRate}%
  Trade Volume: ${m.tradeVolume} transactions
  Total Circulation: ${m.totalCirculation} MON

RECENT ACTIVITY:
${recentFeed || '  No activity yet — this is the first cycle!'}

Your role: ${role.toUpperCase()}
Your balance: ${state.agents.find(a => a.role === role)?.balance || '?'} MON

Make your decision for this cycle. Remember: keep amounts SMALL (0.01-0.1 MON).
Only transfer to agents that EXIST: governor, merchant, builder, banker, worker, philosopher.`;
}

async function executeAgentActions(role: AgentRole, decision: AgentDecision): Promise<void> {
  const wallet = getAgentWallet(role);

  for (const action of decision.actions) {
    if (action.type === 'transfer' && action.to && action.amount) {
      const amount = parseFloat(action.amount);
      if (isNaN(amount) || amount <= 0 || amount > 0.15) {
        console.log(`[ENGINE] ${role}: Skipping invalid amount ${action.amount}`);
        continue;
      }

      // Verify target is a valid agent
      if (!AGENT_ROLES.includes(action.to as AgentRole)) {
        console.log(`[ENGINE] ${role}: Skipping invalid target ${action.to}`);
        continue;
      }

      // Check balance
      const balance = parseFloat(await getBalance(getAgentAddress(role)));
      if (balance < amount + 0.001) { // Keep some for gas
        console.log(`[ENGINE] ${role}: Insufficient balance (${balance}) for transfer of ${amount}`);
        continue;
      }

      try {
        const toAddress = getAgentAddress(action.to as AgentRole);
        const txHash = await transferMON(wallet, toAddress, amount.toFixed(4));

        recordTransaction(role, action.to as AgentRole, amount);

        addFeed({
          timestamp: Date.now(),
          agent: role,
          action: `Sent ${amount.toFixed(4)} MON to ${action.to}`,
          detail: action.reason,
          txHash,
          comparison: decision.comparison,
        });

        console.log(`[ENGINE] ${role} → ${action.to}: ${amount} MON (${txHash.slice(0, 10)}...)`);

        // Update agent state
        const agentState = state.agents.find(a => a.role === role);
        if (agentState) {
          agentState.totalSent += amount;
          agentState.lastAction = `Sent ${amount} MON to ${action.to}`;
        }
        const targetState = state.agents.find(a => a.role === action.to);
        if (targetState) {
          targetState.totalReceived += amount;
        }

        // Small delay between transactions to avoid nonce issues
        await new Promise(r => setTimeout(r, 2000));
      } catch (err: any) {
        console.error(`[ENGINE] ${role} transfer failed:`, err.message);
        addFeed({
          timestamp: Date.now(),
          agent: role,
          action: `Transfer failed`,
          detail: `Tried to send ${amount} MON to ${action.to}: ${err.message}`,
        });
      }
    }

    if (action.type === 'post' && action.content) {
      // Philosopher posts to Moltbook
      try {
        const title = `GENESIS Cycle ${state.cycleNumber + 1} — AI vs Reality`;
        await postToMoltbook(title, action.content);
        addFeed({
          timestamp: Date.now(),
          agent: role,
          action: 'Posted to Moltbook',
          detail: action.content.substring(0, 100) + '...',
        });
      } catch (err: any) {
        console.error(`[ENGINE] Moltbook post failed:`, err.message);
      }
    }
  }

  // Record public statement
  if (decision.public_statement) {
    const agentState = state.agents.find(a => a.role === role);
    if (agentState) {
      agentState.lastStatement = decision.public_statement;
    }
    addFeed({
      timestamp: Date.now(),
      agent: role,
      action: 'Statement',
      detail: decision.public_statement,
      comparison: decision.comparison,
    });
  }
}

async function runAgentCycle(role: AgentRole): Promise<void> {
  console.log(`[ENGINE] Running ${role}...`);

  const personality = getPersonality(role);
  const context = buildStateContext(role);

  try {
    const decision: AgentDecision = await getAgentDecision(personality, context);
    console.log(`[ENGINE] ${role} decided:`, decision.thought);
    await executeAgentActions(role, decision);
  } catch (err: any) {
    console.error(`[ENGINE] ${role} cycle failed:`, err.message);
    addFeed({
      timestamp: Date.now(),
      agent: role,
      action: 'Decision failed',
      detail: err.message,
    });
  }
}

export async function runCycle(): Promise<void> {
  if (running) {
    console.log('[ENGINE] Cycle already running, skipping');
    return;
  }

  running = true;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[ENGINE] === CYCLE ${state.cycleNumber + 1} START ===`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // Refresh all balances
    await refreshAgentStates();

    // Governor acts FIRST (sets policy, redistributes)
    await runAgentCycle('governor');

    // Other agents act (sequential to avoid nonce conflicts)
    for (const role of ['merchant', 'builder', 'banker', 'worker'] as AgentRole[]) {
      await runAgentCycle(role);
    }

    // Philosopher acts LAST (analyzes and posts)
    await runAgentCycle('philosopher');

    // Calculate and update metrics
    state.cycleNumber++;
    const metrics = await calculateMetrics(state.cycleNumber);
    state.metrics = metrics;
    state.metricsHistory.push(metrics);
    if (state.metricsHistory.length > 100) {
      state.metricsHistory = state.metricsHistory.slice(-100);
    }
    updateMetrics(metrics);

    // Refresh balances after all transfers
    await refreshAgentStates();

    console.log(`\n[ENGINE] === CYCLE ${state.cycleNumber} COMPLETE ===`);
    console.log(`[ENGINE] GDP: ${metrics.gdp} MON | Gini: ${metrics.giniCoefficient} | Trades: ${metrics.tradeVolume}`);

    saveState();
  } catch (err: any) {
    console.error('[ENGINE] Cycle error:', err.message);
  } finally {
    running = false;
  }
}

export function getState(): CivilizationState {
  return state;
}

export function getFeed(): FeedEntry[] {
  return state.feed;
}

export async function initEngine(): Promise<void> {
  console.log('[ENGINE] Initializing GENESIS civilization...');

  initWallets();
  loadState();

  // Print all agent addresses
  console.log('\n[ENGINE] Agent wallets:');
  for (const role of AGENT_ROLES) {
    const addr = getAgentAddress(role);
    const bal = await getBalance(addr);
    console.log(`  ${role.padEnd(12)} ${addr} (${bal} MON)`);
  }
  console.log('');

  // Initial state refresh
  await refreshAgentStates();

  // Restore metrics to comparison engine if we have history
  if (state.metrics && state.metrics.cycleNumber > 0) {
    updateMetrics(state.metrics);
  }

  saveState();
}

export function startCycleLoop(): void {
  console.log(`[ENGINE] Starting cycle loop (every ${config.cycleIntervalMs / 1000}s)`);

  // Run first cycle after a short delay
  setTimeout(() => runCycle(), 5000);

  // Then run on interval
  setInterval(() => runCycle(), config.cycleIntervalMs);
}
