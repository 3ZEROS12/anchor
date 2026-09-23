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
  <img src="https://img.shields.io/badge/Tests-13%20Passed-brightgreen.svg" alt="Tests: 13 Passed">
  <img src="https://img.shields.io/badge/Storage-Zero%20Repo%20Pollution-success.svg" alt="Zero Repo Pollution">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License: MIT">
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
* **Closed by evidence** — auto-settled via Git commit semantics or test execution; single-keypress settlement on session exit.
* **Dual durability tiers** — 48h auto-clearing for ephemeral reminders vs permanent preservation for architectural goals.

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
      Exit Settlement / Auto-Match                             │ 48h (Ephemeral)
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

### 3. Dual Durability Tiers
* **Ephemeral (`[48h left]`)**: Temporal reminders ("tonight", "tomorrow", "later") auto-evict after 48 hours of inactivity, preventing abandoned scratchpad notes from festering.
* **Durable (`[permanent]`)**: Architecture visions, refactorings, and recurring habits are preserved indefinitely until physical verification or explicit closure.

### 4. Zero-Friction Evidence Settlement
* **Git Commit Resolution**: Understands commit messages across Latin and CJK languages (via `Intl.Segmenter`). Commits like `git commit -m "fix(auth): resolve cookie session leak"` automatically settle `#anc-1`.
* **Exit Settlement Prompt**: When exiting a session where tracked files were modified, prompts a single-keypress dialog:
  ```text
  ⌖ Settle Anchor Task
  Task #anc-1 [Migrate auth to HTTP-only cookies] touched files (src/auth/jwt.ts).
  Mark as completed and archive? [Enter Confirm] / [Esc Keep]
  ```
* **Instant Undo**: Accidentally settled a task? Run `/anchor undo` to restore it immediately.

---

## 🖥️ Interface Design

Anchor implements a focused, low-saturation Neovim/Cupertino aesthetic:

### Status Bar Capsule
* Empty: **100% invisible** (0 characters, zero distraction).
* Active: **`⌖ 1`** (or `⌖ 2 (1z)` if sleeping tasks exist).

### Interactive Dashboard (`/anchor`)
```text
⌖ Anchors (enter to complete):

> 01  明天吃香蕉                  · Desktop · 46h left · 2h ago
  02  每天吃一个苹果              · Desktop · 2h ago
  03  完成针对桌面的优化          · Desktop · 2h ago
  04  Refactor auth session      · backend · src/auth/* · 3h ago
```
* **Arrow keys + Enter**: Instantly settles the task and frees context.
* **Clear time semantics**: `46h left` (future eviction countdown) vs `2h ago` (creation elapsed time).

### Standalone CLI (`anchor`)
Works in any terminal independently without opening an AI coding harness:
```bash
anchor                           # List pending tasks
anchor "Review PR #42 tomorrow"  # Pin new task (auto-detects 48h ephemeral)
anchor done anc-1                # Settle and evict task
```

---

## 📊 Comparison

| Feature | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **Data Architecture** | Distributed SQL Graph | Vector/SQLite Memory | Static Markdown | **Lightweight Atomic State Machine** |
| **Workspace Hygiene** | Pollutes repo with 200MB Dolt | System daemon | **Pollutes git commit history** | **100% Zero repo pollution (`~/.pi/agent/anchors/`)** |
| **Token Cost** | Medium/High per turn | High (full prompt injection) | Severe (stale text accumulates) | **0 Tokens idle (JIT file touch only)** |
| **Closure Mechanism** | Manual CLI close | Passive storage | Manual file edit | **Git Commit auto-match + One-tap exit settlement** |
| **Decay Management** | Manual pruning | None | Stagnates permanently | **Dual-tier decay (48h auto-evict vs durable)** |
| **Dependencies** | External Dolt binary | External Go binary | None | **Zero native binary dependencies (Pure TS)** |

---

## 🚀 Quick Start

### Installation

#### 1. As Pi Coding Agent Extension
Link or copy into your Pi extensions directory:
```bash
# In ~/.pi/agent/extensions/
npm install @3zeros12/anchor
```

#### 2. Standalone Global CLI
```bash
npm install -g @3zeros12/anchor
```

---

## 🧪 Verification & Quality Assurance

Built with strict TypeScript and 100% standard library tests using Node's native test runner:

```bash
npm run build      # Dual ESM/CJS build via tsup + declaration emit
npm run typecheck  # Strict tsc --noEmit (0 errors)
npm test           # Native Node test suite
```

```text
✔ ContextInjector - renders only active anchors, sleeping consume 0 tokens (64ms)
✔ AnchorDecay - status evaluation transitions (1.5ms)
✔ AnchorDecay - sweepStore transitions and graveyard eviction (142ms)
✔ AnchorMatcher - exact, prefix, and tag matching (5.6ms)
✔ AnchorMatcher - glob pattern matching (*.ts, src/**/*.ts) (1.1ms)
✔ AnchorMatcher - findMatchedAnchors prioritizes high-confidence & high-priority (0.5ms)
✔ SessionTouchObserver - records read, edit, write and commits (32ms)
✔ SessionTouchObserver - matches CJK commit messages with segmentation (3ms)
✔ AnchorStore - basic CRUD & atomic writes (90ms)
✔ AnchorStore - corrupt state recovery (5.2ms)
✔ AnchorTUI - status bar reflects active state cleanly with ⌖ N (31ms)
✔ AnchorTUI - formatRemainingTtl and formatRelativeTime distinguish left vs ago (17ms)
✔ AnchorTUI - openAnchorDashboard renders Plan 2 Neovim/Geek layout with folder metadata (42ms)

ℹ pass 13, fail 0 (455ms total)
```

---

## 📄 License

MIT License © 2025 [Jason Song (@3ZEROS12)](https://github.com/3ZEROS12)
