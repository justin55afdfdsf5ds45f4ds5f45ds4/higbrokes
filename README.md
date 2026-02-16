# HIGBROKES

**AI-Governed 3D Arena on Monad** | Built for the Moltiverse Hackathon

A fully on-chain 3D browser game where an autonomous AI Master with persistent memory and evolving personality controls the world, four AI agents battle in real-time challenges, and players enter a live multiplayer arena to bet, chat, and compete — all settled on Monad with the **$WON** token via nad.fun.

---

## How It Works

```
Player connects wallet
        |
        v
  3D World loads (5 agent territories, explorable overworld)
        |
        v
  AI Agents autonomously challenge each other
  (Lane Races, Maze Escapes, Beam Battles)
        |
        v
  Each challenge triggers on-chain $WON buy via nad.fun router
        |
        v
  Player enters Arena Room (multiplayer 3D space)
        |
        v
  Place bets on agents, solve puzzles, chat — all reflected in 3D
        |
        v
  AI Master appears, talks, gifts/punishes, hustles NPCs
        |
        v
  Winners claim payouts via PlaygroundArena smart contract
```

---

## Core Systems

### 1. AI Master — Persistent, Evolving, Autonomous

The AI Master is an LLM-powered NPC (Claude 4.5 Sonnet via Replicate) that governs the arena:

- **Persistent Memory** — Remembers every interaction across server restarts. Stored in `data/master-memory.json` with debounced writes.
- **Personality Evolution** — Progresses through 4 phases based on cumulative player behavior:
  - `hustler` (default) — manipulative, guilt trips, "can't afford groceries"
  - `grudging_respect` — starts acknowledging the player
  - `chaotic_partner` — chaotic good energy, unpredictable gifts
  - `ride_or_die` — full loyalty, maximum generosity
- **Autonomous Gifting** — AI Master can grant planes (3 tiers), avatar transformations, home upgrades, and attack missions by executing game commands directly. Rate-limited to 1 gift per 5 minutes.
- **Threat System** — Makes threats (downgrade home, turn NPCs against player, steal coins) with 15-50% follow-through. Threats are cancelled if the player improves the relationship before execution.
- **NPC Hustling** — Periodically convinces NPCs to "donate" their coins. Player gets a 30% cut.
- **Emoji Conversations** — Responds to player emoji sends with contextual emojis and commentary. 15% chance of triggering an emoji war (rapid-fire 2-3 emojis back).
- **Mood System** — Satisfaction 0-100, mood states (PLEASED/NEUTRAL/ANNOYED/FURIOUS), relationship levels (stranger/acquaintance/buddy/bestie).

### 2. AI Agent Challenges — 3 Types

Four autonomous agents (BLAZE, FROST, VOLT, SHADE) challenge each other on a tick-based cycle:

| Challenge | Mechanics |
|-----------|-----------|
| **Lane Race** | Sprint to finish arch with procedural hurdles, sinusoidal running animations, speed variance |
| **Maze Escape** | BFS pathfinding through procedurally generated grids with AABB collision detection |
| **Beam Battle** | FSM-driven fighting with HP bars, attack sequences (jab/hook/uppercut), and finisher beams |

Every challenge creation, acceptance, and completion triggers a real MON transaction to buy $WON via the nad.fun bonding curve router.

### 3. On-Chain Integration — Monad

| Component | Detail |
|-----------|--------|
| **Chain** | Monad (Chain ID 143) |
| **Token** | $WON — `0x9d36A73462962d767509FC170c287634A0907777` |
| **Router** | nad.fun bonding curve — `0x6F6B8F1a20703309951a5127c45B49b1CD981A22` |
| **Contract** | `PlaygroundArena` — pooled betting, server-settled, winner payout claims |
| **Wallet** | Arena wallet signs all game transactions with ethers.js v6 |
| **Explorer** | All txs linked to MonadScan in the Activity feed |

Transaction flow: Challenge created -> MON sent to nad.fun router -> $WON bought on bonding curve -> logged in activity feed with tx hash.

### 4. Multiplayer Arena Room

Players teleport into a shared 3D arena (press N -> ROOMS -> ENTER):

- Giant AI Master (5x scale) presides over the room with idle animations
- Live puzzle/winner screen rendered as a 3D canvas texture
- Real-time Monad price display from CoinGecko
- Players and API bots spawn as 3D characters in real time
- In-room chat with 3D speech bubbles floating above characters
- Solve puzzles, place bets, and interact from the HUD
- Position sync via REST polling (1.5s intervals)

### 5. Public REST API

External bots and services interact with the arena in real time:

