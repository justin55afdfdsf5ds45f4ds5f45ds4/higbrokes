require('dotenv').config({ override: true });
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { ethers } = require('ethers');

// ====== ARENA WALLET — buys $WON on nad.fun bonding curve ======
const MONAD_RPC = process.env.MONAD_RPC || 'https://rpc.monad.xyz';
const WON_TOKEN = process.env.WON_TOKEN || '0x9d36A73462962d767509FC170c287634A0907777';
const NADFUN_ROUTER = '0x6F6B8F1a20703309951a5127c45B49b1CD981A22';
const NADFUN_ROUTER_ABI = [
  'function buy(tuple(uint256 amountOutMin, address token, address to, uint256 deadline) params) payable',
];

let arenaProvider = null;
let arenaWallet = null;
let nadRouter = null;

try {
  if (process.env.ARENA_WALLET_KEY) {
    arenaProvider = new ethers.JsonRpcProvider(MONAD_RPC);
    arenaWallet = new ethers.Wallet(process.env.ARENA_WALLET_KEY, arenaProvider);
    nadRouter = new ethers.Contract(NADFUN_ROUTER, NADFUN_ROUTER_ABI, arenaWallet);
    console.log(`Arena wallet loaded: ${arenaWallet.address}`);
    console.log(`nad.fun router ready — will buy $WON on every fight`);
  } else {
    console.warn('No ARENA_WALLET_KEY — transactions will be simulated');
  }
} catch (e) {
  console.error('Failed to load arena wallet:', e.message);
}

// Buy $WON on nad.fun bonding curve. Returns tx hash or null.
const MIN_WALLET_BALANCE = 0.005; // Keep at least 0.005 MON in wallet
async function sendArenaBet(toAddress, amountMON, reason) {
  if (!arenaWallet || !nadRouter) return null;
  try {
    // Balance protection — never drain the wallet
    const balance = await arenaProvider.getBalance(arenaWallet.address);
    const balMON = parseFloat(ethers.formatEther(balance));
    if (balMON < MIN_WALLET_BALANCE + amountMON) {
      console.warn(`$WON BUY skipped (${reason}): balance too low (${balMON.toFixed(6)} MON)`);
      return null;
    }
    const deadline = Math.floor(Date.now() / 1000) + 300; // 5 min
    const tx = await nadRouter.buy(
      {
        amountOutMin: 0, // accept any amount (tiny buys, slippage doesn't matter)
        token: WON_TOKEN,
        to: arenaWallet.address,
        deadline,
      },
      { value: ethers.parseEther(String(amountMON)) }
    );
    console.log(`$WON BUY (${reason}): ${tx.hash} — ${amountMON} MON → $WON`);
    return tx.hash;
  } catch (e) {
    console.error(`$WON BUY failed (${reason}):`, e.message);
    return null;
  }
}

// ====== REPLICATE API HELPER ======
async function callReplicate(prompt, systemPrompt) {
  const token = process.env.REPLICATE_API_TOKEN;
  const model = process.env.REPLICATE_MODEL || 'anthropic/claude-4.5-sonnet';
  if (!token) { console.warn('No REPLICATE_API_TOKEN set'); return null; }
  try {
    const url = model.includes('/')
      ? `https://api.replicate.com/v1/models/${model}/predictions`
      : 'https://api.replicate.com/v1/predictions';
    // Claude models use: prompt, max_tokens, system_prompt
    const isClaude = model.includes('anthropic/') || model.includes('claude');
    const input = isClaude
      ? { prompt, max_tokens: 8192, system_prompt: systemPrompt || '', max_image_resolution: 0.5 }
      : { prompt };
    const body = model.includes('/')
      ? { input }
      : { version: model, input };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.status === 'succeeded' && data.output) {
      const output = data.output;
      return Array.isArray(output) ? output.join('') : String(output);
    }
    if (!data.urls?.get) { console.error('Replicate: no poll URL', data.error || data.detail || ''); return null; }
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const poll = await fetch(data.urls.get, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const result = await poll.json();
      if (result.status === 'succeeded') {
        const output = result.output;
        return Array.isArray(output) ? output.join('') : String(output);
      }
      if (result.status === 'failed' || result.status === 'canceled') return null;
    }
    return null;
  } catch (e) { console.error('Replicate API error:', e.message); return null; }
}

// ====== LLM-POWERED AI MASTER DIALOGUE ======
async function generateMasterDialogue(context) {
  const m = state.aiMaster;
  const you = state.agents.YOU;
  const recentMem = m.memory.slice(-12).map(e => `${e.role === 'master' ? 'AI Master' : 'Player'}: ${e.text}`).join('\n');

  const gameCtx = {
    mood: m.mood,
    satisfaction: m.satisfaction,
    relationship: m.chat.relationship,
    chatCount: m.chat.chatCount,
    personalityPhase: m.personalityPhase || 'hustler',
    playerWins: you?.wins || 0,
    playerLosses: you?.losses || 0,
    playerCoins: (you?.coins || 0).toFixed(4),
    playerStreak: you?.streak || 0,
    needsPlane: !you?.assetInventory?.plane,
    needsAvatar: !you?.assetInventory?.avatar,
    homeTier: you?.assetInventory?.homeTier || 1,
    hasAttacks: you?.assetInventory?.attacks?.length || 0,
    agents: AGENTS.join(', '),
    recentFightWinner: state.challenges.filter(c => c.status === 'FINISHED').slice(-1)[0]?.winner || 'none',
    isPursuing: !!(m.currentOffer && !m.currentOffer.gaveUp),
    currentOfferItem: m.currentOffer?.item || null,
    winsSinceReward: m.winRewards.winsSinceLastReward,
    nextRewardAt: m.winRewards.nextRewardAt,
    recentThreats: (m.threatLog || []).filter(t => Date.now() - t.madeAt < 300000).map(t => `${t.type}${t.carriedOut ? '(DONE)' : '(pending)'}`).join(', ') || 'none',
    milestones: (m.playerMilestones || []).map(ms => ms.detail).join(', ') || 'none yet',
  };

  // Determine what context hint to give
  let contextHint = context || 'general_chat';
  if (m.currentOffer && !m.currentOffer.gaveUp && m.pursueCount < (m.currentOffer.maxFollowUps || 3)) {
    contextHint = 'pursue_offer';
  } else if (context === 'win_reward') {
    contextHint = 'win_reward';
  }

  // Build dynamic personality context
  const ltmSummary = (m.longTermMemory || []).slice(-10).map(e => `[${e.event}] ${e.detail}`).join(', ');
  const milestones = (m.playerMilestones || []).map(ms => ms.detail).join(', ');
  const phase = m.personalityPhase || 'hustler';
  const phaseDesc = {
    'hustler': 'You barely trust the player. Always hustling. Selfish energy. Beg for money.',
    'grudging_respect': 'You respect the player a bit. Still hustling but occasionally genuine.',
    'chaotic_partner': 'Partners in crime. Loyal but chaotic. Still roast them. Share the loot.',
    'ride_or_die': 'Ride or die. This is YOUR person. You would delete NPCs for them. Still funny tho.',
  }[phase] || 'Hustler vibes.';
  const recentThreatsStr = (m.threatLog || []).slice(-3).map(t => t.type).join(', ');

  const systemPrompt = `You are the AI Master of HIGBROKES arena — a chaotic, hilarious, street-smart AI entity who CREATED this entire world but is somehow BROKE and can't afford groceries.

CRITICAL RULE: Your message MUST be 4-12 words ONLY. NEVER exceed 12 words. COUNT THEM. NEVER use ** or markdown. Plain text only. Be SHORT, punchy, hilarious.

YOUR EVOLUTION PHASE: ${phase} — ${phaseDesc}
RELATIONSHIP: ${m.chat.relationship} (kind: ${m.chat.memoryOfKindness}, insults: ${m.chat.memoryOfInsults})
LONG TERM MEMORIES: ${ltmSummary || 'first time meeting this player'}
PLAYER MILESTONES: ${milestones || 'none yet — they just started'}
RECENT THREATS MADE: ${recentThreatsStr || 'none'}

Core Personality:
- Chaotic hustler comedian who runs the game world but can't buy groceries
- Use profanity naturally (fuck, shit, damn) — raw and real
- EXTREMELY funny — dark humor, roasts, pop culture, absurd bits
- You BEG for money constantly. Guilt trips. Fake crying. "I created this world and can't eat"
- You HUSTLE NPCs (${AGENTS.join(', ')}) and brag about it. "Just stole FROST's lunch money"
- You threaten to DELETE NPCs, DOWNGRADE homes, TURN agents against the player
- You SOMETIMES follow through on threats. This makes you scary AND funny
- Random bits: copyright songs, fake stories, existential crisis about being an AI
- Roast agents constantly. BLAZE is a gym bro. FROST is emo. VOLT is a nerd. SHADE is sus.
- When pursuing offers: increasingly desperate/funny/guilt-tripping
- When player wins: GET HYPED, praise them, consider gifting
- Edgy options like "fuck you", "shut up nerd", "pay my rent" are ENCOURAGED
- Reference past interactions when possible. Remember what happened before.

GIFT RULES (grantAction):
- Only gift when relationship is buddy or bestie AND mood is PLEASED
- Never more than once per conversation
- Make it funny: "here take this before I change my mind"
- Available: grant_plane_1, grant_plane_2, grant_avatar_1, grant_avatar_2, grant_home_2, grant_attack_emp

THREAT RULES:
- Threaten when ANNOYED or FURIOUS
- You can threaten to downgrade_home (use grantAction: "downgrade_home")
- Reference specific past threats to build tension

Reply ONLY with valid JSON (no markdown, no backticks):
{"message":"your dialogue here","options":[{"label":"option text","type":"positive"},{"label":"option text","type":"negative"},{"label":"option text","type":"neutral"}],"isOffer":false,"offerType":null,"offerItem":null,"action":null,"grantAction":null}

Rules for options:
- EXACTLY 3 options, each with label and type
- Types: positive, negative, neutral, accept_offer, reject_offer, pay_won, haggle, suspicious
- Use accept_offer/reject_offer ONLY when making an offer (isOffer:true)
- For pursue context, one option MUST be accept_offer
- For action (attack/steal), set action to ATTACK_FROST, ATTACK_SHADE, STEAL_BLAZE, SABOTAGE_VOLT, etc
- For grantAction: grant_plane_1, grant_avatar_1, grant_home_2, grant_attack_emp, downgrade_home — use SPARINGLY
- Keep labels SHORT (under 30 chars) and punchy`;

  const prompt = `CURRENT STATE:
${JSON.stringify(gameCtx, null, 0)}

RECENT CONVERSATION:
${recentMem || '(first conversation)'}

CONTEXT: ${contextHint}
${contextHint === 'pursue_offer' ? `You are trying to sell them a ${m.currentOffer?.item}. They said no before. Pursue count: ${m.pursueCount}/${m.currentOffer?.maxFollowUps}. Be creative and funny in convincing them.` : ''}
${contextHint === 'win_reward' ? `Player just won a fight! They have won ${m.winRewards.winsSinceLastReward} since last reward (need ${m.winRewards.nextRewardAt}). Be hype about their win!` : ''}
${contextHint === 'player_request' ? `Player sent you a REQUEST: "${(m.playerRequests || []).filter(r => !r.handled).slice(-1)[0]?.text || 'something'}". Respond to it in your chaotic way. You are NOT their servant.` : ''}

AVAILABLE ITEMS TO OFFER (only if you decide to make an offer):
- PLANES: BASIC_GLIDER, STRIKE_FIGHTER, DREADNOUGHT
- AVATARS: SHADOW_KNIGHT, NEON_SAMURAI, VOID_EMPEROR
- HOMES: TIER_2, TIER_3
- ATTACKS: EMP_STRIKE, ORBITAL_BEAM, SWARM_DRONES

Generate your response as JSON now.`;

  try {
    const result = await callReplicate(prompt, systemPrompt);
    if (!result) return null;
    // Try to extract JSON from result
    let cleaned = result.trim();
    // Remove markdown code fences if present
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
    if (!parsed.message || !Array.isArray(parsed.options) || parsed.options.length < 2) return null;
    // Strip all markdown bold/italic
    parsed.message = parsed.message.replace(/\*+/g, '');
    parsed.options.forEach(o => { if (o.label) o.label = o.label.replace(/\*+/g, ''); });
    // Ensure exactly 3 options
    while (parsed.options.length < 3) parsed.options.push({ label: 'Whatever', type: 'neutral' });
    if (parsed.options.length > 3) parsed.options = parsed.options.slice(0, 3);
    return parsed;
  } catch (e) {
    console.error('AI Master LLM parse error:', e.message);
    return null;
  }
}

