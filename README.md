# ⌖ Anchor

<p align="center">
  <strong>Zero-Pollution, 0-Idle-Token Task Memory for AI Coding Agents.</strong><br>
  <em>Stop cluttering your git history with stagnant TODOs. Maintain cross-session intent with 0 idle tokens and zero workspace pollution.</em>
</p>

<p align="center">
  <a href="README_zh.md">🇨🇳 简体中文</a> •
  <a href="#why-anchor">💡 Why Anchor?</a> •
  <a href="#core-architecture">✨ Core Architecture</a> •
  <a href="#interface-design">🖥️ Interface</a> •
  <a href="#comparison">📊 Comparison</a> •
  <a href="#quick-start">🚀 Quick Start</a> •
  <a href="#verification--quality-assurance">🧪 Verification</a>
</p>

<p align="center">
  <a href="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml">
    <img src="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <img src="https://img.shields.io/badge/Node-v20+-22c55e.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Tests-26%20Passed-22c55e.svg" alt="Tests: 26 Passed">
  <img src="https://img.shields.io/badge/Startup-%3C%2090ms-success.svg" alt="Startup: < 90ms">
  <img src="https://img.shields.io/badge/Storage-Zero%20Repo%20Pollution-success.svg" alt="Zero Repo Pollution">
  <img src="https://img.shields.io/badge/License-MIT-f97316.svg" alt="License: MIT">
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Anchor Terminal Dashboard" width="820">
</p>

---

## Why Anchor?

When building software with terminal-based AI coding agents (Claude Code, Pi, Aider), developers encounter three recurring points of friction:

1. **Session Amnesia**: Pressing `Ctrl+C` terminates the agent process, clearing working memory. Unfinished refactoring plans, temporary milestones, and cross-session agreements vanish instantly.
2. **Context Window Pollution & Token Bloat**: Writing tasks into `TODO.md` or `AGENTS.md` creates unwanted git commit noise. Worse, **every single turn injects dozens of stagnant lines into the system prompt**, burning token budgets and diluting LLM attention on active code.
3. **Stale Task Debt**: Once code is committed, developers rarely reopen markdown files to check boxes manually. Incomplete task lists rot inside the repository indefinitely.

Existing alternatives introduce heavy trade-offs:
* `gastownhall/beads` forces a 200MB Dolt SQL relational database directly into your repository to manage issue graphs.
* `Gentleman-Programming/engram` runs a persistent background Go daemon with SQLite and continuous vector retrieval, adding daemon overhead and cross-process latency.

**Anchor takes a lean, pragmatic approach**: task state is stored globally in `~/.anchor/`, leaving your project git tree 100% clean; active tasks consume 0 tokens during normal working turns, resurfacing via a single-line code comment only when associated files are touched; and tasks automatically settle upon git commits or on session exit.

---

## Core Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Anchor Lifecycle State Machine                        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ Pin task: /pin "Migrate auth to HTTP-only cookies"
                                       ▼
               ┌───────────────────────────────────────────────┐
               │         [ACTIVE Tier] (Turn 1 Injected)       │
               │ - Status indicator: ⌖ 4                       │
               │ - Turn 2+ : Excluded from prompt (0 Tokens)   │
               └───────┬───────────────────────────────┬───────┘
                       │                               │
      Git Commit /     │                               │ Inactivity Decay
      Code Touch       ▼                               ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │   [Syntax-Safe JIT Wakeup]   │            │   [SLEEPING Tier] (0 Tokens)   │
  │ Language-accurate comments   │            │ Preserved safely in global     │
  │ JSON/ENV strictly skipped    │            │ state; wakes upon code touch   │
  └──────────────┬───────────────┘            └────────────────┬───────────────┘
                 │                                             │
      Exit Prompt / Commit Match                               │ Silent Sweep
                 ▼                                             ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │     [SETTLED / Archived]     │            │      [GRAVEYARD / Evicted]     │
  │ Appended to archive.jsonl    │            │ Swept to graveyard.jsonl       │
  │ Evicted from active context  │            │ (Auto-pruned after decay)      │
  └──────────────────────────────┘            └────────────────────────────────┘
