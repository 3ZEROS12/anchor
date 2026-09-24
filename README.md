# ⌖ Anchor

<p align="center">
  <strong>Zero-Pollution, Context-Aware, Self-Evicting Task Protocol for AI Coding Agents.</strong><br>
  <em>Clean up stagnant task files. Maintain cross-session intent with 0 idle tokens and zero workspace pollution.</em>
</p>

<p align="center">
  <a href="README_zh.md">🇨🇳 简体中文</a> •
  <a href="#the-physical-friction">💡 Problem Statement</a> •
  <a href="#core-architecture">✨ Core Architecture</a> •
  <a href="#interface-design">🖥️ Interface</a> •
  <a href="#comparison">📊 Comparison</a> •
  <a href="#quick-start">🚀 Quick Start</a>
</p>

<p align="center">
  <a href="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml">
    <img src="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <img src="https://img.shields.io/badge/Node-v20+-22c55e.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Tests-20%20Passed-22c55e.svg" alt="Tests: 20 Passed">
  <img src="https://img.shields.io/badge/Startup-%3C%2090ms-success.svg" alt="Startup: < 90ms">
  <img src="https://img.shields.io/badge/Storage-Zero%20Repo%20Pollution-success.svg" alt="Zero Repo Pollution">
  <img src="https://img.shields.io/badge/License-MIT-f97316.svg" alt="License: MIT">
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Anchor Terminal Hero Dashboard" width="820">
</p>

---

## The Physical Friction

Developers working with terminal-based autonomous coding agents encounter three persistent breakdowns:

1. **Session Amnesia**: Pressing `Ctrl+C` terminates the agent process. The volatile memory call stack vanishes immediately, discarding in-flight refactoring agreements and multi-step plans.
2. **Context Window Degradation**: Recording tasks inside `TODO.md` or `AGENTS.md` litters git commit trees. Every turn injects dozens of stagnant lines into the system prompt, consuming token budgets and diluting LLM attention on active code.
3. **Unchecked Debt Accumulation**: Human engineers rarely reopen static markdown files to check boxes after finishing code. Inactive items rot indefinitely inside the repository.

Existing alternatives introduce heavy trade-offs. `gastownhall/beads` forces a 200MB Dolt SQL relational database directly into the project repository to track issue graphs. `Gentleman-Programming/engram` runs a persistent background Go daemon with SQLite and continuous vector retrieval, adding daemon overhead and cross-process latency.

Anchor models cross-session engineering tasks as self-evicting promissory notes. It provides durable cross-session memory without repository clutter, background daemons, or idle token overhead.

---