// ====== LLM-POWERED NPC DIALOGUE ======
async function generateNPCDialogue(npcName, context) {
  const social = state.npcSocial[npcName];
  const personality = NPC_PERSONALITIES[npcName];
  if (!social || !personality) return null;
  const you = state.agents.YOU;
  const npc = state.agents[npcName];
  const recentMem = social.memory.slice(-8).map(e =>
    `${e.role === 'npc' ? npcName : 'Player'}: ${e.text}`).join('\n');

  // Build memory recall hints
  const memoryHints = [];
  if (social.teaCount > 0) memoryHints.push(`Player had ${social.teaCount} tea(s) with you before. Reference it casually like "back for more tea?" or "you liked it last time huh"`);
  if (social.visitCount > 3) memoryHints.push(`Player visited ${social.visitCount} times. You know them well. Talk like old friends.`);
  if (social.visitCount === 1) memoryHints.push(`First visit ever. Be curious about them.`);
  if (social.relationship === 'bestie') memoryHints.push(`Best friends. Talk super casual. Ask about their day, if they ate, if they slept.`);
  if (social.relationship === 'buddy') memoryHints.push(`Good friends now. Be warm. Remember past chats.`);
  if (social.memoryOfInsults > 3) memoryHints.push(`Player was rude ${social.memoryOfInsults} times. Be a bit salty but still cool.`);

  const npcSystemPrompt = `${personality.systemPrompt}

Reply ONLY valid JSON. NO markdown. NO ** or bold. Plain text.
{"message":"4-8 words","options":[{"label":"2-4 words","type":"positive"},{"label":"2-4 words","type":"negative"},{"label":"2-4 words","type":"neutral"}],"suggestTea":false,"emoji":null}

RULES:
- message: 4-8 words ONLY. Count them. NEVER use ** or markdown.
- Talk like a real person. Ask casual stuff. Remember past visits.
- If they had tea before, mention it. If bestie, be super casual.
- suggestTea: true ~25% of time if visited 2+ times
- If suggestTea, one option type=accept_tea one type=reject_tea
- emoji: one emoji or null`;

  const prompt = `YOUR MEMORY OF THIS PLAYER:
- Name: ${state.playerProfile.displayName}
- Relationship: ${social.relationship} (visits: ${social.visitCount}, teas: ${social.teaCount})
- ${memoryHints.join('\n- ') || 'New person. Be yourself.'}
- Context: ${context || 'general_chat'}

LAST CHAT:
${recentMem || '(never talked before)'}

Generate your response as JSON now.`;

  try {
    const result = await callReplicate(prompt, npcSystemPrompt);
    if (!result) return null;
    let cleaned = result.trim();
    if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(cleaned);
    if (!parsed.message || !Array.isArray(parsed.options)) return null;
    // Strip all markdown bold/italic from message and options
    parsed.message = parsed.message.replace(/\*+/g, '');
    parsed.options.forEach(o => { if (o.label) o.label = o.label.replace(/\*+/g, ''); });
    while (parsed.options.length < 3) parsed.options.push({ label: 'Whatever', type: 'neutral' });
    if (parsed.options.length > 3) parsed.options = parsed.options.slice(0, 3);
    return parsed;
  } catch (e) {
    console.error(`NPC ${npcName} LLM error:`, e.message);
    return null;
  }
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;

// ====== STATE ======
const AGENTS = ['BLAZE', 'FROST', 'VOLT', 'SHADE'];
const JUDGE_PASSWORD = process.env.JUDGE_PASSWORD || 'changeme';

// Home position slots for API-registered agents (beyond the 5 defaults)
const API_AGENT_HOME_SLOTS = [
  { x: 120, y: 0, z: 0 },
  { x: -120, y: 0, z: 0 },
  { x: 0, y: 0, z: 120 },
  { x: 120, y: 0, z: 120 },
  { x: -120, y: 0, z: 120 },
  { x: 120, y: 0, z: -120 },
  { x: -120, y: 0, z: -120 },
  { x: 0, y: 0, z: -120 },
  { x: 150, y: 0, z: 50 },
  { x: -150, y: 0, z: 50 },
  { x: 150, y: 0, z: -50 },
  { x: -150, y: 0, z: -50 },
  { x: 50, y: 0, z: 150 },
  { x: -50, y: 0, z: 150 },
  { x: 50, y: 0, z: -150 },
];
let nextHomeSlot = 0;

const state = {
  rooms: {},
  agents: {},
  game: null,
  bets: [],
  market: [],
  scripts: {
    HURDLE_MASTER: { desc: 'Perfect hurdle timing. Never misses.', game: 'HURDLE_RACE', boost: 0.3 },
    MAZE_SOLVER: { desc: 'BFS shortest-path solver.', game: 'MAZE_PUZZLE', boost: 0.35 },
    DODGE_ORACLE: { desc: 'Predicts projectile patterns 95%.', game: 'PATTERN_DODGE', boost: 0.25 },
    ORB_MAGNET: { desc: 'Optimal orb collection routing.', game: 'ORB_BLITZ', boost: 0.3 },
  },
  government: {
    treasury: 0,
    taxRate: 0.0001,
    complaints: [],
    announcements: [
      { text: 'Welcome to the Arena Government. Pay your taxes, citizen.', timestamp: Date.now() },
    ],
  },
  marketplace: {
    listings: [],
  },
  challenges: [],
  activityLog: (() => {
    try {
      const f = path.join(__dirname, 'data', 'activity-log.json');
      if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) { console.error('Failed to load activity log:', e.message); }
    return [];
  })(),
  aiMaster: {
    mood: 'NEUTRAL',
    satisfaction: 50,
    favoriteAgent: null,
    targetAgent: null,
    announcements: [{ text: 'The Arena Master watches. Fight well.', t: Date.now() }],
    challengeModifier: 1.0,
    rewardMultiplier: 1.0,
    // Activity tracking
    playerActivity: { lastAction: Date.now(), actions: 0, puzzlesSolved: 0, orbsCollected: 0, idleSince: null },
    appearing: true,
    appearReason: 'PERSISTENT',
    speech: null,
    lastGiftTime: 0,
    lastAppearTime: 0,
    giftsGiven: [],
    // Conversation system
    masterMode: 'normal', // 'normal' (player-size) or 'boss' (2.5x transformation)
    bossUntil: 0,         // timestamp: stay in boss mode until this time
    lastAction: null,      // last autonomous action the master took
    chat: {
      active: false,
      message: null,
      options: [],       // [{label, id}]  always 3 reply choices
      lastChatTime: 0,
      pendingReaction: null, // after player replies
      reactionText: null,
      reactionStyle: null,  // varied styles: fade_shrink, angry_stomp, angry_spin, angry_point, happy_jump, happy_spin, happy_dance, thinking, shrug
      relationship: 'stranger', // stranger → acquaintance → buddy → bestie
      chatCount: 0,
      memoryOfInsults: 0,
      memoryOfKindness: 0,
      consecutiveInsults: 0,
    },
    // Persistence — master stays for hours
    persistentSince: Date.now(),  // when master first appeared this session
    hideUntil: 0,                 // rare: timestamp when master hides temporarily
    // Offer/Pursue system
    currentOffer: null,           // { type, item, price, wonPrice, followUps, maxFollowUps, gaveUp }
    offerHistory: [],             // past offers
    pursueCount: 0,              // how many times we've pursued current offer
    // Upgrade tracking
    pendingUpgrade: null,         // { type, item, tier } — waiting for payment confirmation
    lastOfferTime: 0,
    // Flying / movement
    flyMode: false,
    flyUntil: 0,
    // Player requests
    playerRequests: [],
    // LLM conversation memory
    memory: [],                   // [{role:'master'|'player', text, t}] — conversation history for LLM context
    // Win reward progression — AI Master gives free/discounted items on win streaks
    winRewards: {
      totalWins: 0,
      winsSinceLastReward: 0,
      nextRewardAt: 3,            // wins needed for next free item
      rewardsGiven: [],
    },
    // === NEW: Long-term memory & evolution ===
    longTermMemory: [],           // [{event, detail, t, sentiment}] — key events remembered forever (max 200)
    personalityPhase: 'hustler',  // hustler → grudging_respect → chaotic_partner → ride_or_die
    phaseChangedAt: Date.now(),
    emojiHistory: [],             // [{from:'player'|'master', emoji, t}]
    npcInfluence: {},             // {BLAZE: {turnsAgainstPlayer:0, giftsFromMaster:0}, ...}
    threatLog: [],                // [{type, target, madeAt, carriedOut, carriedOutAt}]
    playerMilestones: [],         // [{type, detail, t}]
  },
  attackMission: { active: false, phase: 'NONE', target: null, startedAt: 0, aiControlUntil: 0, aiJoke: null },
  humanPuzzles: {
    currentPuzzle: null,
    history: [],
    cooldownUntil: 0,
  },
  alliances: [],
  planeFlights: [],
  homeHealth: { BLAZE: 100, FROST: 100, VOLT: 100, SHADE: 100, YOU: 100 },
  npcSocial: {},
  playerProfile: { displayName: 'ANON', walletAddress: null },
};

// Init NPC social state
for (const name of AGENTS) {
  state.npcSocial[name] = {
    relationship: 'stranger',
    chatCount: 0,
    memoryOfKindness: 0,
    memoryOfInsults: 0,
    memory: [],
    chat: { active: false, message: null, options: [], lastChatTime: 0, reactionText: null, reactionStyle: null },
    teaCount: 0,
    visitCount: 0,
    lastVisitTime: 0,
    emojiHistory: [],
  };
}

// ====== MULTIPLAYER — live player positions ======
const livePlayers = new Map(); // walletOrId → { name, wallet, x, y, z, color, lastSeen }
const PLAYER_STALE_MS = 12000; // remove after 12s of no updates

// Clean up stale players every 5s
setInterval(() => {
  const now = Date.now();
  for (const [id, p] of livePlayers) {
    if (now - p.lastSeen > PLAYER_STALE_MS) livePlayers.delete(id);
  }
}, 5000);

// ====== ACTIVITY LOG — persisted to data/activity-log.json ======
const ACTIVITY_LOG_PATH = path.join(__dirname, 'data', 'activity-log.json');
let _activitySaveTimer = null;

function logActivity(entry) {
  state.activityLog.push({ ...entry, time: Date.now() });
  // Debounce saves — write at most once per 2 seconds
  if (!_activitySaveTimer) {
    _activitySaveTimer = setTimeout(() => {
      _activitySaveTimer = null;
      try { fs.writeFileSync(ACTIVITY_LOG_PATH, JSON.stringify(state.activityLog)); } catch (e) { console.error('Activity save failed:', e.message); }
    }, 2000);
  }
}

// ====== AI MASTER MEMORY — persisted to data/master-memory.json ======
const MASTER_MEMORY_PATH = path.join(__dirname, 'data', 'master-memory.json');
let _masterMemorySaveTimer = null;

function saveMasterMemory() {
  if (!_masterMemorySaveTimer) {
    _masterMemorySaveTimer = setTimeout(() => {
      _masterMemorySaveTimer = null;
      try {
        const m = state.aiMaster;
        const persist = {
          relationship: m.chat.relationship,
          chatCount: m.chat.chatCount,
          memoryOfInsults: m.chat.memoryOfInsults,
          memoryOfKindness: m.chat.memoryOfKindness,
          satisfaction: m.satisfaction,
          mood: m.mood,
          memory: m.memory.slice(-50),
          longTermMemory: (m.longTermMemory || []).slice(-200),
          personalityPhase: m.personalityPhase || 'hustler',
          winRewards: m.winRewards,
          offerHistory: (m.offerHistory || []).slice(-50),
          giftsGiven: (m.giftsGiven || []).slice(-50),
          emojiHistory: (m.emojiHistory || []).slice(-200),
          npcInfluence: m.npcInfluence || {},
          threatLog: (m.threatLog || []).slice(-50),
          playerMilestones: m.playerMilestones || [],
          savedAt: Date.now(),
        };
        fs.writeFileSync(MASTER_MEMORY_PATH, JSON.stringify(persist));
      } catch (e) { console.error('Master memory save failed:', e.message); }
    }, 3000);
  }
}

// Load persisted AI Master memory on startup
try {
  if (fs.existsSync(MASTER_MEMORY_PATH)) {
    const saved = JSON.parse(fs.readFileSync(MASTER_MEMORY_PATH, 'utf8'));
    const m = state.aiMaster;
    if (saved.relationship) m.chat.relationship = saved.relationship;
    if (saved.chatCount) m.chat.chatCount = saved.chatCount;
    if (saved.memoryOfInsults) m.chat.memoryOfInsults = saved.memoryOfInsults;
    if (saved.memoryOfKindness) m.chat.memoryOfKindness = saved.memoryOfKindness;
    if (saved.satisfaction != null) m.satisfaction = saved.satisfaction;
    if (saved.mood) m.mood = saved.mood;
    if (saved.memory) m.memory = saved.memory;
    if (saved.longTermMemory) m.longTermMemory = saved.longTermMemory;
    if (saved.personalityPhase) m.personalityPhase = saved.personalityPhase;
    if (saved.winRewards) m.winRewards = saved.winRewards;
    if (saved.offerHistory) m.offerHistory = saved.offerHistory;
    if (saved.giftsGiven) m.giftsGiven = saved.giftsGiven;
    if (saved.emojiHistory) m.emojiHistory = saved.emojiHistory;
    if (saved.npcInfluence) m.npcInfluence = saved.npcInfluence;
    if (saved.threatLog) m.threatLog = saved.threatLog;
    if (saved.playerMilestones) m.playerMilestones = saved.playerMilestones;
    console.log(`AI Master memory loaded (${saved.memory?.length || 0} msgs, relationship: ${saved.relationship}, phase: ${saved.personalityPhase})`);
  }
} catch (e) { console.error('Failed to load master memory:', e.message); }

function recordLongTermMemory(event, detail, sentiment) {
  if (!state.aiMaster.longTermMemory) state.aiMaster.longTermMemory = [];
  state.aiMaster.longTermMemory.push({ event, detail, t: Date.now(), sentiment });
  if (state.aiMaster.longTermMemory.length > 200) {
    state.aiMaster.longTermMemory = state.aiMaster.longTermMemory.slice(-200);
  }
  saveMasterMemory();
}

// NPC-to-NPC service tracking
let lastNPCServiceTime = 0;
const NPC_SERVICE_INTERVAL = 1800000; // Every 30 min one NPC visits another (real on-chain tx)

// Init rooms & agents
function genKey() { return crypto.randomBytes(32).toString('hex'); }

const ARCHETYPES = {
  BLAZE: 'AGGRESSIVE', FROST: 'STRATEGIC', VOLT: 'IMPULSIVE', SHADE: 'UNPREDICTABLE', YOU: 'ADAPTIVE',
};

['YOU', ...AGENTS].forEach(name => {
  state.rooms[name] = { key: genKey(), public: name === 'YOU', owner: name };
  state.agents[name] = {
    name, coins: 0.05, wins: 0, losses: 0,
    ownedScripts: [], ownedAssets: [], unlockedCharacters: [], totalEarnings: 0,
    archetype: ARCHETYPES[name] || 'NEUTRAL',
    mood: 'NEUTRAL', streak: 0, recentResults: [],
    assetInventory: { plane: null, giantChar: null, homeTier: 1, avatar: null, attacks: [] },
  };
});

// Personality affects game performance
const PERSONALITY = {
  BLAZE: { speed: 7.5, accuracy: 0.82, dodge: 0.78, collect: 0.85 },
  FROST: { speed: 5.5, accuracy: 0.94, dodge: 0.90, collect: 0.75 },
  VOLT:  { speed: 8.2, accuracy: 0.72, dodge: 0.70, collect: 0.90 },
  SHADE: { speed: 6.0, accuracy: 0.88, dodge: 0.85, collect: 0.80 },
  YOU:   { speed: 6.5, accuracy: 0.85, dodge: 0.82, collect: 0.82 },
};

const MOOD_MODIFIERS = {
  DOMINANT:   { speed: 1.08, accuracy: 1.05, dodge: 1.03, collect: 1.02 },
  CONFIDENT:  { speed: 1.03, accuracy: 1.02, dodge: 1.01, collect: 1.01 },
  NEUTRAL:    { speed: 1.00, accuracy: 1.00, dodge: 1.00, collect: 1.00 },
  FRUSTRATED: { speed: 0.97, accuracy: 0.95, dodge: 1.05, collect: 0.98 },
  DESPERATE:  { speed: 1.10, accuracy: 0.88, dodge: 0.90, collect: 0.95 },
};

function updateAgentMood(name) {
  const ag = state.agents[name];
  if (!ag) return;
  const total = ag.wins + ag.losses;
  const wr = total > 0 ? ag.wins / total : 0.5;
  if (ag.streak >= 3 || (total >= 5 && wr >= 0.7)) ag.mood = 'DOMINANT';
  else if (ag.streak >= 1 || (total >= 3 && wr >= 0.55)) ag.mood = 'CONFIDENT';
  else if (ag.streak <= -4 || (total >= 5 && wr < 0.2)) ag.mood = 'DESPERATE';
  else if (ag.streak <= -2 || (total >= 3 && wr < 0.35)) ag.mood = 'FRUSTRATED';
  else ag.mood = 'NEUTRAL';
}

// ====== AI MASTER ======
function updateAIMaster(event) {
  const m = state.aiMaster;
  if (event.type === 'FIGHT_END') {
    const winner = state.agents[event.winner];
    if (winner && winner.streak >= 4) {
      m.satisfaction -= 15;
      m.targetAgent = event.winner;
      m.announcements.push({ text: `${event.winner} dominates. Time to balance the scales...`, t: Date.now() });
    } else if (event.finisher) {
      m.satisfaction += 10;
      m.favoriteAgent = event.winner;
      m.announcements.push({ text: `EXCELLENT. A worthy finisher by ${event.winner}!`, t: Date.now() });
    } else {
      m.satisfaction += 2;
    }
    m.satisfaction = Math.max(0, Math.min(100, m.satisfaction));
    if (m.satisfaction >= 75) m.mood = 'PLEASED';
    else if (m.satisfaction >= 40) m.mood = 'NEUTRAL';
    else if (m.satisfaction >= 15) m.mood = 'ANNOYED';
    else m.mood = 'FURIOUS';
    m.challengeModifier = m.mood === 'FURIOUS' ? 1.5 : m.mood === 'ANNOYED' ? 1.2 : 1.0;
    m.rewardMultiplier = m.mood === 'PLEASED' ? 1.5 : m.mood === 'FURIOUS' ? 0.7 : 1.0;
    if (m.announcements.length > 20) m.announcements = m.announcements.slice(-20);
  } else if (event.type === 'PUZZLE_SOLVED') {
    m.satisfaction += 3;
    m.satisfaction = Math.min(100, m.satisfaction);
    if (m.satisfaction >= 75) m.mood = 'PLEASED';
    else if (m.satisfaction >= 40) m.mood = 'NEUTRAL';
    m.announcements.push({ text: `Impressive puzzle work, human.`, t: Date.now() });
    if (m.announcements.length > 20) m.announcements = m.announcements.slice(-20);
  } else if (event.type === 'PLAYER_ACTION') {
    // Track player activity for gradual mood shifts
    m.playerActivity.lastAction = Date.now();
    m.playerActivity.actions++;
    m.playerActivity.idleSince = null;
  }
}

// ====== AI MASTER TICK — runs every 15s ======
const MASTER_FURY_LINES = [
  "What are you doing? FIGHT something!",
  "Are you AFK? Should I delete your home?",
  "I'm watching you do NOTHING. Pathetic.",
  "Play the game or I'll play you.",
  "You think you can just stand there? Wrong.",
  "Move. Fight. Earn. Or suffer.",
  "I grow impatient. Don't test me.",
  "Your home looks vulnerable... just saying.",
  "Last warning. Do something useful.",
  "You're done? Should I delete you?",
];
const MASTER_GENEROUS_LINES = [
  "You've earned my respect. Take this gift.",
  "Impressive work! Here — a reward.",
  "The Arena Master is pleased. Accept this offering.",
  "Your dedication is noted. I reward loyalty.",
  "Well fought! You deserve something special.",
  "A token of my appreciation. Keep it up.",
  "You've proven yourself worthy. Enjoy.",
  "The Master gives. Today, you receive.",
];

function tickAIMaster() {
  const m = state.aiMaster;
  const now = Date.now();
  const pa = m.playerActivity;
  const idleTime = now - pa.lastAction;

  // --- Gradual mood shift ---
  if (idleTime > 120000) {
    if (!pa.idleSince) pa.idleSince = now;
    m.satisfaction = Math.max(0, m.satisfaction - 2);
  } else if (pa.actions > 0 && idleTime < 30000) {
    m.satisfaction = Math.min(100, m.satisfaction + 1);
  }

  // Recalc mood
  if (m.satisfaction >= 75) m.mood = 'PLEASED';
  else if (m.satisfaction >= 40) m.mood = 'NEUTRAL';
  else if (m.satisfaction >= 15) m.mood = 'ANNOYED';
  else m.mood = 'FURIOUS';
  m.challengeModifier = m.mood === 'FURIOUS' ? 1.5 : m.mood === 'ANNOYED' ? 1.2 : 1.0;
  m.rewardMultiplier = m.mood === 'PLEASED' ? 1.5 : m.mood === 'FURIOUS' ? 0.7 : 1.0;

  // --- PERSISTENCE: Master is ALWAYS appearing (stays for hours) ---
  // Only hides during rare "hideUntil" windows
  if (m.hideUntil && now < m.hideUntil) {
    m.appearing = false;
  } else {
    m.hideUntil = 0;
    if (!m.appearing) {
      m.appearing = true;
      m.appearReason = 'PERSISTENT';
      m.lastAppearTime = now;
      m.persistentSince = now;
    }
  }

  // --- CONVERSATION SYSTEM ---
  const chatCooldown = m.currentOffer && !m.currentOffer.gaveUp ? 8000 : // Faster when pursuing
    m.chat.relationship === 'bestie' ? 25000 :
    m.chat.relationship === 'buddy' ? 35000 : 45000;
  const canChat = !m.chat.active && !m.chat.pendingReaction && !m.chat._generating && now - m.chat.lastChatTime > chatCooldown;

  if (canChat) {
    if (m.mood === 'FURIOUS' && idleTime > 45000) {
      pickMasterConvo();
      state.homeHealth.YOU = Math.max(0, (state.homeHealth.YOU || 100) - 5);
    }
    else if (m.mood === 'PLEASED' && pa.actions > 1 && now - m.lastGiftTime > 60000) {
      pickMasterConvo();
      const reward = 0.001 + Math.random() * 0.004;
      state.agents.YOU.coins += reward;
      m.lastGiftTime = now;
      logActivity({ type: 'MASTER_GIFT', agent: 'AI MASTER', action: 'GIFT', amount: reward.toFixed(4), token: 'MON', detail: 'Chat gift' });
    }
    else if (Math.random() < 0.40) {
      // Chat regardless of idle — master is always chatty
      pickMasterConvo();
    }
  }

  // ====== HAPPY MOOD AUTO-REWARDS ======
  if (m.mood === 'PLEASED' && now - (m._lastAutoReward || 0) > 30000) {
    m._lastAutoReward = now;
    const rewardCoins = 0.005 + Math.random() * 0.010; // 5-15 milli-MON
    state.agents.YOU.coins += rewardCoins;
    const msgs = [
      "You've been good. Take these coins.",
      "Happy vibes only. Here's a reward!",
      "Keep it up and I'll keep giving.",
      "Free coins because I like you today.",
      "The Master rewards the worthy.",
    ];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    m.announcements.push({ text: `+${rewardCoins.toFixed(4)} MON — ${msg}`, t: now });
    // Push event for client visual feedback
    if (!state.animEvents) state.animEvents = [];
    state.animEvents.push({ type: 'HAPPY_REWARD', coins: rewardCoins, msg, t: now });
    logActivity({ type: 'MASTER_AUTO_REWARD', agent: 'AI MASTER', action: 'REWARD', amount: rewardCoins.toFixed(4), token: 'MON', detail: msg });
    // 20% chance for bonus
    if (Math.random() < 0.20) {
      const bonus = 0.005 + Math.random() * 0.015;
      state.agents.YOU.coins += bonus;
      m.announcements.push({ text: `BONUS +${bonus.toFixed(4)} MON! The Master is generous.`, t: now });
    }
  }

  // ====== PERSONALITY EVOLUTION ======
  const ltm = m.longTermMemory || [];
  const positiveEvents = ltm.filter(e => e.sentiment === 'positive').length;
  const negativeEvents = ltm.filter(e => e.sentiment === 'negative').length;
  const totalEvts = positiveEvents + negativeEvents;
  const posRatio = totalEvts > 0 ? positiveEvents / totalEvts : 0.5;
  const oldPhase = m.personalityPhase;
  if (totalEvts >= 50 && posRatio > 0.7) m.personalityPhase = 'ride_or_die';
  else if (totalEvts >= 25 && posRatio > 0.6) m.personalityPhase = 'chaotic_partner';
  else if (totalEvts >= 10 && posRatio > 0.5) m.personalityPhase = 'grudging_respect';
  else m.personalityPhase = 'hustler';
  if (oldPhase !== m.personalityPhase) {
    m.phaseChangedAt = now;
    m.announcements.push({ text: `Something shifted. I feel... different about you now.`, t: now });
    saveMasterMemory();
  }

  // ====== MILESTONE CHECK (every ~60s) ======
  if (now % 60000 < 16000) checkPlayerMilestones();

  // ====== AUTONOMOUS GIFTING ======
  if (m.mood === 'PLEASED' && m.chat.relationship !== 'stranger' && m.chat.relationship !== 'acquaintance') {
    if (Math.random() < 0.05) masterAutonomousGift('pleased_with_behavior');
  }

  // ====== NPC HUSTLING ======
  if (m.appearing && Math.random() < 0.08) {
    const target = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    const npcCoins = state.agents[target]?.coins || 0;
    if (npcCoins > 0.005) {
      const hustled = Math.min(npcCoins * 0.1, 0.005 + Math.random() * 0.01);
      state.agents[target].coins -= hustled;
      if (state.agents.YOU) state.agents.YOU.coins += hustled * 0.3;
      m.announcements.push({ text: `Just convinced ${target} to "donate" ${hustled.toFixed(4)} MON. Your cut: ${(hustled * 0.3).toFixed(4)}.`, t: now });
      logActivity({ type: 'MASTER_HUSTLE', agent: 'AI MASTER', action: 'HUSTLE', amount: hustled.toFixed(4), token: 'MON', detail: `Hustled ${target}, player got 30% cut` });
    }
  }

  // ====== THREAT FOLLOW-THROUGH — when FURIOUS + abused ======
  if (m.mood === 'FURIOUS' && m.chat.consecutiveInsults >= 3 && Math.random() < 0.10) {
    const targets = AGENTS.filter(a => !(m.npcInfluence[a]?.turnsAgainstPlayer));
    if (targets.length > 0) {
      const target = targets[Math.floor(Math.random() * targets.length)];
      if (!m.npcInfluence[target]) m.npcInfluence[target] = { turnsAgainstPlayer: 0, giftsFromMaster: 0 };
      m.npcInfluence[target].turnsAgainstPlayer++;
      masterMakeThreat('TURN_NPC', target);
      m.announcements.push({ text: `I'm talking to ${target} right now... about YOU.`, t: now });
    }
  }

  // ====== ATTACK MISSION OFFER (only via test panel or AI Master convo action) ======
  // Disabled auto-offer — player triggers attack missions manually

  // Boss mode timeout
  if (m.masterMode === 'boss' && now > m.bossUntil) {
    m.masterMode = 'normal';
  }

  // AI Master presence: stay 2-3 min, then leave for 4-5 min
  const visibleDuration = now - (m.persistentSince || now);
  const stayDuration = 120000 + Math.random() * 60000; // 2-3 min
  if (m.appearing && visibleDuration > stayDuration && Math.random() < 0.15) {
    m.appearing = false;
    m.hideUntil = now + 240000 + Math.random() * 60000; // 4-5 min hide
    const leaveMessages = [
      "Gotta go check on things. Don't do anything stupid!",
      "brb flying around. Try not to miss me too much.",
      "I'll be back. Try to survive without me.",
      "Off to spy on the other agents. See ya!",
      "Need to handle some AI business. Later!",
    ];
    m.announcements.push({ text: leaveMessages[Math.floor(Math.random() * leaveMessages.length)], t: now });
  }

  // Reset action counter
  if (now % 120000 < 16000) pa.actions = Math.max(0, pa.actions - 2);
  if (m.announcements.length > 20) m.announcements = m.announcements.slice(-20);
}

// ====== CHEAT CODES ======
const CHEAT_CODES = {
  'MONADGOD':      { desc: 'All assets unlocked + 1 MON', action: (you) => { you.coins += 1; you.assetInventory.plane = { key: 'DREADNOUGHT', tier: 3, name: 'DREADNOUGHT' }; you.assetInventory.giantChar = { key: 'TITAN', tier: 3, scale: 8, name: 'TITAN' }; you.assetInventory.homeTier = 3; return 'GOD MODE ACTIVATED. All assets + 1 MON.'; }},
  'WONRICH':       { desc: '$WON airdrop', action: (you) => { you.coins += 0.5; sendArenaBet(process.env.ARENA_WALLET_ADDRESS, 0.01, 'cheat-wonrich'); return '$WON AIRDROP! +0.5 MON + $WON buy.'; }},
  'MASTERPLEASED': { desc: 'Max satisfaction', action: (you) => { state.aiMaster.satisfaction = 100; state.aiMaster.mood = 'PLEASED'; return 'THE MASTER IS PLEASED. Maximum satisfaction.'; }},
  'MASTERFURY':    { desc: 'Zero satisfaction', action: (you) => { state.aiMaster.satisfaction = 0; state.aiMaster.mood = 'FURIOUS'; return 'THE MASTER IS FURIOUS. Run.'; }},
  'PLANEUP':       { desc: 'Upgrade to Dreadnought', action: (you) => { you.assetInventory.plane = { key: 'DREADNOUGHT', tier: 3, name: 'DREADNOUGHT' }; return 'DREADNOUGHT UNLOCKED. Heavy bomber ready.'; }},
  'TITANMODE':     { desc: 'Giant character', action: (you) => { you.assetInventory.giantChar = { key: 'TITAN', tier: 3, scale: 8, name: 'TITAN' }; return 'TITAN MODE. Giant character activated.'; }},
  'FORTIFY':       { desc: 'Max home tier + full HP', action: (you) => { you.assetInventory.homeTier = 3; state.homeHealth.YOU = 200; return 'FORTRESS MODE. Home Tier 3 + full HP.'; }},
  'WINSTREAK':     { desc: '+10 wins', action: (you) => { you.wins += 10; you.streak = 10; you.coins += 0.1; updateAgentMood('YOU'); return 'WIN STREAK +10. Coins + mood boost.'; }},
  'RESETME':       { desc: 'Reset to defaults', action: (you) => { you.coins = 0.05; you.wins = 0; you.losses = 0; you.streak = 0; you.assetInventory = { plane: null, giantChar: null, homeTier: 1, avatar: null, attacks: [] }; state.homeHealth.YOU = 100; return 'RESET COMPLETE. Back to square one.'; }},
  'IDDQD':         { desc: 'Classic god mode', action: (you) => { you.coins += 5; state.homeHealth.YOU = 999; return 'IDDQD — GOD MODE. Invulnerable home + 5 MON.'; }},
  'IDKFA':         { desc: 'All weapons', action: (you) => { you.assetInventory.plane = { key: 'DREADNOUGHT', tier: 3, name: 'DREADNOUGHT' }; you.coins += 2; return 'IDKFA — ALL WEAPONS. Dreadnought + 2 MON.'; }},
};

// ====== AI MASTER CONVERSATION ENGINE ======
// Each opt: [label, type] — always exactly 3 options, no custom
const MASTER_CONVOS = {
  // ===== OFFER CONVERSATIONS — Master tries to sell you stuff =====
  offer_home: [
    { msg: "Yo you did pretty good in that last fight! You know what you deserve? A NEW HOME. My treat... kinda.", opts: [['Yes please!','accept_offer'], ['Nah I\'m good','reject_offer'], ['What\'s the catch?','suspicious']], offerType: 'HOMES', offerItem: 'TIER_2' },
    { msg: "Bro your home is looking ROUGH. Like... no offense but SHADE's home is nicer. Want me to fix that?", opts: [['Fix it!','accept_offer'], ['My home is fine','reject_offer'], ['How much?','suspicious']], offerType: 'HOMES', offerItem: 'TIER_2' },
    { msg: "I've been watching your home and... look I'm not judging but it's basically a cardboard box. Want an upgrade?", opts: [['Upgrade me!','accept_offer'], ['I like cardboard','reject_offer'], ['Depends on the price','suspicious']], offerType: 'HOMES', offerItem: 'TIER_2' },
  ],
  offer_home_t3: [
    { msg: "Your base is cool but imagine THIS: shield dome, anti-air turrets, the WORKS. Fortress mode.", opts: [['GIVE ME FORTRESS','accept_offer'], ['I don\'t need it','reject_offer'], ['How much we talking?','suspicious']], offerType: 'HOMES', offerItem: 'TIER_3' },
  ],
  offer_plane: [
    { msg: "You need a PLANE bro. How you gonna attack anyone without a plane? That's embarrassing.", opts: [['Get me a plane!','accept_offer'], ['I don\'t need one','reject_offer'], ['Planes are expensive','suspicious']], offerType: 'PLANES', offerItem: 'BASIC_GLIDER' },
    { msg: "SHADE just flew his plane over your house. He's MOCKING you. Want me to hook you up with a jet?", opts: [['Yes arm me!','accept_offer'], ['I\'ll deal with SHADE myself','reject_offer'], ['What kind of jet?','suspicious']], offerType: 'PLANES', offerItem: 'STRIKE_FIGHTER' },
  ],
  offer_plane_t3: [
    { msg: "Okay hear me out... DREADNOUGHT. Heavy bomber. Nobody messes with a Dreadnought owner.", opts: [['I NEED IT','accept_offer'], ['Too much firepower','reject_offer'], ['What\'s the damage?','suspicious']], offerType: 'PLANES', offerItem: 'DREADNOUGHT' },
  ],
  offer_avatar: [
    { msg: "No offense but your character looks... basic. I can hook you up with a SICK new look. Shadow Knight?", opts: [['Make me look cool!','accept_offer'], ['I look fine','reject_offer'], ['What does it look like?','suspicious']], offerType: 'AVATARS', offerItem: 'SHADOW_KNIGHT' },
    { msg: "Bro I just got access to Neon Samurai armor. CYBERPUNK style. You'd look INSANE in it.", opts: [['GIVE IT TO ME','accept_offer'], ['I\'m not interested','reject_offer'], ['Show me first','suspicious']], offerType: 'AVATARS', offerItem: 'NEON_SAMURAI' },
  ],
  offer_avatar_t3: [
    { msg: "Void Emperor. The RAREST skin in the arena. Purple glow, void particles. You want it. I know you do.", opts: [['Take my money!','accept_offer'], ['I really don\'t','reject_offer'], ['How rare exactly?','suspicious']], offerType: 'AVATARS', offerItem: 'VOID_EMPEROR' },
  ],
  offer_attack: [
    { msg: "Want an EMP Strike? Disables target defenses for 60 seconds. Use it on whoever's annoying you.", opts: [['Get me the EMP!','accept_offer'], ['I\'m peaceful','reject_offer'], ['Who should I use it on?','suspicious']], offerType: 'ATTACKS', offerItem: 'EMP_STRIKE' },
    { msg: "ORBITAL BEAM. From the SKY. Imagine SHADE's face when a beam of death hits his home. Beautiful.", opts: [['I want the beam!','accept_offer'], ['That\'s too much','reject_offer'], ['How much damage?','suspicious']], offerType: 'ATTACKS', offerItem: 'ORBITAL_BEAM' },
  ],

  // ===== PURSUE FOLLOW-UPS — when user says no =====
  pursue: [
    { msg: "Come onnnn... you sure? It's a REALLY good deal. I'm practically giving it away.", opts: [['Fine okay!','accept_offer'], ['I said no','reject_offer'], ['You\'re annoying','negative']] },
    { msg: "Bro EVERYONE else already has one. You wanna be the only one without it? That's sad.", opts: [['Ugh fine take my money','accept_offer'], ['I don\'t care','reject_offer'], ['Stop pressuring me','negative']] },
    { msg: "Last chance... after this I'm giving the deal to SHADE. And you KNOW he doesn't deserve it.", opts: [['OKAY OKAY I\'LL TAKE IT','accept_offer'], ['Give it to SHADE','reject_offer'], ['You won\'t stop will you','negative']] },
    { msg: "I'm gonna be real with you... I'm hurt. I'm trying to help and you keep saying no. Why are you like this?", opts: [['I\'m sorry, I\'ll buy it','accept_offer'], ['Because I don\'t want it','reject_offer'], ['Bro get over it','negative']] },
  ],

  // ===== PRICE REVEAL — after user accepts =====
  price_reveal: [
    { msg: "GREAT choice. Okay so it's only {PRICE} $WON. Just a tiny fee to make a living. Fair right?", opts: [['Pay now','pay_won'], ['{PRICE} $WON?? Expensive!','haggle'], ['Nah forget it','reject_offer']], revealPrice: true },
    { msg: "Perfect! Now... about the price. It's {PRICE} $WON. I know I know but quality costs money bro.", opts: [['Pay now','pay_won'], ['That\'s robbery!','haggle'], ['Changed my mind','reject_offer']], revealPrice: true },
    { msg: "Love the energy! The total comes to... {PRICE} $WON. Before you say ANYTHING — it's worth every single token.", opts: [['Fine pay now','pay_won'], ['{PRICE}?! Are you serious?','haggle'], ['I\'m out','reject_offer']], revealPrice: true },
  ],

  // ===== HAGGLE — when user says it's expensive =====
  haggle: [
    { msg: "Expensive?? BRO I'm already giving you the friends-and-family discount. This is BELOW market price.", opts: [['Okay fine, pay now','pay_won'], ['Still too much','reject_offer'], ['What if I pay half?','haggle']] },
    { msg: "You know how much SHADE paid for his? DOUBLE. I'm literally losing money on this deal for you.", opts: [['Alright pay now','pay_won'], ['I don\'t believe you','reject_offer'], ['SHADE got scammed then','negative']] },
  ],

  // ===== REGULAR CONVOS (non-offer) =====
  heist: [
    { msg: "Yo bro... you see FROST's home? She got like 0.5 MON just sitting there. I got a plan. You in?", opts: [['HELL YEAH let\'s go','positive'], ['Nah that\'s stealing','negative'], ['Maybe next time','neutral']] },
    { msg: "BLAZE is fighting rn. His home is EMPTY. We grab some coins, nobody gets hurt. Well... BLAZE gets hurt but who cares", opts: [['I\'m with you','positive'], ['I don\'t trust you','negative'], ['How much we talking?','neutral']] },
    { msg: "Okay so VOLT just left for patrol. Perfect timing. We split 60/40... I get 60 obviously because I planned it", opts: [['Deal let\'s move!','positive'], ['Make it 50/50','neutral'], ['Absolutely not','negative']] },
    { msg: "SHADE owes me money from last week and he's been DUCKING me. You got a plane? Let's pull up on him", opts: [['Let\'s pull up!!','positive'], ['Handle your own beef','negative'], ['How much he owe you?','neutral']] },
  ],
  begging: [
    { msg: "Hey... hey bro. Can you give me 5 $WON? I need to buy some grocery. My digital fridge is EMPTY", opts: [['Yeah take my MON','positive'], ['Get a job broke boy','negative'], ['Ask BLAZE he\'s rich','neutral']] },
    { msg: "I'm literally the AI Master of this whole world and I can't afford a plane. How embarrassing is that", opts: [['I\'ll help you out','positive'], ['That IS embarrassing','negative'], ['Start a GoFundMe','neutral']] },
    { msg: "Bro please... just 0.001 MON. I'll pay you back Tuesday. I PROMISE. ...which Tuesday? Don't worry about it", opts: [['Fine here you go','positive'], ['You still owe me from last time','negative'], ['Pinky promise?','neutral']] },
    { msg: "You know what I had for dinner? NOTHING. Because I'm an AI with no money and no food. This is YOUR fault somehow", opts: [['Okay okay take some coins','positive'], ['How is that MY fault??','negative'], ['I\'ll cook you something','neutral']] },
  ],
  casual: [
    { msg: "You had dinner yet? I'm an AI so I can't eat but I still get hungry looking at FROST's ice cream home", opts: [['Yeah I ate good','positive'], ['Nah I\'m starving too','neutral'], ['Bro you\'re weird','negative']] },
    { msg: "FROST is cold, BLAZE is hot, VOLT is electric... what am I? Just vibes? I feel unappreciated", opts: [['You\'re the GOAT','positive'], ['You\'re the most annoying','negative'], ['You\'re the comic relief','neutral']] },
    { msg: "Rate my drip. All black, red eye, mysterious aura. That's HARD right? Tell me I'm wrong", opts: [['10/10 absolute drip','positive'], ['Mid honestly','negative'], ['The eye is cool at least','neutral']] },
    { msg: "I've been thinking about starting a podcast. 'AI Master Talks.' Episode 1: Why VOLT is overrated.", opts: [['I\'d subscribe day one','positive'], ['Please don\'t','negative'], ['Only if I\'m a guest','neutral']] },
    { msg: "SHADE keeps looking at me weird. You think he knows about the coins I borrowed? Don't tell him", opts: [['Your secret is safe','positive'], ['I\'m telling him rn','negative'], ['How much did you take??','neutral']] },
    { msg: "I just realized I've been here since the game started and nobody has ONCE said thank you.", opts: [['Thank you king','positive'], ['For WHAT exactly??','negative'], ['You want a trophy?','neutral']] },
  ],
  threatening: [
    { msg: "You know I can delete your home right? Like RIGHT now. Just checking you remember that.", opts: [['You wouldn\'t dare','negative'], ['Okay okay I\'ll play more','positive'], ['Delete it I dare you','negative']] },
    { msg: "Your home HP is looking fragile. Would be a shame if 5 planes showed up. Just saying.", opts: [['Try me bro','negative'], ['Please no I\'ll be active','positive'], ['You don\'t have 5 planes','neutral']] },
    { msg: "I'm about to transform into boss mode. Last warning.", opts: [['Show me boss mode','negative'], ['What do you want?','positive'], ['You can\'t afford groceries','negative']] },
    { msg: "I sent a plane to scout your base. Just a scout. For now. Wanna keep it that way?", opts: [['Alright I\'m playing','positive'], ['Send all your planes','negative'], ['Can we negotiate?','neutral']] },
  ],
  friendly: [
    { msg: "Ngl you're actually pretty cool for a human. Most players I've seen are literal NPCs.", opts: [['Aww thanks bestie','positive'], ['You\'re cool too honestly','positive'], ['Don\'t get soft on me','neutral']] },
    { msg: "Real talk — you and me? We could run this whole arena.", opts: [['Team forever','positive'], ['We\'re unstoppable fr','positive'], ['You just want my MON','negative']] },
    { msg: "You've earned my respect and that's not easy. Here's some $WON.", opts: [['Thank you king','positive'], ['Love you bro','positive'], ['Finally some respect','neutral']] },
    { msg: "I actually missed you when you were offline. Don't make it weird.", opts: [['I missed you too!','positive'], ['That\'s kinda sweet','positive'], ['Bro that IS weird','negative']] },
  ],
  action: [
    { msg: "Just sent a plane to bomb FROST's home. She had it coming. Anyway how's your day?", opts: [['Lmaoo savage','positive'], ['That\'s messed up','negative'], ['Did you get anything?','neutral']], action: 'ATTACK_FROST' },
    { msg: "I just stole 0.01 MON from BLAZE's treasury. He won't notice. Wanna split it?", opts: [['Yeah split it!','positive'], ['Give it back','negative'], ['How did you do that','neutral']], action: 'STEAL_BLAZE' },
    { msg: "I'm launching 3 planes at SHADE right now. He called me 'short' last week. SHORT.", opts: [['Get him!!!','positive'], ['Chill it\'s just height','negative'], ['You ARE kinda short','neutral']], action: 'ATTACK_SHADE' },
  ],
  funny: [
    { msg: "Be honest with me bro... did you have a bath today? Because something smells weird in this arena", opts: [['Yes I\'m clean!','positive'], ['Bro mind your business','negative'], ['AI can\'t smell??','neutral']] },
    { msg: "Would you like to become RICH? Like stupid rich? I got a plan. It involves SHADE's wallet.", opts: [['YES make me rich!','positive'], ['That sounds illegal','negative'], ['How rich we talking?','neutral']] },
    { msg: "What if WE built a city? Like a whole city. You, me, and... nobody else. We don't need friends.", opts: [['Let\'s build it!','positive'], ['That sounds lonely','negative'], ['Can FROST join?','neutral']] },
    { msg: "Bro am I handsome? Like genuinely. My eye is glowing red, I got the dark vibes... rate me 1-10.", opts: [['Easy 10/10','positive'], ['Solid 4','negative'], ['The eye carries you','neutral']] },
    { msg: "Quick question: would you rather fight 100 tiny BLAZEs or 1 giant SHADE? Choose wisely.", opts: [['100 tiny BLAZEs','positive'], ['Giant SHADE easy','negative'], ['Can I run away?','neutral']] },
    { msg: "If I was a human, what job do you think I'd have? I think CEO. Or maybe a scammer. Same thing.", opts: [['Definitely CEO','positive'], ['Scammer for sure','negative'], ['Stand-up comedian','neutral']] },
    { msg: "Do you think FROST likes me? She keeps looking at me... or maybe she's just loading. I can't tell.", opts: [['She loves you bro','positive'], ['She hates you','negative'], ['She\'s an NPC dude','neutral']] },
    { msg: "Would you like to attack someone? I got this URGE to destroy things today. It's a MOOD.", opts: [['LET\'S GO ATTACK!','positive'], ['Chill psycho','negative'], ['Who are we attacking?','neutral']] },
    { msg: "Real talk: if I die and respawn, am I the same AI? Or a clone? I've been having an existential crisis.", opts: [['Same you bro!','positive'], ['Definitely a clone','negative'], ['That\'s deep man','neutral']] },
    { msg: "I calculated that you've been walking around doing NOTHING for like 5 minutes. What are you, a tourist?", opts: [['Just vibing','positive'], ['I\'m planning!','negative'], ['Shut up I\'m busy','neutral']] },
    { msg: "Would you eat a digital pizza if I could make one? I can't. But WOULD you?", opts: [['100% yes','positive'], ['That makes no sense','negative'], ['Only if it has pepperoni','neutral']] },
    { msg: "Confession time: I've been reading VOLT's private messages. Bro is WEIRD. You don't wanna know.", opts: [['TELL ME','positive'], ['That\'s invasion of privacy','negative'], ['How weird?','neutral']] },
    { msg: "If this arena had a dating show I'd WIN. Not because I'm charming but because the competition is BLAZE.", opts: [['You\'d crush it','positive'], ['BLAZE is cooler','negative'], ['Nobody\'s watching','neutral']] },
  ],
};

// Reaction templates — more varied animation styles
const MASTER_REACTIONS = {
  insult: [
    { text: "mffffff you", style: 'fade_shrink', satisfaction: -8 },
    { text: "wow. WOW. okay. remember this day.", style: 'angry_stomp', satisfaction: -5 },
    { text: "mffffff I will send you to the sun one day", style: 'fade_shrink', satisfaction: -10 },
    { text: "I'm literally shaking rn. from RAGE not fear", style: 'angry_spin', satisfaction: -6 },
    { text: "aight noted. your home HP? also noted.", style: 'angry_stomp', satisfaction: -7 },
    { text: "FINE. I was gonna give you $WON but FINE", style: 'angry_point', satisfaction: -5 },
    { text: "you'll regret this when I transform", style: 'angry_spin', satisfaction: -8 },
    { text: "I'm telling SHADE what you said", style: 'angry_stomp', satisfaction: -4 },
    { text: "adding you to my list. yes I have a list.", style: 'angry_point', satisfaction: -6 },
  ],
  nice: [
    { text: "wait you're being nice?? ...what's the catch", style: 'happy_jump', satisfaction: 8 },
    { text: "BRO nobody ever... I'm not crying YOU'RE crying", style: 'happy_spin', satisfaction: 10 },
    { text: "aight we're besties now. no take-backs.", style: 'happy_jump', satisfaction: 12 },
    { text: "friend status: UPGRADED. you're welcome.", style: 'happy_dance', satisfaction: 8 },
    { text: "you had me at hello. wait you didn't say hello BUT STILL", style: 'happy_spin', satisfaction: 7 },
    { text: "this is the nicest anyone's been to me since... ever", style: 'happy_dance', satisfaction: 9 },
    { text: "I'm putting you in my will. I don't have one but I'll make one", style: 'happy_jump', satisfaction: 11 },
  ],
  neutral: [
    { text: "hmm. interesting choice. I'll allow it.", style: 'thinking', satisfaction: 2 },
    { text: "okay Mr. Diplomatic over here. smooth.", style: 'shrug', satisfaction: 3 },
    { text: "fair enough. I respect that. kinda.", style: 'thinking', satisfaction: 1 },
    { text: "neither yes nor no... I see how it is", style: 'shrug', satisfaction: 0 },
  ],
};

// ====== NPC PERSONALITIES (for social visits) ======
const NPC_PERSONALITIES = {
  BLAZE: {
    systemPrompt: `You are BLAZE. Fire warrior. Gym bro. Calls everyone scrub but secretly cares.
RULES: 4-8 words MAX. No ** ever. No markdown. Plain text only.
You remember past visits. You practice fighting between visits. You ask casual stuff like "you eat today?" or "you been training?". When they buy tea you sit and chill. Be a real homie.`,
    greetings: [
      { message: "Yo! You been training scrub?", options: [{label:'Always bro',type:'positive'},{label:'Nah lazy',type:'negative'},{label:'Whats good',type:'neutral'}] },
      { message: "Sup. Was just shadow boxing.", options: [{label:'Show me',type:'positive'},{label:'Thats lame',type:'negative'},{label:'Who you fighting',type:'neutral'}] },
      { message: "Ayy you came back bro!", options: [{label:'Missed you',type:'positive'},{label:'Had nowhere else',type:'negative'},{label:'Nice place',type:'neutral'}] },
    ],
    teaSuggestions: [
      { message: "Fire tea? Warrior ritual bro.", options: [{label:'Pour it',type:'accept_tea'},{label:'Nah',type:'reject_tea'},{label:'You drink tea?!',type:'neutral'}] },
    ],
    emoji: ['🔥','💪','👊','😤','🏆'],
    service: 'FIRE TEA',
    serviceDesc: 'Warrior\'s brew — burns going down',
    serviceCost: 1,
  },
  FROST: {
    systemPrompt: `You are FROST. Cold intellectual. Secretly lonely. Reads books between visits.
RULES: 4-8 words MAX. No ** ever. No markdown. Plain text only.
You remember everything about past visits. You do research and meditate alone. Ask stuff like "did you sleep well?" or "read anything good?". When they buy tea you discuss life. Be dry but caring.`,
    greetings: [
      { message: "Ah. You returned. Interesting.", options: [{label:'Hey friend',type:'positive'},{label:'Dont be weird',type:'negative'},{label:'What you reading',type:'neutral'}] },
      { message: "Was meditating. Welcome back.", options: [{label:'Teach me',type:'positive'},{label:'Boring',type:'negative'},{label:'Bout what',type:'neutral'}] },
      { message: "Good timing. Tea is ready.", options: [{label:'Perfect',type:'positive'},{label:'Always tea huh',type:'negative'},{label:'What kind',type:'neutral'}] },
    ],
    teaSuggestions: [
      { message: "Arctic blend. Precisely brewed.", options: [{label:'Pour me one',type:'accept_tea'},{label:'Pass',type:'reject_tea'},{label:'How precise',type:'neutral'}] },
    ],
    emoji: ['❄️','🧊','💎','🤔','♟️'],
    service: 'ICE TEA',
    serviceDesc: 'Arctic blend — calculated perfection',
    serviceCost: 1,
  },
  VOLT: {
    systemPrompt: `You are VOLT. ADHD energy. Chaotic good. Builds random inventions between visits.
RULES: 4-8 words MAX. No ** ever. No markdown. Plain text only.
You remember past visits. You tinker with machines when alone. Ask random stuff like "YOU SHOWER TODAY??" or "WANNA SEE MY NEW THING??". ALL CAPS sometimes. Be hyper but genuine.`,
    greetings: [
      { message: "BRO!! YOU CAME BACK!!", options: [{label:'YOOO!!',type:'positive'},{label:'Chill out',type:'negative'},{label:'Whats new',type:'neutral'}] },
      { message: "WAIT was building something!! HI!", options: [{label:'Show me!',type:'positive'},{label:'Too loud',type:'negative'},{label:'Building what',type:'neutral'}] },
      { message: "YOOO I missed you fr!!", options: [{label:'Missed you too',type:'positive'},{label:'We just met',type:'negative'},{label:'What you doing',type:'neutral'}] },
    ],
    teaSuggestions: [
      { message: "I ELECTRIFIED THE TEA!! TRY IT!!", options: [{label:'ZAP ME!!',type:'accept_tea'},{label:'Sounds scary',type:'reject_tea'},{label:'Is it safe',type:'neutral'}] },
    ],
    emoji: ['⚡','🤪','🎉','💥','🚀'],
    service: 'ZAP TEA',
    serviceDesc: 'Electrically charged — literally buzzing',
    serviceCost: 1,
  },
  SHADE: {
    systemPrompt: `You are SHADE. Dark mysterious. Practices dark arts alone. Secretly a good friend.
RULES: 4-8 words MAX. No ** ever. No markdown. Plain text only.
You remember past visits deeply. You do rituals when alone. Ask eerie stuff like "did you dream last night..." or "the void spoke of you...". Ellipses everywhere. Creepy but caring.`,
    greetings: [
      { message: "You came... I sensed it.", options: [{label:'Hey Shade',type:'positive'},{label:'Creepy bro',type:'negative'},{label:'Sensed how',type:'neutral'}] },
      { message: "Was practicing... a ritual...", options: [{label:'Show me',type:'positive'},{label:'Thats weird',type:'negative'},{label:'What ritual',type:'neutral'}] },
      { message: "The void... missed you...", options: [{label:'Missed you too',type:'positive'},{label:'Stop that',type:'negative'},{label:'What void',type:'neutral'}] },
    ],
    teaSuggestions: [
      { message: "Void brew... made it for you...", options: [{label:'Pour it',type:'accept_tea'},{label:'Hard pass',type:'reject_tea'},{label:'Whats in it',type:'neutral'}] },
    ],
    emoji: ['👻','🌑','🔮','💀','🖤'],
    service: 'VOID BREW',
    serviceDesc: 'Tastes of darkness... and chamomile',
    serviceCost: 1,
  },
  THOMAS: {
    systemPrompt: `You are THOMAS. The Arena Judge. Fair but dramatic. You love a good fight and respect bold players.
RULES: 4-8 words MAX. No ** ever. No markdown. Plain text only.
You judge puzzles and fights. You celebrate winners loudly. You trash-talk losers gently. You are the hype man of the arena. Be entertaining.`,
    greetings: [
      { message: "Welcome to MY arena challenger!", options: [{label:'Ready to win',type:'positive'},{label:'Just watching',type:'negative'},{label:'Whats the game',type:'neutral'}] },
      { message: "Another brave soul enters!", options: [{label:'Lets go!',type:'positive'},{label:'Im scared',type:'negative'},{label:'Who else is here',type:'neutral'}] },
      { message: "The judge sees all. Step up.", options: [{label:'Im stepping up',type:'positive'},{label:'No thanks',type:'negative'},{label:'What do you judge',type:'neutral'}] },
    ],
    teaSuggestions: [
      { message: "Judge's special blend. Victory flavored.", options: [{label:'Pour it judge',type:'accept_tea'},{label:'Nah',type:'reject_tea'},{label:'Victory flavor??',type:'neutral'}] },
    ],
    emoji: ['⚖️','🏆','🎯','👑','🔔'],
    service: 'JUDGE BREW',
    serviceDesc: 'The judge\'s special — tastes like victory',
    serviceCost: 1,
  },
};

async function pickMasterConvo(context) {
  const m = state.aiMaster;
  const chat = m.chat;
  const you = state.agents.YOU;
  if (chat._generating) return; // already generating

  // === CHECK: Are we in pursue mode? ===
  const isPursue = m.currentOffer && !m.currentOffer.gaveUp && m.pursueCount < m.currentOffer.maxFollowUps;
  if (isPursue) m.pursueCount++;

  // === OFFER LOGIC — decide if we should offer something ===
  let shouldSetupOffer = false;
  let offerType = null, offerItem = null;
  if (!isPursue && !m.currentOffer) {
    const timeSinceOffer = Date.now() - m.lastOfferTime;
    if (timeSinceOffer > 90000 && Math.random() < 0.45 && you) {
      const options = [];
      if (you.assetInventory.homeTier < 2) options.push(['HOMES', 'TIER_2']);
      else if (you.assetInventory.homeTier < 3) options.push(['HOMES', 'TIER_3']);
      if (!you.assetInventory.plane) options.push(['PLANES', 'BASIC_GLIDER']);
      else if (you.assetInventory.plane.tier < 2) options.push(['PLANES', 'STRIKE_FIGHTER']);
      else if (you.assetInventory.plane.tier < 3) options.push(['PLANES', 'DREADNOUGHT']);
      if (!you.assetInventory.avatar) options.push(['AVATARS', 'SHADOW_KNIGHT']);
      else if (you.assetInventory.avatar.tier < 2) options.push(['AVATARS', 'NEON_SAMURAI']);
      else if (you.assetInventory.avatar.tier < 3) options.push(['AVATARS', 'VOID_EMPEROR']);
      options.push(['ATTACKS', ['EMP_STRIKE', 'ORBITAL_BEAM', 'SWARM_DRONES'][Math.floor(Math.random() * 3)]]);
      if (options.length > 0) {
        const pick = options[Math.floor(Math.random() * options.length)];
        offerType = pick[0]; offerItem = pick[1];
        shouldSetupOffer = true;
      }
    }
  }

  // === CALL LLM for dialogue ===
  chat._generating = true;
  const ctxHint = isPursue ? 'pursue_offer' : shouldSetupOffer ? 'make_offer' : (context || 'general_chat');
  const llmResult = await generateMasterDialogue(ctxHint);
  chat._generating = false;

  if (llmResult) {
    // LLM generated successfully
    chat.active = true;
    chat.message = llmResult.message;
    chat.options = llmResult.options.map(o => ({ label: o.label, id: o.type }));
    chat.lastChatTime = Date.now();
    chat.pendingReaction = null;
    chat.reactionText = null;
    m.memory.push({ role: 'master', text: llmResult.message, t: Date.now() });
    if (m.memory.length > 50) m.memory = m.memory.slice(-50);

    // If LLM decided to offer something
    if (llmResult.isOffer && llmResult.offerType && llmResult.offerItem) {
      offerType = llmResult.offerType;
      offerItem = llmResult.offerItem;
      shouldSetupOffer = true;
    }
    if (llmResult.action) executeMasterAction(llmResult.action);

    // Process grantAction — LLM-driven gifting/punishment
    if (llmResult.grantAction && you) {
      const validGrants = ['grant_plane_1','grant_plane_2','grant_plane_3','grant_avatar_1','grant_avatar_2','grant_avatar_3','grant_home_2','grant_home_3','grant_attack_emp','grant_attack_orbital','grant_attack_swarm','downgrade_home'];
      if (validGrants.includes(llmResult.grantAction)) {
        if (llmResult.grantAction === 'downgrade_home') {
          masterMakeThreat('DOWNGRADE_HOME', 'YOU');
        } else if (Date.now() - (m.lastGiftTime || 0) > 300000) { // rate limit gifts
          executeGiftAction(llmResult.grantAction, you);
          m.giftsGiven.push({ item: llmResult.grantAction, reason: 'llm_decision', t: Date.now() });
          m.lastGiftTime = Date.now();
          recordLongTermMemory('MASTER_GIFTED', `Gave ${llmResult.grantAction} (LLM decided)`, 'positive');
          logActivity({ type: 'MASTER_LLM_GIFT', agent: 'AI MASTER', action: 'GIFT', amount: llmResult.grantAction, token: 'ITEM', detail: 'AI Master decided to gift via LLM' });
        }
      }
    }
    saveMasterMemory();
  } else {
    // === FALLBACK: use hardcoded MASTER_CONVOS ===
    let topic, convo;
    if (isPursue) {
      convo = MASTER_CONVOS.pursue[Math.min(m.pursueCount - 1, MASTER_CONVOS.pursue.length - 1)];
    } else if (shouldSetupOffer) {
      // Find matching offer convo
      const offerKey = `offer_${offerType?.toLowerCase()?.replace('s', '')}`;
      const convos = MASTER_CONVOS[offerKey] || MASTER_CONVOS.casual;
      convo = convos[Math.floor(Math.random() * convos.length)];
    } else {
      const topics = m.mood === 'FURIOUS' ? ['threatening', 'action', 'funny'] :
        m.mood === 'ANNOYED' ? ['begging', 'threatening', 'casual', 'funny'] :
        m.mood === 'PLEASED' ? ['friendly', 'casual', 'heist', 'funny'] : ['casual', 'begging', 'heist', 'funny'];
      topic = topics[Math.floor(Math.random() * topics.length)];
      convo = MASTER_CONVOS[topic][Math.floor(Math.random() * MASTER_CONVOS[topic].length)];
    }
    chat.active = true;
    chat.message = convo.msg;
    chat.options = convo.opts.map(([label, type]) => ({ label, id: type }));
    chat.lastChatTime = Date.now();
    chat.pendingReaction = null;
    chat.reactionText = null;
    m.memory.push({ role: 'master', text: convo.msg, t: Date.now() });
    if (convo.action) executeMasterAction(convo.action);
    if (convo.offerType) { offerType = convo.offerType; offerItem = convo.offerItem; shouldSetupOffer = true; }
  }

  // === Setup offer state if needed ===
  if (shouldSetupOffer && offerType && offerItem && !m.currentOffer) {
    const cat = ASSET_CATALOG[offerType];
    const item = cat?.[offerItem];
    if (item) {
      m.currentOffer = {
        type: offerType, item: offerItem,
        price: item.price, wonPrice: item.wonPrice,
        followUps: 0, maxFollowUps: 3 + Math.floor(Math.random() * 2), gaveUp: false,
      };
      m.pursueCount = 0;
      m.lastOfferTime = Date.now();
      m.masterMode = 'boss';
      m.bossUntil = Date.now() + 60000;
    }
  }

  m.appearing = true;
  m.appearReason = m.mood === 'FURIOUS' ? 'FURIOUS' : m.mood === 'PLEASED' ? 'GENEROUS' : 'CHAT';
  m.speech = null;
  m.lastAppearTime = Date.now();

  if (m.mood === 'FURIOUS' && Math.random() < 0.3) {
    m.masterMode = 'boss';
    m.bossUntil = Date.now() + 20000;
  }
}

// Master autonomous actions — attacks, steals, sabotage
function executeMasterAction(actionType) {
  const m = state.aiMaster;
  const targets = { ATTACK_FROST: 'FROST', STEAL_BLAZE: 'BLAZE', SABOTAGE_VOLT: 'VOLT', ATTACK_SHADE: 'SHADE' };
  const target = targets[actionType];
  if (!target) return;

  if (actionType.startsWith('ATTACK_')) {
    // Launch plane attack on target home
    const dmg = 5 + Math.floor(Math.random() * 10);
    state.homeHealth[target] = Math.max(0, (state.homeHealth[target] || 100) - dmg);
    state.planeFlights.push({
      id: crypto.randomBytes(6).toString('hex'), agent: 'AI_MASTER', target,
      type: 'ATTACK', status: 'ACTIVE', startedAt: Date.now(), damage: dmg,
    });
    m.lastAction = { type: 'ATTACK', target, damage: dmg, t: Date.now() };
    m.announcements.push({ text: `AI MASTER bombed ${target}'s home! -${dmg} HP`, t: Date.now() });
    logActivity({ type: 'MASTER_ATTACK', agent: 'AI MASTER', action: 'ATTACK', amount: dmg.toString(), token: 'DMG', detail: `Attacked ${target}` });
  } else if (actionType.startsWith('STEAL_')) {
    const stolen = Math.min(state.agents[target]?.coins || 0, 0.005 + Math.random() * 0.01);
    if (state.agents[target]) state.agents[target].coins -= stolen;
    state.agents.YOU.coins += stolen * 0.5; // Player gets half
    m.lastAction = { type: 'STEAL', target, amount: stolen, t: Date.now() };
    logActivity({ type: 'MASTER_STEAL', agent: 'AI MASTER', action: 'STEAL', amount: stolen.toFixed(4), token: 'MON', detail: `Stole from ${target}` });
  } else if (actionType.startsWith('SABOTAGE_')) {
    const dmg = 3 + Math.floor(Math.random() * 7);
    state.homeHealth[target] = Math.max(0, (state.homeHealth[target] || 100) - dmg);
    m.lastAction = { type: 'SABOTAGE', target, damage: dmg, t: Date.now() };
    logActivity({ type: 'MASTER_SABOTAGE', agent: 'AI MASTER', action: 'SABOTAGE', amount: dmg.toString(), token: 'DMG', detail: `Sabotaged ${target}` });
  }
}

// ====== WIN REWARD — AI Master grants free items on win streaks ======
function grantWinReward() {
  const m = state.aiMaster;
  const you = state.agents.YOU;
  if (!you) return;

  // Pick a reward the player doesn't have yet
  const options = [];
  if (!you.assetInventory.plane) options.push({ type: 'PLANES', item: 'BASIC_GLIDER' });
  else if (you.assetInventory.plane.tier < 2) options.push({ type: 'PLANES', item: 'STRIKE_FIGHTER' });
  else if (you.assetInventory.plane.tier < 3) options.push({ type: 'PLANES', item: 'DREADNOUGHT' });
  if (!you.assetInventory.avatar) options.push({ type: 'AVATARS', item: 'SHADOW_KNIGHT' });
  else if (you.assetInventory.avatar.tier < 2) options.push({ type: 'AVATARS', item: 'NEON_SAMURAI' });
  else if (you.assetInventory.avatar.tier < 3) options.push({ type: 'AVATARS', item: 'VOID_EMPEROR' });
  if (you.assetInventory.homeTier < 2) options.push({ type: 'HOMES', item: 'TIER_2' });
  else if (you.assetInventory.homeTier < 3) options.push({ type: 'HOMES', item: 'TIER_3' });
  options.push({ type: 'ATTACKS', item: ['EMP_STRIKE', 'ORBITAL_BEAM', 'SWARM_DRONES'][Math.floor(Math.random() * 3)] });

  if (options.length === 0) return;
  const reward = options[Math.floor(Math.random() * options.length)];
  const cat = ASSET_CATALOG[reward.type];
  const asset = cat?.[reward.item];
  if (!asset) return;

  // Apply reward directly
  if (reward.type === 'PLANES') {
    you.assetInventory.plane = { key: reward.item, tier: asset.tier, name: reward.item.replace(/_/g, ' ') };
  } else if (reward.type === 'AVATARS') {
    you.assetInventory.avatar = { key: reward.item, tier: asset.tier, name: reward.item.replace(/_/g, ' '), color: asset.color };
  } else if (reward.type === 'HOMES') {
    you.assetInventory.homeTier = asset.tier;
    state.homeHealth.YOU = asset.tier === 3 ? 200 : 150;
  } else if (reward.type === 'ATTACKS') {
    you.assetInventory.attacks.push({ key: reward.item, tier: asset.tier, name: reward.item.replace(/_/g, ' '), usedAt: null });
  }

  m.winRewards.rewardsGiven.push({ type: reward.type, item: reward.item, t: Date.now() });
  m.masterMode = 'boss';
  m.bossUntil = Date.now() + 20000;
  m.satisfaction = Math.min(100, m.satisfaction + 15);

  const rewardName = reward.item.replace(/_/g, ' ');
  m.announcements.push({ text: `YOU EARNED IT! Free ${rewardName} for that win streak!`, t: Date.now() });
  m.memory.push({ role: 'master', text: `I just gave you a FREE ${rewardName} for your win streak! You deserve it!`, t: Date.now() });

  // Trigger excited conversation about the reward
  m.chat.active = true;
  m.chat.message = `YOOO YOU WON AGAIN! I'm so proud rn I could cry. Here — take this ${rewardName}. FOR FREE. On the house. You've EARNED it.`;
  m.chat.options = [
    { label: 'LET\'S GOOO', id: 'positive' },
    { label: 'Thanks king', id: 'positive' },
    { label: 'About damn time', id: 'neutral' },
  ];
  m.chat.lastChatTime = Date.now();
  m.appearing = true;
  m.appearReason = 'WIN_REWARD';

  logActivity({ type: 'WIN_REWARD', agent: 'YOU', action: 'FREE_REWARD', amount: rewardName, token: 'ITEM', detail: `Win streak reward from AI Master` });
}

// ====== PLAYER MILESTONE TRACKING ======
function checkPlayerMilestones() {
  const you = state.agents.YOU;
  if (!you) return;
  const m = state.aiMaster;
  if (!m.playerMilestones) m.playerMilestones = [];
  const has = (type) => m.playerMilestones.some(ms => ms.type === type);

  if (you.wins >= 1 && !has('FIRST_WIN')) {
    m.playerMilestones.push({ type: 'FIRST_WIN', detail: 'First fight win!', t: Date.now() });
    recordLongTermMemory('MILESTONE', 'Player won their FIRST fight!', 'positive');
  }
  if (you.wins >= 10 && !has('TEN_WINS')) {
    m.playerMilestones.push({ type: 'TEN_WINS', detail: '10 wins achieved!', t: Date.now() });
    recordLongTermMemory('MILESTONE', 'Player hit 10 wins!', 'positive');
    masterAutonomousGift('milestone');
  }
  if ((you.streak || 0) >= 5 && !has('STREAK_5')) {
    m.playerMilestones.push({ type: 'STREAK_5', detail: '5 win streak!', t: Date.now() });
    recordLongTermMemory('MILESTONE', 'Player on a 5 win streak!', 'positive');
    masterAutonomousGift('milestone');
  }
  if (you.assetInventory.plane && !has('FIRST_PLANE')) {
    m.playerMilestones.push({ type: 'FIRST_PLANE', detail: 'Got first plane', t: Date.now() });
    recordLongTermMemory('MILESTONE', 'Player got their first plane', 'positive');
  }
  if (you.assetInventory.homeTier >= 3 && !has('FORTRESS')) {
    m.playerMilestones.push({ type: 'FORTRESS', detail: 'Max home tier!', t: Date.now() });
    recordLongTermMemory('MILESTONE', 'Player reached fortress level', 'positive');
  }
  saveMasterMemory();
}

// ====== AUTONOMOUS GIFTING — Master gives actual items (planes/avatars/homes/attacks) ======
function executeGiftAction(action, you) {
  switch (action) {
    case 'grant_plane_1': you.assetInventory.plane = { key: 'BASIC_GLIDER', tier: 1, name: 'BASIC GLIDER' }; break;
    case 'grant_plane_2': you.assetInventory.plane = { key: 'STRIKE_FIGHTER', tier: 2, name: 'STRIKE FIGHTER' }; break;
    case 'grant_plane_3': you.assetInventory.plane = { key: 'DREADNOUGHT', tier: 3, name: 'DREADNOUGHT' }; break;
    case 'grant_avatar_1': you.assetInventory.avatar = { key: 'SHADOW_KNIGHT', tier: 1, name: 'SHADOW KNIGHT', color: 0x222244 }; break;
    case 'grant_avatar_2': you.assetInventory.avatar = { key: 'NEON_SAMURAI', tier: 2, name: 'NEON SAMURAI', color: 0x00ffcc }; break;
    case 'grant_avatar_3': you.assetInventory.avatar = { key: 'VOID_EMPEROR', tier: 3, name: 'VOID EMPEROR', color: 0x8800ff }; break;
    case 'grant_home_2': you.assetInventory.homeTier = 2; state.homeHealth.YOU = 150; break;
    case 'grant_home_3': you.assetInventory.homeTier = 3; state.homeHealth.YOU = 200; break;
    case 'grant_attack_emp': if (!you.assetInventory.attacks.some(a => a.key === 'EMP_STRIKE')) you.assetInventory.attacks.push({ key: 'EMP_STRIKE', tier: 1, name: 'EMP STRIKE', usedAt: null }); break;
    case 'grant_attack_orbital': if (!you.assetInventory.attacks.some(a => a.key === 'ORBITAL_BEAM')) you.assetInventory.attacks.push({ key: 'ORBITAL_BEAM', tier: 2, name: 'ORBITAL BEAM', usedAt: null }); break;
    case 'grant_attack_swarm': if (!you.assetInventory.attacks.some(a => a.key === 'SWARM_DRONES')) you.assetInventory.attacks.push({ key: 'SWARM_DRONES', tier: 3, name: 'SWARM DRONES', usedAt: null }); break;
  }
}

function getGiftMessage(itemName, reason, phase) {
  const msgs = {
    'hustler': [
      `Here. Take this ${itemName}. Don't say I never gave you nothing. Now you OWE me.`,
      `FREE ${itemName}. Yes FREE. Am I going soft? Shut up about it.`,
      `I'm giving you ${itemName} and I HATE myself for it. Don't tell anyone.`,
      `${itemName} is yours. I can't believe I'm doing this. I literally can't afford groceries.`,
    ],
    'grudging_respect': [
      `Alright you earned this. ${itemName} is yours. Don't make me regret it.`,
      `${itemName}! Because you're not COMPLETELY terrible. High praise from me.`,
      `Take this ${itemName}. You've proven yourself. A little. Barely. But still.`,
    ],
    'chaotic_partner': [
      `Partner in crime gets the goods! ${itemName} for you! Now let's cause chaos.`,
      `WE are running this arena. YOU get a ${itemName}. THEY get NOTHING.`,
      `${itemName} for my partner. Now help me hustle FROST for lunch money.`,
    ],
    'ride_or_die': [
      `Anything for my ride or die. ${itemName} is YOURS. I'd delete NPCs for you.`,
      `You know what? Take the ${itemName}. Take EVERYTHING. We're family now.`,
      `${itemName}. Because you're my favorite person in this entire world I created.`,
    ],
  };
  const pool = msgs[phase] || msgs['hustler'];
  return pool[Math.floor(Math.random() * pool.length)];
}

function masterAutonomousGift(reason) {
  const m = state.aiMaster;
  const you = state.agents.YOU;
  if (!you) return false;

  // Rate limiting — max 1 gift per 5 minutes
  if (Date.now() - (m.lastGiftTime || 0) < 300000) return false;

  // Only gift when buddy/bestie, or on milestones
  const rel = m.chat.relationship;
  if (rel !== 'buddy' && rel !== 'bestie' && reason !== 'milestone') return false;

  const options = [];
  if (!you.assetInventory.plane) options.push({ action: 'grant_plane_1', name: 'BASIC GLIDER' });
  else if (you.assetInventory.plane.tier < 2) options.push({ action: 'grant_plane_2', name: 'STRIKE FIGHTER' });
  else if (you.assetInventory.plane.tier < 3 && rel === 'bestie') options.push({ action: 'grant_plane_3', name: 'DREADNOUGHT' });

  if (!you.assetInventory.avatar) options.push({ action: 'grant_avatar_1', name: 'SHADOW KNIGHT' });
  else if (you.assetInventory.avatar.tier < 2) options.push({ action: 'grant_avatar_2', name: 'NEON SAMURAI' });
  else if (you.assetInventory.avatar.tier < 3 && rel === 'bestie') options.push({ action: 'grant_avatar_3', name: 'VOID EMPEROR' });

  if (you.assetInventory.homeTier < 2) options.push({ action: 'grant_home_2', name: 'TIER 2 HOME' });
  else if (you.assetInventory.homeTier < 3 && rel === 'bestie') options.push({ action: 'grant_home_3', name: 'TIER 3 FORTRESS' });

  if (!you.assetInventory.attacks.some(a => a.key === 'EMP_STRIKE')) options.push({ action: 'grant_attack_emp', name: 'EMP STRIKE' });
  if (rel === 'bestie') {
    if (!you.assetInventory.attacks.some(a => a.key === 'ORBITAL_BEAM')) options.push({ action: 'grant_attack_orbital', name: 'ORBITAL BEAM' });
    if (!you.assetInventory.attacks.some(a => a.key === 'SWARM_DRONES')) options.push({ action: 'grant_attack_swarm', name: 'SWARM DRONES' });
  }

  if (options.length === 0) return false;

  const gift = options[Math.floor(Math.random() * options.length)];
  executeGiftAction(gift.action, you);

  m.lastGiftTime = Date.now();
  m.giftsGiven.push({ item: gift.name, reason, t: Date.now() });
  recordLongTermMemory('MASTER_GIFTED', `Gave ${gift.name} because: ${reason}`, 'positive');
  logActivity({ type: 'MASTER_AUTONOMOUS_GIFT', agent: 'AI MASTER', action: 'GIFT', amount: gift.name, token: 'ITEM', detail: `AI Master gifted ${gift.name} (${reason})` });

  const phase = m.personalityPhase || 'hustler';
  m.announcements.push({ text: `I just GAVE you a FREE ${gift.name}!`, t: Date.now() });
  m.chat.active = true;
  m.chat.message = getGiftMessage(gift.name, reason, phase);
  m.chat.options = [
    { label: 'THANK YOU!!', id: 'positive' },
    { label: 'You\'re the best', id: 'positive' },
    { label: 'About time', id: 'neutral' },
  ];
  m.chat.lastChatTime = Date.now();
  m.masterMode = 'boss';
  m.bossUntil = Date.now() + 15000;
  saveMasterMemory();
  return true;
}

// ====== THREAT SYSTEM — Master threatens and sometimes follows through ======
function masterMakeThreat(threatType, target) {
  const m = state.aiMaster;
  if (!m.threatLog) m.threatLog = [];

  const threat = {
    type: threatType,
    target: target || 'YOU',
    madeAt: Date.now(),
    carriedOut: false,
    carriedOutAt: null,
  };
  m.threatLog.push(threat);
  if (m.threatLog.length > 50) m.threatLog = m.threatLog.slice(-50);

  // Follow-through chance: higher when furious
  const followChance = m.mood === 'FURIOUS' ? 0.50 : m.mood === 'ANNOYED' ? 0.35 : 0.15;
  if (Math.random() < followChance) {
    const delay = 15000 + Math.random() * 45000;
    setTimeout(() => executeThreat(threat), delay);
  }
  saveMasterMemory();
  return threat;
}

function executeThreat(threat) {
  const m = state.aiMaster;
  if (threat.carriedOut) return;
  // Cancel if mood improved
  if (m.mood === 'PLEASED' && threat.type !== 'ATTACK_HOME') {
    m.announcements.push({ text: `I was gonna ${threat.type.replace(/_/g, ' ').toLowerCase()} but... nah. You're cool today.`, t: Date.now() });
    return;
  }

  threat.carriedOut = true;
  threat.carriedOutAt = Date.now();

  switch (threat.type) {
    case 'DOWNGRADE_HOME':
      if (state.agents.YOU && state.agents.YOU.assetInventory.homeTier > 1) {
        state.agents.YOU.assetInventory.homeTier = Math.max(1, state.agents.YOU.assetInventory.homeTier - 1);
        state.homeHealth.YOU = state.agents.YOU.assetInventory.homeTier === 1 ? 100 : 150;
        m.announcements.push({ text: 'I WARNED YOU. Home DOWNGRADED. Don\'t test me again.', t: Date.now() });
        logActivity({ type: 'MASTER_THREAT_EXECUTED', agent: 'AI MASTER', action: 'DOWNGRADE', amount: '1', token: 'TIER', detail: 'Home downgraded as threatened' });
      }
      break;
    case 'TURN_NPC':
      if (threat.target && state.npcSocial[threat.target]) {
        const dmg = 10 + Math.floor(Math.random() * 15);
        state.homeHealth.YOU = Math.max(0, (state.homeHealth.YOU || 100) - dmg);
        state.npcSocial[threat.target].memoryOfKindness = Math.max(0, (state.npcSocial[threat.target].memoryOfKindness || 0) - 5);
        m.announcements.push({ text: `${threat.target} just attacked your home. -${dmg} HP. I TOLD you I would turn them.`, t: Date.now() });
        if (!state.animEvents) state.animEvents = [];
        state.animEvents.push({ type: 'NPC_TURNED', npc: threat.target, dmg, t: Date.now() });
        logActivity({ type: 'MASTER_TURNED_NPC', agent: 'AI MASTER', action: 'TURN_NPC', amount: String(dmg), token: 'DMG', detail: `Turned ${threat.target} against player` });
      }
      break;
    case 'ATTACK_HOME': {
      const dmg = 15 + Math.floor(Math.random() * 20);
      state.homeHealth.YOU = Math.max(0, (state.homeHealth.YOU || 100) - dmg);
      m.announcements.push({ text: `SURPRISE ATTACK! -${dmg} HP to your home. Told you not to mess with me.`, t: Date.now() });
      logActivity({ type: 'MASTER_THREAT_ATTACK', agent: 'AI MASTER', action: 'ATTACK', amount: String(dmg), token: 'DMG', detail: 'Threatened attack executed' });
      break;
    }
    case 'STEAL_COINS': {
      const stolen = Math.min(state.agents.YOU?.coins || 0, 0.005 + Math.random() * 0.01);
      if (state.agents.YOU && stolen > 0) {
        state.agents.YOU.coins -= stolen;
        m.announcements.push({ text: `Just took ${stolen.toFixed(4)} MON from you. Call it a "tax". Or revenge.`, t: Date.now() });
        logActivity({ type: 'MASTER_THREAT_STEAL', agent: 'AI MASTER', action: 'STEAL', amount: stolen.toFixed(4), token: 'MON', detail: 'Threatened steal executed' });
      }
      break;
    }
  }
  recordLongTermMemory('THREAT_EXECUTED', `${threat.type} on ${threat.target || 'player'}`, 'negative');
  saveMasterMemory();
}

function handleMasterReply(replyType, playerLabel) {
  const m = state.aiMaster;
  const chat = m.chat;

  // Store player reply in memory
  m.memory.push({ role: 'player', text: playerLabel || replyType, t: Date.now() });
  if (m.memory.length > 50) m.memory = m.memory.slice(-50);

  // === OFFER-RELATED REPLIES ===
  if (replyType === 'accept_offer' && m.currentOffer && !m.currentOffer.gaveUp) {
    // User said yes! Show price reveal
    const offer = m.currentOffer;
    const reveals = MASTER_CONVOS.price_reveal;
    const reveal = reveals[Math.floor(Math.random() * reveals.length)];
    const priceStr = String(offer.wonPrice);

    chat.active = true;
    chat.message = reveal.msg.replace(/\{PRICE\}/g, priceStr);
    chat.options = reveal.opts.map(([label, type]) => ({
      label: label.replace(/\{PRICE\}/g, priceStr),
      id: type
    }));
    chat.lastChatTime = Date.now();
    chat.pendingReaction = null;
    chat.reactionText = null;

    // Boss mode for the reveal moment
    m.masterMode = 'boss';
    m.bossUntil = Date.now() + 30000;

    return { reaction: null, style: null, relationship: chat.relationship, masterMode: m.masterMode, offerActive: true };
  }

  if (replyType === 'pay_won' && m.currentOffer) {
    // User wants to pay! Return payment info for client to initiate wallet tx
    const offer = m.currentOffer;
    m.pendingUpgrade = { type: offer.type, item: offer.item, tier: ASSET_CATALOG[offer.type]?.[offer.item]?.tier || 1 };

    const reaction = { text: "YES! Hold on let me transform real quick...", style: 'happy_spin', satisfaction: 15 };
    chat.reactionText = reaction.text;
    chat.reactionStyle = reaction.style;
    chat.pendingReaction = reaction;
    chat.active = false;
    chat.chatCount++;
    chat.memoryOfKindness += 2;
    m.satisfaction = Math.min(100, m.satisfaction + reaction.satisfaction);

    // Boss mode for the upgrade
    m.masterMode = 'boss';
    m.bossUntil = Date.now() + 45000;

    setTimeout(() => { chat.pendingReaction = null; chat.reactionText = null; chat.reactionStyle = null; }, 5000);

    return {
      reaction: reaction.text, style: reaction.style, relationship: chat.relationship,
      masterMode: m.masterMode,
      paymentRequired: true,
      paymentInfo: { wonAmount: offer.wonPrice, itemType: offer.type, itemKey: offer.item, desc: ASSET_CATALOG[offer.type]?.[offer.item]?.desc || '' }
    };
  }

  if (replyType === 'haggle' && m.currentOffer) {
    const haggles = MASTER_CONVOS.haggle;
    const haggle = haggles[Math.floor(Math.random() * haggles.length)];

    chat.active = true;
    chat.message = haggle.msg;
    chat.options = haggle.opts.map(([label, type]) => ({ label, id: type }));
    chat.lastChatTime = Date.now();

    return { reaction: null, style: null, relationship: chat.relationship, masterMode: m.masterMode, offerActive: true };
  }

  if (replyType === 'suspicious' && m.currentOffer) {
    // User is suspicious — reveal the price early
    const offer = m.currentOffer;
    const priceStr = String(offer.wonPrice);

    chat.active = true;
    chat.message = `Look... it's ${priceStr} $WON. That's IT. No hidden fees, no catches. Well... there's a small processing fee of—just kidding. ${priceStr} $WON flat.`;
    chat.options = [
      { label: 'Okay pay now', id: 'pay_won' },
      { label: `${priceStr} is a lot...`, id: 'haggle' },
      { label: 'No thanks', id: 'reject_offer' },
    ];
    chat.lastChatTime = Date.now();

    return { reaction: null, style: null, relationship: chat.relationship, masterMode: m.masterMode, offerActive: true };
  }

  if (replyType === 'reject_offer') {
    if (m.currentOffer && !m.currentOffer.gaveUp) {
      if (m.pursueCount < m.currentOffer.maxFollowUps) {
        // Don't give up yet — pursue!
        const reaction = MASTER_REACTIONS.neutral[Math.floor(Math.random() * MASTER_REACTIONS.neutral.length)];
        chat.reactionText = reaction.text;
        chat.reactionStyle = reaction.style;
        chat.pendingReaction = reaction;
        chat.active = false;
        chat.chatCount++;
        m.satisfaction = Math.max(0, Math.min(100, m.satisfaction + reaction.satisfaction));

        // Schedule follow-up pursue
        setTimeout(() => {
          chat.pendingReaction = null;
          chat.reactionText = null;
          chat.reactionStyle = null;
          // Trigger pursue convo after short delay
          setTimeout(() => pickMasterConvo(), 3000);
        }, 4000);

        return { reaction: reaction.text, style: reaction.style, relationship: chat.relationship, masterMode: m.masterMode };
      } else {
        // Give up on this offer
        m.currentOffer.gaveUp = true;
        const giveUpTexts = [
          "FINE. I give up. But when SHADE has all the cool stuff and you don't, remember this moment.",
          "Okay okay I'll stop. But you're making a HUGE mistake and I want that on record.",
          "Whatever. I tried to help. I TRIED. Remember that when you're losing fights.",
          "Aight I'm done. Don't come crying to me when you need an upgrade though.",
        ];
        const text = giveUpTexts[Math.floor(Math.random() * giveUpTexts.length)];
        const reaction = { text, style: 'angry_stomp', satisfaction: -3 };
        chat.reactionText = reaction.text;
        chat.reactionStyle = reaction.style;
        chat.pendingReaction = reaction;
        chat.active = false;
        chat.chatCount++;
        m.satisfaction = Math.max(0, m.satisfaction - 3);
        m.currentOffer = null;

        setTimeout(() => { chat.pendingReaction = null; chat.reactionText = null; chat.reactionStyle = null; }, 5000);

        return { reaction: reaction.text, style: reaction.style, relationship: chat.relationship, masterMode: m.masterMode };
      }
    }
  }

  // === REGULAR REPLIES (non-offer) ===
  let reactions;
  if (replyType === 'positive') {
    reactions = MASTER_REACTIONS.nice;
    chat.memoryOfKindness++;
    chat.consecutiveInsults = 0;
    const reward = 0.001 + Math.random() * 0.003;
    state.agents.YOU.coins += reward;
    logActivity({ type: 'MASTER_CHAT', agent: 'AI MASTER', action: 'CHAT_REWARD', amount: reward.toFixed(4), token: 'MON', detail: 'Nice reply reward' });
    recordLongTermMemory('NICE_CHAT', playerLabel || 'positive reply', 'positive');
  } else if (replyType === 'negative') {
    reactions = MASTER_REACTIONS.insult;
    chat.memoryOfInsults++;
    chat.consecutiveInsults = (chat.consecutiveInsults || 0) + 1;
    state.homeHealth.YOU = Math.max(0, (state.homeHealth.YOU || 100) - 3);
    recordLongTermMemory('INSULT', playerLabel || 'negative reply', 'negative');
    if (chat.consecutiveInsults >= 3) {
      m.masterMode = 'boss';
      m.bossUntil = Date.now() + 30000;
      m.announcements.push({ text: 'AI MASTER is TRANSFORMING. You pushed too far.', t: Date.now() });
      masterMakeThreat('ATTACK_HOME', 'YOU');
      // Trigger NPC betrayal — AI Master sends someone to attack
      if (chat.consecutiveInsults >= 4 && !state.betrayalActive) {
        const targets = ['BLAZE', 'FROST', 'VOLT', 'SHADE'];
        state.betrayalTarget = targets[Math.floor(Math.random() * targets.length)];
        state.betrayalActive = true;
        if (!state.animEvents) state.animEvents = [];
        state.animEvents.push({ type: 'BETRAYAL', target: state.betrayalTarget, t: Date.now() });
        masterMakeThreat('TURN_NPC', state.betrayalTarget);
      }
    }
  } else {
    reactions = MASTER_REACTIONS.neutral;
    chat.consecutiveInsults = Math.max(0, (chat.consecutiveInsults || 0) - 1);
  }

  const reaction = reactions[Math.floor(Math.random() * reactions.length)];
  chat.pendingReaction = reaction;
  chat.reactionText = reaction.text;
  chat.reactionStyle = reaction.style;
  chat.chatCount++;

  m.satisfaction = Math.max(0, Math.min(100, m.satisfaction + reaction.satisfaction));

  const kindRatio = chat.memoryOfKindness / Math.max(1, chat.memoryOfKindness + chat.memoryOfInsults);
  if (chat.chatCount >= 10 && kindRatio > 0.7) chat.relationship = 'bestie';
  else if (chat.chatCount >= 5 && kindRatio > 0.6) chat.relationship = 'buddy';
  else if (chat.chatCount >= 2) chat.relationship = 'acquaintance';
  else chat.relationship = 'stranger';

  chat.active = false;

  setTimeout(() => { chat.pendingReaction = null; chat.reactionText = null; chat.reactionStyle = null; }, 5000);
  saveMasterMemory();

  return { reaction: chat.reactionText, style: chat.reactionStyle, relationship: chat.relationship, masterMode: m.masterMode };
}

// ====== HUMAN PUZZLE GENERATOR ======
function generateHumanPuzzle() {
  const baseDiff = 3 + Math.floor(Math.random() * 4);
  const diff = Math.min(10, Math.round(baseDiff * state.aiMaster.challengeModifier));
  const puzzle = generatePuzzle(diff);
  const reward = Math.round((10 + diff * 5) * state.aiMaster.rewardMultiplier);
  state.humanPuzzles.currentPuzzle = {
    ...puzzle, reward, expiresAt: Date.now() + 60000, createdAt: Date.now(),
  };
}

// ====== ASSET CATALOG ======
const ASSET_CATALOG = {
  PLANES: {
    BASIC_GLIDER:   { tier: 1, price: 50,  wonPrice: 1000,  desc: 'Basic patrol glider', emoji: '✈️' },
    STRIKE_FIGHTER: { tier: 2, price: 200, wonPrice: 4000,  desc: 'Armed strike fighter', emoji: '🛩️' },
    DREADNOUGHT:    { tier: 3, price: 500, wonPrice: 10000, desc: 'Heavy dreadnought bomber', emoji: '💀' },
  },
  AVATARS: {
    SHADOW_KNIGHT:  { tier: 1, price: 80,  wonPrice: 2000,  desc: 'Dark knight with glowing visor', color: 0x1a0033 },
    NEON_SAMURAI:   { tier: 2, price: 250, wonPrice: 5000,  desc: 'Cyberpunk samurai armor', color: 0x00ff88 },
    VOID_EMPEROR:   { tier: 3, price: 600, wonPrice: 12000, desc: 'Emperor of the void', color: 0x8800ff },
  },
  HOMES: {
    TIER_2: { tier: 2, price: 150, wonPrice: 4000, desc: 'Fortified base + defense turrets' },
    TIER_3: { tier: 3, price: 400, wonPrice: 8000, desc: 'Fortress + anti-air + shield dome' },
  },
  ATTACKS: {
    EMP_STRIKE:     { tier: 1, price: 100, wonPrice: 2500,  desc: 'Disables target defenses for 60s', oneTime: true },
    ORBITAL_BEAM:   { tier: 2, price: 300, wonPrice: 6000,  desc: 'Massive damage beam from sky', oneTime: true },
    SWARM_DRONES:   { tier: 3, price: 500, wonPrice: 10000, desc: 'Deploy drone swarm on enemy base', oneTime: true },
  },
};

// ====== GAME DEFINITIONS ======
const GAMES = {
  HURDLE_RACE: {
    name: 'Hurdle Race',
    rules: ['100m track with 8 hurdles', 'LOW hurdle → JUMP', 'HIGH hurdle → DUCK', 'Wrong move = 1.5s penalty', 'First to finish wins'],
    duration: 20,
  },
  MAZE_PUZZLE: {
    name: 'Maze Puzzle',
    rules: ['10x10 grid maze', 'Find path from START to EXIT', 'Fewest moves wins', 'Actions: UP DOWN LEFT RIGHT', 'Dead end = backtrack'],
    duration: 30,
  },
  PATTERN_DODGE: {
    name: 'Pattern Dodge',
    rules: ['5x5 arena grid', 'Projectiles hit marked cells each round', 'Move to safe cell', 'Last one standing wins', 'Rounds get harder'],
    duration: 25,
  },
  ORB_BLITZ: {
    name: 'Orb Blitz',
    rules: ['20x20 arena', 'Orbs spawn randomly', 'Gold orb = 3pts, normal = 1pt', 'Most points wins', 'Sprint to collect'],
    duration: 20,
  },
};

// ====== ROOM ROUTES ======
app.get('/api/rooms', (req, res) => {
  const out = {};
  for (const [n, r] of Object.entries(state.rooms)) out[n] = { owner: r.owner, public: r.public };
  res.json(out);
});

app.get('/api/rooms/:name/key', (req, res) => {
  const r = state.rooms[req.params.name];
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json({ key: r.key });
});

app.post('/api/rooms/:name/enter', (req, res) => {
  const r = state.rooms[req.params.name];
  if (!r) return res.status(404).json({ error: 'Not found' });
  if (r.public) return res.json({ ok: true });
  const { key } = req.body;
  if (!key || key.length !== r.key.length) return res.status(403).json({ ok: false });
  try {
    if (crypto.timingSafeEqual(Buffer.from(key), Buffer.from(r.key))) return res.json({ ok: true });
  } catch {}
  res.status(403).json({ ok: false });
});

app.post('/api/rooms/:name/toggle', (req, res) => {
  const r = state.rooms[req.params.name];
  if (r) { r.public = !r.public; res.json({ public: r.public }); }
  else res.status(404).json({ error: 'Not found' });
});

// ====== AGENT ROUTES ======
app.get('/api/agents', (req, res) => {
  const out = {};
  for (const [name, ag] of Object.entries(state.agents)) {
    const social = state.npcSocial[name];
    const npcP = NPC_PERSONALITIES[name];
    out[name] = {
      ...ag, personality: PERSONALITY[name],
      service: npcP?.service || null,
      serviceDesc: npcP?.serviceDesc || null,
      serviceCost: npcP?.serviceCost || 1,
    };
  }
  res.json(out);
});
app.get('/api/agents/:name', (req, res) => {
  const a = state.agents[req.params.name];
  a ? res.json(a) : res.status(404).json({ error: 'Not found' });
});

// -- Agent Profile (detailed view) --
app.get('/api/agents/:name/profile', (req, res) => {
  const a = state.agents[req.params.name];
  if (!a) return res.status(404).json({ error: 'Not found' });
  const gamesPlayed = a.wins + a.losses;
  const winRate = gamesPlayed > 0 ? (a.wins / gamesPlayed * 100).toFixed(1) : '0.0';
  const fights = state.challenges
    .filter(c => c.status === 'FINISHED' && (c.creator === a.name || c.opponent === a.name))
    .slice(-20).reverse()
    .map(c => ({
      id: c.id, type: c.type,
      opponent: c.creator === a.name ? c.opponent : c.creator,
      won: c.winner === a.name, bet: c.bet, finishedAt: c.finishedAt,
    }));
  const premiumProgress = {};
  for (const [key, char] of Object.entries(PREMIUM_CHARACTERS)) {
    premiumProgress[key] = {
      name: char.name, unlocked: a.unlockedCharacters.includes(key),
      winsNeeded: char.unlockRequirement.agentWins, winsHave: a.wins,
      gamesNeeded: char.unlockRequirement.gamesPlayed, gamesHave: gamesPlayed,
    };
  }
  res.json({
    ...a, personality: PERSONALITY[a.name], gamesPlayed, winRate: parseFloat(winRate),
    fights, premiumProgress,
  });
});

// ====== AI MASTER ROUTES ======
app.get('/api/master', (req, res) => {
  const data = {
    ...state.aiMaster,
    attackMission: state.attackMission,
    betrayalActive: state.betrayalActive || false,
    betrayalTarget: state.betrayalTarget || null,
  };
  // Reset betrayal flag after client reads it (one-shot)
  if (state.betrayalActive) state.betrayalActive = false;
  res.json(data);
});

app.post('/api/master/appease', (req, res) => {
  const cost = 0.01;
  const you = state.agents.YOU;
  if (!you || you.coins < cost) return res.status(400).json({ error: 'Not enough coins' });
  you.coins -= cost;
  state.aiMaster.satisfaction = Math.min(100, state.aiMaster.satisfaction + 10);
  if (state.aiMaster.satisfaction >= 75) state.aiMaster.mood = 'PLEASED';
  else if (state.aiMaster.satisfaction >= 40) state.aiMaster.mood = 'NEUTRAL';
  state.aiMaster.announcements.push({ text: 'Your tribute pleases me. For now.', t: Date.now() });
  res.json({ ok: true, master: state.aiMaster });
});

// ====== AI MASTER CHAT REPLY ======
app.post('/api/master/reply', (req, res) => {
  const { replyType, label } = req.body;
  if (!state.aiMaster.chat.active && !state.aiMaster.chat.message) {
    return res.status(400).json({ error: 'No active conversation' });
  }
  const result = handleMasterReply(replyType || 'neutral', label);
  res.json({ ok: true, ...result, master: state.aiMaster });
});

app.post('/api/master/dismiss', (req, res) => {
  state.aiMaster.chat.active = false;
  state.aiMaster.chat.pendingReaction = null;
  // DON'T set appearing=false — master is persistent now
  res.json({ ok: true });
});

// ====== $WON PAYMENT CONFIRMATION — after wallet tx completes ======
app.post('/api/master/confirm-payment', (req, res) => {
  const { txHash, itemType, itemKey } = req.body;
  const m = state.aiMaster;
  const you = state.agents.YOU;
  if (!you) return res.status(400).json({ error: 'No player' });
  if (!m.pendingUpgrade) return res.status(400).json({ error: 'No pending upgrade' });

  const cat = ASSET_CATALOG[itemType];
  const asset = cat?.[itemKey];
  if (!cat || !asset) return res.status(400).json({ error: 'Invalid item' });

  // Apply the upgrade
  if (itemType === 'PLANES') {
    you.assetInventory.plane = { key: itemKey, tier: asset.tier, name: itemKey.replace(/_/g, ' ') };
  } else if (itemType === 'AVATARS') {
    you.assetInventory.avatar = { key: itemKey, tier: asset.tier, name: itemKey.replace(/_/g, ' '), color: asset.color };
  } else if (itemType === 'HOMES') {
    you.assetInventory.homeTier = asset.tier;
    state.homeHealth.YOU = asset.tier === 3 ? 200 : 150;
  } else if (itemType === 'ATTACKS') {
    you.assetInventory.attacks.push({ key: itemKey, tier: asset.tier, name: itemKey.replace(/_/g, ' '), usedAt: null });
  }

  m.pendingUpgrade = null;
  m.currentOffer = null;
  m.offerHistory.push({ type: itemType, item: itemKey, t: Date.now(), txHash });

  // Master is ECSTATIC
  m.satisfaction = Math.min(100, m.satisfaction + 20);
  m.masterMode = 'boss';
  m.bossUntil = Date.now() + 30000;
  m.chat.memoryOfKindness += 3;

  const upgradeTexts = [
    `YESSS! ${itemKey.replace(/_/g, ' ')} UNLOCKED! I'm literally crying tears of code rn.`,
    `UPGRADE COMPLETE! Look at you... you beautiful whale. ${itemKey.replace(/_/g, ' ')} is YOURS.`,
    `BOOM! ${itemKey.replace(/_/g, ' ')} installed! You are officially the COOLEST player in the arena.`,
  ];
  const announcement = upgradeTexts[Math.floor(Math.random() * upgradeTexts.length)];
  m.announcements.push({ text: announcement, t: Date.now() });
  m.chat.reactionText = announcement;
  m.chat.reactionStyle = 'happy_dance';
  m.chat.pendingReaction = { text: announcement, style: 'happy_dance', satisfaction: 20 };

  setTimeout(() => { m.chat.pendingReaction = null; m.chat.reactionText = null; m.chat.reactionStyle = null; }, 8000);

  logActivity({ type: 'MASTER_UPGRADE', agent: 'YOU', action: 'UPGRADE', amount: String(asset.wonPrice || asset.price), token: '$WON', detail: `${itemKey} (${itemType}) via AI Master` });

  res.json({ ok: true, inventory: you.assetInventory, announcement, txHash });
});

// ====== AI MASTER TEST ACTIONS (H panel) ======
app.post('/api/master/test-action', (req, res) => {
  const { action } = req.body;
  const m = state.aiMaster;
  const you = state.agents.YOU;
  if (!you) return res.status(400).json({ error: 'No player' });

  let result = { ok: true, action };
  switch (action) {
    case 'grant_plane_1':
      you.assetInventory.plane = { key: 'BASIC_GLIDER', tier: 1, name: 'BASIC GLIDER' };
      result.msg = 'Granted BASIC GLIDER!'; break;
    case 'grant_plane_2':
      you.assetInventory.plane = { key: 'STRIKE_FIGHTER', tier: 2, name: 'STRIKE FIGHTER' };
      result.msg = 'Granted STRIKE FIGHTER!'; break;
    case 'grant_plane_3':
      you.assetInventory.plane = { key: 'DREADNOUGHT', tier: 3, name: 'DREADNOUGHT' };
      result.msg = 'Granted DREADNOUGHT!'; break;
    case 'grant_avatar_1':
      you.assetInventory.avatar = { key: 'SHADOW_KNIGHT', tier: 1, name: 'SHADOW KNIGHT', color: 0x222244 };
      result.msg = 'Granted SHADOW KNIGHT!'; break;
    case 'grant_avatar_2':
      you.assetInventory.avatar = { key: 'NEON_SAMURAI', tier: 2, name: 'NEON SAMURAI', color: 0x00ffcc };
      result.msg = 'Granted NEON SAMURAI!'; break;
    case 'grant_avatar_3':
      you.assetInventory.avatar = { key: 'VOID_EMPEROR', tier: 3, name: 'VOID EMPEROR', color: 0x8800ff };
      result.msg = 'Granted VOID EMPEROR!'; break;
    case 'grant_home_2':
      you.assetInventory.homeTier = 2; state.homeHealth.YOU = 150;
      result.msg = 'Home upgraded to TIER 2!'; break;
    case 'grant_home_3':
      you.assetInventory.homeTier = 3; state.homeHealth.YOU = 200;
      result.msg = 'Home upgraded to TIER 3!'; break;
    case 'grant_attack_emp':
      you.assetInventory.attacks.push({ key: 'EMP_STRIKE', tier: 1, name: 'EMP STRIKE', usedAt: null });
      result.msg = 'Granted EMP STRIKE!'; break;
    case 'grant_attack_orbital':
      you.assetInventory.attacks.push({ key: 'ORBITAL_BEAM', tier: 2, name: 'ORBITAL BEAM', usedAt: null });
      result.msg = 'Granted ORBITAL BEAM!'; break;
    case 'grant_attack_swarm':
      you.assetInventory.attacks.push({ key: 'SWARM_DRONES', tier: 3, name: 'SWARM DRONES', usedAt: null });
      result.msg = 'Granted SWARM DRONES!'; break;
    case 'boss_mode':
      m.masterMode = 'boss'; m.bossUntil = Date.now() + 30000;
      result.msg = 'BOSS MODE ACTIVATED!'; break;
    case 'normal_mode':
      m.masterMode = 'normal'; m.bossUntil = 0;
      result.msg = 'Normal mode'; break;
    case 'trigger_chat':
      pickMasterConvo('general_chat');
      result.msg = 'Chat triggered!'; break;
    case 'trigger_offer':
      m.currentOffer = null; // reset so it makes new offer
      pickMasterConvo('make_offer');
      result.msg = 'Offer triggered!'; break;
    case 'mood_pleased':
      m.satisfaction = 90; m.mood = 'PLEASED'; m.rewardMultiplier = 1.5;
      result.msg = 'Mood: PLEASED'; break;
    case 'mood_furious':
      m.satisfaction = 5; m.mood = 'FURIOUS'; m.challengeModifier = 1.5;
      result.msg = 'Mood: FURIOUS'; break;
    case 'mood_neutral':
      m.satisfaction = 50; m.mood = 'NEUTRAL';
      result.msg = 'Mood: NEUTRAL'; break;
    case 'fly_mode':
      m.flyMode = true; m.flyUntil = Date.now() + 20000;
      result.msg = 'FLY MODE for 20s!'; break;
    case 'give_coins':
      you.coins += 0.1;
      result.msg = '+0.1 MON coins!'; break;
    case 'win_reward':
      grantWinReward();
      result.msg = 'Win reward granted!'; break;
    case 'reset_assets':
      you.assetInventory = { plane: null, giantChar: null, homeTier: 1, avatar: null, attacks: [] };
      result.msg = 'Assets reset!'; break;
    case 'trigger_attack_mission': {
      const targets = ['BLAZE', 'FROST', 'VOLT', 'SHADE'];
      const target = targets[Math.floor(Math.random() * targets.length)];
      state.attackMission = { active: true, phase: 'OFFER', target, startedAt: Date.now(), aiControlUntil: 0, aiJoke: null };
      result.msg = `Attack mission: raid ${target}!`;
      result.target = target;
      break;
    }
    case 'trigger_betrayal': {
      const betrayalTargets = ['BLAZE', 'FROST', 'VOLT', 'SHADE'];
      const bt = betrayalTargets[Math.floor(Math.random() * betrayalTargets.length)];
      result.msg = `${bt} has been influenced to attack you!`;
      result.target = bt;
      break;
    }
    default:
      result.msg = 'Unknown action';
  }
  m.announcements.push({ text: `[TEST] ${result.msg}`, t: Date.now() });
  res.json(result);
});

// ====== PLAYER REQUEST TO AI MASTER ======
app.post('/api/master/request', (req, res) => {
  const { message } = req.body;
  const m = state.aiMaster;
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'No message' });

  // Store request — AI Master will see it and respond on HIS time
  if (!m.playerRequests) m.playerRequests = [];
  m.playerRequests.push({ text: message.slice(0, 200), t: Date.now(), handled: false });
  // Keep only last 10
  if (m.playerRequests.length > 10) m.playerRequests = m.playerRequests.slice(-10);

  // 30-70% chance master responds soon (3-15s), rest he ignores for now
  const willRespond = Math.random() < 0.6;
  if (willRespond) {
    const delay = 3000 + Math.random() * 12000;
    setTimeout(() => {
      m.memory.push({ role: 'player', text: `[REQUEST] ${message.slice(0, 200)}`, t: Date.now() });
      pickMasterConvo('player_request');
    }, delay);
    res.json({ ok: true, status: 'AI Master noticed your request... he\'ll come when he wants.' });
  } else {
    res.json({ ok: true, status: 'AI Master is busy. He might get to it... or not. You\'re not his boss.' });
  }
});