```

### 1. Zero Repository Contamination & Concurrent File Safety
Anchor never creates local `.anchor` folders or touches your project git tree. All state lives safely in user-global storage:
```text
~/.anchor/
├── state.json           # Active and sleeping task state (< 10KB, atomic write)
├── state.lock           # Cross-process sync atomic lock (Zero dependencies)
├── archive.jsonl        # Append-only log of settled tasks
└── graveyard.jsonl      # Append-only log of decayed and evicted items
```

* **Zero-Dependency Exclusive Lock**: Uses Node's native `fs.openSync(lockPath, 'wx')` to ensure atomic serialization across multiple terminal tabs or concurrent agents.
* **Dead PID Reclamation**: Automatically reads lock owner metadata. If the owning process has terminated (`process.kill(pid, 0)` fails) or exceeded the 5000ms stale timeout, Anchor safely reclaims the lock.
* **Resilient Atomic Writes**: State writes use a temporary file (`state.tmp.${pid}.${timestamp}`) followed by atomic `fs.renameSync` with spin-retries for Windows NTFS locks. Corrupted states trigger automatic timestamped backups (`state.corrupt.${timestamp}.json`) and fall back to clean initialization.

### 2. 0-Token Idle Economy & Multi-Language Syntax-Safe JIT
Context windows stay lean throughout extended sessions:
* **Turn 1 (Cold Start)**: The `before_agent_start` hook identifies the session turn count via `sessionManager.getEntries()`. It injects active commitments for the current workspace alongside natural conversational guidelines.
* **Turn 2+ (Working Turns)**: Anchor strips task lists from subsequent turns. Stored tasks consume **0 tokens** while the agent writes code.
* **Language-Accurate Comment Formats**: When an agent touches files, Anchor formats annotations matching the file extension:
  - Double slash `//`: `ts`, `tsx`, `js`, `jsx`, `go`, `rs`, `java`, `c`, `cpp`, `cs`, `swift`, `dart`, `zig`
  - Hash `#`: `py`, `rb`, `sh`, `bash`, `zsh`, `yaml`, `yml`, `toml`, `dockerfile`, `ps1`
  - HTML markup `<!-- -->`: `html`, `xml`, `svg`, `vue`, `svelte`
  - Block comments `/* */`: `css`, `scss`, `less`
  - SQL dashes `--`: `sql`, `lua`, `hs`
* **Syntax-Safe Guard (Strict Null)**: For **JSON, ENV, Lockfiles, and binary assets**, Anchor explicitly returns `null`, preventing corrupted parsers or invalid syntax.
* **Session Deduplication**: Matched tasks are injected only once per session per file to keep tool results clean.

### 3. Decoupled Universal Agent Protocol
Anchor separates its core state management from host environments:
* **`AnchorProtocol`**: Harness-agnostic engine orchestrating state transitions, decay sweeps, JIT annotations, and settlement matching.
* **`AgentAdapter`**: A lightweight bridge (`name`, `getCwd()`, `notify()`) enabling drop-in integration with Pi, Claude Code, Cursor, Aider, or custom MCP servers.

### 4. Dual-Timeline: Deadlines & Task Aging
Anchor organizes tasks along two complementary temporal axes:
* **Target Delivery (`targetDate`)**: Expected completion date. Natural language keywords (today, tonight, tomorrow, friday, next week) map directly to structured ISO dates. Rendered in UI as `Today`, `Tomorrow`, `In 2d`, `Daily`, `Someday`.
* **Creation Timestamp (`createdAt`)**: Physical creation time. Rendered in UI as `Today 10:02`, `Yesterday 21:34`, or `09-24 15:30`.

The dashboard groups active tasks into four categories:
* **`[Today]`**: Items due today or overdue. Priority target for the current session.
* **`[Upcoming]`**: Scheduled future commitments (tomorrow, upcoming weekdays, specific dates via `--due friday`).
* **`[Habits]`**: Recurring daily practices (such as regular backups or review habits). Completing today auto-reawakens the task tomorrow.
* **`[Backlog]`**: Architectural visions without explicit deadlines (`Someday`).

