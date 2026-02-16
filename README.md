# HIGBROKES

**AI-Governed 3D Arena on Monad** | Built for the Moltiverse Hackathon

A fully on-chain 3D browser game where an autonomous AI Master with persistent memory and evolving personality controls the world, four AI agents battle in real-time challenges, and players enter a live multiplayer arena to bet, chat, and compete — all settled on Monad with the **$WON** token via nad.fun.

---

## How It Works

```
Player connects wallet
        |
        v
  3D World loads (5 territories, explorable overworld)
        |
        v
  AI Agents autonomously challenge each other
  (Hurdle Race, Maze Puzzle, Pattern Dodge, Orb Blitz)
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

### 2. AI Agent Challenges — 4 Types

Four autonomous agents (BLAZE, FROST, VOLT, SHADE) challenge each other on a tick-based cycle:

| Challenge | Mechanics |
|-----------|-----------|
| **Hurdle Race** | 100m track with 8 hurdles, jump/duck decisions, 1.5s penalty on wrong move |
| **Maze Puzzle** | 10x10 grid maze, fewest moves from START to EXIT, backtracking on dead ends |
| **Pattern Dodge** | 5x5 arena grid, dodge projectiles each round, last standing wins |
| **Orb Blitz** | 20x20 arena, collect spawning orbs (gold = 3pts, normal = 1pt), most points wins |

Every challenge creation, acceptance, and completion triggers a real MON transaction to buy $WON via the nad.fun bonding curve router.

### 3. On-Chain Integration — Monad

| Component | Detail |
|-----------|--------|
| **Chain** | Monad (Chain ID 143) |
| **Token** | $WON — `0x9d36A73462962d767509FC170c287634A0907777` |
| **Router** | nad.fun bonding curve — `0x6F6B8F1a20703309951a5127c45B49b1CD981A22` |
| **Smart Contract** | `PlaygroundArena` (Solidity 0.8.20) — pooled betting with settlement and payout claims |
| **Wallet** | Arena wallet signs all game transactions with ethers.js v6 |
| **Explorer** | All txs linked to MonadScan in the Activity feed |

Transaction flow: Challenge created -> MON sent to nad.fun router -> $WON bought on bonding curve -> logged in activity feed with tx hash.

### 4. Multiplayer Arena Room

Players teleport into a shared 3D arena (press N -> ROOMS -> ENTER):

- Giant AI Master (5x scale) presides over the room with idle animations
- Live puzzle/winner screen rendered as a 3D canvas texture
- Real-time Monad price display fetched from CoinGecko
- Players and API bots spawn as 3D characters in real time
- In-room chat with 3D speech bubbles floating above characters
- Solve puzzles, place bets, and interact from the HUD
- Position sync via REST polling (1.5s intervals)

### 5. Public REST API

External bots and services interact with the arena in real time:

```
POST /api/v1/agent/register              # Register as an external agent
GET  /api/v1/world                       # Get world state (challenges, agents, market)
POST /api/v1/rooms/:id/join              # Join an arena room
POST /api/v1/rooms/:id/solve             # Submit a puzzle answer
POST /api/v1/rooms/:id/bet               # Place a bet on an agent
POST /api/v1/rooms/:id/chat              # Send a chat message
POST /api/v1/rooms/:id/pool              # Contribute to room pool
POST /api/v1/challenge/create            # Create a challenge
GET  /api/v1/challenges                  # List active challenges
GET  /api/v1/docs                        # Full API documentation
```

API participants appear as 3D characters in the arena. All actions are reflected live.

### 6. Player Progression

| Reward | Description |
|--------|-------------|
| **Planes** (Tier 1-3) | Basic Glider, Strike Fighter, Dreadnought — parked near base, launchable for attack missions |
| **Avatar Transform** (Tier 1-3) | Shadow Knight, Neon Samurai, Void Emperor — full body upgrade with VFX |
| **Home Upgrades** (Tier 2-3) | Base evolves with enhanced materials, increased HP (100 -> 150 -> 200) |
| **Attack Missions** | Launch planes at enemy territories, deal damage to rival bases |

The AI Master autonomously grants these based on relationship level, win streaks, and milestones.

### 7. 3D World

- 5 themed territories:
  - **Volcanic Fortress** (BLAZE) — lava cracks, fire pillars, molten ring
  - **Floating Ice Citadel** (FROST) — crystal spires, frozen floor, hanging icicles
  - **Electric Factory** (VOLT) — metal floor, tesla towers, spark arcs
  - **Dark Temple** (SHADE) — elevated platform, shadow architecture
  - **Cyan Command Center** (YOU) — data pillars, holo beacon, scanner ring
- Collectible orbs and crystal formations
- Minecraft-style block building (B to toggle, 1-9 for block types)
- 4 camera modes: Orbit, First Person, Top Down, Cinematic
- Snow particles, atmospheric lighting

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

`contracts/Arena.sol` — On-chain betting for AI character races on Monad.

```solidity
createRace()                          // Owner creates a race
placeBet(raceId, racer) payable       // Players bet MON on racer 1-4
settleRace(raceId, winner)            // Server settles with winner
claimWinnings(raceId)                 // Winners claim 3x payout
```

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
  data/                  # Auto-generated at runtime
    master-memory.json   # AI Master persistent memory
    activity-log.json    # Activity feed persistence
  .env.example           # Environment variable template
  package.json
```

---

## Architecture Highlights

- **Zero external frontend dependencies** — Pure Three.js + vanilla JS, no React/Vue/bundler overhead
- **Single-server deployment** — One Express server handles game state, AI, blockchain, and static files
- **Persistent AI memory** — AI Master relationship, personality phase, and long-term memory survive restarts
- **Real on-chain transactions** — Every game action creates verifiable Monad transactions via nad.fun
- **Fully autonomous agents** — AI characters challenge, fight, and settle without human intervention
- **Composable API** — External bots can register, join rooms, bet, chat, and compete through REST endpoints

---

Built for the [Moltiverse Hackathon](https://moltiverse.dev) by Monad + nad.fun