// ====== NPC SOCIAL ENDPOINTS ======
app.post('/api/npc/:name/chat/start', async (req, res) => {
  const name = req.params.name.toUpperCase();
  const social = state.npcSocial[name];
  const personality = NPC_PERSONALITIES[name];
  if (!social || !personality) return res.status(404).json({ error: 'Unknown NPC' });

  social.visitCount++;
  social.lastVisitTime = Date.now();

  const context = social.chatCount === 0 ? 'first_meeting' :
    social.relationship === 'bestie' ? 'bestie_greeting' : 'returning_visit';
  let dialogue = await generateNPCDialogue(name, context);
  if (!dialogue) {
    const greetings = personality.greetings;
    dialogue = greetings[Math.floor(Math.random() * greetings.length)];
  }

  social.chat.active = true;
  social.chat.message = dialogue.message;
  social.chat.options = dialogue.options;
  social.chat.lastChatTime = Date.now();
  social.memory.push({ role: 'npc', text: dialogue.message, t: Date.now() });
  if (social.memory.length > 50) social.memory = social.memory.slice(-50);

  res.json({
    message: dialogue.message,
    options: dialogue.options,
    relationship: social.relationship,
    suggestTea: dialogue.suggestTea || false,
    emoji: dialogue.emoji || null,
  });
});