### 5. Zero-Friction Evidence Settlement
* **Git Commit Resolution**: Recognizes commit messages across Latin and CJK character sets via standard `Intl.Segmenter`. Commits matching task descriptions auto-settle the corresponding anchor.
* **Exit Settlement Interception**: Session exit evaluates files modified in Git. If touched files intersect with active anchors, Anchor prompts a single-keypress resolution dialog:
  ```text
  ⌖ Settle Anchor Task
  Task #anc-1 [Migrate auth to HTTP-only cookies] touched files (src/auth/jwt.ts).
  Mark as completed and archive? [Enter Confirm] / [Esc Keep]
  ```
* **Instant Reversion**: Run `anchor undo` to restore the last settled task back into `state.json`.

---

## Interface Design

### Status Bar Indicator
* When active tasks exist: Displays task count `⌖ 4` in the terminal status row.
* Zero tasks: 100% invisible (0 characters rendered).

### Global CLI (`anchor`) & Interactive TUI (`/anchor`)
```text
⌖ Anchors (4 active):

  [Today · Today's Focus]
  01  [Today]     Optimize token truncation & JIT safety  Desktop     Today         Today 10:02

  [Upcoming · Scheduled]
  02  [Upcoming]  Add concurrent file lock unit tests     Desktop     Tomorrow      Yesterday 21:34
  03  [Upcoming]  Polish CLI interactive dashboard        Desktop     Tomorrow      Today 10:02
  04  [Upcoming]  Publish npm package v0.2.0              Desktop     In 2d         Today 10:02

  Use `anchor done <id>` to complete.
```
* **Continuous Numbering**: Ordered index rows (`01`, `02`, `03`) prevent visual disorientation.
* **Dual-Channel Input**: `anchor done 1` completes displayed line 1; `anchor done anc-5` targets an explicit ID.
* **Unicode / Emoji / Hangul Alignment**: Pure terminal column calculation prevents row tearing across mixed ASCII, full-width CJK, and emoji sequences.

---

## Comparison

| Feature | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **Core Architecture** | Distributed SQL Graph | Vector/SQLite Memory | Static Markdown | **Decoupled Universal Protocol + Atomic State** |
| **Concurrency Safety** | SQL Transaction locks | Daemon single-point | Git merge conflicts | **Zero-dep cross-process atomic file lock** |
| **Workspace Hygiene** | Pollutes repo with 200MB Dolt | System daemon | **Pollutes git commit history** | **100% Zero repo pollution (`~/.anchor/`)** |
| **Token Cost** | Medium/High per turn | High (full prompt injection) | Severe (stale text accumulates) | **0 Tokens idle (JIT file touch only)** |
| **JIT Syntax Safety** | N/A | Raw text injection | Static unformatted | **Language-aware comments, strictly skips JSON** |
| **Task Timeline** | Flat list | Flat list | Static checklist | **Dual-timeline (Due Date + Task Age)** |
| **Closure Mechanism** | Manual CLI close | Passive storage | Manual file edit | **Git Commit auto-match + One-tap exit settlement** |
| **Decay Management** | Manual pruning | None | Stagnates permanently | **Silent decay (ephemeral 48h vs durable backlog)** |
| **Startup Overhead** | Heavy CLI init | Go daemon | None | **< 90ms pre-bundled production artifact** |
| **Dependencies** | External Dolt binary | External Go binary | None | **Zero native binary dependencies (Pure TS)** |

---

## Quick Start

### 1. Global CLI
```bash
# Global installation
npm install -g pi-anchor

# Or instant invocation via npx
npx pi-anchor
```

Command summary:
```bash
anchor                                  # List active tasks
anchor "Refactor auth cookies"          # Pin new commitment
anchor "Submit report" --due friday     # Pin with explicit deadline
anchor done 1                           # Complete row 1
anchor undo                             # Restore last archived task
```

