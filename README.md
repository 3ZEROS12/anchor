# ⌖ Anchor

<p align="center">
  <strong>The Zero-Pollution, Context-Aware, Self-Evicting Task Protocol for AI Coding Agents.</strong><br>
  <em>Clean up bloated AGENTS.md. Maintain cross-session intent with 0 idle tokens and zero repository pollution.</em>
</p>

<p align="center">
  <a href="README_zh.md">🇨🇳 简体中文</a> •
  <a href="#-problem-statement">💡 Problem Statement</a> •
  <a href="#-core-architecture">✨ Core Architecture</a> •
  <a href="#-interface-design">🖥️ Interface</a> •
  <a href="#-comparison">📊 Comparison</a> •
  <a href="#-quick-start">🚀 Quick Start</a>
</p>

<p align="center">
  <a href="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml">
    <img src="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg" alt="CI Status">
  </a>
  <img src="https://img.shields.io/badge/Node-v20+-brightgreen.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Tests-18%20Passed-brightgreen.svg" alt="Tests: 18 Passed">
  <img src="https://img.shields.io/badge/Startup-%3C%2090ms-success.svg" alt="Startup: < 90ms">
  <img src="https://img.shields.io/badge/Storage-Zero%20Repo%20Pollution-success.svg" alt="Zero Repo Pollution">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License: MIT">
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Anchor Terminal Hero Dashboard" width="820">
</p>

---

## 💡 Problem Statement

Engineers using autonomous CLI agents (Pi, Claude Code, Cursor, Aider) encounter three persistent points of friction:

1. **Session Amnesia**: Exiting the terminal or pressing `Ctrl+C` wipes in-flight context, discarding multi-session refactoring goals and verbal commitments.
2. **Context Window Pollution**: Persisting tasks into `AGENTS.md` or `TODO.md` litters git repositories with metadata changes and injects dozens of stagnant lines into every single prompt turn.
3. **Manual Checkbox Chore**: Human developers rarely remember to manually open a markdown file and check off boxes after completing code. Unchecked tasks rot permanently.

**Anchor** resolves this by modeling tasks as **self-evicting promissory notes**:
* **Stored globally** (`~/.pi/agent/anchors/`) — zero local `.anchor/` folders or git pollution.
* **0-Token idle consumption** — injected on cold-start (Turn 1), then completely stripped from subsequent turns until associated code is touched.
* **Dual-Timeline GTD Model** — intuitive `Target Date` (`Today`, `Tomorrow`, `In 2d`, `Daily`, `Someday`) paired with `Creation Time` (`Today 10:02`).
* **Closed by evidence** — auto-settled via Git commit semantics or test execution; single-keypress settlement on session exit.
* **Instant Startup** — pre-bundled production artifacts load in **< 90ms** (27x faster than runtime transpilation).

---

## ✨ Core Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Anchor Lifecycle State Machine                        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ /pin "Migrate auth to HTTP-only cookies"
                                       ▼
               ┌───────────────────────────────────────────────┐
               │         [ACTIVE Tier] (Turn 1 Injected)       │
               │ - Status capsule: ⌖ 1                         │
               │ - Turn 2+ : Stripped from prompt (0 Tokens)   │
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
  │ Auto-evicted from context    │            │ (Ephemeral auto-cleared)       │
  └──────────────────────────────┘            └────────────────────────────────┘