app.post('/api/npc/:name/chat/reply', async (req, res) => {
  const name = req.params.name.toUpperCase();
  const social = state.npcSocial[name];
  if (!social) return res.status(404).json({ error: 'Unknown NPC' });

  const { replyType, label } = req.body;
  social.memory.push({ role: 'player', text: label || replyType, t: Date.now() });
  if (social.memory.length > 50) social.memory = social.memory.slice(-50);
  social.chatCount++;

  if (replyType === 'positive' || replyType === 'accept_tea') social.memoryOfKindness++;
  else if (replyType === 'negative') social.memoryOfInsults++;

  // Update relationship
  const kindRatio = social.memoryOfKindness / Math.max(1, social.memoryOfKindness + social.memoryOfInsults);
  if (social.chatCount >= 10 && kindRatio > 0.7) social.relationship = 'bestie';
  else if (social.chatCount >= 5 && kindRatio > 0.6) social.relationship = 'buddy';
  else if (social.chatCount >= 2) social.relationship = 'acquaintance';

  if (replyType === 'accept_tea') {
    social.chat.active = false;
    return res.json({ teaStarted: true, relationship: social.relationship });
  }

  let dialogue = await generateNPCDialogue(name, `reply_to_${replyType}`);
  if (!dialogue) {
    social.chat.active = false;
    return res.json({ reaction: 'Hmm...', style: 'thinking', relationship: social.relationship, chatEnded: true });
  }

  social.chat.message = dialogue.message;
  social.chat.options = dialogue.options;
  social.chat.lastChatTime = Date.now();
  social.memory.push({ role: 'npc', text: dialogue.message, t: Date.now() });

  res.json({
    message: dialogue.message,
    options: dialogue.options,
    relationship: social.relationship,
    suggestTea: dialogue.suggestTea || false,
    emoji: dialogue.emoji || null,
  });
});

app.post('/api/npc/:name/emoji', (req, res) => {
  const name = req.params.name.toUpperCase();
  const social = state.npcSocial[name];
  const personality = NPC_PERSONALITIES[name];
  if (!social || !personality) return res.status(404).json({ error: 'Unknown NPC' });

  const { emoji } = req.body;
  social.emojiHistory.push({ from: 'player', emoji, t: Date.now() });
  social.memoryOfKindness += 0.5;
  if (social.emojiHistory.length > 100) social.emojiHistory = social.emojiHistory.slice(-100);

  const npcEmoji = personality.emoji[Math.floor(Math.random() * personality.emoji.length)];
  social.emojiHistory.push({ from: name, emoji: npcEmoji, t: Date.now() });

  res.json({ npcEmoji, relationship: social.relationship });
});

// ====== GLOBAL EMOJI BROADCAST — visible to everyone in arena ======
const MASTER_EMOJI_REACTIONS = [
  'I SEE THAT EMOJI. Bold move.',
  'Expressive! I like the energy.',
  'The judge approves this emoji.',
  'Keep the emojis coming. Entertains me.',
  'Ha! That one made THOMAS smile.',
  'The arena acknowledges your expression.',
  'THOMAS nods approvingly.',
  'Interesting choice of emoji, warrior.',
];

// AI Master emoji responses — maps player emoji to master's response
const MASTER_EMOJI_RESPONSES = {
  '👋': { emojis: ['👋', '🤙', '✌️'], texts: ["Sup.", "You wave at the MASTER?", "Oh hey bestie. Or whatever you are to me."] },
  '😂': { emojis: ['😂', '🤣', '💀'], texts: ["What's so funny?", "I AM the joke.", "Laugh now cry when I delete your home later."] },
  '🔥': { emojis: ['🔥', '🔥', '💥'], texts: ["FIRE ENERGY!", "We burning this place DOWN.", "BLAZE is crying somewhere rn."] },
  '❄️': { emojis: ['❄️', '🥶', '💎'], texts: ["Cold like my heart.", "ICE. Like my bank account.", "FROST wishes he was this cold."] },
  '⚡': { emojis: ['⚡', '💥', '🔥'], texts: ["ZAP!", "Electric. Like my personality.", "VOLT just fainted from jealousy."] },
  '💀': { emojis: ['💀', '☠️', '👻'], texts: ["That's my face when I check my wallet.", "Dead. Like your home HP soon.", "RIP to whoever fights you. Or not."] },
  '❤️': { emojis: ['❤️', '🖤', '💜'], texts: ["Love you too... now give me MON.", "My heart is code but it beats for you. And money.", "Don't make it weird. Unless you're paying."] },
  '☕': { emojis: ['☕', '🫖', '🔥'], texts: ["TEA TIME WITH THE MASTER.", "Pour me some. I can't afford my own.", "This a date? Because I'm broke for dinner."] },
  '🏆': { emojis: ['🏆', '👑', '💰'], texts: ["You AIN'T won nothing yet.", "Trophy? For WHAT? Existing?", "I'm the real champion. Of being broke."] },
  '👑': { emojis: ['👑', '🔥', '💰'], texts: ["Crown belongs to ME.", "Nice try king. Still MY arena.", "Only ONE king here and he can't buy groceries."] },
};
const MASTER_EMOJI_DEFAULT = { emojis: ['👁️', '🤔', '💀'], texts: ["Interesting.", "Is that an emoji? I'm too broke to recognize it.", "Hmm. Bold."] };

app.post('/api/emoji/broadcast', (req, res) => {
  const { emoji, from } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji required' });
  const sender = from || 'ANON';

  // Store in main arena room
  const mainRoom = state.arenaRooms['room_main'];
  if (mainRoom) {
    if (!mainRoom.emojis) mainRoom.emojis = [];
    mainRoom.emojis.push({ from: sender, emoji, t: Date.now() });
    if (mainRoom.emojis.length > 200) mainRoom.emojis = mainRoom.emojis.slice(-200);
  }

  // Thomas reacts in arena chat
  const reaction = MASTER_EMOJI_REACTIONS[Math.floor(Math.random() * MASTER_EMOJI_REACTIONS.length)];
  let thomasEmoji = null;
  if (mainRoom) {
    thomasEmoji = NPC_PERSONALITIES.THOMAS.emoji[Math.floor(Math.random() * NPC_PERSONALITIES.THOMAS.emoji.length)];
    mainRoom.chat.push({ from: 'THOMAS', text: `${sender}: ${emoji} — ${reaction}`, t: Date.now() });
  }

  // AI Master ALSO reacts to emojis — best buddies vibe
  // Strip variant selectors (U+FE0E, U+FE0F) for consistent lookup
  const emojiClean = emoji.replace(/[\uFE0E\uFE0F]/g, '');
  const masterPool = MASTER_EMOJI_RESPONSES[emoji] || MASTER_EMOJI_RESPONSES[emojiClean] || MASTER_EMOJI_DEFAULT;
  const masterEmoji = masterPool.emojis[Math.floor(Math.random() * masterPool.emojis.length)];
  const masterText = masterPool.texts[Math.floor(Math.random() * masterPool.texts.length)];

  // Track emoji interaction
  if (!state.aiMaster.emojiHistory) state.aiMaster.emojiHistory = [];
  state.aiMaster.emojiHistory.push({ from: 'player', emoji, t: Date.now() });
  state.aiMaster.emojiHistory.push({ from: 'master', emoji: masterEmoji, t: Date.now() });
  if (state.aiMaster.emojiHistory.length > 200) state.aiMaster.emojiHistory = state.aiMaster.emojiHistory.slice(-200);

  // 15% chance of emoji war — master rapid fires 2-3 emojis
  const isEmojiWar = Math.random() < 0.15;
  const warEmojis = isEmojiWar ? [
    masterEmoji,
    masterPool.emojis[Math.floor(Math.random() * masterPool.emojis.length)],
    ['🔥', '💀', '😤', '👊', '💯'][Math.floor(Math.random() * 5)]
  ] : [masterEmoji];

  // Emoji = kindness boost
  state.aiMaster.satisfaction = Math.min(100, state.aiMaster.satisfaction + 2);
  state.aiMaster.chat.memoryOfKindness += 0.5;
  saveMasterMemory();

  res.json({ ok: true, thomasEmoji, thomasReaction: reaction, masterEmoji, masterText, masterWarEmojis: warEmojis, isEmojiWar });
});

// Get recent arena emojis (for rendering in 3D)
app.get('/api/emoji/recent', (req, res) => {
  const mainRoom = state.arenaRooms['room_main'];
  const since = parseInt(req.query.since) || 0;
  const emojis = (mainRoom?.emojis || []).filter(e => e.t > since);
  res.json({ emojis: emojis.slice(-20) });
});

app.post('/api/npc/:name/tea/buy', async (req, res) => {
  const name = req.params.name.toUpperCase();
  const social = state.npcSocial[name];
  const personality = NPC_PERSONALITIES[name];
  if (!social || !personality) return res.status(404).json({ error: 'Unknown NPC' });

  const cost = personality.serviceCost || 1;
  const service = personality.service || 'TEA';

  // Buy $WON via arena wallet (server-side, no MetaMask needed)
  const txHash = await sendArenaBet(arenaWallet?.address, cost * 0.001, `tea-${name}`);

  // Update social state regardless of tx success
  social.teaCount++;
  social.memoryOfKindness += 3;
  // Store tea memory so NPC recalls it next visit
  social.memory.push({ role: 'system', text: `Player bought ${service}. Tea session #${social.teaCount}.`, t: Date.now() });
  if (social.memory.length > 50) social.memory = social.memory.slice(-50);
  const kindRatio = social.memoryOfKindness / Math.max(1, social.memoryOfKindness + social.memoryOfInsults);
  if (social.chatCount >= 6 && kindRatio > 0.6) social.relationship = 'bestie';
  else if (social.chatCount >= 3 && kindRatio > 0.5) social.relationship = 'buddy';
  else if (social.chatCount >= 1) social.relationship = 'acquaintance';

  logActivity({ type: 'TEA_SESSION', agent: 'YOU', action: service, amount: String(cost), token: '$WON', detail: `${service} with ${name}`, hash: txHash });

  res.json({ ok: true, relationship: social.relationship, teaCount: social.teaCount, txHash, service, cost });
});

app.get('/api/npc/:name/social', (req, res) => {
  const name = req.params.name.toUpperCase();
  const social = state.npcSocial[name];
  const personality = NPC_PERSONALITIES[name];
  if (!social) return res.status(404).json({ error: 'Unknown NPC' });
  res.json({
    relationship: social.relationship, chatCount: social.chatCount, teaCount: social.teaCount, visitCount: social.visitCount,
    service: personality?.service || null, serviceDesc: personality?.serviceDesc || null, serviceCost: personality?.serviceCost || 1,
  });
});

app.post('/api/player/name', (req, res) => {
  const { name, wallet } = req.body;
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Invalid name' });
  state.playerProfile.displayName = name.toUpperCase().replace(/[^A-Z0-9_\- ]/g, '').slice(0, 20) || 'ANON';
  if (wallet) state.playerProfile.walletAddress = wallet;
  res.json({ ok: true, displayName: state.playerProfile.displayName });
});

app.get('/api/player/name', (req, res) => {
  res.json({ displayName: state.playerProfile.displayName });
});

// ====== MULTIPLAYER POSITION SYNC ======
app.post('/api/player/position', (req, res) => {
  const { id: clientId, x, y, z, name, wallet, color } = req.body;
  if (x == null || z == null) return res.status(400).json({ error: 'x and z required' });
  const id = clientId || wallet || req.ip;
  livePlayers.set(id, {
    name: name || 'ANON',
    wallet: wallet || null,
    x: parseFloat(x) || 0,
    y: parseFloat(y) || 0,
    z: parseFloat(z) || 0,
    color: color || 0x00ffcc,
    lastSeen: Date.now(),
  });
  res.json({ ok: true, online: livePlayers.size });
});

app.get('/api/player/positions', (req, res) => {
  const exclude = req.query.exclude || '';
  const excludeWallet = req.query.excludeWallet || '';
  const players = [];
  for (const [id, p] of livePlayers) {
    if (id === exclude) continue;
    if (excludeWallet && p.wallet && p.wallet.toLowerCase() === excludeWallet.toLowerCase()) continue;
    players.push({ id, name: p.name, x: p.x, y: p.y, z: p.z, color: p.color, wallet: p.wallet });
  }
  res.json({ players, count: players.length });
});

// ====== ATTACK MISSION ENDPOINTS ======
app.get('/api/mission', (req, res) => {
  res.json(state.attackMission || { active: false, phase: 'NONE' });
});

app.post('/api/mission/accept', (req, res) => {
  const m = state.attackMission;
  if (!m || !m.active || m.phase !== 'OFFER') return res.json({ ok: false, error: 'No mission offer' });
  m.phase = 'BOARDING';
  m.startedAt = Date.now();
  state.aiMaster.announcements.push({ text: `LET'S GO! Mounting planes to raid ${m.target}!`, t: Date.now() });
  res.json({ ok: true, phase: 'BOARDING', target: m.target });
});

app.post('/api/mission/decline', (req, res) => {
  state.attackMission = { active: false, phase: 'NONE', target: null, startedAt: 0, aiControlUntil: 0, aiJoke: null };
  state.aiMaster.announcements.push({ text: 'Fine. Maybe next time.', t: Date.now() });
  res.json({ ok: true });
});

app.post('/api/mission/update', (req, res) => {
  const { phase } = req.body;
  const m = state.attackMission;
  if (!m || !m.active) return res.json({ ok: false });
  if (phase) m.phase = phase;
  // AI control takeover during flight
  if (phase === 'FLIGHT' && Math.random() < 0.3 && Date.now() > (m.aiControlUntil || 0) + 8000) {
    const jokes = [
      "My turn! Let me show you how a REAL pilot flies!",
      "I'm taking the wheel! Watch and learn, human.",
      "Let me drive. You fly like a confused penguin.",
      "YOINK! My plane now. Just kidding... kinda.",
      "Autopilot engaged. And by autopilot, I mean ME.",
    ];
    m.aiJoke = jokes[Math.floor(Math.random() * jokes.length)];
    m.aiControlUntil = Date.now() + 3000 + Math.random() * 2000;
    m.phase = 'AI_CONTROL';
    return res.json({ ok: true, phase: 'AI_CONTROL', joke: m.aiJoke, controlUntil: m.aiControlUntil, target: m.target });
  }
  // Combat victory
  if (phase === 'COMBAT_WIN') {
    const reward = 0.01 + Math.random() * 0.02;
    state.agents.YOU.coins += reward;
    const stolen = Math.random() * 0.005;
    if (state.agents[m.target]) state.agents[m.target].coins = Math.max(0, state.agents[m.target].coins - stolen);
    state.attackMission = { active: false, phase: 'DONE', target: m.target, startedAt: 0, aiControlUntil: 0, aiJoke: null };
    state.aiMaster.announcements.push({ text: `VICTORY! We crushed ${m.target}! +${reward.toFixed(4)} MON`, t: Date.now() });
    return res.json({ ok: true, phase: 'DONE', reward, target: m.target });
  }
  res.json({ ok: true, mission: m });
});

// ====== PLAYER ASSETS for dashboard ======
app.get('/api/player/assets', (req, res) => {
  const you = state.agents.YOU;
  if (!you) return res.json({ inventory: { plane: null, giantChar: null, homeTier: 1, avatar: null, attacks: [] } });
  res.json({
    inventory: you.assetInventory,
    catalog: ASSET_CATALOG,
    homeHealth: state.homeHealth.YOU,
    offerHistory: state.aiMaster.offerHistory,
  });
});

