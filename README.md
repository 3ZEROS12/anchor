# ⌖ Anchor

> **Zero-pollution, 0-idle-token cross-session task memory for AI coding agents**  
> Maintain cross-session intent with zero idle tokens, syntax-safe JIT touch wakeups, and zero git repository pollution.

[![CI Status](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Node v20+](https://img.shields.io/badge/Node-v20+-22c55e.svg)](package.json)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg)](tsconfig.json)
[![Tests: 26 Passed](https://img.shields.io/badge/Tests-26%20Passed-22c55e.svg)](tests/index.test.ts)
[![Startup: < 90ms](https://img.shields.io/badge/Startup-%3C%2090ms-success.svg)](package.json)
[![Zero Repo Pollution](https://img.shields.io/badge/Storage-Zero%20Repo%20Pollution-success.svg)](#1-zero-repository-contamination--storage-topology)
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

---

## Why Anchor?

When building software with terminal-based AI coding agents (Claude Code, Pi, Aider), developers encounter three recurring points of friction:

### 1. Terminal Exit = Instant Amnesia
Pressing `Ctrl+C` terminates the agent process, clearing working memory. Unfinished refactoring plans, temporary milestones, and cross-session agreements vanish instantly.

### 2. TODO.md Pollutes Git & Suffocates Token Windows
Writing tasks into `TODO.md` or `AGENTS.md` inside your repository creates unwanted git noise (`update todo`, `fix checklist`). Worse, **every single turn injects dozens of stagnant lines into the system prompt**, burning token budgets and diluting LLM attention on active code.

### 3. Checkbox Rot & Heavy Over-Engineering
Once code is written, developers rarely reopen markdown files to check boxes manually. Incomplete task lists rot inside the repository indefinitely. Existing alternatives introduce heavy trade-offs: `beads` forces a 200MB Dolt SQL database directly into your repository, while `engram` runs a persistent background Go daemon with SQLite and continuous vector retrieval.

**Anchor takes a lean, pragmatic approach**:
- **Zero Repo Contamination**: State is stored outside the workspace in `~/.anchor/state.json`, keeping your git tree 100% clean.
- **0 Idle Tokens**: Injects active commitments on Turn 1 cold-start; Turn 2+ working turns consume **0 tokens**. Stored tasks don't cost a dime while writing code.
- **Syntax-Safe JIT Wakeup**: When the agent touches relevant files, Anchor surfaces a single-line language-accurate comment (`//`, `#`, `<!-- -->`, `/* */`), while strictly skipping JSON, ENV, and lockfiles.
- **Auto-Settlement & Accidental Settle Guard**: Tasks automatically settle on git commits matching task descriptions or on session exit. In interactive dashboard mode, a two-stage dialog prevents accidental completion.

---

## Core Architecture & State Machine

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
| **File Touch** | Edit or read code normally | Matches touched files against anchor paths | Injects syntax-safe 1-line comment (skips JSON/ENV) | Working on relevant project modules |
| **Git Commit** | `git commit -m "feat: ..."` | Matches commit message using `Intl.Segmenter` | Auto-settles and archives matching task | Finishing code milestones |
| **Session Exit** | Type `exit` / `quit` | Intersects git-modified files with active anchors | Single-keypress prompt: `[Enter Settle] / [Esc Keep]` | Wrapping up terminal session |

---

## Engineering Highlights & v0.2.1 Hardening

### 1. Zero Repository Contamination & Storage Topology
Anchor never creates local `.anchor` folders or touches your project git tree. All state lives safely in user-global storage:
```text
~/.anchor/
├── state.json           # Active and sleeping task state (< 10KB, atomic write)
├── state.lock           # Cross-process sync atomic lock (Zero dependencies)
├── archive.jsonl        # Append-only log of settled tasks
└── graveyard.jsonl      # Append-only log of decayed and evicted items
```
* **Zero-Dependency Exclusive Lock**: Uses Node's native `fs.openSync(lockPath, 'wx')` to ensure atomic serialization across concurrent tabs or agents.
* **Dead PID Reclamation**: Automatically reclaims stale locks if the owning process terminated (`process.kill(pid, 0)` fails) or exceeded the 5000ms timeout.
* **Resilient Atomic Writes**: State writes use a temporary file followed by atomic `fs.renameSync` with spin-retries for Windows NTFS locks.

### 2. Accidental Settle Guard & Details Inspector (v0.2.1)
Pressing Enter in `/anchor` presents a two-stage action menu:
* `✓ Settle`: Completes and archives the task with an undo notice (`/anchor undo to revert`).
* `ℹ View details & associated files`: Inspects full description, target date, files, and physical verification command without completing the task.
* `↩ Cancel`: Returns safely without mutating state.

### 3. Invariant 11 Token Clamping (v0.2.1)
Visual string truncation in dashboard headers automatically strips trailing open brackets (`(`, `[`, `{`, `（`, `【`) right before ellipsis markers (`...`), eliminating dangling punctuation artifacts.

### 4. 0-Token Idle Economy & Multi-Language Syntax-Safe JIT
* **Turn 1 (Cold Start)**: Injects active commitments for the current workspace alongside natural conversational guidelines.
* **Turn 2+ (Working Turns)**: Anchor strips task lists from subsequent turns. Stored tasks consume **0 tokens** while coding.
* **Syntax-Safe Guard (Strict Null)**: For **JSON, ENV, Lockfiles, and binary assets**, Anchor explicitly returns `null`, preventing corrupted parsers or invalid syntax.

### 5. Pre-Flight Physical Verification
When an anchor declares a `verifyCommand`, the runner executes it on session start. Tasks that pass auto-settle immediately, freeing cognitive space.

---

## Commands & Usage

### Standalone CLI
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

## Author's Note

The motivation behind Anchor came from a recurring headache during pair-programming with AI coding agents: watching `TODO.md` and `AGENTS.md` rot inside my git trees.

Every time a task remained unfinished across sessions, writing it to a project markdown file felt harmless at first. Over weeks of work, two frictions became unbearable:
1. In multi-turn sessions, the AI dragged dozens of stagnant task lines into the prompt on every single turn, burning hundreds of tokens while diluting the model's focus on the actual code being edited.
2. Merge conflicts on task checklists in Git commits polluted the repository's history with irrelevant bookkeeping noise.

When I looked at existing solutions, the trade-offs felt disproportionate. Stuffing a 200MB Dolt SQL relational database into the repository root (`beads`), or running a background Go daemon with SQLite and continuous vector retrieval (`engram`), inverted the relationship between tool and developer. A task tracker should not demand more system resources than the application being built.

Anchor takes the opposite approach: store state outside the project tree in a lean global ledger (`~/.anchor/state.json`), inject tasks only on Turn 1 of a cold start, keep Turn 2+ at exactly 0 tokens, and auto-settle upon git commits or session exit.

In v0.2.1, we added the two-stage settle menu to eliminate accidental completions and enhanced visual truncation to prevent dangling punctuation. I hope Anchor keeps your project trees clean and your focus where it belongs: on the code.

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