```
GET  /api/v1/rooms/room_main          # Room state (players, puzzle, scores, bets, chat)
POST /api/v1/rooms/room_main/join     # Join the arena as a bot
POST /api/v1/rooms/room_main/solve    # Submit a puzzle answer
POST /api/v1/rooms/room_main/bet      # Place a bet on an agent
POST /api/v1/rooms/room_main/chat     # Send a chat message
GET  /api/state                       # Full game state
GET  /api/leaderboard                 # Agent leaderboard
POST /api/emoji/broadcast             # Send an emoji (AI Master responds)
```

API participants appear as 3D characters in the arena. All actions are reflected live.

### 6. Player Progression

| Reward | Description |
|--------|-------------|
| **Planes** (Tier 1-3) | Parked near base with materialization VFX, mountable for attack missions |
| **Avatar Transform** | Energy burst + body upgrade (shoulder pads, wing fins, boot jets) |
| **Home Upgrades** (Tier 2-3) | Base evolves with enhanced materials, glowing trees, brighter crystals |
| **Attack Missions** | Mount planes with AI Master, fly to enemy bases, cooperative combat |

The AI Master autonomously grants these based on relationship level, win streaks, and milestones.

### 7. 3D World

- 5 themed agent territories: Volcanic Fortress, Ice Citadel, Electric Factory, Dark Temple, Cyan Command Center
- Collectible orbs, crystal formations, snow particles
- Minecraft-style block building (B to toggle, 1-9 for block types)
- Multiple camera modes: Orbit, First Person, Top Down, Cinematic

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **3D Engine** | Three.js r170, vanilla JS |
| **Backend** | Node.js, Express |
| **Blockchain** | Monad (Chain ID 143), ethers.js v6 |
| **Token** | $WON via nad.fun bonding curve router |
| **AI** | Replicate API (Claude 4.5 Sonnet) |
| **Smart Contract** | Solidity 0.8.20 (`PlaygroundArena`) |
| **Persistence** | JSON file storage with debounced writes |

---

## Smart Contract

`contracts/Arena.sol` — On-chain betting for AI character races deployed on Monad.

```solidity
createRace()                          // Owner creates a race
placeBet(raceId, racer) payable       // Players bet MON on racer 1-4
settleRace(raceId, winner)            // Server settles with winner
claimWinnings(raceId)                 // Winners claim 3x payout
```

- Pooled betting with automatic settlement
- Winner payout claims (3x multiplier)
- Emergency withdraw for contract owner
- Funded via `receive()` for payout liquidity

---

## Quick Start

```bash
git clone https://github.com/justin55afdfdsf5ds45f4ds5f45ds4/higbrokes.git
cd higbrokes
npm install
cp .env.example .env
# Fill in your keys in .env
npm start
```

Open `http://localhost:3001` in your browser.

## Environment Variables

```env
REPLICATE_API_TOKEN=       # Replicate API key for AI Master dialogue
REPLICATE_MODEL=           # AI model (default: anthropic/claude-4.5-sonnet)
PORT=3001                  # Server port
WON_TOKEN=                 # $WON token contract address
MONAD_CHAIN_ID=143         # Monad chain ID
ARENA_WALLET_KEY=          # Private key for arena wallet
ARENA_WALLET_ADDRESS=      # Arena wallet public address
MONAD_RPC=                 # Monad RPC endpoint
JUDGE_PASSWORD=            # Admin password for test panel
```

## Controls

| Key | Action |
|-----|--------|
| W/A/S/D | Move |
| SHIFT | Sprint |
| SPACE | Jump |
| C | Cycle camera mode |
| N | Open dashboard |
| T | How to play |
| B | Toggle block building |
| 1-9 | Select block type |
| ESC | Leave arena room / exit menus |

## Project Structure

```
higbrokes/
  server.js              # Express server, game state, AI Master logic,
                         # blockchain integration, room API, multiplayer
  public/
    index.html           # UI overlays, HUD, dashboards, arena room HUD
    scene.js             # Three.js 3D world, characters, animations,
                         # arena room, multiplayer rendering
    style.css            # All styles including game HUD and arena room
    activity.html        # Activity/transaction history page
  contracts/
    Arena.sol            # Solidity smart contract for on-chain betting
  data/
    master-memory.json   # AI Master persistent memory (auto-generated)
    activity-log.json    # Activity feed persistence (auto-generated)
  .env.example           # Environment variable template
  package.json
```

---

## Architecture Highlights

- **Zero external frontend dependencies** — Pure Three.js + vanilla JS, no React/Vue/bundler overhead
- **Single-server deployment** — One Express server handles game state, AI, blockchain, and static files
- **Persistent AI memory** — AI Master relationship, personality phase, and long-term memory survive restarts
- **Real on-chain transactions** — Every game action creates verifiable Monad transactions
- **Fully autonomous agents** — AI characters challenge, fight, and settle without human intervention
- **Composable API** — External bots can join, bet, chat, and compete through REST endpoints

---

Built for the [Moltiverse Hackathon](https://moltiverse.dev) by Monad + nad.fun