### 2. Universal Protocol Library
```typescript
import { AnchorStore, AnchorProtocol } from 'pi-anchor';

const store = new AnchorStore();
const protocol = new AnchorProtocol(store);

// Initialize session
protocol.handleSessionStart();

// Turn 1 injects cold-start context; Turn 2+ returns null (0 tokens)
const turn1Prompt = protocol.handleBeforeTurn(1, process.cwd());

// Tool result file touch generates language-accurate safe comments
const { annotation } = protocol.handleToolResult({
  toolName: 'read',
  filePath: 'src/auth.ts',
  cwd: process.cwd()
});
```

### 3. Pi Coding Agent Extension
Install into user extensions:
```bash
pi install npm:pi-anchor
```

---

## Verification & Quality Assurance

Engineered with strict TypeScript and 100% standard library test coverage using Node's native test runner:

```bash
npm run build      # Dual ESM/CJS compilation via tsup + declaration emit
npm run typecheck  # Strict tsc --noEmit check (0 errors)
npm test           # Native Node test runner (26/26 passing)
```

```text
✔ ContextInjector - renders only active anchors, sleeping consume 0 tokens
✔ ContextInjector - renders targetDate and task aging in prompt
✔ ContextInjector - renders preflight failure hints into cold-start context
✔ AnchorDecay - status evaluation transitions
✔ AnchorDecay - sweepStore transitions and graveyard eviction
✔ AnchorMatcher - exact, prefix, and tag matching
✔ AnchorMatcher - glob pattern matching (*.ts, src/**/*.ts)
✔ AnchorMatcher - findMatchedAnchors prioritizes high-confidence & high-priority
✔ SessionTouchObserver - records read, edit, write and commits
✔ SessionTouchObserver - matches CJK commit messages with segmentation
✔ SessionTouchObserver - separates read inspection from edit mutation
✔ Lock - acquireSyncLock acquires, holds, and releases exclusive lockfile
✔ Lock - acquireSyncLock safely reclaims stale lock from dead PID
✔ Context - makeSafeTaskAnnotation produces language-accurate comments and skips JSON
✔ Protocol - AnchorProtocol lifecycle handles cold-start and safe JIT
✔ AnchorStore - basic CRUD & atomic writes
✔ AnchorStore - corrupt state recovery
✔ AnchorStore - daily recurring task completes for today and wakes tomorrow
✔ AnchorStore - temporal durability keywords and project detection
✔ AnchorStore - atomicRenameWithRetry successfully replaces files atomically
✔ AnchorTUI - status bar reflects active state cleanly with ⌖ N
✔ AnchorTUI - formatTargetDate and formatCreationTime render clear dual-timeline
✔ AnchorTUI - openAnchorDashboard renders Plan 2 Neovim/Geek layout with folder metadata
✔ AnchorTUI - getDisplayWidth and padToWidth properly align CJK full-width columns
✔ AnchorTUI - updateStartupBanner renders clean widget above editor
✔ AnchorTUI - truncateToWidth properly handles ANSI escape sequences and bounds width

ℹ pass 26, fail 0
```

---

## Author's Note

The motivation behind Anchor came from a recurring headache during pair-programming with AI coding agents: watching `TODO.md` and `AGENTS.md` rot inside my git trees.

Every time a task remained unfinished across sessions, writing it to a project markdown file felt harmless at first. But over weeks of work, two frictions became unbearable:
1. In multi-turn sessions, the AI dragged dozens of stagnant task lines into the prompt on every single turn, burning hundreds of tokens while diluting the model's focus on the actual code being edited.
2. Merge conflicts on task checklists in Git commits polluted the repository's history with irrelevant bookkeeping noise.

When I looked at existing solutions, the trade-offs felt disproportionate. Stuffing a 200MB Dolt SQL relational database into the repository root (`beads`), or running a background Go daemon with SQLite and continuous vector retrieval (`engram`), inverted the relationship between tool and developer. A developer task tracker should not demand more system resources than the application being built.

Anchor takes the opposite approach: store state outside the project tree in a lean global ledger (`~/.anchor/state.json`), inject tasks only on Turn 1 of a cold start, keep Turn 2+ at exactly 0 tokens, and auto-settle upon git commits or session exit.

I hope Anchor helps keep your project trees clean and your focus where it belongs: on the code.

---

## License

MIT License © 2025 [Jason Song (@3ZEROS12)](https://github.com/3ZEROS12)