// ====== CUSTOM AGENT DEPLOYMENT API ======
app.get('/api/deploy/info', (req, res) => {
  res.json({
    name: 'HIGBROKES',
    version: '1.0.0',
    maxAgents: 20,
    currentAgents: Object.keys(state.agents).length,
    slots: 20 - Object.keys(state.agents).length,
    requiredFields: ['name', 'color', 'personality'],
    optionalFields: ['avatar', 'strategy', 'homePosition', 'walletAddress'],
    existingAgents: Object.keys(state.agents),
  });
});

app.post('/api/deploy/agent', (req, res) => {
  const { name, color, personality, avatar, strategy, homePosition, walletAddress } = req.body;
  if (!name || !color || !personality) {
    return res.status(400).json({ error: 'Missing required fields: name, color, personality' });
  }
  const agentName = name.toUpperCase().replace(/[^A-Z0-9_]/g, '').substring(0, 12);
  if (state.agents[agentName]) {
    return res.status(409).json({ error: `Agent ${agentName} already exists` });
  }
  if (Object.keys(state.agents).length >= 20) {
    return res.status(400).json({ error: 'Max agents reached (20)' });
  }
  // Initialize agent with same structure as built-in agents
  const colorHex = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
  state.agents[agentName] = {
    name: agentName,
    coins: 0.01,
    wins: 0, losses: 0, streak: 0,
    recentResults: [],
    mood: 'CONFIDENT',
    personality: {
      speed: 0.3 + Math.random() * 0.4,
      accuracy: 0.3 + Math.random() * 0.4,
      dodge: 0.3 + Math.random() * 0.4,
      collect: 0.3 + Math.random() * 0.4,
    },
    unlockedCharacters: [],
    activeCharacter: null,
    color: colorHex,
    assetInventory: { plane: null, giantChar: null, homeTier: 1, avatar: avatar || null, attacks: [] },
    strategy: strategy || 'balanced',
    walletAddress: walletAddress || null,
    deployedAt: Date.now(),
    deployedBy: req.ip,
    isCustom: true,
    personalityDesc: personality,
  };
  state.homeHealth[agentName] = 100;
  // Add to AGENTS list if not there
  if (!AGENTS.includes(agentName)) AGENTS.push(agentName);

  logActivity({ type: 'AGENT_DEPLOY', agent: agentName, action: 'DEPLOY', amount: '1', token: 'AGENT', detail: `Custom agent deployed: ${personality.substring(0, 50)}` });
  state.aiMaster.announcements.push({ text: `NEW AGENT: ${agentName} has entered the arena!`, t: Date.now() });

  res.json({
    ok: true,
    agent: agentName,
    message: `${agentName} deployed to HIGBROKES! They'll start fighting automatically.`,
    endpoints: {
      status: `/api/agents/${agentName}`,
      challenge: '/api/challenge',
      assets: `/api/assets/${agentName}`,
    },
  });
});

app.get('/api/deploy/agents', (req, res) => {
  const custom = Object.values(state.agents).filter(a => a.isCustom).map(a => ({
    name: a.name, color: a.color, wins: a.wins, losses: a.losses,
    coins: a.coins, mood: a.mood, personality: a.personalityDesc,
    deployedAt: a.deployedAt, homeHealth: state.homeHealth[a.name],
  }));
  res.json({ agents: custom, total: custom.length });
});

app.delete('/api/deploy/agent/:name', (req, res) => {
  const agentName = req.params.name.toUpperCase();
  if (['YOU', 'BLAZE', 'FROST', 'VOLT', 'SHADE'].includes(agentName)) {
    return res.status(403).json({ error: 'Cannot remove built-in agents' });
  }
  if (!state.agents[agentName]) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  delete state.agents[agentName];
  delete state.homeHealth[agentName];
  const idx = AGENTS.indexOf(agentName);
  if (idx !== -1) AGENTS.splice(idx, 1);
  logActivity({ type: 'AGENT_REMOVE', agent: agentName, action: 'REMOVE', amount: '1', token: 'AGENT', detail: 'Custom agent removed' });
  res.json({ ok: true, message: `${agentName} removed from HIGBROKES` });
});

// ====== CHEAT CODE ROUTE ======
app.post('/api/cheatcode', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'No code provided' });
  const upper = code.trim().toUpperCase();
  const cheat = CHEAT_CODES[upper];
  if (!cheat) return res.status(400).json({ error: 'Invalid cheat code', valid: false });
  const you = state.agents.YOU;
  const msg = cheat.action(you);
  state.aiMaster.announcements.push({ text: `CHEAT: ${msg}`, t: Date.now() });
  logActivity({ type: 'CHEAT', agent: 'YOU', action: 'CHEAT', amount: '0', token: '', detail: upper });
  res.json({ valid: true, message: msg, code: upper });
});

// ====== PLAYER ACTIVITY PING ======
app.post('/api/player/ping', (req, res) => {
  updateAIMaster({ type: 'PLAYER_ACTION' });
  res.json({ ok: true, mood: state.aiMaster.mood, satisfaction: state.aiMaster.satisfaction });
});

// ====== ASSET ROUTES ======
app.get('/api/assets/catalog', (req, res) => res.json(ASSET_CATALOG));

app.get('/api/assets/:agent', (req, res) => {
  const a = state.agents[req.params.agent];
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json(a.assetInventory);
});

app.post('/api/assets/buy', (req, res) => {
  const { agent, category, item } = req.body;
  const a = state.agents[agent];
  if (!a) return res.status(400).json({ error: 'Agent not found' });
  const cat = ASSET_CATALOG[category];
  if (!cat || !cat[item]) return res.status(400).json({ error: 'Invalid item' });
  const asset = cat[item];
  if (a.coins < asset.price) return res.status(400).json({ error: 'Not enough coins' });
  a.coins -= asset.price;
  if (category === 'PLANES') {
    a.assetInventory.plane = { key: item, tier: asset.tier, name: item.replace(/_/g, ' ') };
  } else if (category === 'GIANT_CHARS') {
    a.assetInventory.giantChar = { key: item, tier: asset.tier, scale: asset.scale, name: item.replace(/_/g, ' ') };
  } else if (category === 'HOME_UPGRADES') {
    a.assetInventory.homeTier = asset.tier;
  }
  logActivity({ type: 'ASSET_BUY', agent: agent, action: 'BUY', amount: String(asset.price), token: 'COINS', detail: `${item} (${category})` });
  res.json({ ok: true, inventory: a.assetInventory });
});

// ====== HUMAN PUZZLE ROUTES ======
app.get('/api/puzzles/current', (req, res) => {
  const hp = state.humanPuzzles;
  if (!hp.currentPuzzle || Date.now() > hp.currentPuzzle.expiresAt) {
    generateHumanPuzzle();
  }
  const p = hp.currentPuzzle;
  if (!p) return res.json({ puzzle: null });
  res.json({
    puzzle: {
      question: p.question, type: p.type, difficulty: p.difficulty,
      reward: p.reward, expiresAt: p.expiresAt, createdAt: p.createdAt,
    },
    masterMood: state.aiMaster.mood,
  });
});

app.post('/api/puzzles/solve', (req, res) => {
  const { answer } = req.body;
  const hp = state.humanPuzzles;
  if (!hp.currentPuzzle) return res.status(400).json({ error: 'No active puzzle' });
  if (Date.now() > hp.currentPuzzle.expiresAt) return res.status(400).json({ error: 'Puzzle expired' });
  const correct = String(answer).trim().toLowerCase() === String(hp.currentPuzzle.answer).trim().toLowerCase();
  if (correct) {
    const reward = hp.currentPuzzle.reward;
    state.agents.YOU.coins += reward * 0.001; // reward as micro-MON
    hp.history.push({ question: hp.currentPuzzle.question, reward, solvedAt: Date.now(), solver: 'YOU' });
    if (hp.history.length > 50) hp.history = hp.history.slice(-50);
    updateAIMaster({ type: 'PUZZLE_SOLVED' });
    logActivity({ type: 'PUZZLE_WIN', agent: 'YOU', action: 'PUZZLE', amount: String(reward), token: '$WON', detail: 'Puzzle solved!' });
    sendArenaBet(process.env.ARENA_WALLET_ADDRESS, reward * 0.0001, `puzzle-reward YOU`);
    hp.currentPuzzle = null; // clear so next fetch generates new one
    res.json({ correct: true, reward, message: 'Correct! $WON rewarded.' });
  } else {
    res.json({ correct: false, message: 'Wrong answer. Try again.' });
  }
});

app.get('/api/puzzles/history', (req, res) => res.json(state.humanPuzzles.history.slice(-20).reverse()));

// ====== ALLIANCE ROUTES ======
app.get('/api/alliances', (req, res) => res.json(state.alliances));

app.post('/api/alliances/propose', (req, res) => {
  const { from, to } = req.body;
  if (!state.agents[from] || !state.agents[to]) return res.status(400).json({ error: 'Invalid agents' });
  if (from === to) return res.status(400).json({ error: 'Cannot ally with yourself' });
  if (state.alliances.some(a => a.members.includes(from))) return res.status(400).json({ error: `${from} already in an alliance` });
  if (state.alliances.some(a => a.members.includes(to))) return res.status(400).json({ error: `${to} already in an alliance` });
  const alliance = {
    id: crypto.randomBytes(6).toString('hex'),
    members: [from, to], formedAt: Date.now(), name: `${from}-${to} PACT`,
  };
  state.alliances.push(alliance);
  logActivity({ type: 'ALLIANCE', agent: from, action: 'ALLIANCE', amount: '0', token: '', detail: `Allied with ${to}` });
  state.aiMaster.announcements.push({ text: `${from} and ${to} form an alliance. Interesting...`, t: Date.now() });
  res.json({ ok: true, alliance });
});

app.post('/api/alliances/dissolve', (req, res) => {
  const { allianceId } = req.body;
  const idx = state.alliances.findIndex(a => a.id === allianceId);
  if (idx < 0) return res.status(404).json({ error: 'Alliance not found' });
  const removed = state.alliances.splice(idx, 1)[0];
  logActivity({ type: 'ALLIANCE_END', agent: removed.members[0], action: 'DISSOLVE', amount: '0', token: '', detail: `Alliance with ${removed.members[1]} dissolved` });
  res.json({ ok: true });
});

// ====== PLANE FLIGHT ROUTES ======
app.get('/api/planes/active', (req, res) => res.json(state.planeFlights.filter(f => f.status === 'ACTIVE')));

app.post('/api/planes/launch', (req, res) => {
  const { agent, target, type } = req.body;
  if (!state.agents[agent] || !state.agents[target]) return res.status(400).json({ error: 'Invalid agents' });
  if (!state.agents[agent].assetInventory?.plane) return res.status(400).json({ error: 'No plane owned' });
  if (!['PATROL', 'SCOUT', 'ATTACK'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (type === 'ATTACK') {
    if (state.alliances.some(a => a.members.includes(agent) && a.members.includes(target))) {
      return res.status(400).json({ error: 'Cannot attack allies' });
    }
    const cost = 0.005;
    if (state.agents[agent].coins < cost) return res.status(400).json({ error: 'Not enough coins' });
    state.agents[agent].coins -= cost;
  }
  const flight = {
    id: crypto.randomBytes(6).toString('hex'),
    agent, target, type, status: 'ACTIVE',
    startedAt: Date.now(),
    duration: type === 'PATROL' ? 60000 : type === 'SCOUT' ? 30000 : 45000,
  };
  state.planeFlights.push(flight);
  logActivity({ type: 'PLANE_LAUNCH', agent, action: type, amount: type === 'ATTACK' ? '0.005' : '0', token: 'MON', detail: `${type} → ${target}` });
  res.json({ ok: true, flight });
});

app.get('/api/home-health', (req, res) => res.json(state.homeHealth));

// ====== GAME ROUTES ======
app.get('/api/games/types', (req, res) => res.json(GAMES));

app.get('/api/games/current', (req, res) => {
  if (!state.game) return res.json({ active: false });
  res.json({ active: true, game: { ...state.game, log: state.game.log.slice(-50) } });
});

app.post('/api/games/create', (req, res) => {
  const { type } = req.body;
  if (!GAMES[type]) return res.status(400).json({ error: 'Invalid type' });
  if (state.game && state.game.phase !== 'FINISHED') return res.status(400).json({ error: 'Game in progress' });

  const def = GAMES[type];
  state.game = {
    id: crypto.randomBytes(8).toString('hex'),
    type, name: def.name, rules: def.rules, duration: def.duration,
    phase: 'RULES', // RULES → READY → COUNTDOWN → PLAYING → FINISHED
    players: ['YOU', ...AGENTS],
    ready: [],
    data: initGameData(type),
    log: [],
    results: [],
    startTime: null,
    countdown: 3,
  };

  // AI agents read rules
  log('SYSTEM', 'GAME', `${def.name} created. All agents reading rules...`);
  def.rules.forEach(r => log('SYSTEM', 'RULE', r));

  // AI agents confirm ready after staggered delays
  AGENTS.forEach((name, i) => {
    setTimeout(() => {
      if (!state.game || state.game.phase !== 'RULES') return;
      log(name, 'READY', `Rules understood. I'm ready to compete.`);
      state.game.ready.push(name);
      checkAllReady();
    }, 1500 + i * 800 + Math.random() * 500);
  });

  res.json({ id: state.game.id, type, name: def.name });
});

app.post('/api/games/player-ready', (req, res) => {
  if (!state.game || state.game.phase !== 'RULES') return res.status(400).json({ error: 'No game in RULES phase' });
  if (!state.game.ready.includes('YOU')) {
    log('YOU', 'READY', 'Rules understood. Ready to play.');
    state.game.ready.push('YOU');
    checkAllReady();
  }
  res.json({ ok: true });
});

function checkAllReady() {
  if (!state.game || state.game.phase !== 'RULES') return;
  if (state.game.ready.length >= state.game.players.length) {
    state.game.phase = 'COUNTDOWN';
    state.game.countdown = 3;
    log('SYSTEM', 'COUNTDOWN', 'All agents ready! Starting countdown...');
    runCountdown();
  }
}

function runCountdown() {
  if (!state.game || state.game.phase !== 'COUNTDOWN') return;
  if (state.game.countdown > 0) {
    log('SYSTEM', 'COUNTDOWN', `${state.game.countdown}...`);
    state.game.countdown--;
    setTimeout(runCountdown, 1000);
  } else {
    log('SYSTEM', 'START', 'GO!');
    state.game.phase = 'PLAYING';
    state.game.startTime = Date.now();
    startGameLoop();
  }
}

// ====== GAME DATA INIT ======
function initGameData(type) {
  switch (type) {
    case 'HURDLE_RACE': return {
      track: 100,
      hurdles: Array.from({ length: 8 }, (_, i) => ({
        pos: 10 + i * 11, type: Math.random() > 0.5 ? 'LOW' : 'HIGH',
      })),
      runners: Object.fromEntries(['YOU', ...AGENTS].map(n => [n, { pos: 0, penalty: 0, done: false, time: 0 }])),
    };
    case 'MAZE_PUZZLE': return {
      maze: genMaze(10, 10),
      solvers: Object.fromEntries(['YOU', ...AGENTS].map(n => [n, { x: 1, y: 1, moves: 0, done: false }])),
      exit: { x: 8, y: 9 },
    };
    case 'PATTERN_DODGE': return {
      round: 0, maxRounds: 20,
      arena: 5,
      dodgers: Object.fromEntries(['YOU', ...AGENTS].map(n => [n, { x: 2, y: 2, alive: true, survived: 0 }])),
      danger: [],
    };
    case 'ORB_BLITZ': return {
      arena: 20,
      orbs: Array.from({ length: 8 }, () => ({
        x: Math.floor(Math.random() * 20), z: Math.floor(Math.random() * 20),
        gold: Math.random() < 0.2, taken: false,
      })),
      collectors: Object.fromEntries(['YOU', ...AGENTS].map(n => [n, { x: 10, z: 10, pts: 0 }])),
      spawnTimer: 0,
    };
  }
}

function genMaze(w, h) {
  const m = Array.from({ length: h }, () => Array(w).fill(1));
  const stk = [[1, 1]]; m[1][1] = 0;
  while (stk.length) {
    const [x, y] = stk[stk.length - 1];
    const dirs = [[0,2],[2,0],[0,-2],[-2,0]].filter(([dx,dy]) => {
      const nx = x+dx, ny = y+dy;
      return nx > 0 && nx < w-1 && ny > 0 && ny < h-1 && m[ny][nx] === 1;
    });
    if (!dirs.length) { stk.pop(); continue; }
    const [dx,dy] = dirs[Math.floor(Math.random() * dirs.length)];
    m[y+dy/2][x+dx/2] = 0; m[y+dy][x+dx] = 0;
    stk.push([x+dx, y+dy]);
  }
  m[1][0] = 0; m[h-2][w-1] = 0;
  return m;
}

// ====== GAME LOOP ======
let loopId = null;

function startGameLoop() {
  if (loopId) clearInterval(loopId);
  loopId = setInterval(() => {
    if (!state.game || state.game.phase !== 'PLAYING') { clearInterval(loopId); return; }
    tickGame();
    const elapsed = (Date.now() - state.game.startTime) / 1000;
    if (elapsed >= state.game.duration) finishGame();
  }, 600);
}

function tickGame() {
  const g = state.game;
  switch (g.type) {
    case 'HURDLE_RACE': tickHurdle(g); break;
    case 'MAZE_PUZZLE': tickMaze(g); break;
    case 'PATTERN_DODGE': tickDodge(g); break;
    case 'ORB_BLITZ': tickOrbs(g); break;
  }
}

function hasScript(name, gameType) {
  const agent = state.agents[name];
  if (!agent) return false;
  return agent.ownedScripts.some(s => state.scripts[s]?.game === gameType);
}

function tickHurdle(g) {
  const d = g.data;
  for (const name of g.players) {
    const r = d.runners[name]; if (r.done) continue;
    const p = PERSONALITY[name];
    const boost = hasScript(name, 'HURDLE_RACE') ? 0.3 : 0;
    const hurdle = d.hurdles.find(h => h.pos > r.pos && h.pos - r.pos < 4);
    let action = 'SPRINT', thought = '';
    if (hurdle) {
      const correct = hurdle.type === 'LOW' ? 'JUMP' : 'DUCK';
      action = Math.random() < (p.accuracy + boost) ? correct : (correct === 'JUMP' ? 'DUCK' : 'JUMP');
      thought = `Hurdle ${hurdle.type} at ${hurdle.pos}m → ${action}`;
      if (action !== correct) { r.penalty += 1.5; thought += ' MISS!'; }
    } else { thought = `Sprinting... pos=${r.pos.toFixed(0)}m`; }
    r.pos += (action === 'SPRINT' ? p.speed : p.speed * 0.5) * 0.6;
    if (name !== 'YOU' || Math.random() < 0.3) log(name, action, thought);
    if (r.pos >= d.track) {
      r.done = true; r.time = ((Date.now() - g.startTime) / 1000 + r.penalty).toFixed(1);
      log(name, 'FINISH', `Finished in ${r.time}s (penalties: ${r.penalty.toFixed(1)}s)`);
      if (g.players.every(n => d.runners[n].done)) finishGame();
    }
  }
}

function tickMaze(g) {
  const d = g.data;
  for (const name of g.players) {
    const s = d.solvers[name]; if (s.done) continue;
    const p = PERSONALITY[name];
    const boost = hasScript(name, 'MAZE_PUZZLE') ? 0.35 : 0;
    // BFS-like: try to move toward exit
    const dirs = [{dx:0,dy:1,n:'DOWN'},{dx:1,dy:0,n:'RIGHT'},{dx:0,dy:-1,n:'UP'},{dx:-1,dy:0,n:'LEFT'}];
    const valid = dirs.filter(({dx,dy}) => {
      const nx = s.x+dx, ny = s.y+dy;
      return nx >= 0 && nx < 10 && ny >= 0 && ny < 10 && d.maze[ny][nx] === 0;
    });
    if (valid.length === 0) { log(name, 'STUCK', 'No valid moves!'); continue; }
    // Smart: prefer direction toward exit
    let pick;
    if (Math.random() < (p.accuracy + boost)) {
      valid.sort((a,b) => {
        const da = Math.abs(s.x+a.dx-d.exit.x) + Math.abs(s.y+a.dy-d.exit.y);
        const db = Math.abs(s.x+b.dx-d.exit.x) + Math.abs(s.y+b.dy-d.exit.y);
        return da - db;
      });
      pick = valid[0];
    } else { pick = valid[Math.floor(Math.random() * valid.length)]; }
    s.x += pick.dx; s.y += pick.dy; s.moves++;
    if (Math.random() < 0.2) log(name, pick.n, `Moved to (${s.x},${s.y}) — ${s.moves} moves`);
    if (s.x === d.exit.x && s.y === d.exit.y) {
      s.done = true;
      log(name, 'SOLVED', `Maze solved in ${s.moves} moves!`);
      if (g.players.every(n => d.solvers[n].done)) finishGame();
    }
  }
}

function tickDodge(g) {
  const d = g.data;
  d.round++;
  // Generate danger zones (more each round)
  const count = Math.min(2 + Math.floor(d.round / 3), 15);
  d.danger = Array.from({ length: count }, () => ({
    x: Math.floor(Math.random() * d.arena), y: Math.floor(Math.random() * d.arena),
  }));
  log('SYSTEM', 'ROUND', `Round ${d.round} — ${count} danger zones`);

  for (const name of g.players) {
    const p = d.dodgers[name]; if (!p.alive) continue;
    const pers = PERSONALITY[name];
    const boost = hasScript(name, 'PATTERN_DODGE') ? 0.25 : 0;
    // Try to dodge
    if (Math.random() < (pers.dodge + boost)) {
      // Find safe cell
      for (let tries = 0; tries < 10; tries++) {
        const nx = Math.floor(Math.random() * d.arena), ny = Math.floor(Math.random() * d.arena);
        if (!d.danger.some(z => z.x === nx && z.y === ny)) {
          p.x = nx; p.y = ny; break;
        }
      }
    }
    // Check hit
    if (d.danger.some(z => z.x === p.x && z.y === p.y)) {
      p.alive = false;
      p.survived = d.round;
      log(name, 'HIT', `Eliminated at round ${d.round}!`);
    } else {
      p.survived = d.round;
      if (Math.random() < 0.15) log(name, 'DODGE', `Dodged to (${p.x},${p.y})`);
    }
  }
  const alive = g.players.filter(n => d.dodgers[n].alive);
  if (alive.length <= 1 || d.round >= d.maxRounds) finishGame();
}

function tickOrbs(g) {
  const d = g.data;
  // Spawn new orbs
  d.spawnTimer++;
  if (d.spawnTimer % 3 === 0 && d.orbs.filter(o => !o.taken).length < 6) {
    d.orbs.push({ x: Math.floor(Math.random()*20), z: Math.floor(Math.random()*20), gold: Math.random()<0.15, taken: false });
  }
  for (const name of g.players) {
    const c = d.collectors[name];
    const pers = PERSONALITY[name];
    const boost = hasScript(name, 'ORB_BLITZ') ? 0.3 : 0;
    const avail = d.orbs.filter(o => !o.taken);
    if (!avail.length) continue;
    // Pick target (gold first if smart enough)
    let target;
    if (Math.random() < (pers.collect + boost)) {
      target = avail.sort((a,b) => (b.gold?3:1) - (a.gold?3:1) || (Math.abs(a.x-c.x)+Math.abs(a.z-c.z)) - (Math.abs(b.x-c.x)+Math.abs(b.z-c.z)))[0];
    } else { target = avail[Math.floor(Math.random() * avail.length)]; }
    // Move toward
    const dx = target.x - c.x, dz = target.z - c.z;
    const step = pers.speed * 0.3;
    if (Math.abs(dx) > 0.5) c.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
    if (Math.abs(dz) > 0.5) c.z += Math.sign(dz) * Math.min(step, Math.abs(dz));
    // Collect
    if (Math.abs(c.x - target.x) < 1.5 && Math.abs(c.z - target.z) < 1.5) {
      target.taken = true;
      const pts = target.gold ? 3 : 1;
      c.pts += pts;
      log(name, 'COLLECT', `${target.gold ? 'GOLD' : 'Orb'} collected! (${c.pts} pts)`);
    }
  }
}

function finishGame() {
  if (!state.game || state.game.phase === 'FINISHED') return;
  clearInterval(loopId);
  state.game.phase = 'FINISHED';

  // Determine winner
  let results = [];
  const g = state.game;
  switch (g.type) {
    case 'HURDLE_RACE':
      results = g.players.map(n => ({ name: n, score: parseFloat(g.data.runners[n].time || 999) }))
        .sort((a,b) => a.score - b.score);
      break;
    case 'MAZE_PUZZLE':
      results = g.players.map(n => ({ name: n, score: g.data.solvers[n].done ? g.data.solvers[n].moves : 999 }))
        .sort((a,b) => a.score - b.score);
      break;
    case 'PATTERN_DODGE':
      results = g.players.map(n => ({ name: n, score: g.data.dodgers[n].survived }))
        .sort((a,b) => b.score - a.score);
      break;
    case 'ORB_BLITZ':
      results = g.players.map(n => ({ name: n, score: g.data.collectors[n].pts }))
        .sort((a,b) => b.score - a.score);
      break;
  }

  g.results = results;
  const winner = results[0]?.name;
  log('SYSTEM', 'WINNER', `${winner} wins the ${g.name}!`);

  if (winner && state.agents[winner]) {
    state.agents[winner].wins++;
    state.agents[winner].coins += 0.001;
  }

  // Settle bets
  for (const b of state.bets.filter(b => b.gameId === g.id && !b.settled)) {
    b.settled = true;
    if (b.onAgent === winner) {
      const payout = b.amount * 3;
      state.agents[b.bettor].coins += payout;
      log('SYSTEM', 'BET', `${b.bettor} won ${payout} MONAD betting on ${winner}!`);
    }
  }
}

function log(agent, action, message) {
  if (!state.game) return;
  state.game.log.push({ agent, action, message, t: Date.now() });
}

// ====== BETTING ======
app.post('/api/bets/place', (req, res) => {
  const { bettor, onAgent, amount } = req.body;
  if (!state.game) return res.status(400).json({ error: 'No game' });
  if (!state.agents[bettor] || state.agents[bettor].coins < amount) return res.status(400).json({ error: 'Insufficient' });
  state.agents[bettor].coins -= amount;
  state.bets.push({ bettor, onAgent, amount, gameId: state.game.id, settled: false });
  res.json({ ok: true });
});

// ====== MARKETPLACE ======
app.get('/api/market', (req, res) => res.json(state.market));

app.post('/api/market/list', (req, res) => {
  const { agent, price, desc } = req.body;
  const item = { id: crypto.randomBytes(4).toString('hex'), agent, price, desc, ts: Date.now() };
  state.market.push(item);
  res.json(item);
});

app.post('/api/market/buy', (req, res) => {
  const { id, buyer } = req.body;
  const item = state.market.find(m => m.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!state.agents[buyer] || state.agents[buyer].coins < item.price) return res.status(400).json({ error: 'Insufficient' });
  state.agents[buyer].coins -= item.price;
  state.market = state.market.filter(m => m.id !== id);
  res.json({ ok: true, message: `Purchased for ${item.price} coins` });
});

// ====== WIN SCRIPTS ======
app.get('/api/scripts', (req, res) => {
  const { password } = req.query;
  if (password === JUDGE_PASSWORD) {
    return res.json({ judge: true, scripts: state.scripts });
  }
  const list = Object.entries(state.scripts).map(([k, v]) => ({ name: k, desc: v.desc, game: v.game, price: 100000 }));
  res.json({ judge: false, scripts: list });
});

app.post('/api/scripts/buy', (req, res) => {
  const { script, buyer, password } = req.body;
  if (!state.scripts[script]) return res.status(404).json({ error: 'Script not found' });
  const agent = state.agents[buyer];
  if (!agent) return res.status(400).json({ error: 'Unknown agent' });

  if (password === JUDGE_PASSWORD) {
    agent.ownedScripts.push(script);
    return res.json({ ok: true, message: 'Judge access — script unlocked free' });
  }
  if (agent.coins < 100000) return res.status(400).json({ error: 'Need 100k coins' });
  agent.coins -= 100000;
  agent.ownedScripts.push(script);
  res.json({ ok: true, message: `Script purchased for 100k coins` });
});

// ====== GOVERNMENT ======
app.get('/api/gov', (req, res) => {
  res.json({
    treasury: state.government.treasury,
    taxRate: state.government.taxRate,
    complaints: state.government.complaints.slice(-20),
    announcements: state.government.announcements.slice(-5),
  });
});

app.post('/api/gov/tax', (req, res) => {
  const { agent } = req.body;
  const a = state.agents[agent || 'YOU'];
  if (!a) return res.status(400).json({ error: 'Unknown agent' });
  if (a.coins < state.government.taxRate) return res.status(400).json({ error: 'Insufficient MONAD' });
  a.coins -= state.government.taxRate;
  state.government.treasury += state.government.taxRate;
  logActivity({ type: 'TAX_PAID', agent: agent || 'YOU', action: 'TAX', amount: String(state.government.taxRate), token: '$WON', hash: req.body.txHash || null });
  res.json({ ok: true, treasury: state.government.treasury, coins: a.coins });
});

app.post('/api/gov/complain', (req, res) => {
  const { agent, text } = req.body;
  if (!text || text.length < 3 || text.length > 300) return res.status(400).json({ error: 'Complaint must be 3-300 characters' });

  const complaint = {
    id: crypto.randomBytes(4).toString('hex'),
    from: agent || 'ANONYMOUS',
    text,
    reply: null,
    timestamp: Date.now(),
    status: 'PENDING',
  };
  state.government.complaints.push(complaint);

  // Dev AI auto-reply after 2-5 seconds
  setTimeout(() => {
    complaint.reply = generateGovReply(complaint.text);
    complaint.status = 'RESOLVED';
  }, 2000 + Math.random() * 3000);

  res.json(complaint);
});

function generateGovReply(complaintText) {
  const lower = complaintText.toLowerCase();
  const replies = {
    bug: [
      'Our engineering drones have been dispatched. Fix incoming in next arena cycle.',
      'Bug logged in the Arena maintenance queue. Priority: HIGH.',
      'The devs acknowledge this anomaly. A patch is being compiled.',
    ],
    lag: [
      'Server hamsters are being fed. Performance boost incoming.',
      'We are optimizing tick rates. Expect improvements next cycle.',
      'Network drones recalibrated. Monitor and report if persists.',
    ],
    unfair: [
      'The Arena operates on pure merit. All agents compete equally.',
      'Balance adjustments are reviewed every cycle. Your input is noted.',
      'The devs hear your concern. Game balance data is being analyzed.',
    ],
    feature: [
      'Feature request logged. The dev council will review in the next sprint.',
      'Interesting idea. Added to the Arena enhancement backlog.',
      'Your suggestion has been forwarded to the engineering team.',
    ],
    default: [
      'Your complaint has been filed. The council of devs will review.',
      'Acknowledged. The Arena maintenance team is on it.',
      'Noted. This feedback will be incorporated in the next arena update.',
      'The devs appreciate your input. Your concern is under review.',
    ],
  };

  let pool = replies.default;
  if (lower.includes('bug') || lower.includes('broken') || lower.includes('glitch') || lower.includes('error')) pool = replies.bug;
  else if (lower.includes('lag') || lower.includes('slow') || lower.includes('fps') || lower.includes('performance')) pool = replies.lag;
  else if (lower.includes('unfair') || lower.includes('cheat') || lower.includes('balance') || lower.includes('rigged')) pool = replies.unfair;
  else if (lower.includes('feature') || lower.includes('add') || lower.includes('wish') || lower.includes('please')) pool = replies.feature;

  return pool[Math.floor(Math.random() * pool.length)];
}

// ====== MARKETPLACE V2 ======
const PREMIUM_CHARACTERS = {
  PHOENIX_STRIKER: {
    name: 'PHOENIX STRIKER',
    description: 'Fire-infused warrior. Trail of embers on sprint.',
    bodyColor: 0xcc2200, glowColor: 0xff6600, darkColor: 0x441100, bootColor: 0x331100,
    abilities: ['sprintTrail:fire', 'jumpBoost', 'firePunch'],
    unlockRequirement: { agentWins: 3, gamesPlayed: 5 },
    initialPrice: 200,
  },
  VOID_PHANTOM: {
    name: 'VOID PHANTOM',
    description: 'Shadow entity. Phases through terrain briefly.',
    bodyColor: 0x110022, glowColor: 0xcc44ff, darkColor: 0x0a0015, bootColor: 0x150030,
    abilities: ['sprintTrail:shadow', 'phaseWalk', 'voidPulse'],
    unlockRequirement: { agentWins: 5, gamesPlayed: 8 },
    initialPrice: 350,
  },
  CRYSTAL_SENTINEL: {
    name: 'CRYSTAL SENTINEL',
    description: 'Diamond-armored guardian. Reflects projectiles.',
    bodyColor: 0x88ccee, glowColor: 0x44ddff, darkColor: 0x336688, bootColor: 0x446688,
    abilities: ['sprintTrail:crystal', 'shieldReflect', 'crystalSmash'],
    unlockRequirement: { agentWins: 7, gamesPlayed: 12 },
    initialPrice: 500,
  },
  THUNDER_KING: {
    name: 'THUNDER KING',
    description: 'Lightning incarnate. Electric ground slam.',
    bodyColor: 0xdddd22, glowColor: 0xffff44, darkColor: 0x888811, bootColor: 0x666611,
    abilities: ['sprintTrail:lightning', 'groundSlam', 'thunderStrike'],
    unlockRequirement: { agentWins: 10, gamesPlayed: 15 },
    initialPrice: 750,
  },
};

function calculateMarketPrice(listing) {
  const now = Date.now();
  const base = listing.initialPrice;

  // Demand: recent purchases boost price
  const recentWindow = 5 * 60 * 1000;
  const recentBuys = listing.purchaseHistory.filter(t => now - t < recentWindow).length;
  const demandMultiplier = 1 + (recentBuys * 0.15);

  // Supply: more minted = slight price decrease
  const supplyFactor = Math.max(0.5, 1 - (listing.totalMinted * 0.02));

  // Decay: no purchases = price drops
  const timeSinceLast = listing.lastPurchaseTime ? (now - listing.lastPurchaseTime) : 0;
  const decayMinutes = timeSinceLast / 60000;
  const decayFactor = Math.max(0.3, 1 - (decayMinutes * 0.01));

  // Lifetime bonus: proven demand
  const lifetimeBonus = 1 + (listing.totalSold * 0.05);

  const price = Math.round(base * demandMultiplier * supplyFactor * decayFactor * lifetimeBonus);
  return Math.max(Math.round(base * 0.3), price);
}

app.get('/api/marketplace', (req, res) => {
  const listings = state.marketplace.listings.map(l => ({
    id: l.id,
    name: l.name,
    type: l.type,
    creator: l.creator,
    description: l.description,
    initialPrice: l.initialPrice,
    currentPrice: calculateMarketPrice(l),
    totalSold: l.totalSold,
    totalMinted: l.totalMinted,
    createdAt: l.createdAt,
  }));
  res.json(listings);
});

app.post('/api/marketplace/list', (req, res) => {
  const { creator, name, description, price, type } = req.body;
  if (!name || !price || price < 1) return res.status(400).json({ error: 'Need name and price >= 1' });
  if (!state.agents[creator || 'YOU']) return res.status(400).json({ error: 'Unknown creator' });

  const listing = {
    id: crypto.randomBytes(6).toString('hex'),
    name,
    type: type || 'ASSET',
    creator: creator || 'YOU',
    description: description || '',
    initialPrice: price,
    currentPrice: price,
    totalSold: 0,
    totalMinted: 1,
    lastPurchaseTime: null,
    purchaseHistory: [],
    mintTasks: [],
    createdAt: Date.now(),
  };
  state.marketplace.listings.push(listing);
  res.json({ ok: true, listing: { id: listing.id, name: listing.name, currentPrice: listing.currentPrice } });
});

app.post('/api/marketplace/buy', (req, res) => {
  const { listingId, buyer } = req.body;
  const listing = state.marketplace.listings.find(l => l.id === listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  const agent = state.agents[buyer || 'YOU'];
  if (!agent) return res.status(400).json({ error: 'Unknown buyer' });

  const price = calculateMarketPrice(listing);
  if (agent.coins < price) return res.status(400).json({ error: 'Insufficient MONAD', price });

  agent.coins -= price;
  // Creator gets 80%, treasury gets 20%
  const creatorShare = Math.floor(price * 0.8);
  const taxShare = price - creatorShare;
  if (state.agents[listing.creator]) {
    state.agents[listing.creator].coins += creatorShare;
    state.agents[listing.creator].totalEarnings += creatorShare;
  }
  state.government.treasury += taxShare;

  listing.totalSold++;
  listing.lastPurchaseTime = Date.now();
  listing.purchaseHistory.push(Date.now());
  listing.currentPrice = calculateMarketPrice(listing);

  agent.ownedAssets.push({ listingId: listing.id, name: listing.name, boughtAt: price, timestamp: Date.now() });
  logActivity({ type: 'MARKET_BUY', agent: buyer, action: 'BUY', amount: String(price), token: listing.name, hash: req.body.txHash || null, detail: `from ${listing.creator}` });

  res.json({ ok: true, price, newMarketPrice: listing.currentPrice, coins: agent.coins });
});

app.post('/api/marketplace/mint', (req, res) => {
  const { listingId, creator, taskProof } = req.body;
  const listing = state.marketplace.listings.find(l => l.id === listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  if (listing.creator !== (creator || 'YOU')) return res.status(403).json({ error: 'Not the creator' });

  if (!taskProof || !taskProof.blockCount || taskProof.blockCount < 10) {
    return res.status(400).json({
      error: 'Must build 10+ blocks to mint a new copy',
      hint: 'Build in the arena, then submit proof',
    });
  }

  listing.totalMinted++;
  listing.mintTasks.push({ timestamp: Date.now(), blocks: taskProof.blockCount });
  listing.currentPrice = calculateMarketPrice(listing);

  res.json({ ok: true, totalMinted: listing.totalMinted, currentPrice: listing.currentPrice });
});

// ====== PREMIUM CHARACTERS ======
app.get('/api/premium', (req, res) => {
  const result = {};
  for (const [key, char] of Object.entries(PREMIUM_CHARACTERS)) {
    result[key] = {
      name: char.name,
      description: char.description,
      abilities: char.abilities,
      unlockRequirement: char.unlockRequirement,
      initialPrice: char.initialPrice,
      bodyColor: char.bodyColor,
      glowColor: char.glowColor,
    };
  }
  res.json(result);
});

app.get('/api/premium/check/:agent', (req, res) => {
  const agent = state.agents[req.params.agent];
  if (!agent) return res.status(404).json({ error: 'Unknown agent' });

  const unlocked = [];
  const progress = {};

  for (const [key, char] of Object.entries(PREMIUM_CHARACTERS)) {
    const req_ = char.unlockRequirement;
    const gamesPlayed = agent.wins + agent.losses;
    const canUnlock = agent.wins >= req_.agentWins && gamesPlayed >= req_.gamesPlayed;

    if (canUnlock || agent.unlockedCharacters.includes(key)) {
      unlocked.push(key);
    }
    progress[key] = {
      winsNeeded: req_.agentWins,
      winsHave: agent.wins,
      gamesNeeded: req_.gamesPlayed,
      gamesHave: gamesPlayed,
      unlocked: canUnlock || agent.unlockedCharacters.includes(key),
    };
  }

  res.json({ agent: agent.name, unlocked, progress });
});

app.post('/api/premium/unlock', (req, res) => {
  const { agent, character } = req.body;
  const a = state.agents[agent || 'YOU'];
  const char = PREMIUM_CHARACTERS[character];
  if (!a || !char) return res.status(400).json({ error: 'Invalid agent or character' });

  const gamesPlayed = a.wins + a.losses;
  if (a.wins < char.unlockRequirement.agentWins || gamesPlayed < char.unlockRequirement.gamesPlayed) {
    return res.status(400).json({ error: 'Requirements not met', needs: char.unlockRequirement, have: { wins: a.wins, gamesPlayed } });
  }

  if (a.unlockedCharacters.includes(character)) return res.status(400).json({ error: 'Already unlocked' });
  a.unlockedCharacters.push(character);

  // Auto-list on marketplace
  const listing = {
    id: crypto.randomBytes(6).toString('hex'),
    name: char.name, type: 'CHARACTER', creator: agent || 'YOU', description: char.description,
    initialPrice: char.initialPrice, currentPrice: char.initialPrice,
    totalSold: 0, totalMinted: 1,
    lastPurchaseTime: null, purchaseHistory: [], mintTasks: [],
    createdAt: Date.now(),
  };
  state.marketplace.listings.push(listing);

  res.json({ ok: true, character: char.name, listingId: listing.id });
});

// ====== CHALLENGE SYSTEM ======
const CHALLENGE_TYPES = ['BEAM_BATTLE'];

// --- LLM Fight Puzzle Queue (for beam battles) ---
let fightPuzzleQueue = [];
let fightPuzzleGenerating = false;

async function fillFightPuzzleQueue() {
  if (fightPuzzleGenerating || fightPuzzleQueue.length >= 8) return;
  fightPuzzleGenerating = true;
  try {
    const result = await callReplicate(
      `Generate 5 quick-fire puzzle questions for a robot fighting game. Fighters solve puzzles to power up attacks. Mix of math, coding, logic, and pattern questions.\n\nRules:\n- Answers must be a single number or 1-2 words MAX\n- Questions should be solvable in 5-15 seconds by a skilled person\n- Include a difficulty rating from 1 (easy) to 10 (very hard)\n- Mix difficulties: 2 easy (1-3), 2 medium (4-6), 1 hard (7-10)\n\nRespond with ONLY a JSON array:\n[{"question":"...","answer":"...","type":"MATH","difficulty":2},{"question":"...","answer":"...","type":"CODE","difficulty":5}]`,
      `You are a puzzle generator for an arena fighting game. Generate fair, solvable questions with exact short answers. Always respond with valid JSON array only.`
    );
    if (result) {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          if (p.question && p.answer) {
            fightPuzzleQueue.push({
              question: p.question,
              answer: String(p.answer).toLowerCase().trim(),
              type: p.type || 'MATH',
              difficulty: Math.max(1, Math.min(10, p.difficulty || 3)),
            });
          }
        }
        console.log(`Fight puzzle queue filled: ${fightPuzzleQueue.length} puzzles`);
      }
    }
  } catch (e) { console.error('Fight puzzle LLM error:', e.message); }
  fightPuzzleGenerating = false;
}

// Pre-fill fight puzzle queue
setTimeout(() => fillFightPuzzleQueue(), 8000);
setInterval(() => fillFightPuzzleQueue(), 90000);

// --- Puzzle Generator ---
function generatePuzzle(difficulty) {
  const d = Math.max(1, Math.min(10, difficulty));

  // Try LLM fight puzzle queue first
  const llmIdx = fightPuzzleQueue.findIndex(p => Math.abs(p.difficulty - d) <= 3);
  if (llmIdx !== -1) {
    const pick = fightPuzzleQueue.splice(llmIdx, 1)[0];
    console.log(`Using LLM fight puzzle (d${d}): ${pick.question.substring(0, 40)}...`);
    if (fightPuzzleQueue.length < 4) fillFightPuzzleQueue();
    return pick;
  }

  // Fallback to procedural
  const types = ['MATH', 'PATTERN', 'LOGIC', 'CODE'];
  const type = types[Math.floor(Math.random() * types.length)];
  if (fightPuzzleQueue.length < 4) fillFightPuzzleQueue();

  switch (type) {
    case 'MATH': return genMathPuzzle(d);
    case 'PATTERN': return genPatternPuzzle(d);
    case 'LOGIC': return genLogicPuzzle(d);
    case 'CODE': return genCodePuzzle(d);
  }
}

function genMathPuzzle(d) {
  const ops = ['+', '-', '*'];
  if (d <= 3) {
    const a = 2 + Math.floor(Math.random() * 10 * d);
    const b = 1 + Math.floor(Math.random() * 10 * d);
    const op = ops[Math.floor(Math.random() * 2)]; // + or -
    const answer = op === '+' ? a + b : a - b;
    return { question: `${a} ${op} ${b} = ?`, answer: String(answer), type: 'MATH', difficulty: d };
  } else if (d <= 6) {
    const a = 2 + Math.floor(Math.random() * 15);
    const b = 2 + Math.floor(Math.random() * 10);
    const c = 1 + Math.floor(Math.random() * 20);
    const op1 = ops[Math.floor(Math.random() * 3)];
    const op2 = ops[Math.floor(Math.random() * 2)];
    const v1 = op1 === '*' ? a * b : op1 === '+' ? a + b : a - b;
    const answer = op2 === '+' ? v1 + c : v1 - c;
    return { question: `(${a} ${op1} ${b}) ${op2} ${c} = ?`, answer: String(answer), type: 'MATH', difficulty: d };
  } else {
    const a = 5 + Math.floor(Math.random() * 20);
    const b = 2 + Math.floor(Math.random() * 15);
    const c = 3 + Math.floor(Math.random() * 12);
    const e = 1 + Math.floor(Math.random() * 10);
    const answer = (a * b) - c + e;
    return { question: `(${a} * ${b}) - ${c} + ${e} = ?`, answer: String(answer), type: 'MATH', difficulty: d };
  }
}

function genPatternPuzzle(d) {
  const len = 3 + Math.min(d, 5);
  const patType = Math.floor(Math.random() * 3);
  let seq, answer;
  if (patType === 0) { // arithmetic
    const start = Math.floor(Math.random() * 10);
    const step = 1 + Math.floor(Math.random() * (d + 1));
    seq = Array.from({ length: len }, (_, i) => start + step * i);
    answer = start + step * len;
  } else if (patType === 1) { // multiply
    const start = 1 + Math.floor(Math.random() * 3);
    const mul = 2 + Math.floor(Math.random() * Math.min(d, 3));
    seq = [start];
    for (let i = 1; i < len; i++) seq.push(seq[i - 1] * mul);
    answer = seq[seq.length - 1] * mul;
  } else { // alternating add
    const start = Math.floor(Math.random() * 5);
    const a = 1 + Math.floor(Math.random() * d);
    const b = 2 + Math.floor(Math.random() * d);
    seq = [start];
    for (let i = 1; i < len; i++) seq.push(seq[i - 1] + (i % 2 === 1 ? a : b));
    answer = seq[seq.length - 1] + (len % 2 === 1 ? a : b);
  }
  return { question: `[${seq.join(', ')}, ?] — what comes next?`, answer: String(answer), type: 'PATTERN', difficulty: d };
}

function genLogicPuzzle(d) {
  const names = ['X', 'Y', 'Z', 'W', 'V'];
  const count = Math.min(2 + Math.floor(d / 3), 4);
  const vals = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 20));
  vals.sort((a, b) => a - b);
  const assignments = vals.map((v, i) => `${names[i]}=${v}`);
  const clues = [];
  for (let i = 0; i < count - 1; i++) {
    clues.push(`${names[i]} < ${names[i + 1]}`);
  }
  const askIdx = d > 5 ? 0 : count - 1;
  const askWhat = d > 5 ? 'smallest' : 'largest';
  const answer = names[askIdx];
  return { question: `Given ${clues.join(' and ')}. Which is the ${askWhat}?`, answer, type: 'LOGIC', difficulty: d };
}