```

### 1. Zero Repository Contamination
Anchor never creates local `.anchor` directories or touches your project's `.git` tree. All state resides in user-global state:
```
~/.pi/agent/anchors/
├── state.json           # Active & sleeping state (< 10KB, atomic write)
├── archive.jsonl        # Append-only settled contract ledger
└── graveyard.jsonl      # Append-only record of naturally decayed items
```

### 2. 0-Token Idle Economy & JIT Resurface
* **Turn 1 (Cold Start)**: Injects an ultra-compact summary with human-assistant conversational guidelines.
* **Turn 2+ (Working Turns)**: Completely stripped from system prompts. Consumes **0 tokens** while the agent writes code.
* **File Touch JIT**: When an agent accesses matching file paths (e.g. `src/auth/*`), Anchor injects a single unobtrusive code comment at the end of tool output:
  ```text
  // ⌖ anchor context: #anc-1 Migrate auth to HTTP-only cookies (P0)
  ```
* **No False Positives**: Domain tags are strictly taxonomy metadata and never hijack file matching. Only physical files or globs trigger JIT injection.

### 3. Dual-Timeline & 4-Quadrant Grouping
Anchor divides tasks into four clear cognitive quadrants:
* **`[Today]` (Due Today & Overdue)**: Immediate focus for the current session.
* **`[Upcoming]` (Near-Term)**: Tomorrow, in 2 days, or specific dates (`--due friday`).
* **`[Habits]` (Daily Cadence)**: Recurring daily habits (`每天吃一个苹果`). Completing for today automatically wakes back up tomorrow.
* **`[Backlog]` (Long-Term Vision)**: Open-ended architecture goals (`Someday`).

### 4. Zero-Friction Evidence Settlement
* **Git Commit Resolution**: Understands commit messages across Latin and CJK languages (via `Intl.Segmenter`). Commits like `git commit -m "fix(auth): resolve cookie session leak"` automatically settle `#anc-1`.
* **Exit Settlement Prompt**: When exiting a session where tracked files were modified, prompts a single-keypress dialog:
  ```text
  ⌖ Settle Anchor Task
  Task #anc-1 [Migrate auth to HTTP-only cookies] touched files (src/auth/jwt.ts).
  Mark as completed and archive? [Enter Confirm] / [Esc Keep]
  ```
* **Instant Undo**: Accidentally settled a task? Run `anchor undo` to restore it immediately.

---

## 🖥️ Interface Design

Anchor implements a focused, low-saturation Neovim/Cupertino aesthetic:

### Status Bar Capsule
* Empty: **100% invisible** (0 characters, zero distraction).
* Active: **`⌖ 4`** in footer.

### Interactive Dashboard (`/anchor`) & Global CLI (`anchor`)
```text
⌖ Anchors (4 active):

  [Today · 今日聚焦]
  01  [Today]     今天完成anchor项目后端优化    Desktop     Today         Today 10:02

  [Upcoming · 近期排期]
  02  [Upcoming]  明天吃香蕉                    Desktop     Tomorrow      Yesterday 21:34
  03  [Upcoming]  明天完成anchor项目前端优化    Desktop     Tomorrow      Today 10:02
  04  [Upcoming]  后天完成anchor项目上传优化    Desktop     In 2d         Today 10:02
```
* **Sequential numbering (`01`, `02`, `03`)**: Strictly ordered rows.
* **Dual-channel resolution**: `anchor done 1` settles row 1; `anchor done anc-5` settles by ID.
* **Explicit Provenance**: The folder column faithfully records where you were when the task was created (`Desktop`, `X`, `global`).

---

## 📊 Comparison

| Feature | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **Data Architecture** | Distributed SQL Graph | Vector/SQLite Memory | Static Markdown | **Lightweight Atomic State Machine** |
| **Workspace Hygiene** | Pollutes repo with 200MB Dolt | System daemon | **Pollutes git commit history** | **100% Zero repo pollution (`~/.pi/agent/anchors/`)** |
| **Token Cost** | Medium/High per turn | High (full prompt injection) | Severe (stale text accumulates) | **0 Tokens idle (JIT file touch only)** |
| **Cognitive Timeline**| Flat list | Flat list | Static checklist | **Dual-timeline (Target Date + Creation Time)** |
| **Closure Mechanism** | Manual CLI close | Passive storage | Manual file edit | **Git Commit auto-match + One-tap exit settlement** |
| **Decay Management** | Manual pruning | None | Stagnates permanently | **Silent decay (ephemeral 48h vs durable backlog)** |
| **Startup Overhead** | Heavy CLI init | Go daemon | None | **< 90ms pre-bundled production artifact** |
| **Dependencies** | External Dolt binary | External Go binary | None | **Zero native binary dependencies (Pure TS)** |

---

## 🚀 Quick Start

### 1. Standalone Global CLI
```bash
# Install globally
npm install -g @3zeros12/anchor

# Or run instantly via npx
npx @3zeros12/anchor
```

Commands:
```bash
anchor                                  # List pending anchors
anchor "Refactor auth cookies"          # Pin a task
anchor "Submit report" --due friday     # Pin with target date
anchor done 1                           # Settle row 1
anchor undo                             # Restore last settled task
```

### 2. As Pi Coding Agent Extension
Link or install into your Pi extensions directory:
```bash
# In ~/.pi/agent/extensions/
npm install @3zeros12/anchor
```

---

## 🧪 Verification & Quality Assurance

Built with strict TypeScript and 100% standard library tests using Node's native test runner:

```bash
npm run build      # Dual ESM/CJS build via tsup + declaration emit
npm run typecheck  # Strict tsc --noEmit (0 errors)
npm test           # Native Node test suite (18/18 passing)
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
✔ AnchorTUI - openAnchorDashboard renders Plan 2 Neovim/Geek layout with folder metadata (26ms)
✔ AnchorTUI - getDisplayWidth and padToWidth properly align CJK full-width columns (0.3ms)
✔ AnchorTUI - updateStartupBanner renders clean widget above editor (8.7ms)

ℹ pass 18, fail 0 (384ms total)
```

---

## 📄 License

MIT License © 2025 [Jason Song (@3ZEROS12)](https://github.com/3ZEROS12)
