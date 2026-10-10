# ⌖ Anchor

Zero-pollution, 0-idle-token cross-session task memory for AI coding agents.

Stop cluttering your git history with stagnant TODOs. Maintain cross-session intent with 0 idle tokens and zero workspace pollution.

[![CI Status](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Node v20+](https://img.shields.io/badge/Node-v20+-22c55e.svg)](package.json)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg)](tsconfig.json)
[![Tests: 26 Passed](https://img.shields.io/badge/Tests-26%20Passed-22c55e.svg)](tests/index.test.ts)
[![Zero Repo Pollution](https://img.shields.io/badge/Storage-Zero%20Repo%20Pollution-success.svg)](#1-zero-repository-contamination--concurrent-file-safety)
[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)

**English** | [简体中文](./README_zh.md)

<p align="center">
  <img src="assets/hero.svg" alt="Anchor Terminal Dashboard" width="820">
</p>

```text
⌖ Anchors (4 active):

  [Today · Today's Focus]
  01  [Today]     Optimize token truncation & JIT safety  Desktop     Today         Today 10:02

  [Upcoming · Scheduled]
  02  [Upcoming]  Add concurrent file lock unit tests     Desktop     Tomorrow      Yesterday 21:34
  03  [Upcoming]  Migrate auth module to HttpOnly cookies Desktop     Tomorrow      Today 10:02
  04  [Upcoming]  Polish CLI interactive dashboard & TUI  Desktop     In 2d         Today 10:02

  Use `anchor done <id>` to complete.
```

## Quick Start

### Pi Coding Agent Extension
Install directly inside Pi:

```bash
pi install npm:pi-anchor
```

### Standalone System CLI
Install globally via npm or run instantly via npx:

```bash
npm install -g pi-anchor
# Or instant invocation
npx pi-anchor
```

---

## Core Value: Why Do Developers Need Anchor?

When building software with terminal-based AI coding agents (Claude Code, Pi, Aider), developers encounter three recurring points of friction:

### 1. Terminal Exit = Instant Amnesia
Pressing `Ctrl+C` terminates the agent process, clearing working memory. Unfinished refactoring plans, temporary milestones, and cross-session agreements vanish instantly.

### 2. TODO.md Pollutes Git & Suffocates Token Windows
Writing tasks into `TODO.md` or `AGENTS.md` inside your repository creates messy git noise ("update todo", "fix checklist").
Worse, **every single turn injects dozens of stagnant lines into the system prompt**, burning token budgets and diluting LLM attention on active code.

### 3. Stale Task Debt & Manual Checkbox Rot
Once code is written, developers rarely reopen markdown files to check boxes manually. Incomplete task lists rot inside the repository indefinitely.
Existing alternatives introduce heavy trade-offs (e.g. `beads` forces a 200MB Dolt SQL database into your repo; `engram` runs a persistent background Go daemon with SQLite).

**Anchor takes a lean, pragmatic approach**: task state is stored globally in `~/.anchor/`, leaving your project git tree 100% clean; active tasks consume 0 tokens during normal working turns, resurfacing via a single-line code comment only when associated files are touched; and tasks automatically settle upon git commits or on session exit.

---

## How It Works: The Action Matrix

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Anchor Lifecycle State Machine                        │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ Pin task: anchor "Migrate auth to HTTP-only cookies"
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

| Action / Scenario | What You Do | What Anchor Does | What the AI Gets | When to Use |
| :--- | :--- | :--- | :--- | :--- |
| **Pin Commitment** | Run `anchor "Refactor auth"` | Atomically writes to `~/.anchor/state.json` | Turn 1: Injected into prompt; Turn 2+: 0 tokens | Retaining multi-step plans across terminal restarts |
| **File Touch** | Edit or read code normally | Matches touched files against anchor paths | Injects syntax-safe 1-line comment (skips JSON/ENV!) | Working on relevant project modules |
| **Git Commit** | `git commit -m "feat: ..."` | Matches commit message using `Intl.Segmenter` | Auto-settles and archives matching task | Finishing code milestones |
| **Session Exit** | Type `exit` / `quit` | Intersects git-modified files with active anchors | Single-keypress prompt: `[Enter Settle] / [Esc Keep]` | Wrapping up terminal session |

---

## Engineering Highlights

- 🛡️ **100% Zero Repository Contamination**: All state lives safely in user-global storage `~/.anchor/`. Never creates local `.anchor` folders or pollutes your project git tree.
- ⚡ **0-Token Idle Economy**: Injects active commitments on Turn 1 cold-start; Turn 2+ working turns consume **0 tokens**. Stored tasks don't cost a dime while coding.
- 🔒 **Syntax-Safe JIT (Strict Null)**: Injects language-accurate comments (`//`, `#`, `<!-- -->`, `/* */`), but **strictly skips JSON, ENV, Lockfiles, and binaries**, never breaking parsers.
- ⚙️ **Dead-PID Lock Recovery**: Native atomic file lock (`state.lock`) reclaims stale locks if a terminal crashes or dies. Completely safe across concurrent tabs.
- ⏳ **Dual-Timeline Management**: Tracks both delivery deadlines (`targetDate`: Today, Tomorrow, Friday) and task aging (`createdAt`: Today 10:02). Maps natural language dates automatically.
- 🧹 **Silent Decay & Graveyard Eviction**: Stale inactive tasks decay gracefully to sleep; abandoned tasks sweep silently to `graveyard.jsonl`.
- 🔌 **Universal Agent Protocol**: Harness-agnostic engine `AnchorProtocol` with lightweight bridge `AgentAdapter` connects drop-in to Pi, Claude Code, Cursor, or custom MCP servers.

---

## Commands & Usage

### CLI Quick Reference
```bash
anchor                                  # List active tasks (Neovim-style dashboard)
anchor "Migrate auth to cookies"        # Pin new commitment
anchor "Submit report" --due friday     # Pin with explicit deadline
anchor done 1                           # Complete row 1 (ordered index support)
anchor done anc-5                       # Complete by explicit ID
anchor undo                             # Restore last archived task
```

### Pi Coding Agent Commands
| Command | Description |
| :--- | :--- |
| `/pin "task description"` | Pin an anchor task for the current workspace |
| `/anchor` | Open interactive terminal task dashboard |
| Status bar `⌖ N` | Displays active task count in status row; 100% hidden when 0 tasks exist |

---

## Technical Comparison

| Feature | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **Architecture** | Distributed SQL Graph | Vector/SQLite Memory | Static Markdown | **Decoupled Universal Protocol + Atomic State** |
| **Workspace Hygiene** | Pollutes repo with 200MB Dolt | System daemon | **Pollutes git commit history** | **100% Zero repo pollution (`~/.anchor/`)** |
| **Token Cost** | Medium/High per turn | High (full prompt injection) | Severe (stale text accumulates) | **0 Tokens idle (JIT file touch only)** |
| **Syntax Safety** | N/A | Raw text injection | Static unformatted | **Language-aware comments, strictly skips JSON** |
| **Closure Mechanism** | Manual CLI close | Passive storage | Manual file edit | **Git Commit auto-match + One-tap exit settlement** |
| **Concurrency Safety** | SQL Transaction locks | Daemon single-point | Git merge conflicts | **Zero-dep cross-process atomic file lock** |
| **Startup Overhead** | Heavy CLI init | Go daemon | None | **< 90ms pre-bundled production artifact** |
| **Dependencies** | External Dolt binary | External Go binary | None | **Zero native binary dependencies (Pure TS)** |

---

## Verification & Quality Assurance

Engineered with strict TypeScript and 100% standard library test coverage using Node's native test runner:

```bash
npm run typecheck  # Strict tsc --noEmit check (0 errors)
npm test           # Native Node test runner (26/26 passing)
npm run build      # Dual ESM/CJS compilation via tsup + declaration emit
```

---

## License

MIT © [Jason Song](https://github.com/3ZEROS12)