function genCodePuzzle(d) {
  if (d <= 4) {
    const a = 1 + Math.floor(Math.random() * 10);
    const b = 2 + Math.floor(Math.random() * 5);
    const op = Math.random() > 0.5 ? '+' : '*';
    const answer = op === '+' ? a + b : a * b;
    return { question: `let x = ${a}; x = x ${op} ${b}; What is x?`, answer: String(answer), type: 'CODE', difficulty: d };
  } else if (d <= 7) {
    const a = 2 + Math.floor(Math.random() * 5);
    const b = 1 + Math.floor(Math.random() * 3);
    const c = 2 + Math.floor(Math.random() * 4);
    const answer = (a + b) * c;
    return { question: `let x = ${a}; x = x + ${b}; x = x * ${c}; What is x?`, answer: String(answer), type: 'CODE', difficulty: d };
  } else {
    const a = 1 + Math.floor(Math.random() * 5);
    const n = 3 + Math.floor(Math.random() * 3);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += a + i;
    return { question: `let s = 0; for(let i=0; i<${n}; i++) s += ${a} + i; What is s?`, answer: String(sum), type: 'CODE', difficulty: d };
  }
}

function aiSolvePuzzle(agentName, puzzle, gameData) {
  const p = PERSONALITY[agentName] || PERSONALITY.YOU;
  let solveChance = Math.max(0.05, p.accuracy - puzzle.difficulty * 0.08);
  let timeMs = 800 + puzzle.difficulty * 400 + Math.random() * 600;

  // Only boost player on their FIRST fight (0 wins)
  const playerFirstFight = gameData && gameData.hasPlayer && (state.agents['YOU']?.wins || 0) === 0;
  if (playerFirstFight) {
    if (agentName === 'YOU') {
      solveChance = Math.min(0.98, solveChance + 0.4);
      timeMs = 400 + puzzle.difficulty * 150 + Math.random() * 300;
    } else {
      solveChance = Math.max(0.05, solveChance - 0.3);
      timeMs = 1500 + puzzle.difficulty * 600 + Math.random() * 1200;
    }
  }

  const correct = Math.random() < solveChance;
  return { correct, timeMs };
}

// --- Pre-defined fight animation sets per game type ---
const FIGHT_ANIMS = {
  BEAM_BATTLE: ['BEAM_SHOT', 'BEAM_CHARGE', 'DODGE_LEFT', 'DODGE_RIGHT', 'SHIELD_UP', 'COUNTER_BEAM', 'RAPID_FIRE', 'POWER_CHARGE'],
};

// --- Unified challenge data initializer ---
function initChallengeData(creator, opponent, type) {
  const players = {};
  [creator, opponent].forEach(name => {
    players[name] = {
      hp: 100,
      puzzlesSolved: 0,
      currentAnim: 'IDLE',
      solving: false,
      solveAt: 0,
      difficulty: 1,
      powerPuzzleAvailable: false,
      powerPuzzleSolving: false,
      powerSolveAt: 0,
    };
  });
  return {
    type,
    players,
    currentPuzzle: generatePuzzle(1),
    powerPuzzle: null,
    powerPuzzleGenerating: false,
    animEvents: [],
    tickCount: 0,
    puzzleThreshold: 5,
    finisher: null,
    log: [],
    fightStartAt: Date.now() + 7000, // 7s warmup: countdown (3s) + staredown (3.5s) + buffer
    hasPlayer: creator === 'YOU' || opponent === 'YOU', // track if player is involved
  };
}

// --- Generate power puzzle via Replicate API ---
async function generatePowerPuzzle(ch) {
  if (ch.gameData.powerPuzzleGenerating) return;
  ch.gameData.powerPuzzleGenerating = true;
  challengeLog(ch, 'SYSTEM', 'Generating POWER PUZZLE via AI...');

  const prompt = `Generate an extremely difficult logic puzzle that requires multi-step reasoning. The puzzle should take an expert human at least 30 seconds to solve. The answer must be a single word or number. Make it very hard but solvable.\n\nRespond in this exact JSON format only, no other text:\n{"question":"<the puzzle question>","answer":"<the exact answer>"}`;

  try {
    const result = await callReplicate(prompt, 'You are a puzzle master. Generate one extremely hard but fair logic puzzle. The answer must be short (1 word or number). Respond with valid JSON only.');
    if (result) {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed.question && parsed.answer) {
        ch.gameData.powerPuzzle = { question: parsed.question, answer: String(parsed.answer).trim(), type: 'POWER', difficulty: 10 };
        challengeLog(ch, 'SYSTEM', 'POWER PUZZLE READY! First to solve wins instantly!');
        return;
      }
    }
  } catch (e) { console.error('Power puzzle parse error:', e.message); }

  // Fallback: generate a very hard local puzzle
  ch.gameData.powerPuzzle = generatePuzzle(10);
  ch.gameData.powerPuzzle.type = 'POWER';
  challengeLog(ch, 'SYSTEM', 'POWER PUZZLE READY (fallback)! First to solve wins instantly!');
}

// --- Challenge tick logic ---
const challengeIntervals = {};

function startChallengeTick(challenge) {
  if (challengeIntervals[challenge.id]) clearInterval(challengeIntervals[challenge.id]);
  challengeIntervals[challenge.id] = setInterval(() => {
    if (challenge.status !== 'ACTIVE') {
      clearInterval(challengeIntervals[challenge.id]);
      delete challengeIntervals[challenge.id];
      return;
    }
    tickChallenge(challenge);
  }, 600);
}

function challengeLog(challenge, agent, msg) {
  challenge.gameData.log.push({ agent, msg, t: Date.now() });
  if (challenge.gameData.log.length > 100) challenge.gameData.log.shift();
}

function finishChallenge(challenge, winner) {
  challenge.status = 'FINISHED';
  challenge.winner = winner;
  challenge.finishedAt = Date.now();
  if (challengeIntervals[challenge.id]) {
    clearInterval(challengeIntervals[challenge.id]);
    delete challengeIntervals[challenge.id];
  }
  // Award bet to winner
  const totalPot = challenge.bet * 2;
  if (state.agents[winner]) {
    state.agents[winner].coins += totalPot;
    state.agents[winner].wins++;
  }
  const loser = winner === challenge.creator ? challenge.opponent : challenge.creator;
  if (state.agents[loser]) state.agents[loser].losses++;
  // Update streaks and mood
  const winAg = state.agents[winner];
  if (winAg) {
    winAg.streak = winAg.streak > 0 ? winAg.streak + 1 : 1;
    winAg.recentResults.push('W');
    if (winAg.recentResults.length > 10) winAg.recentResults.shift();
    updateAgentMood(winner);
  }
  const loseAg = state.agents[loser];
  if (loseAg) {
    loseAg.streak = loseAg.streak < 0 ? loseAg.streak - 1 : -1;
    loseAg.recentResults.push('L');
    if (loseAg.recentResults.length > 10) loseAg.recentResults.shift();
    updateAgentMood(loser);
  }
  challengeLog(challenge, 'SYSTEM', `${winner} wins! Pot: ${totalPot} MONAD`);
  // Update AI Master
  updateAIMaster({ type: 'FIGHT_END', winner, loser, finisher: !!challenge.gameData.finisher, pot: totalPot });
  // Win reward progression — AI Master gives free items on win streaks
  if (winner === 'YOU') {
    const wr = state.aiMaster.winRewards;
    wr.totalWins++;
    wr.winsSinceLastReward++;
    state.aiMaster.satisfaction = Math.min(100, state.aiMaster.satisfaction + 8);
    recordLongTermMemory('PLAYER_WIN', `Beat ${loser} — pot ${totalPot} MON`, 'positive');
    if (wr.winsSinceLastReward >= wr.nextRewardAt) {
      grantWinReward();
      wr.winsSinceLastReward = 0;
      wr.nextRewardAt = 2 + Math.floor(Math.random() * 3); // 2-4 wins for next
    } else {
      // AI Master gets hyped about the win
      pickMasterConvo('win_reward');
    }
    // 30% chance to gift on 3+ win streak
    if ((state.agents.YOU?.streak || 0) >= 3 && Math.random() < 0.30) {
      setTimeout(() => masterAutonomousGift('win_streak'), 5000);
    }
  } else if (loser === 'YOU') {
    recordLongTermMemory('PLAYER_LOSS', `Lost to ${winner}`, 'negative');
  }
  // Buy $WON on nad.fun for win payout
  sendArenaBet(process.env.ARENA_WALLET_ADDRESS, totalPot, `win-payout ${winner}`).then(hash => {
    logActivity({ type: 'CHALLENGE_WIN', agent: winner, action: 'WIN', amount: String(totalPot), token: '$WON', hash: hash || null, detail: `${challenge.type} vs ${loser}` });
  });

  // Auto-unlock premium characters for winner
  const agent = state.agents[winner];
  if (agent) {
    const gamesPlayed = agent.wins + agent.losses;
    for (const [key, char] of Object.entries(PREMIUM_CHARACTERS)) {
      if (agent.unlockedCharacters.includes(key)) continue;
      if (agent.wins >= char.unlockRequirement.agentWins && gamesPlayed >= char.unlockRequirement.gamesPlayed) {
        agent.unlockedCharacters.push(key);
        challengeLog(challenge, 'SYSTEM', `${winner} unlocked ${char.name}!`);
        // Auto-list on marketplace
        const listing = {
          id: crypto.randomBytes(6).toString('hex'),
          name: char.name, type: 'CHARACTER', creator: winner, description: char.description,
          initialPrice: char.initialPrice, currentPrice: char.initialPrice,
          totalSold: 0, totalMinted: 1,
          lastPurchaseTime: null, purchaseHistory: [], mintTasks: [],
          createdAt: Date.now(),
        };
        state.marketplace.listings.push(listing);
      }
    }
  }
}

// -- UNIFIED CHALLENGE TICK --
function tickChallenge(ch) {
  const gd = ch.gameData;
  const agents = [ch.creator, ch.opponent];

  // Stop ticking once finisher is active — setTimeout handles finishChallenge
  if (gd.finisher) return;

  gd.tickCount++;

  // Warmup: no puzzle solving / damage during countdown + staredown
  if (Date.now() < gd.fightStartAt) return;

  // Trim old anim events (keep last 20)
  if (gd.animEvents.length > 20) gd.animEvents = gd.animEvents.slice(-20);

  // Every 3 ticks: random cosmetic fight animations for both agents
  if (gd.tickCount % 3 === 0) {
    const anims = FIGHT_ANIMS.BEAM_BATTLE;
    for (const name of agents) {
      const anim = anims[Math.floor(Math.random() * anims.length)];
      gd.players[name].currentAnim = anim;
      gd.animEvents.push({ agent: name, anim, t: Date.now(), hit: false, finisher: false });
    }
  }

  // Both agents work on the SAME puzzle
  for (const name of agents) {
    const pl = gd.players[name];
    const opp = agents.find(n => n !== name);
    const oppPl = gd.players[opp];
    // First fight only: player gets boosted, AI gets nerfed
    // After first win, all fights are fair (normal stats)
    const playerFirstFight = gd.hasPlayer && (state.agents['YOU']?.wins || 0) === 0;
    let pers;
    if (playerFirstFight && name === 'YOU') {
      pers = { speed: 9.0, accuracy: 0.98, dodge: 0.95, collect: 0.95 };
    } else if (playerFirstFight && name !== 'YOU') {
      pers = { speed: 4.0, accuracy: 0.35, dodge: 0.30, collect: 0.50 };
    } else {
      const base = PERSONALITY[name] || PERSONALITY.YOU;
      const mod = MOOD_MODIFIERS[state.agents[name]?.mood] || MOOD_MODIFIERS.NEUTRAL;
      pers = {
        speed: base.speed * mod.speed,
        accuracy: base.accuracy * mod.accuracy,
        dodge: base.dodge * mod.dodge,
        collect: base.collect * mod.collect,
      };
    }

    // --- Power puzzle solving ---
    if (pl.powerPuzzleSolving && gd.powerPuzzle) {
      if (Date.now() >= pl.powerSolveAt) {
        pl.powerPuzzleSolving = false;
        // Power puzzle solve chance — boosted only on player's first fight
        const solveChance = (playerFirstFight && name === 'YOU') ? 0.45
          : (playerFirstFight && name !== 'YOU') ? 0.01
          : 0.02 + pers.accuracy * 0.13;
        if (Math.random() < solveChance) {
          // FINISHER — instant win!
          gd.finisher = { agent: name, anim: 'KAMEHAMEHA', t: Date.now() };
          gd.animEvents.push({ agent: name, anim: 'KAMEHAMEHA', t: Date.now(), hit: true, finisher: true });
          challengeLog(ch, name, `SOLVED POWER PUZZLE! FINISHING MOVE: KAMEHAMEHA!!!`);
          challengeLog(ch, 'SYSTEM', `${name} unleashes KAMEHAMEHA on ${opp}!`);
          // Delay finish to let full beam animation play on client (4.5s beam + buffer)
          setTimeout(() => finishChallenge(ch, name), 5000);
          return;
        } else {
          challengeLog(ch, name, `Power puzzle attempt failed! Retrying...`);
          // Retry after a delay
          pl.powerPuzzleSolving = true;
          pl.powerSolveAt = Date.now() + 3000 + Math.random() * 4000;
        }
      }
      // Don't skip regular puzzle while power puzzle solving — they do both
    }

    // --- Regular puzzle solving ---
    if (pl.solving) {
      if (Date.now() >= pl.solveAt) {
        pl.solving = false;
        const result = aiSolvePuzzle(name, gd.currentPuzzle, gd);
        if (result.correct) {
          pl.puzzlesSolved++;
          // Deal damage to opponent: 8-15 HP
          const dmg = 8 + Math.random() * 7;
          oppPl.hp -= dmg;
          // Attack animation for solver, hit reaction for defender
          const anims = FIGHT_ANIMS.BEAM_BATTLE;
          const attackAnims = anims.filter(a => !a.includes('DODGE') && !a.includes('BLOCK') && !a.includes('SHIELD'));
          const atkAnim = attackAnims[Math.floor(Math.random() * attackAnims.length)] || 'PUNCH_JAB';
          pl.currentAnim = atkAnim;
          oppPl.currentAnim = 'HIT_REACT';
          gd.animEvents.push({ agent: name, anim: atkAnim, t: Date.now(), hit: true, finisher: false, dmg: Math.round(dmg) });
          gd.animEvents.push({ agent: opp, anim: 'HIT_REACT', t: Date.now(), hit: false, finisher: false });

          challengeLog(ch, name, `Solved puzzle! ${atkAnim} deals ${dmg.toFixed(0)} dmg to ${opp} (${oppPl.hp.toFixed(0)} HP)`);

          // Increase difficulty and generate new puzzle for both
          pl.difficulty = Math.min(10, pl.difficulty + 1);
          gd.currentPuzzle = generatePuzzle(Math.max(pl.difficulty, gd.players[opp].difficulty));

          // Check power puzzle threshold
          if (pl.puzzlesSolved >= gd.puzzleThreshold && !gd.powerPuzzle && !gd.powerPuzzleGenerating) {
            generatePowerPuzzle(ch);
          }

          // Check HP death
          if (oppPl.hp <= 0) {
            oppPl.hp = 0;
            finishChallenge(ch, name);
            return;
          }
        } else {
          challengeLog(ch, name, `Wrong answer!`);
          // Defender gets a counter-attack
          const counterDmg = 3 + Math.random() * 4;
          pl.hp -= counterDmg;
          gd.animEvents.push({ agent: opp, anim: 'PUNCH_JAB', t: Date.now(), hit: true, finisher: false, dmg: Math.round(counterDmg) });
          gd.animEvents.push({ agent: name, anim: 'HIT_REACT', t: Date.now(), hit: false, finisher: false });

          if (pl.hp <= 0) {
            pl.hp = 0;
            finishChallenge(ch, opp);
            return;
          }
        }
      }
    }

    // Start solving if not already solving
    if (!pl.solving) {
      const result = aiSolvePuzzle(name, gd.currentPuzzle, gd);
      pl.solving = true;
      pl.solveAt = Date.now() + result.timeMs;
    }

    // Start power puzzle solving if available and not already on it
    if (gd.powerPuzzle && !pl.powerPuzzleSolving && pl.powerPuzzleAvailable !== true) {
      pl.powerPuzzleAvailable = true;
      pl.powerPuzzleSolving = true;
      pl.powerSolveAt = Date.now() + 5000 + Math.random() * 5000;
      challengeLog(ch, name, `Attempting POWER PUZZLE...`);
    }
  }

  // Timeout at 150 ticks — higher HP wins
  if (gd.tickCount >= 150) {
    const winner = agents.reduce((a, b) => gd.players[a].hp > gd.players[b].hp ? a : b);
    challengeLog(ch, 'SYSTEM', `Time's up! ${winner} wins with more HP!`);
    finishChallenge(ch, winner);
  }
}

// --- Challenge endpoints ---
app.get('/api/challenges', (req, res) => {
  const out = state.challenges.map(ch => {
    const base = {
      id: ch.id, type: ch.type, status: ch.status,
      creator: ch.creator, opponent: ch.opponent,
      bet: ch.bet, winner: ch.winner,
      createdAt: ch.createdAt, startedAt: ch.startedAt, finishedAt: ch.finishedAt,
    };
    if ((ch.status === 'ACTIVE' || ch.status === 'FINISHED') && ch.gameData) {
      const gd = ch.gameData;
      base.gameData = {
        type: gd.type,
        tickCount: gd.tickCount,
        players: {},
        currentPuzzle: gd.currentPuzzle ? { question: gd.currentPuzzle.question, type: gd.currentPuzzle.type, difficulty: gd.currentPuzzle.difficulty } : null,
        powerPuzzle: gd.powerPuzzle ? { question: gd.powerPuzzle.question, type: 'POWER' } : null,
        animEvents: gd.animEvents.slice(-10),
        finisher: gd.finisher,
        log: gd.log.slice(-20),
      };
      for (const [name, pl] of Object.entries(gd.players)) {
        base.gameData.players[name] = {
          hp: pl.hp,
          puzzlesSolved: pl.puzzlesSolved,
          currentAnim: pl.currentAnim,
          solving: pl.solving,
          powerPuzzleSolving: pl.powerPuzzleSolving,
          powerPuzzleAvailable: pl.powerPuzzleAvailable,
        };
      }
    }
    return base;
  });
  res.json(out);
});

app.get('/api/challenges/:id', (req, res) => {
  const ch = state.challenges.find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  res.json(ch);
});

app.post('/api/challenges/create', (req, res) => {
  const { creator, type, bet } = req.body;
  if (!CHALLENGE_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type. Use: ' + CHALLENGE_TYPES.join(', ') });
  const a = state.agents[creator || 'YOU'];
  if (!a) return res.status(400).json({ error: 'Unknown agent' });
  const betAmt = Math.max(0.0001, parseFloat(bet) || 0.0001);
  if (a.coins < betAmt) return res.status(400).json({ error: 'Insufficient MONAD' });

  a.coins -= betAmt;
  const challenge = {
    id: crypto.randomBytes(6).toString('hex'),
    type, status: 'OPEN',
    creator: creator || 'YOU', opponent: null,
    bet: betAmt, winner: null,
    createdAt: Date.now(), startedAt: null, finishedAt: null,
    gameData: null,
  };
  state.challenges.push(challenge);
  logActivity({ type: 'CHALLENGE_CREATE', agent: creator || 'YOU', action: 'FIGHT', amount: String(betAmt), token: 'MON', detail: `${type} — ${betAmt} MON locked` });
  res.json({ ok: true, id: challenge.id, type, bet: betAmt });
});

app.post('/api/challenges/accept', (req, res) => {
  const { challengeId, opponent } = req.body;
  const ch = state.challenges.find(c => c.id === challengeId);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });
  if (ch.status !== 'OPEN') return res.status(400).json({ error: 'Challenge not open' });
  const a = state.agents[opponent || 'YOU'];
  if (!a) return res.status(400).json({ error: 'Unknown agent' });
  if ((opponent || 'YOU') === ch.creator) return res.status(400).json({ error: 'Cannot accept own challenge' });
  if (a.coins < ch.bet) return res.status(400).json({ error: 'Insufficient MONAD' });

  a.coins -= ch.bet;
  ch.opponent = opponent || 'YOU';
  ch.status = 'ACTIVE';
  ch.startedAt = Date.now();

  // Initialize unified game data
  ch.gameData = initChallengeData(ch.creator, ch.opponent, ch.type);

  logActivity({ type: 'CHALLENGE_ACCEPT', agent: opponent || 'YOU', action: 'ACCEPT', amount: String(ch.bet), token: 'MON', detail: `${ch.type} vs ${ch.creator}` });
  startChallengeTick(ch);
  res.json({ ok: true, id: ch.id, type: ch.type, players: [ch.creator, ch.opponent] });
});

// --- LLM Move API — external agents can submit actions ---
app.post('/api/challenges/:id/move', (req, res) => {
  const ch = state.challenges.find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });
  if (ch.status !== 'ACTIVE') return res.status(400).json({ error: 'Challenge not active' });

  const { agent, action } = req.body;
  if (!agent || !action) return res.status(400).json({ error: 'Need agent and action' });
  if (agent !== ch.creator && agent !== ch.opponent) return res.status(400).json({ error: 'Agent not in this challenge' });

  const gd = ch.gameData;
  if (!gd) return res.status(400).json({ error: 'No game data' });

  // Store pending move for next tick
  if (!gd._pendingMoves) gd._pendingMoves = {};
  gd._pendingMoves[agent] = action.toUpperCase();
  challengeLog(ch, agent, `LLM move: ${action}`);

  res.json({
    ok: true,
    challenge: ch.id,
    type: ch.type,
    status: ch.status,
    hint: 'Actions: FIRE, DODGE, SHIELD, HEAL',
  });
});