## Core Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Anchor Lifecycle State Machine                        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ /pin "Migrate auth to HTTP-only cookies"
                                       ▼
               ┌───────────────────────────────────────────────┐
               │         [ACTIVE Tier] (Turn 1 Injected)       │
               │ - Status capsule: ⌖ 4                         │
               │ - Turn 2+ : Excluded from prompt (0 Tokens)   │
               └───────┬───────────────────────────────┬───────┘
                       │                               │
      Git Commit /     │                               │ Inactivity Decay
      Code Touch       ▼                               ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │   [JIT Comment Annotation]   │            │   [SLEEPING Tier] (0 Tokens)   │
  │ Touching src/auth/* injects: │            │ Preserved safely in global     │
  │ // ⌖ anchor context: #anc-1  │            │ state; wakes upon code touch   │
  └──────────────┬───────────────┘            └────────────────┬───────────────┘
                 │                                             │
      Exit Settlement / Auto-Match                             │ Background Sweep
                 ▼                                             ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │     [SETTLED / Archived]     │            │      [GRAVEYARD / Evicted]     │
  │ Appended to archive.jsonl    │            │ Swept to graveyard.jsonl       │
  │ Evicted from active context  │            │ (Ephemeral auto-cleared)       │
  └──────────────────────────────┘            └────────────────────────────────┘
```

### 1. Zero Repository Contamination
Anchor never creates local `.anchor` folders or touches your project git tree. All state resides in user-global storage:
```text
~/.anchor/
├── state.json           # Active and sleeping task state (< 10KB, atomic write)
├── archive.jsonl        # Append-only ledger of settled contracts
└── graveyard.jsonl      # Append-only log of decayed and evicted items
```

State writes use a temporary file (`state.tmp.${pid}.${timestamp}`) followed by atomic `fs.renameSync`. This prevents partial JSON serialization during process interrupts. Corrupt states trigger an automatic timestamped backup (`state.corrupt.${timestamp}.json`) and fall back to clean initialization, keeping terminal sessions uninterrupted.

### 2. 0-Token Idle Economy & JIT Resurface
Context windows remain lean throughout extended sessions:
* **Turn 1 (Cold Start)**: The `before_agent_start` hook detects session turn count via `sessionManager.getEntries()`. It injects active commitments for the current workspace alongside natural conversational guidelines.
* **Turn 2+ (Working Turns)**: Anchor strips task lists from subsequent turns. Stored tasks consume exactly 0 tokens while the agent writes code.
* **Code Touch JIT Wakeup**: When an agent accesses associated code via tools (`read`, `write`, `edit`), the matcher evaluates touched paths. It appends a single concise code comment to the tool result:
  ```text
  // ⌖ anchor context: #anc-1 Migrate auth to HTTP-only cookies (P0)
  ```
* **Decoupled Metadata**: Tags act strictly as taxonomy labels and never hijack file triggers. Tasks without explicit file bindings (`files: []`) remain quiet during file operations, eliminating false-positive activations.

### 3. Orthogonal Dual-Timeline Model
Anchor organizes tasks along two complementary temporal axes:
* **Target Delivery (`targetDate`)**: Expected completion date. Natural language keywords (today, tonight, tomorrow, friday, next week) map directly to structured ISO dates. Rendered in UI as `Today`, `Tomorrow`, `In 2d`, `Daily`, `Someday`.
* **Creation Provenance (`createdAt`)**: Physical creation timestamp. Rendered in UI as `Today 10:02`, `Yesterday 21:34`, or `09-24 15:30`.

The dashboard groups active tasks into four cognitive quadrants:
* **`[Today]`**: Items due today or overdue. Priority target for current session.
* **`[Upcoming]`**: Scheduled future commitments (tomorrow, upcoming weekdays, specific dates).
* **`[Habits]`**: Recurring daily practices (such as `每天背单词`). Completing today auto-reawakens the task tomorrow.
* **`[Backlog]`**: Architectural visions without explicit deadlines (`Someday`).

### 4. Zero-Friction Evidence Settlement
* **Git Commit Resolution**: Recognizes commit messages across Latin and CJK character sets via standard `Intl.Segmenter`. Commits matching task descriptions auto-settle the corresponding anchor.
* **Exit Settlement Interception**: Session exit evaluates files modified in Git. If touched files intersect with active anchors, Anchor prompts a single-keypress resolution dialog:
  ```text
  ⌖ Settle Anchor Task
  Task #anc-1 [Migrate auth to HTTP-only cookies] touched files (src/auth/jwt.ts).
  Mark as completed and archive? [Enter Confirm] / [Esc Keep]
  ```
* **Instant Reversion**: Run `anchor undo` to pop the last settled contract back into `state.json`.

---

## Interface Design

### Status Bar Capsule
* When active tasks exist: Displays minimal crosshair capsule `⌖ 4` in terminal status row.
* Zero tasks: 100% invisible (0 characters rendered).

### Global CLI (`anchor`) & Interactive TUI (`/anchor`)
```text
⌖ Anchors (4 active):

  [Today · 今日聚焦]
  01  [Today]     今天完成anchor项目后端优化    Desktop     Today         Today 10:02

  [Upcoming · 近期排期]
  02  [Upcoming]  明天吃香蕉                    Desktop     Tomorrow      Yesterday 21:34
  03  [Upcoming]  明天完成anchor项目前端优化    Desktop     Tomorrow      Today 10:02
  04  [Upcoming]  后天完成anchor项目上传优化    Desktop     In 2d         Today 10:02

  Use `anchor done <id>` to complete.
```
* **Continuous Numbering**: Ordered index rows (`01`, `02`, `03`) prevent visual disorientation.
* **Dual-Channel Input**: `anchor done 1` completes displayed line 1; `anchor done anc-5` targets explicit ID.
* **CJK Display Width Alignment**: Pure terminal column calculation prevents row tearing across mixed ASCII and full-width Chinese characters.

---

## Comparison

| Feature | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **Data Architecture** | Distributed SQL Graph | Vector/SQLite Memory | Static Markdown | **Lightweight Atomic State Machine** |
| **Workspace Hygiene** | Pollutes repo with 200MB Dolt | System daemon | **Pollutes git commit history** | **100% Zero repo pollution (`~/.anchor/`)** |
| **Token Cost** | Medium/High per turn | High (full prompt injection) | Severe (stale text accumulates) | **0 Tokens idle (JIT file touch only)** |
| **Cognitive Timeline**| Flat list | Flat list | Static checklist | **Dual-timeline (Target Date + Creation Time)** |
| **Closure Mechanism** | Manual CLI close | Passive storage | Manual file edit | **Git Commit auto-match + One-tap exit settlement** |
| **Decay Management** | Manual pruning | None | Stagnates permanently | **Silent decay (ephemeral 48h vs durable backlog)** |
| **Startup Overhead** | Heavy CLI init | Go daemon | None | **< 90ms pre-bundled production artifact** |
| **Dependencies** | External Dolt binary | External Go binary | None | **Zero native binary dependencies (Pure TS)** |

---

## Quick Start

### 1. Global CLI
```bash
# Global installation
npm install -g @3zeros12/anchor

# Or instant invocation via npx
npx @3zeros12/anchor
```

Command summary:
```bash
anchor                                  # List active tasks
anchor "Refactor auth cookies"          # Pin new commitment
anchor "Submit report" --due friday     # Pin with explicit deadline
anchor done 1                           # Complete row 1
anchor undo                             # Restore last archived task
```

### 2. Pi Coding Agent Extension
Install into user extensions:
```bash
# In ~/.pi/agent/extensions/
npm install @3zeros12/anchor
```

---

## Verification & Quality Assurance

Engineered with strict TypeScript and 100% standard library test coverage using Node's native test runner:

```bash
npm run build      # Dual ESM/CJS compilation via tsup + declaration emit
npm run typecheck  # Strict tsc --noEmit check (0 errors)
npm test           # Native Node test runner (18/18 passing)
```

```text
✔ ContextInjector - renders only active anchors, sleeping consume 0 tokens (59ms)
✔ ContextInjector - renders targetDate and task aging in prompt (10ms)
✔ AnchorDecay - status evaluation transitions (1.2ms)
✔ AnchorDecay - sweepStore transitions and graveyard eviction (102ms)
✔ AnchorMatcher - exact, prefix, and tag matching (2.5ms)
✔ AnchorMatcher - glob pattern matching (*.ts, src/**/*.ts) (0.7ms)
✔ AnchorMatcher - findMatchedAnchors prioritizes high-confidence & high-priority (0.4ms)
✔ SessionTouchObserver - records read, edit, write and commits (25ms)
✔ SessionTouchObserver - matches CJK commit messages with segmentation (2.0ms)
✔ AnchorStore - basic CRUD & atomic writes (77ms)
✔ AnchorStore - corrupt state recovery (9.1ms)
✔ AnchorStore - daily recurring task completes for today and wakes tomorrow (19ms)
✔ AnchorStore - temporal durability keywords and project detection (10ms)
✔ AnchorTUI - status bar reflects active state cleanly with ⌖ N (23ms)
✔ AnchorTUI - formatTargetDate and formatCreationTime render clear dual-timeline (38ms)
✔ AnchorTUI - openAnchorDashboard renders Neovim-aligned layout with folder metadata (26ms)
✔ AnchorTUI - getDisplayWidth and padToWidth properly align CJK full-width columns (0.3ms)
✔ AnchorTUI - updateStartupBanner renders clean widget above editor (8.7ms)

ℹ pass 18, fail 0 (384ms total runtime)
```

---

## License

MIT License © 2025 [Jason Song (@3ZEROS12)](https://github.com/3ZEROS12)