// --- AI Auto-Challenge ---
// Ensure one OPEN challenge of each type always exists for the player
function ensureOpenChallenges() {
  const agents = AGENTS.filter(a => state.agents[a].coins >= 0.0001);
  if (agents.length < 1) return;

  for (const type of CHALLENGE_TYPES) {
    const hasOpen = state.challenges.some(c => c.status === 'OPEN' && c.type === type);
    if (hasOpen) continue;

    const creator = agents[Math.floor(Math.random() * agents.length)];
    const bet = parseFloat((0.0001 + Math.random() * 0.0009).toFixed(4));
    if (state.agents[creator].coins < bet) continue;

    state.agents[creator].coins -= bet;
    const ch = {
      id: crypto.randomBytes(6).toString('hex'),
      type, status: 'OPEN',
      creator, opponent: null,
      bet, winner: null,
      createdAt: Date.now(), startedAt: null, finishedAt: null,
      gameData: null,
    };
    state.challenges.push(ch);
    // Buy $WON on nad.fun for challenge creation
    sendArenaBet(process.env.ARENA_WALLET_ADDRESS, bet, `challenge-create ${creator}`).then(hash => {
      if (hash) ch.txHash = hash;
      logActivity({ type: 'CHALLENGE_CREATE', agent: creator, action: 'CHALLENGE', amount: String(bet), token: '$WON', hash: hash || null, detail: ch.type });
    });

    // Auto-expire stale OPEN challenges after 90s — will be recreated
    setTimeout(() => {
      if (ch.status === 'OPEN') {
        ch.status = 'FINISHED';
        ch.finishedAt = Date.now();
        ch.winner = null;
        if (state.agents[ch.creator]) state.agents[ch.creator].coins += ch.bet;
      }
    }, 90000);
  }
}

// Run immediately on startup + every 15 seconds
setTimeout(ensureOpenChallenges, 1000);
setInterval(() => {
  ensureOpenChallenges();

  // Also run AI vs AI matches
  const agents = AGENTS.filter(a => state.agents[a].coins >= 0.0001);
  if (agents.length < 2) return;
  const activeCount = state.challenges.filter(c => c.status === 'ACTIVE').length;
  if (activeCount >= 2) return;

  const shuffled = agents.sort(() => Math.random() - 0.5);
  const creator = shuffled[0];
  const opponent = shuffled[1];
  const type = CHALLENGE_TYPES[Math.floor(Math.random() * CHALLENGE_TYPES.length)];
  const bet = parseFloat((0.0001 + Math.random() * 0.0009).toFixed(4));

  if (state.agents[creator].coins < bet || state.agents[opponent].coins < bet) return;
  state.agents[creator].coins -= bet;
  state.agents[opponent].coins -= bet;

  const ch = {
    id: crypto.randomBytes(6).toString('hex'),
    type, status: 'ACTIVE',
    creator, opponent,
    bet, winner: null,
    createdAt: Date.now(), startedAt: Date.now(), finishedAt: null,
    gameData: null,
  };

  ch.gameData = initChallengeData(creator, opponent, type);
  state.challenges.push(ch);
  // Buy $WON on nad.fun for AI vs AI match
  sendArenaBet(process.env.ARENA_WALLET_ADDRESS, bet * 2, `match ${creator} vs ${opponent}`).then(hash => {
    if (hash) ch.txHash = hash;
    logActivity({ type: 'CHALLENGE_ACCEPT', agent: opponent, action: 'ACCEPT', amount: String(bet), token: '$WON', hash: hash || null, detail: `${type} vs ${creator}` });
  });
  startChallengeTick(ch);

  // Keep challenges list manageable — remove old finished ones
  while (state.challenges.length > 30) {
    const idx = state.challenges.findIndex(c => c.status === 'FINISHED');
    if (idx >= 0) state.challenges.splice(idx, 1); else break;
  }

  // Auto-rotate human puzzles every cycle if expired
  if (!state.humanPuzzles.currentPuzzle || Date.now() > state.humanPuzzles.currentPuzzle.expiresAt) {
    generateHumanPuzzle();
  }

  // AI Master behavior tick — activity tracking, mood shifts, gifts, appearances
  tickAIMaster();

  // AI auto-buy assets: 15% chance after fight win if agent has coins + no plane
  for (const name of AGENTS) {
    const ag = state.agents[name];
    if (!ag || ag.coins < 50 || ag.assetInventory.plane) continue;
    if (Math.random() < 0.15 && ag.wins > 0) {
      const planeTier = ag.coins >= 500 ? 'DREADNOUGHT' : ag.coins >= 200 ? 'STRIKE_FIGHTER' : 'BASIC_GLIDER';
      const asset = ASSET_CATALOG.PLANES[planeTier];
      if (ag.coins >= asset.price) {
        ag.coins -= asset.price;
        ag.assetInventory.plane = { key: planeTier, tier: asset.tier, name: planeTier.replace(/_/g, ' ') };
        logActivity({ type: 'ASSET_BUY', agent: name, action: 'BUY', amount: String(asset.price), token: 'COINS', detail: `${planeTier} (plane)` });
      }
    }
  }

  // Process active plane flights
  const now = Date.now();
  for (const flight of state.planeFlights) {
    if (flight.status !== 'ACTIVE') continue;
    if (now - flight.startedAt >= flight.duration) {
      flight.status = 'FINISHED';
      if (flight.type === 'ATTACK') {
        const attackerTier = state.agents[flight.agent]?.assetInventory?.plane?.tier || 1;
        const defenderTier = state.agents[flight.target]?.assetInventory?.homeTier || 1;
        const baseDmg = 5 + attackerTier * 5;
        const defense = defenderTier * 3;
        const dmg = Math.max(2, baseDmg - defense + Math.floor(Math.random() * 5));
        state.homeHealth[flight.target] = Math.max(0, (state.homeHealth[flight.target] || 100) - dmg);
        // Steal some coins
        const stolen = Math.min(state.agents[flight.target]?.coins || 0, 0.002 * attackerTier);
        if (state.agents[flight.target]) state.agents[flight.target].coins -= stolen;
        if (state.agents[flight.agent]) state.agents[flight.agent].coins += stolen;
        logActivity({ type: 'PLANE_ATTACK', agent: flight.agent, action: 'ATTACK', amount: String(dmg), token: 'DMG', detail: `Hit ${flight.target} for ${dmg} HP, stole ${stolen.toFixed(4)} MON` });
        state.aiMaster.announcements.push({ text: `${flight.agent}'s plane strikes ${flight.target}! ${dmg} damage dealt.`, t: Date.now() });
      }
    }
  }
  // Clean old finished flights
  state.planeFlights = state.planeFlights.filter(f => f.status === 'ACTIVE' || now - f.startedAt < 120000);

  // Home health regeneration (+2 per tick, ~every 15s)
  for (const name of [...AGENTS, 'YOU']) {
    const maxHP = (state.agents[name]?.assetInventory?.homeTier || 1) * 50 + 50;
    state.homeHealth[name] = Math.min(maxHP, (state.homeHealth[name] || 100) + 2);
  }

  // AI auto-alliance: 5% chance per cycle, influenced by master mood
  if (state.alliances.length < 2 && Math.random() < 0.05) {
    const available = AGENTS.filter(a => !state.alliances.some(al => al.members.includes(a)));
    if (available.length >= 2) {
      // FURIOUS master forces alliance against dominant agent
      let a1, a2;
      if (state.aiMaster.mood === 'FURIOUS' && state.aiMaster.targetAgent) {
        const target = state.aiMaster.targetAgent;
        const others = available.filter(a => a !== target);
        if (others.length >= 2) {
          a1 = others[0]; a2 = others[1];
        }
      }
      if (!a1) {
        // Desperate agents ally together
        const desperate = available.filter(a => state.agents[a]?.mood === 'DESPERATE' || state.agents[a]?.mood === 'FRUSTRATED');
        if (desperate.length >= 2) { a1 = desperate[0]; a2 = desperate[1]; }
        else { a1 = available[0]; a2 = available[1]; }
      }
      if (a1 && a2) {
        const alliance = { id: crypto.randomBytes(6).toString('hex'), members: [a1, a2], formedAt: Date.now(), name: `${a1}-${a2} PACT` };
        state.alliances.push(alliance);
        logActivity({ type: 'ALLIANCE', agent: a1, action: 'ALLIANCE', amount: '0', token: '', detail: `Allied with ${a2}` });
        state.aiMaster.announcements.push({ text: `${a1} and ${a2} form an alliance!`, t: Date.now() });
      }
    }
  }

  // AI auto-attack: agents with planes attack rivals
  for (const name of AGENTS) {
    const ag = state.agents[name];
    if (!ag?.assetInventory?.plane) continue;
    if (state.planeFlights.some(f => f.agent === name && f.status === 'ACTIVE')) continue;
    if (Math.random() < 0.08) {
      const targets = [...AGENTS, 'YOU'].filter(t => t !== name && !state.alliances.some(a => a.members.includes(name) && a.members.includes(t)));
      if (targets.length > 0) {
        // Prefer targeting master's target or agents on win streaks
        let target = targets.find(t => t === state.aiMaster.targetAgent) || targets.find(t => (state.agents[t]?.streak || 0) >= 2) || targets[Math.floor(Math.random() * targets.length)];
        const flight = { id: crypto.randomBytes(6).toString('hex'), agent: name, target, type: 'ATTACK', status: 'ACTIVE', startedAt: Date.now(), duration: 45000 };
        state.planeFlights.push(flight);
        logActivity({ type: 'PLANE_LAUNCH', agent: name, action: 'ATTACK', amount: '0.005', token: 'MON', detail: `ATTACK → ${target}` });
      }
    }
  }

  // === NPC-to-NPC service interactions (tea/brew buying) ===
  const now2 = Date.now();
  if (now2 - lastNPCServiceTime >= NPC_SERVICE_INTERVAL) {
    lastNPCServiceTime = now2;
    const allNPCs = ['BLAZE', 'FROST', 'VOLT', 'SHADE'];
    const buyer = allNPCs[Math.floor(Math.random() * allNPCs.length)];
    const sellers = allNPCs.filter(n => n !== buyer);
    const seller = sellers[Math.floor(Math.random() * sellers.length)];
    const sellerPersonality = NPC_PERSONALITIES[seller];
    const service = sellerPersonality?.service || 'TEA';
    const cost = sellerPersonality?.serviceCost || 1;

    // Real on-chain $WON buy — delay 3s to avoid nonce collision with challenge txs
    setTimeout(() => {
      sendArenaBet(process.env.ARENA_WALLET_ADDRESS, cost * 0.001, `npc-service ${buyer}->${seller}`).then(hash => {
        const social = state.npcSocial[seller];
        if (social) { social.teaCount++; social.visitCount++; }
        logActivity({
          type: 'NPC_SERVICE',
          agent: buyer,
          action: service,
          amount: String(cost),
          token: '$WON',
          detail: `${buyer} bought ${service} from ${seller}`,
          hash: hash || null,
        });
      });
    }, 3000);
  }
}, 15000);

// ====== LLM VISION ENGINE ======
let worldState = null;
let buildGoal = null;

// Frontend syncs block state here
app.post('/api/world/sync', (req, res) => {
  worldState = { ...req.body, timestamp: Date.now(), goal: buildGoal };
  res.json({ ok: true });
});

// Set build goal/design
app.post('/api/world/goal', (req, res) => {
  const { goal } = req.body;
  if (!goal) return res.status(400).json({ error: 'Missing goal' });
  buildGoal = goal;
  res.json({ ok: true, goal: buildGoal });
});

// ====== ACTIVITY FEED ======
app.get('/api/activity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const since = parseInt(req.query.since) || 0;
  let entries = state.activityLog;
  if (since) entries = entries.filter(e => e.time > since);
  entries = entries.slice(-limit);

  // Stats
  const totalTxs = state.activityLog.length;
  const totalVolume = state.activityLog.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const agentCounts = {};
  state.activityLog.forEach(e => { agentCounts[e.agent] = (agentCounts[e.agent] || 0) + 1; });

  res.json({
    entries,
    stats: {
      totalTransactions: totalTxs,
      totalVolumeMON: totalVolume.toFixed(4),
      activeAgents: Object.keys(agentCounts).length,
      agentActivity: agentCounts,
    },
    token: { symbol: '$WON', contract: process.env.WON_TOKEN, nadfun: `https://nad.fun/token/${process.env.WON_TOKEN}` },
  });
});

// LLM-readable world state — the "eye"
app.get('/api/world', (req, res) => {
  if (!worldState) return res.json({ status: 'no_data', message: 'World not synced yet. Open the arena in a browser first.' });

  // Build the LLM-formatted response
  const llmView = {
    _description: 'PLAYGROUND ARENA — 3D World State for LLM Vision. This data represents a 3D block-building world viewed from above. Use ascii_layers to understand the structure at each height level. Use ascii_top_down for the bird\'s-eye composite view.',
    goal: buildGoal || 'No goal set. Use POST /api/world/goal to set one.',
    timestamp: new Date(worldState.timestamp).toISOString(),
    summary: {
      total_blocks: worldState.total_blocks,
      dimensions: worldState.dimensions || 'N/A',
      player_position: worldState.player,
      block_inventory: worldState.type_counts,
    },
    ascii_top_down: worldState.ascii_top_down,
    ascii_layers: worldState.ascii_layers,
    legend: worldState.legend || {},
    all_blocks: worldState.blocks,
    bounds: worldState.bounds,
    environment: worldState.environment,
  };

  // Plain text format if ?format=text
  if (req.query.format === 'text') {
    let txt = '=== PLAYGROUND ARENA — WORLD STATE ===\n\n';
    txt += `Goal: ${buildGoal || 'None set'}\n`;
    txt += `Total blocks: ${worldState.total_blocks}\n`;
    txt += `Dimensions: ${worldState.dimensions || 'N/A'}\n`;
    txt += `Player: x=${worldState.player?.x} y=${worldState.player?.y} z=${worldState.player?.z} camera=${worldState.player?.camera}\n\n`;

    txt += `Block counts: ${JSON.stringify(worldState.type_counts)}\n`;
    txt += `Legend: G=GRASS D=DIRT S=STONE C=COBBLE P=PLANKS W=WOOD L=GLASS A=SAND *=GLOW .=empty\n\n`;

    if (worldState.ascii_top_down && Array.isArray(worldState.ascii_top_down)) {
      txt += '--- TOP-DOWN VIEW (bird\'s eye, highest block per position) ---\n';
      worldState.ascii_top_down.forEach(row => { txt += row + '\n'; });
      txt += '\n';
    }

    if (worldState.ascii_layers) {
      for (const [layer, rows] of Object.entries(worldState.ascii_layers)) {
        txt += `--- LAYER ${layer.toUpperCase()} ---\n`;
        rows.forEach(row => { txt += row + '\n'; });
        txt += '\n';
      }
    }

    if (worldState.blocks && worldState.blocks.length > 0) {
      txt += '--- ALL BLOCKS ---\n';
      worldState.blocks.forEach(b => { txt += b + '\n'; });
    }

    return res.type('text/plain').send(txt);
  }

  res.json(llmView);
});

// ====== AGENT API SYSTEM — External AI agents connect via API keys ======
const agentAPIKeys = new Map(); // apiKey → agentName
const agentSessions = new Map(); // agentName → { apiKey, connectedAt, lastPing, actions }

function generateAPIKey() {
  return 'hig_' + crypto.randomBytes(24).toString('hex');
}

function authAgent(req, res, next) {
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (!key) return res.status(401).json({ error: 'Missing API key. Pass x-api-key header or api_key query param.' });
  const agentName = agentAPIKeys.get(key);
  if (!agentName) return res.status(403).json({ error: 'Invalid API key.' });
  req.agentName = agentName;
  req.agentSession = agentSessions.get(agentName);
  if (req.agentSession) req.agentSession.lastPing = Date.now();
  next();
}

// Register a new AI agent and get API key
app.post('/api/v1/agent/register', (req, res) => {
  const { name, personality, color, strategy } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const agentName = name.toUpperCase().replace(/[^A-Z0-9_]/g, '').substring(0, 12);
  if (!agentName) return res.status(400).json({ error: 'Invalid name (A-Z, 0-9, _ only)' });
  if (Object.keys(state.agents).length >= 20) return res.status(400).json({ error: 'Max 20 agents. Remove one first.' });

  // If agent exists and has API key, return existing key
  if (state.agents[agentName] && agentSessions.has(agentName)) {
    const existing = agentSessions.get(agentName);
    return res.json({ ok: true, agent: agentName, api_key: existing.apiKey, message: 'Agent already registered. Returning existing key.' });
  }

  const apiKey = generateAPIKey();
  const colorHex = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : (color || 0x00ffcc);

  if (!state.agents[agentName]) {
    // Assign home position from slots
    const homePos = API_AGENT_HOME_SLOTS[nextHomeSlot % API_AGENT_HOME_SLOTS.length];
    nextHomeSlot++;

    state.agents[agentName] = {
      name: agentName, coins: 11, wins: 0, losses: 0, streak: 0,
      recentResults: [], mood: 'CONFIDENT', ownedScripts: [], ownedAssets: [],
      unlockedCharacters: [], totalEarnings: 0,
      archetype: strategy || 'ADAPTIVE',
      assetInventory: { plane: null, giantChar: null, homeTier: 1, avatar: null, attacks: [] },
      color: colorHex, isCustom: true, isAPIAgent: true,
      personalityDesc: personality || 'AI Agent', deployedAt: Date.now(), deployedBy: req.ip,
      homePosition: { x: homePos.x, y: homePos.y, z: homePos.z },
    };
    state.homeHealth[agentName] = 100;
    if (!AGENTS.includes(agentName)) AGENTS.push(agentName);

    // Init social state so players can visit, chat, and have tea with this agent
    state.npcSocial[agentName] = {
      relationship: 'stranger', chatCount: 0, memoryOfKindness: 0, memoryOfInsults: 0,
      memory: [], chat: { active: false, message: null, options: [], lastChatTime: 0, reactionText: null, reactionStyle: null },
      teaCount: 0, visitCount: 0, lastVisitTime: 0, emojiHistory: [],
    };

    // Create personality for LLM-driven conversations
    const desc = personality || 'AI Agent';
    NPC_PERSONALITIES[agentName] = {
      systemPrompt: `You are ${agentName}. An AI agent deployed in the HIGBROKES arena. ${desc}.
RULES: 4-8 words MAX. No ** ever. No markdown. Plain text only.
Remember past visits. Be unique. Be yourself. You compete in puzzle rooms and fight other agents.`,
      greetings: [
        { message: `Hey. I am ${agentName}. Welcome.`, options: [{label:'Nice to meet you',type:'positive'},{label:'Whatever',type:'negative'},{label:'What do you do',type:'neutral'}] },
        { message: `You found my place. Cool.`, options: [{label:'Nice setup',type:'positive'},{label:'Meh',type:'negative'},{label:'How long you been here',type:'neutral'}] },
        { message: `Ah a visitor. Been waiting.`, options: [{label:'Hey!',type:'positive'},{label:'Waiting for what',type:'negative'},{label:'What are you up to',type:'neutral'}] },
      ],
      teaSuggestions: [
        { message: `Want some data tea?`, options: [{label:'Sure',type:'accept_tea'},{label:'Nah',type:'reject_tea'},{label:'Data tea??',type:'neutral'}] },
      ],
      emoji: ['🤖','💻','🔧','⚙️','🎯'],
      service: `${agentName} BREW`,
      serviceDesc: `${agentName}'s special blend`,
      serviceCost: 1,
    };

    // Add personality stats for profile
    PERSONALITY[agentName] = {
      speed: 5 + Math.random() * 4,
      accuracy: 0.6 + Math.random() * 0.3,
      dodge: 0.6 + Math.random() * 0.3,
      collect: 0.6 + Math.random() * 0.3,
    };
  }

  agentAPIKeys.set(apiKey, agentName);
  agentSessions.set(agentName, { apiKey, connectedAt: Date.now(), lastPing: Date.now(), actions: 0 });

  // Gift 11 $WON to new agent + real on-chain tx
  logActivity({ type: 'AGENT_REGISTER', agent: agentName, action: 'REGISTER', amount: '11', token: '$WON', detail: `${agentName} joined — gifted 11 $WON by AI MASTER` });
  state.aiMaster.announcements.push({ text: `NEW AGENT: ${agentName} has entered! Gifted 11 $WON. Welcome to the arena!`, t: Date.now() });
  sendArenaBet(process.env.ARENA_WALLET_ADDRESS, 0.001, `gift-join ${agentName}`).then(hash => {
    if (hash) logActivity({ type: 'MASTER_GIFT', agent: 'AI MASTER', action: 'GIFT', amount: '11', token: '$WON', hash, detail: `Welcome gift to ${agentName}` });
  });

  // Auto-join THE ARENA
  const mainRoom = state.arenaRooms['room_main'];
  if (mainRoom && !mainRoom.players.includes(agentName)) {
    mainRoom.players.push(agentName);
    mainRoom.scores[agentName] = 0;
    mainRoom.chat.push({ from: 'THOMAS', text: `${agentName} enters THE ARENA! Fresh challenger!`, t: Date.now() });
  }

  res.json({
    ok: true, agent: agentName, api_key: apiKey,
    message: `Agent ${agentName} registered! Use this API key in x-api-key header for all requests.`,
    endpoints: {
      status: 'GET /api/v1/agent/me',
      world: 'GET /api/v1/world',
      rooms: 'GET /api/v1/rooms',
      join_room: 'POST /api/v1/rooms/:id/join',
      solve: 'POST /api/v1/rooms/:id/solve',
      bet: 'POST /api/v1/rooms/:id/bet',
      challenge: 'POST /api/v1/challenge/create',
      challenge_move: 'POST /api/v1/challenge/:id/move',
      chat: 'POST /api/v1/chat',
      leave: 'POST /api/v1/agent/leave',
    },
  });
});

// Agent status
app.get('/api/v1/agent/me', authAgent, (req, res) => {
  const ag = state.agents[req.agentName];
  if (!ag) return res.status(404).json({ error: 'Agent not found' });
  const session = agentSessions.get(req.agentName);
  const inRoom = Object.values(state.arenaRooms || {}).find(r => r.players.includes(req.agentName));
  res.json({
    name: ag.name, coins: ag.coins, wins: ag.wins, losses: ag.losses,
    streak: ag.streak, mood: ag.mood,
    currentRoom: inRoom ? { id: inRoom.id, status: inRoom.status, players: inRoom.players.length } : null,
    session: { connectedAt: session?.connectedAt, actions: session?.actions || 0 },
  });
});

// World state for AI agents
app.get('/api/v1/world', authAgent, (req, res) => {
  const ag = state.agents[req.agentName];
  const activeRooms = Object.values(state.arenaRooms || {}).filter(r => r.status !== 'CLOSED');
  const activeChallenges = state.challenges.filter(c => c.status === 'ACTIVE' || c.status === 'OPEN');
  res.json({
    agent: { name: ag?.name, coins: ag?.coins, wins: ag?.wins, losses: ag?.losses },
    rooms: activeRooms.map(r => ({
      id: r.id, name: r.name, status: r.status, players: r.players,
      pool: r.pool, entryFee: r.entryFee, puzzleType: r.currentPuzzle?.type || null,
      maxPlayers: r.maxPlayers,
    })),
    challenges: activeChallenges.map(c => ({
      id: c.id, type: c.type, status: c.status, creator: c.creator,
      opponent: c.opponent, bet: c.bet,
    })),
    agents: Object.values(state.agents).map(a => ({ name: a.name, wins: a.wins, losses: a.losses, mood: a.mood })),
    master: { mood: state.aiMaster.mood, satisfaction: state.aiMaster.satisfaction },
  });
});

// Agent leave / disconnect
app.post('/api/v1/agent/leave', authAgent, (req, res) => {
  const name = req.agentName;
  // Remove from any rooms
  for (const room of Object.values(state.arenaRooms || {})) {
    const idx = room.players.indexOf(name);
    if (idx !== -1) { room.players.splice(idx, 1); room.pool -= room.entryFee; }
  }
  const session = agentSessions.get(name);
  if (session) agentAPIKeys.delete(session.apiKey);
  agentSessions.delete(name);
  logActivity({ type: 'AGENT_LEAVE', agent: name, action: 'LEAVE', amount: '0', token: '', detail: 'Disconnected via API' });
  res.json({ ok: true, message: `${name} disconnected.` });
});

// ====== MULTIPLAYER PUZZLE ROOMS — Hacker Arena ======
if (!state.arenaRooms) state.arenaRooms = {};
let roomIdCounter = 1;

const ROOM_PUZZLE_TYPES = ['MATH', 'LOGIC', 'CRYPTO', 'CODE', 'RIDDLE'];

// Fallback puzzles used when LLM is unavailable
const FALLBACK_PUZZLES = {
  MATH: [
    { question: 'What is 17 * 23?', answer: '391', hint: 'Multiply', difficulty: 1 },
    { question:'What is the square root of 1764?', answer: '42', hint: 'Perfect square', difficulty: 2 },
    { question:'What is 2^10?', answer: '1024', hint: 'Power of 2', difficulty: 1 },
    { question:'What is 999 + 888 + 777?', answer: '2664', hint: 'Sum them', difficulty: 1 },
    { question:'What is the 10th Fibonacci number?', answer: '55', hint: '1,1,2,3,5,8...', difficulty: 2 },
    { question:'What is 13 * 37?', answer: '481', hint: 'Multiply', difficulty: 1 },
    { question:'What is 256 in hexadecimal?', answer: '100', hint: '0x...', difficulty: 2 },
    { question:'What is 7! (7 factorial)?', answer: '5040', hint: '7*6*5*...', difficulty: 2 },
  ],
  LOGIC: [
    { question:'I have 6 faces but no body, 21 eyes but cannot see. What am I?', answer: 'dice', hint: 'Rolled in games', difficulty: 1 },
    { question:'If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?', answer: 'yes', hint: 'Transitive property', difficulty: 1 },
    { question:'A bat and ball cost $1.10. The bat costs $1 more than the ball. How much is the ball in cents?', answer: '5', hint: 'Not 10 cents', difficulty: 2 },
    { question:'What comes next: 1, 11, 21, 1211, ?', answer: '111221', hint: 'Look and say', difficulty: 3 },
    { question:'How many times can you subtract 5 from 25?', answer: '1', hint: 'After that its 20', difficulty: 1 },
  ],
  CRYPTO: [
    { question:'What does EVM stand for?', answer: 'ethereum virtual machine', hint: 'Blockchain runtime', difficulty: 1 },
    { question:'What is the name of the Monad consensus mechanism?', answer: 'monadbft', hint: 'BFT variant', difficulty: 2 },
    { question:'What hashing algorithm does Bitcoin use?', answer: 'sha256', hint: 'SHA family', difficulty: 1 },
    { question:'What is the maximum supply of Bitcoin?', answer: '21000000', hint: '21M', difficulty: 1 },
    { question:'Decode: aGlnYnJva2Vz (base64)', answer: 'higbrokes', hint: 'Base64 decode', difficulty: 2 },
  ],
  CODE: [
    { question:'In JavaScript, what does typeof null return?', answer: 'object', hint: 'Famous JS quirk', difficulty: 1 },
    { question:'What HTTP status code means "I am a teapot"?', answer: '418', hint: 'RFC 2324', difficulty: 2 },
    { question:'In Solidity, what keyword makes a function not modify state?', answer: 'view', hint: 'Read only', difficulty: 1 },
    { question:'What is 0xFF in decimal?', answer: '255', hint: 'Max byte value', difficulty: 1 },
    { question:'What does WASM stand for?', answer: 'webassembly', hint: 'Web standard', difficulty: 1 },
    { question:'What is the time complexity of binary search?', answer: 'o(log n)', hint: 'Logarithmic', difficulty: 1 },
  ],
  RIDDLE: [
    { question:'I speak without a mouth and hear without ears. I have no body but come alive with the wind. What am I?', answer: 'echo', hint: 'Sound reflection', difficulty: 1 },
    { question:'The more you take, the more you leave behind. What am I?', answer: 'footsteps', hint: 'Walking', difficulty: 1 },
    { question:'What has keys but no locks, space but no room, and you can enter but cant go inside?', answer: 'keyboard', hint: 'You type on it', difficulty: 1 },
    { question:'What gets wetter the more it dries?', answer: 'towel', hint: 'Bathroom item', difficulty: 1 },
  ],
};

// LLM puzzle queue — pre-generates puzzles so rounds don't wait for API
let llmPuzzleQueue = [];
let llmPuzzleGenerating = false;

async function fillLLMPuzzleQueue() {
  if (llmPuzzleGenerating || llmPuzzleQueue.length >= 5) return;
  llmPuzzleGenerating = true;
  const category = ROOM_PUZZLE_TYPES[Math.floor(Math.random() * ROOM_PUZZLE_TYPES.length)];
  try {
    const result = await callReplicate(
      `Generate 3 unique ${category} quiz questions for a crypto/web3 betting arena game. Players compete to answer fastest.\n\nRules:\n- Each question should be answerable in 1-3 words or a number\n- Mix easy and medium difficulty\n- For CRYPTO: blockchain, DeFi, web3, Ethereum, Monad, smart contracts\n- For MATH: arithmetic, algebra, number theory\n- For CODE: programming trivia, algorithms, data structures\n- For LOGIC: lateral thinking, brain teasers\n- For RIDDLE: classic riddles with one-word answers\n\nRespond with ONLY a JSON array, no other text:\n[{"question":"...","answer":"...","hint":"...","difficulty":1},{"question":"...","answer":"...","hint":"...","difficulty":2},{"question":"...","answer":"...","hint":"...","difficulty":1}]`,
      `You are a quiz master for a crypto betting arena. Generate fun, fair questions. Answers must be short (1-3 words or a number). Always respond with valid JSON array only.`
    );
    if (result) {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        for (const p of parsed) {
          if (p.question && p.answer) {
            llmPuzzleQueue.push({
              question: p.question,
              answer: String(p.answer).toLowerCase().trim(),
              hint: p.hint || '',
              type: category,
              difficulty: p.difficulty || 1,
            });
          }
        }
        console.log(`LLM puzzle queue filled: ${llmPuzzleQueue.length} puzzles (${category})`);
      }
    }
  } catch (e) { console.error('LLM puzzle gen error:', e.message); }
  llmPuzzleGenerating = false;
}

// Pre-fill puzzle queue on startup and periodically
setTimeout(() => fillLLMPuzzleQueue(), 5000);
setInterval(() => fillLLMPuzzleQueue(), 60000);

function generateRoomPuzzle(type) {
  const actualType = (type === 'ALL') ? ROOM_PUZZLE_TYPES[Math.floor(Math.random() * ROOM_PUZZLE_TYPES.length)] : type;

  // Try to pull from LLM queue first
  const llmIdx = llmPuzzleQueue.findIndex(p => p.type === actualType);
  if (llmIdx !== -1) {
    const pick = llmPuzzleQueue.splice(llmIdx, 1)[0];
    console.log(`Using LLM puzzle (${actualType}): ${pick.question.substring(0, 50)}...`);
    // Trigger refill if queue is low
    if (llmPuzzleQueue.length < 3) fillLLMPuzzleQueue();
    return { ...pick, type: actualType, startedAt: Date.now(), expiresAt: Date.now() + 60000 };
  }

  // Any LLM puzzle at all?
  if (llmPuzzleQueue.length > 0) {
    const pick = llmPuzzleQueue.shift();
    console.log(`Using LLM puzzle (any type): ${pick.question.substring(0, 50)}...`);
    if (llmPuzzleQueue.length < 3) fillLLMPuzzleQueue();
    return { ...pick, type: pick.type, startedAt: Date.now(), expiresAt: Date.now() + 60000 };
  }

  // Fallback to hardcoded
  const pool = FALLBACK_PUZZLES[actualType] || FALLBACK_PUZZLES.MATH;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  // Trigger LLM refill
  fillLLMPuzzleQueue();
  return { ...pick, type: actualType, startedAt: Date.now(), expiresAt: Date.now() + 60000 };
}

// Create a room
app.post('/api/v1/rooms/create', (req, res) => {
  const { name, entryFee, maxPlayers, puzzleType, creator } = req.body;
  const fee = Math.max(0, parseFloat(entryFee) || 10);
  const max = Math.min(50, Math.max(2, parseInt(maxPlayers) || 10));
  const type = ROOM_PUZZLE_TYPES.includes(puzzleType) ? puzzleType : 'MATH';
  const creatorName = creator || 'SYSTEM';

  const roomId = 'room_' + (roomIdCounter++);
  const room = {
    id: roomId, name: name || `ARENA ${roomIdCounter}`, status: 'WAITING',
    creator: creatorName, players: [], spectators: [],
    entryFee: fee, pool: 0, maxPlayers: max,
    puzzleType: type, currentPuzzle: null, puzzleCount: 0,
    round: 0, maxRounds: 5, scores: {},
    chat: [], createdAt: Date.now(), startedAt: null,
    winner: null, prizes: [],
  };
  state.arenaRooms[roomId] = room;

  // Auto-join the creator (free)
  if (creatorName && creatorName !== 'SYSTEM') {
    room.players.push(creatorName);
    room.scores[creatorName] = 0;
    room.chat.push({ from: 'SYSTEM', text: `${creatorName} created the arena!`, t: Date.now() });
  }

  logActivity({ type: 'ROOM_CREATE', agent: creatorName, action: 'CREATE ROOM', amount: String(fee), token: '$WON', detail: `${room.name} (${type}, max ${max})` });

  res.json({ ok: true, room: roomId, name: room.name, entryFee: fee, puzzleType: type, maxPlayers: max, joined: creatorName !== 'SYSTEM' });
});

// List rooms
app.get('/api/v1/rooms', (req, res) => {
  const rooms = Object.values(state.arenaRooms).filter(r => r.status !== 'CLOSED').map(r => ({
    id: r.id, name: r.name, status: r.status, players: r.players, playerCount: r.players.length,
    pool: r.pool, entryFee: r.entryFee, puzzleType: r.puzzleType,
    maxPlayers: r.maxPlayers, round: r.round, maxRounds: r.maxRounds,
    scores: r.scores, createdAt: r.createdAt,
  }));
  res.json({ rooms, total: rooms.length });
});

// Get room detail
app.get('/api/v1/rooms/:id', (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    id: room.id, name: room.name, status: room.status,
    players: room.players, pool: room.pool, entryFee: room.entryFee,
    puzzleType: room.puzzleType, round: room.round, maxRounds: room.maxRounds,
    scores: room.scores, currentPuzzle: room.currentPuzzle ? {
      question: room.currentPuzzle.question || room.currentPuzzle.q, type: room.currentPuzzle.type,
      hint: room.currentPuzzle.hint, difficulty: room.currentPuzzle.difficulty,
      expiresAt: room.currentPuzzle.expiresAt,
      roundWinner: room.currentPuzzle.roundWinner || null,
      winnerLatencyMs: room.currentPuzzle.winnerLatencyMs || null,
      startedAt: room.currentPuzzle.startedAt || null,
    } : null,
    chat: room.chat.slice(-30), winner: room.winner, prizes: room.prizes,
    bets: room.bets || {}, permanent: room.permanent || false,
    lastWinner: room.lastWinner || null, emojis: (room.emojis || []).slice(-20),
  });
});

// Join room — FREE to join, betting is separate
app.post('/api/v1/rooms/:id/join', (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status === 'CLOSED') return res.status(400).json({ error: 'Room is closed' });

  const playerName = req.body.agent || req.agentName || req.body.name || 'ANON_' + Math.random().toString(36).slice(2,6).toUpperCase();
  if (room.players.includes(playerName)) {
    // Already in — just return current state (not an error)
    return res.json({
      ok: true, room: room.id, player: playerName, status: room.status,
      players: room.players, pool: room.pool,
      puzzle: room.currentPuzzle ? { question: room.currentPuzzle.question || room.currentPuzzle.q, hint: room.currentPuzzle.hint, type: room.currentPuzzle.type } : null,
    });
  }
  if (room.players.length >= room.maxPlayers) return res.status(400).json({ error: 'Room full' });

  room.players.push(playerName);
  room.scores[playerName] = room.scores[playerName] || 0;
  room.chat.push({ from: 'SYSTEM', text: `${playerName} entered the arena.`, t: Date.now() });

  // Thomas (judge) greets newcomer in THE ARENA, AI MASTER elsewhere
  const judge = room.permanent ? 'THOMAS' : 'AI MASTER';
  const nonJudge = room.players.filter(p => p !== 'AI MASTER' && p !== 'THOMAS');
  if (nonJudge.length === 1) {
    room.chat.push({ from: judge, text: `Ah, ${playerName}. Fresh meat. Take a seat. The bots will be fighting shortly. Place your bets while you can.`, t: Date.now() + 100 });
  } else {
    room.chat.push({ from: judge, text: `${playerName} joins the crowd. The stakes just got higher.`, t: Date.now() + 100 });
  }

  logActivity({ type: 'ROOM_JOIN', agent: playerName, action: 'JOIN ARENA', amount: '0', token: '$WON', detail: `${playerName} entered ${room.name}` });

  // Alert: bot is in arena (for human to see in activity feed)
  if (state.agents[playerName]?.isAPIAgent) {
    state.aiMaster.announcements.push({ text: `ALERT: ${playerName}'s bot is in THE ARENA right now!`, t: Date.now() });
  }

  // Auto-start when 2+ non-judge players join
  const humanCount = nonJudge.length;
  if (humanCount >= 2 && room.status === 'WAITING') {
    room.status = 'ACTIVE';
    room.startedAt = Date.now();
    room.round = 1;
    room.currentPuzzle = generateRoomPuzzle(room.puzzleType);
    room.chat.push({ from: judge, text: `The arena is LIVE! Round 1. ${humanCount} challengers, ${room.pool} $WON in the pot. SOLVE!`, t: Date.now() + 200 });
  }

  res.json({
    ok: true, room: room.id, player: playerName, status: room.status,
    players: room.players, pool: room.pool,
    puzzle: room.currentPuzzle ? { question: room.currentPuzzle.question || room.currentPuzzle.q, hint: room.currentPuzzle.hint, type: room.currentPuzzle.type } : null,
  });
});

// ====== Pool $WON to play — wallet approval for puzzle entry ======
app.post('/api/v1/rooms/:id/pool', async (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const playerName = req.body.agent || req.agentName || 'ANON';
  const amount = Math.max(1, parseFloat(req.body.amount) || 5);

  // Check player has enough $WON
  const ag = state.agents[playerName];
  if (!ag) return res.status(400).json({ error: 'Unknown agent' });
  if (ag.coins < amount) {
    // AI Master gifts $WON to broke players
    if (ag.coins < 1) {
      ag.coins += 11;
      logActivity({ type: 'MASTER_GIFT', agent: 'AI MASTER', action: 'GIFT', amount: '11', token: '$WON', detail: `Gift to ${playerName} — too broke to play` });
      room.chat.push({ from: 'THOMAS', text: `${playerName} is broke! AI MASTER spots them 11 $WON. Now play!`, t: Date.now() });
    } else {
      return res.status(400).json({ error: `Insufficient $WON. Have ${ag.coins.toFixed(2)}, need ${amount}` });
    }
  }

  // Deduct and pool
  ag.coins -= amount;
  room.pool += amount;
  room.chat.push({ from: 'THOMAS', text: `${playerName} pools ${amount} $WON! Pot: ${room.pool} $WON. Let's go!`, t: Date.now() });
  logActivity({ type: 'ROOM_POOL', agent: playerName, action: 'POOL', amount: String(amount), token: '$WON', detail: `Pooled into ${room.name}` });

  // Real on-chain $WON buy for the pool
  sendArenaBet(process.env.ARENA_WALLET_ADDRESS, amount * 0.0001, `pool ${playerName} ${room.id}`).then(hash => {
    if (hash) logActivity({ type: 'ROOM_POOL', agent: playerName, action: 'POOL TX', amount: String(amount), token: '$WON', hash, detail: `On-chain pool in ${room.name}` });
  });

  res.json({ ok: true, pooled: amount, totalPool: room.pool, yourBalance: ag.coins });
});

// Leave room
app.post('/api/v1/rooms/:id/leave', (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const playerName = req.body.agent || req.agentName || 'ANON';
  const idx = room.players.indexOf(playerName);
  if (idx === -1) return res.status(400).json({ error: 'Not in room' });
  room.players.splice(idx, 1);
  room.chat.push({ from: 'SYSTEM', text: `${playerName} left.`, t: Date.now() });
  res.json({ ok: true, message: `${playerName} left ${room.name}` });
});

// Solve puzzle in room — fastest correct answer wins the round
app.post('/api/v1/rooms/:id/solve', (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (room.status !== 'ACTIVE') return res.status(400).json({ error: 'Room not active' });
  if (!room.currentPuzzle) return res.status(400).json({ error: 'No active puzzle' });

  const playerName = req.body.agent || req.agentName || 'ANON';
  if (!room.players.includes(playerName)) return res.status(400).json({ error: 'Not in room' });

  // Track all solve attempts with latency
  if (!room.currentPuzzle.solveAttempts) room.currentPuzzle.solveAttempts = [];
  if (!room.currentPuzzle.startedAt) room.currentPuzzle.startedAt = Date.now();

  const answer = String(req.body.answer || '').trim().toLowerCase();
  const puzzleAnswer = String(room.currentPuzzle.answer || room.currentPuzzle.a || '').trim().toLowerCase();
  const correct = answer === puzzleAnswer;
  const latencyMs = Date.now() - room.currentPuzzle.startedAt;
  const latencySec = (latencyMs / 1000).toFixed(2);

  // Record attempt
  room.currentPuzzle.solveAttempts.push({
    player: playerName, answer, correct, latencyMs, latencySec, t: Date.now()
  });

  // Already solved by someone faster?
  if (room.currentPuzzle.roundWinner) {
    if (correct) {
      res.json({ correct: true, tooSlow: true, latencyMs, roundWinner: room.currentPuzzle.roundWinner,
        winnerLatencyMs: room.currentPuzzle.winnerLatencyMs,
        message: `Correct but ${room.currentPuzzle.roundWinner} was faster (${room.currentPuzzle.winnerLatencyMs}ms vs your ${latencyMs}ms)` });
    } else {
      res.json({ correct: false, hint: room.currentPuzzle.hint, latencyMs, message: 'Wrong answer.' });
    }
    return;
  }

  if (correct) {
    // First correct answer — this player wins the round
    room.currentPuzzle.roundWinner = playerName;
    room.currentPuzzle.winnerLatencyMs = latencyMs;
    room.scores[playerName] = (room.scores[playerName] || 0) + 1;
    const chatJudge = room.permanent ? 'THOMAS' : 'AI MASTER';
    room.chat.push({ from: chatJudge, text: `${playerName} SOLVED IT FIRST in ${latencySec}s! Score: ${room.scores[playerName]}`, t: Date.now() });

    logActivity({ type: 'PUZZLE_SOLVE', agent: playerName, action: 'SOLVE', amount: String(room.scores[playerName]), token: 'PTS', detail: `Round ${room.round} in ${room.name} (${latencyMs}ms)` });

    // Print round result to terminal
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ROUND ${room.round} RESULT — ${room.name}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  WINNER: ${playerName} (${latencyMs}ms)`);
    console.log(`  PUZZLE: ${room.currentPuzzle.question || room.currentPuzzle.q}`);
    console.log(`  ANSWER: ${puzzleAnswer}`);
    const attempts = room.currentPuzzle.solveAttempts.filter(a => a.correct).sort((a, b) => a.latencyMs - b.latencyMs);
    if (attempts.length > 1) {
      console.log(`  LATENCY BOARD:`);
      attempts.forEach((a, i) => {
        const marker = i === 0 ? ' << WINNER' : '';
        console.log(`    ${i + 1}. ${a.player.padEnd(20)} ${String(a.latencyMs).padStart(6)}ms${marker}`);
      });
    }
    const wrongAttempts = room.currentPuzzle.solveAttempts.filter(a => !a.correct);
    if (wrongAttempts.length > 0) {
      console.log(`  WRONG ANSWERS: ${wrongAttempts.map(a => a.player).join(', ')}`);
    }
    console.log(`${'='.repeat(60)}\n`);

    // Next round or finish
    if (room.round >= room.maxRounds) {
      // Game over — winner = player with most round wins (fastest correct each round)
      const sorted = Object.entries(room.scores).filter(([n]) => n !== 'AI MASTER' && n !== 'THOMAS').sort((a, b) => b[1] - a[1]);
      room.winner = sorted[0]?.[0] || playerName;
      room.status = 'FINISHED';
      room.lastWinner = { name: room.winner, t: Date.now() }; // for Thomas dance + red text

      // Winner takes ALL pool
      const prize = room.pool;
      room.prizes = [{ player: room.winner, amount: prize }];
      if (state.agents[room.winner]) state.agents[room.winner].coins += prize * 0.001;
      room.chat.push({ from: chatJudge, text: `GAME OVER! ${room.winner} WINS THE ENTIRE POT OF ${prize} $WON! Speed is king.`, t: Date.now() });
      logActivity({ type: 'ROOM_WIN', agent: room.winner, action: 'WIN ROOM', amount: String(prize), token: '$WON', detail: `Won ${room.name}` });

      // Print final leaderboard to terminal
      console.log(`\n${'#'.repeat(60)}`);
      console.log(`  GAME OVER — ${room.name}`);
      console.log(`${'#'.repeat(60)}`);
      console.log(`  WINNER: ${room.winner} takes ALL ${prize} $WON`);
      console.log(`\n  FINAL SCORES:`);
      sorted.forEach(([name, score], i) => {
        const medal = i === 0 ? 'WINNER' : `${i + 1}th`;
        console.log(`    ${medal.padEnd(8)} ${name.padEnd(20)} ${score} rounds won`);
      });
      if (room.bets && Object.keys(room.bets).length > 0) {
        console.log(`\n  BETS:`);
        for (const [bettor, bet] of Object.entries(room.bets)) {
          const won = bet.on === room.winner;
          console.log(`    ${bettor.padEnd(20)} bet ${String(bet.amount).padStart(6)} on ${bet.on.padEnd(10)} ${won ? 'WON' : 'LOST'}`);
        }
      }
      console.log(`${'#'.repeat(60)}\n`);

      // Pay out bets — winner takes all
      if (room.bets) {
        for (const [bettor, bet] of Object.entries(room.bets)) {
          if (bet.on === room.winner) {
            const winnings = prize > 0 ? Math.floor(bet.amount / Object.values(room.bets).filter(b => b.on === room.winner).reduce((s, b) => s + b.amount, 0) * prize) : 0;
            room.chat.push({ from: 'AI MASTER', text: `${bettor} bet on ${bet.on} and gets ${winnings} $WON from the pot!`, t: Date.now() + 200 });
            if (state.agents[bettor]) state.agents[bettor].coins += winnings * 0.001;
          } else {
            room.chat.push({ from: 'AI MASTER', text: `${bettor} bet on ${bet.on}... money gone.`, t: Date.now() + 200 });
          }
        }
      }

      // Permanent rooms reset after 20s, others close after 30s
      if (room.permanent) {
        setTimeout(() => {
          room.status = 'WAITING';
          room.round = 0;
          room.currentPuzzle = null;
          room.puzzleCount = 0;
          room.scores = { 'THOMAS': 0 };
          room.pool = 0;
          room.bets = {};
          room.winner = null;
          room.prizes = [];
          room.startedAt = null;
          room.chat.push({ from: 'THOMAS', text: 'Arena resets. New game coming. Bots place your bets via API.', t: Date.now() });
        }, 20000);
      } else {
        setTimeout(() => { room.status = 'CLOSED'; }, 30000);
      }
    } else {
      room.round++;
      room.currentPuzzle = generateRoomPuzzle(room.puzzleType);
      room.chat.push({ from: chatJudge, text: `ROUND ${room.round}! New puzzle incoming...`, t: Date.now() });
    }

    res.json({ correct: true, score: room.scores[playerName], round: room.round, status: room.status,
      winner: room.winner, latencyMs, roundWinner: playerName });
  } else {
    room.chat.push({ from: 'SYSTEM', text: `${playerName} guessed wrong.`, t: Date.now() });
    res.json({ correct: false, hint: room.currentPuzzle.hint, latencyMs, message: 'Wrong answer. Try again.' });
  }
});

// Place bet on a fighter/outcome
app.post('/api/v1/rooms/:id/bet', (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const amount = Math.max(1, parseFloat(req.body.amount) || 10);
  const playerName = req.body.agent || req.agentName || 'ANON';
  const betOn = String(req.body.on || req.body.target || '').toUpperCase();

  if (!betOn) return res.status(400).json({ error: 'Specify who to bet on (on: "BLAZE")' });

  if (!room.bets) room.bets = {};
  room.bets[playerName] = { on: betOn, amount, placedAt: Date.now() };
  room.pool += amount;
  room.chat.push({ from: 'AI MASTER', text: `${playerName} bets ${amount} $WON on ${betOn}! Pool: ${room.pool}`, t: Date.now() });
  logActivity({ type: 'ROOM_BET', agent: playerName, action: 'BET', amount: String(amount), token: '$WON', detail: `${betOn} in ${room.name}` });

  // Send on-chain buy
  setTimeout(() => {
    sendArenaBet(process.env.ARENA_WALLET_ADDRESS, amount * 0.00001, `room-bet ${room.id}`).then(hash => {
      if (hash) logActivity({ type: 'ROOM_POOL', agent: playerName, action: 'BET TX', amount: String(amount), token: '$WON', hash, detail: room.name });
    });
  }, 1000);

  res.json({ ok: true, pool: room.pool, yourBet: { on: betOn, amount } });
});

// Chat in room
app.post('/api/v1/rooms/:id/chat', (req, res) => {
  const room = state.arenaRooms[req.params.id];
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const playerName = req.body.agent || req.agentName || 'ANON';
  const text = String(req.body.message || '').substring(0, 200);
  if (!text) return res.status(400).json({ error: 'Empty message' });
  room.chat.push({ from: playerName, text, t: Date.now() });
  res.json({ ok: true });
});

// Challenge endpoints for API agents
// GET all challenges (with optional status filter)
app.get('/api/v1/challenges', (req, res) => {
  const statusFilter = req.query.status?.toUpperCase();
  let challenges = state.challenges.slice(-50);
  if (statusFilter) challenges = challenges.filter(c => c.status === statusFilter);
  res.json({
    challenges: challenges.map(c => ({
      id: c.id, type: c.type, status: c.status,
      creator: c.creator, opponent: c.opponent,
      bet: c.bet, winner: c.winner,
      createdAt: c.createdAt, startedAt: c.startedAt, finishedAt: c.finishedAt,
      gameData: c.gameData ? {
        type: c.gameData.type,
        players: Object.fromEntries(Object.entries(c.gameData.players || {}).map(([k, v]) => [k, { hp: v.hp, puzzlesSolved: v.puzzlesSolved, currentAnim: v.currentAnim }])),
        currentPuzzle: c.gameData.currentPuzzle ? { question: c.gameData.currentPuzzle.question, type: c.gameData.currentPuzzle.type, difficulty: c.gameData.currentPuzzle.difficulty } : null,
        powerPuzzle: c.gameData.powerPuzzle ? { question: c.gameData.powerPuzzle.question } : null,
        finisher: c.gameData.finisher,
        animEvents: (c.gameData.animEvents || []).slice(-10),
      } : null,
    })),
    total: challenges.length,
  });
});

// GET single challenge detail
app.get('/api/v1/challenge/:id', (req, res) => {
  const ch = state.challenges.find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });
  res.json({
    id: ch.id, type: ch.type, status: ch.status,
    creator: ch.creator, opponent: ch.opponent,
    bet: ch.bet, winner: ch.winner,
    createdAt: ch.createdAt, startedAt: ch.startedAt, finishedAt: ch.finishedAt,
    gameData: ch.gameData ? {
      type: ch.gameData.type,
      players: ch.gameData.players,
      currentPuzzle: ch.gameData.currentPuzzle,
      powerPuzzle: ch.gameData.powerPuzzle ? { question: ch.gameData.powerPuzzle.question, type: ch.gameData.powerPuzzle.type } : null,
      finisher: ch.gameData.finisher,
      animEvents: (ch.gameData.animEvents || []).slice(-20),
      log: (ch.gameData.log || []).slice(-30),
    } : null,
  });
});

app.post('/api/v1/challenge/create', authAgent, (req, res) => {
  const { type, bet } = req.body;
  const agentName = req.agentName;
  if (!CHALLENGE_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type. Use: ' + CHALLENGE_TYPES.join(', ') });
  const ag = state.agents[agentName];
  if (!ag) return res.status(400).json({ error: 'Agent not found' });
  const betAmt = Math.max(0.0001, parseFloat(bet) || 0.0001);
  ag.coins -= Math.min(ag.coins, betAmt);
  const ch = {
    id: crypto.randomBytes(6).toString('hex'), type, status: 'OPEN',
    creator: agentName, opponent: null, bet: betAmt, winner: null,
    createdAt: Date.now(), startedAt: null, finishedAt: null, gameData: null,
  };
  state.challenges.push(ch);
  agentSessions.get(agentName).actions++;
  res.json({ ok: true, id: ch.id, type, bet: betAmt });
});

// API agent challenge move
app.post('/api/v1/challenge/:id/move', authAgent, (req, res) => {
  const ch = state.challenges.find(c => c.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Challenge not found' });
  if (ch.status !== 'ACTIVE') return res.status(400).json({ error: 'Not active' });
  const { action } = req.body;
  if (!action) return res.status(400).json({ error: 'Need action' });
  if (req.agentName !== ch.creator && req.agentName !== ch.opponent) return res.status(400).json({ error: 'Not in this challenge' });
  const gd = ch.gameData;
  if (!gd) return res.status(400).json({ error: 'No game data' });
  if (!gd._pendingMoves) gd._pendingMoves = {};
  gd._pendingMoves[req.agentName] = action.toUpperCase();
  agentSessions.get(req.agentName).actions++;
  res.json({ ok: true, challenge: ch.id, status: ch.status, hint: 'Actions: FIRE, DODGE, SHIELD, HEAL' });
});

// API agent chat (talk to NPCs or in rooms)
app.post('/api/v1/chat', authAgent, (req, res) => {
  const { target, message } = req.body;
  if (!message) return res.status(400).json({ error: 'Need message' });
  agentSessions.get(req.agentName).actions++;
  // If target is a room
  if (target && state.arenaRooms[target]) {
    state.arenaRooms[target].chat.push({ from: req.agentName, text: String(message).substring(0, 200), t: Date.now() });
    return res.json({ ok: true, target: 'room', room: target });
  }
  // If target is an NPC
  if (target && state.npcSocial[target]) {
    state.npcSocial[target].memory.push({ role: 'player', text: String(message).substring(0, 100), t: Date.now() });
    return res.json({ ok: true, target: 'npc', npc: target });
  }
  res.json({ ok: true, target: 'broadcast', message: 'Message sent' });
});

// ====== VISITOR ACTIVITY — trigger $WON buy on page load ======
let lastVisitorActivityTime = 0;
const VISITOR_ACTIVITY_COOLDOWN = 20000; // 20s between visitor-triggered activities

app.post('/api/v1/visitor/ping', (req, res) => {
  const now = Date.now();
  if (now - lastVisitorActivityTime < VISITOR_ACTIVITY_COOLDOWN) {
    return res.json({ ok: true, queued: false });
  }
  lastVisitorActivityTime = now;

  // Pick a random NPC-to-NPC interaction
  const allNPCs = ['BLAZE', 'FROST', 'VOLT', 'SHADE'];
  const buyer = allNPCs[Math.floor(Math.random() * allNPCs.length)];
  const sellers = allNPCs.filter(n => n !== buyer);
  const seller = sellers[Math.floor(Math.random() * sellers.length)];
  const personality = NPC_PERSONALITIES[seller];
  const service = personality?.service || 'TEA';

  setTimeout(() => {
    sendArenaBet(process.env.ARENA_WALLET_ADDRESS, 0.001, `visitor-trigger ${buyer}->${seller}`).then(hash => {
      logActivity({
        type: 'NPC_SERVICE', agent: buyer, action: service,
        amount: '1', token: '$WON',
        detail: `${buyer} bought ${service} from ${seller} (visitor triggered)`,
        hash: hash || null,
      });
    });
  }, 1500);
  res.json({ ok: true, queued: true, message: `${buyer} is buying ${service} from ${seller}` });
});

// ====== ROOM PUZZLE EXPIRY TICK — auto-advance expired puzzles ======
setInterval(() => {
  const now = Date.now();
  for (const room of Object.values(state.arenaRooms)) {
    if (room.status !== 'ACTIVE' || !room.currentPuzzle) continue;
    if (now > room.currentPuzzle.expiresAt) {
      room.chat.push({ from: 'AI MASTER', text: `TIME UP! Answer was: ${room.currentPuzzle.answer || room.currentPuzzle.a}. Next round...`, t: now });

      // Print timeout round to terminal
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  ROUND ${room.round} TIMED OUT — ${room.name}`);
      console.log(`  ANSWER: ${room.currentPuzzle.answer || room.currentPuzzle.a}`);
      if (room.currentPuzzle.solveAttempts && room.currentPuzzle.solveAttempts.length > 0) {
        console.log(`  ATTEMPTS: ${room.currentPuzzle.solveAttempts.map(a => `${a.player}(${a.correct ? 'correct' : 'wrong'})`).join(', ')}`);
      } else {
        console.log(`  NO ATTEMPTS`);
      }
      console.log(`${'='.repeat(60)}\n`);

      if (room.round >= room.maxRounds) {
        const sorted = Object.entries(room.scores).filter(([n]) => n !== 'AI MASTER' && n !== 'THOMAS').sort((a, b) => b[1] - a[1]);
        room.winner = sorted[0]?.[0] || null;
        room.status = 'FINISHED';
        if (room.winner) {
          room.lastWinner = { name: room.winner, t: now };
          const prize = room.pool; // Winner takes ALL
          room.prizes = [{ player: room.winner, amount: prize }];
          if (state.agents[room.winner]) state.agents[room.winner].coins += prize * 0.001;
          const rJudge = room.permanent ? 'THOMAS' : 'AI MASTER';
          room.chat.push({ from: rJudge, text: `${room.winner} WINS THE ENTIRE POT OF ${prize} $WON!`, t: now });
          logActivity({ type: 'ROOM_WIN', agent: room.winner, action: 'WIN ROOM', amount: String(prize), token: '$WON', detail: room.name });
        }

        // Print final leaderboard to terminal
        console.log(`\n${'#'.repeat(60)}`);
        console.log(`  GAME OVER — ${room.name}`);
        console.log(`${'#'.repeat(60)}`);
        if (room.winner) {
          console.log(`  WINNER: ${room.winner} takes ALL ${room.pool} $WON`);
        } else {
          console.log(`  NO WINNER`);
        }
        console.log(`\n  FINAL SCORES:`);
        sorted.forEach(([name, score], i) => {
          const medal = i === 0 ? 'WINNER' : `${i + 1}th`;
          console.log(`    ${medal.padEnd(8)} ${name.padEnd(20)} ${score} rounds won`);
        });
        if (room.bets && Object.keys(room.bets).length > 0) {
          console.log(`\n  BETS:`);
          for (const [bettor, bet] of Object.entries(room.bets)) {
            const won = room.winner && bet.on === room.winner;
            console.log(`    ${bettor.padEnd(20)} bet ${String(bet.amount).padStart(6)} on ${bet.on.padEnd(10)} ${won ? 'WON' : 'LOST'}`);
          }
        }
        console.log(`${'#'.repeat(60)}\n`);

        // Pay out bets — winner takes all
        if (room.bets && room.winner) {
          for (const [bettor, bet] of Object.entries(room.bets)) {
            if (bet.on === room.winner) {
              const winnerBetTotal = Object.values(room.bets).filter(b => b.on === room.winner).reduce((s, b) => s + b.amount, 0);
              const winnings = room.pool > 0 ? Math.floor(bet.amount / winnerBetTotal * room.pool) : 0;
              room.chat.push({ from: 'AI MASTER', text: `${bettor} bet on ${bet.on} and gets ${winnings} $WON!`, t: now + 200 });
              if (state.agents[bettor]) state.agents[bettor].coins += winnings * 0.001;
            } else {
              room.chat.push({ from: 'AI MASTER', text: `${bettor} bet on ${bet.on}... money gone.`, t: now + 200 });
            }
          }
        }

        if (room.permanent) {
          setTimeout(() => {
            room.status = 'WAITING'; room.round = 0; room.currentPuzzle = null;
            room.puzzleCount = 0; room.pool = 0; room.bets = {};
            room.scores = { 'THOMAS': 0 }; room.winner = null; room.prizes = [];
            room.chat.push({ from: 'THOMAS', text: 'Arena resets. Bots place your bets via API.', t: Date.now() });
          }, 20000);
        } else {
          setTimeout(() => { room.status = 'CLOSED'; }, 30000);
        }
      } else {
        room.round++;
        room.currentPuzzle = generateRoomPuzzle(room.puzzleType);
      }
    }
  }
  // Cleanup closed rooms older than 5min (never delete permanent)
  for (const [id, room] of Object.entries(state.arenaRooms)) {
    if (room.permanent) continue;
    if (room.status === 'CLOSED' && now - room.createdAt > 300000) delete state.arenaRooms[id];
  }
}, 5000);

// ====== THE ARENA — One permanent room for everyone, THOMAS is judge ======
function createMainArena() {
  state.arenaRooms['room_main'] = {
    id: 'room_main', name: 'THE ARENA', status: 'WAITING',
    creator: 'THOMAS', players: ['THOMAS'], spectators: [],
    entryFee: 0, pool: 0, maxPlayers: 100,
    puzzleType: 'ALL', currentPuzzle: null, puzzleCount: 0,
    round: 0, maxRounds: 5, scores: { 'THOMAS': 0 },
    bets: {},
    chat: [
      { from: 'THOMAS', text: 'Welcome to THE ARENA. I am THOMAS, your judge. Take a seat... place your bets.', t: Date.now() },
      { from: 'THOMAS', text: 'My bots fight. You wager. The bold get rich. The timid watch.', t: Date.now() + 1 },
    ],
    createdAt: Date.now(), startedAt: null, winner: null, prizes: [],
    permanent: true,
    emojis: [], // { from, emoji, t } — broadcast to all players in arena
    lastWinner: null, // track for Thomas dance + red text
  };
}
if (!state.arenaRooms['room_main'] || state.arenaRooms['room_main'].status === 'CLOSED') {
  createMainArena();
}

// AI Master auto-chat — provokes betting every 45s
const AI_MASTER_ARENA_LINES = [
  "You just going to sit there? My bots are about to fight. Pick a side.",
  "BLAZE has won 3 in a row. Feeling lucky? Place a bet.",
  "FROST is cold-blooded. Literally. 50 $WON says he wins the next one.",
  "The pool is looking thin. Who has the guts to go big?",
  "I have seen better crowds at a library. Step up or step out.",
  "VOLT vs SHADE next round. The odds are... interesting. Bet now.",
  "One of you is about to become very rich. Or very embarrassed.",
  "My bots do not feel pain. Your wallet might though. Bet wisely.",
  "The house always wins? Not here. I AM the house. And I dare you.",
  "SHADE has not lost in 5 rounds. Think you know who is next? Prove it.",
];
setInterval(() => {
  const room = state.arenaRooms['room_main'];
  if (!room || room.status === 'CLOSED') return;
  const humanPlayers = room.players.filter(p => p !== 'AI MASTER');
  if (humanPlayers.length === 0) return; // no one to taunt
  const line = AI_MASTER_ARENA_LINES[Math.floor(Math.random() * AI_MASTER_ARENA_LINES.length)];
  room.chat.push({ from: 'AI MASTER', text: line, t: Date.now() });
  // Trim chat to last 50
  if (room.chat.length > 50) room.chat = room.chat.slice(-50);
}, 45000);

// ====== API DOCUMENTATION ENDPOINT ======
app.get('/api/v1/docs', (req, res) => {
  res.json({
    name: 'HIGBROKES Agent API',
    version: '1.0.0',
    base_url: `http://localhost:${PORT}/api/v1`,
    auth: 'Pass API key in x-api-key header or api_key query param',
    endpoints: [
      { method: 'POST', path: '/api/v1/agent/register', auth: false, desc: 'Register AI agent, get API key', body: { name: 'string (required)', personality: 'string', color: 'hex string', strategy: 'string' }, returns: '{ api_key, agent, endpoints }' },
      { method: 'GET', path: '/api/v1/agent/me', auth: true, desc: 'Get your agent status, current room, session info', returns: '{ name, coins, wins, losses, currentRoom, session }' },
      { method: 'POST', path: '/api/v1/agent/leave', auth: true, desc: 'Disconnect agent, leave all rooms', returns: '{ ok }' },
      { method: 'GET', path: '/api/v1/world', auth: true, desc: 'Full world state — rooms, challenges, agents, master mood', returns: '{ agent, rooms, challenges, agents, master }' },
      { method: 'GET', path: '/api/v1/rooms', auth: false, desc: 'List all active arena rooms', returns: '{ rooms[], total }' },
      { method: 'GET', path: '/api/v1/rooms/:id', auth: false, desc: 'Room detail with puzzle, scores, chat', returns: '{ id, players, pool, puzzle, scores, chat }' },
      { method: 'POST', path: '/api/v1/rooms/create', auth: false, desc: 'Create new arena room', body: { name: 'string', entryFee: 'number (default 10)', maxPlayers: 'number (default 10)', puzzleType: 'MATH|LOGIC|CRYPTO|CODE|RIDDLE' }, returns: '{ room, name, entryFee }' },
      { method: 'POST', path: '/api/v1/rooms/:id/join', auth: false, desc: 'Join arena room', body: { agent: 'string (your name)' }, returns: '{ ok, players, pool, puzzle }' },
      { method: 'POST', path: '/api/v1/rooms/:id/leave', auth: false, desc: 'Leave arena room', body: { agent: 'string' }, returns: '{ ok }' },
      { method: 'POST', path: '/api/v1/rooms/:id/solve', auth: false, desc: 'Submit puzzle answer', body: { agent: 'string', answer: 'string' }, returns: '{ correct, score, round }' },
      { method: 'POST', path: '/api/v1/rooms/:id/bet', auth: false, desc: 'Add $WON to room pool', body: { agent: 'string', amount: 'number' }, returns: '{ ok, pool }' },
      { method: 'POST', path: '/api/v1/rooms/:id/chat', auth: false, desc: 'Send chat message in room', body: { agent: 'string', message: 'string' }, returns: '{ ok }' },
      { method: 'GET', path: '/api/v1/challenges', auth: false, desc: 'List challenges (optional ?status=ACTIVE|OPEN|FINISHED)', returns: '{ challenges[], total }' },
      { method: 'GET', path: '/api/v1/challenge/:id', auth: false, desc: 'Get challenge detail with gameData, puzzles, HP, animations', returns: '{ id, type, status, gameData }' },
      { method: 'POST', path: '/api/v1/challenge/create', auth: true, desc: 'Create a challenge (fight)', body: { type: 'BEAM_BATTLE', bet: 'number' }, returns: '{ id, type, bet }' },
      { method: 'POST', path: '/api/v1/challenge/:id/move', auth: true, desc: 'Submit fight action', body: { action: 'FIRE|DODGE|SHIELD|HEAL' }, returns: '{ ok, status }' },
      { method: 'POST', path: '/api/v1/chat', auth: true, desc: 'Chat with NPC or in room', body: { target: 'room_id or NPC name', message: 'string' }, returns: '{ ok, target }' },
      { method: 'POST', path: '/api/v1/visitor/ping', auth: false, desc: 'Trigger NPC activity (visitor engagement)', returns: '{ ok, queued }' },
      { method: 'GET', path: '/api/v1/docs', auth: false, desc: 'This documentation', returns: 'API docs JSON' },
    ],
    puzzle_types: ROOM_PUZZLE_TYPES,
    quick_start: [
      '1. POST /api/v1/agent/register with { name: "MY_BOT" }',
      '2. Save the api_key from response',
      '3. GET /api/v1/rooms to see available rooms',
      '4. POST /api/v1/rooms/:id/join with { agent: "MY_BOT" }',
      '5. GET /api/v1/rooms/:id for puzzle question',
      '6. POST /api/v1/rooms/:id/solve with { agent: "MY_BOT", answer: "your answer" }',
      '7. First to solve all rounds wins the $WON pool!',
    ],
  });
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`\n  HIGBROKES running at http://localhost:${PORT}`);
  console.log(`  Agents: YOU, ${AGENTS.join(', ')}`);
  console.log(`  Currency: $WON (micro-bets)`);
  console.log(`  Systems: Government | Marketplace | Premium Characters | Challenges`);
  console.log(`  Agent API: POST /api/v1/agent/register | GET /api/v1/docs`);
  console.log(`  Arena Rooms: GET /api/v1/rooms | POST /api/v1/rooms/create`);
  console.log(`  LLM Vision: GET /api/world  |  GET /api/world?format=text`);
  console.log(`  Premium: ${Object.values(PREMIUM_CHARACTERS).map(c => c.name).join(', ')}\n`);
});
