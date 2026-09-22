# ⚓ Anchor

<p align="center">
  <strong>The Zero-Pollution, Context-Aware, Self-Evicting Task Protocol for AI Coding Agents.</strong><br>
  <em>Clean up bloated AGENTS.md. Maintain cross-session intent without polluting your context window.</em>
</p>

<p align="center">
  <a href="README_zh.md">🇨🇳 简体中文</a> •
  <a href="#-problem-statement">💡 Problem Statement</a> •
  <a href="#-core-mechanisms">✨ Core Mechanisms</a> •
  <a href="#-architecture--storage">🛠️ Architecture</a> •
  <a href="#-comparison">📊 Comparison</a> •
  <a href="#-quick-start">🚀 Quick Start</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-v20+-brightgreen.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Dependencies-Zero-success.svg" alt="Zero External Dependencies">
  <img src="https://img.shields.io/badge/Tests-8%20Passed-brightgreen.svg" alt="Tests: 8 Passed">
  <img src="https://img.shields.io/badge/License-MIT-orange.svg" alt="License: MIT">
</p>

---

## 💡 Problem Statement

Engineers using autonomous CLI agents (Claude Code, Pi, Cursor, Aider) encounter three persistent frictions:

1. **Session State Loss**: Pressing `Ctrl+C` or exiting the terminal resets conversational state, discarding multi-turn refactoring goals and active commitments.
2. **Context Bloat**: Persisting tasks into `AGENTS.md` or `TODO.md` leads to hundreds of lines of obsolete markdown over time, wasting tokens on every request.
3. **Manual Verification Failure**: Non-trivial refactoring tasks often lack single-command automated test suites. Relying on developers to manually locate and edit markdown checkboxes leaves tasks unresolved indefinitely.

Anchor models cross-session tasks as evidence-backed settlement contracts: linked to concrete file paths, resurfaced when related files are touched, verified at session exit, and naturally decayed when abandoned.

---

## ✨ Core Mechanisms

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      Anchor Task Lifecycle Machine                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ User or Agent: /pin "Fix auth bug"
                                     ▼
             ┌───────────────────────────────────────────────┐
             │         [ACTIVE Period] (Days 0 - 3)          │
             │ - Status bar capsule: ⚓ ● 1 active             │
             │ - Injects ultra-compact 2-line contract tag   │
             └───────┬───────────────────────────────┬───────┘
                     │                               │
    File Modified    │                               │ 3 Days Untouched
    (git / tool)     ▼                               ▼
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│ [One-Tap Exit Settlement]    │            │   [SLEEPING Period] (Days 4 - 7)│
│ Session exit prompts dialog: │            │ - 100% stripped from context    │
│ Press [Enter] ➔ Instant Evict│            │ - 0 Tokens consumed             │
└──────────────┬───────────────┘            └────────────────┬────────────────┘
               │                                             │
               │ Confirmed                                   │ 14 Days Untouched
               ▼                                             ▼
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│     [SETTLED / Closed]       │            │       [GRAVEYARD / Swept]       │
│ Archived to archive.jsonl    │            │ Auto-dropped to graveyard.jsonl │
└──────────────────────────────┘            └─────────────────────────────────┘
```

### 1. One-Tap Exit Settlement
Developers rarely inspect task files after completing code changes.
When Anchor intercepts a session shutdown or exit signal, it reads files modified during the turn. If changes intersect with an active anchor, it renders an inline settlement prompt:

```text
───────────────────────────────────────────────────────────────────
⚓ Anchor Settlement Proposal
   Task #anc-1: Migrate JWT cookies to HTTP-only [P0]
   Trigger: Modified src/auth/login.ts, src/auth/jwt.ts
   [Enter Confirm Settle & Evict]  /  [Tab Keep Pending]
───────────────────────────────────────────────────────────────────
```
Pressing Enter at session exit confirms task resolution, archives the entry, and frees prompt context immediately.

### 2. Context-Aware Resurface
Inactive anchors remain detached from system prompts. When an agent touches associated paths (such as `read` on `src/auth/`), Anchor surfaces a non-intrusive status line notice:
> `💡 Anchor: Inspected auth directory. Anchor #anc-1 is active. Press Tab to view.`

### 3. Half-Life Decay & Auto-Sweep
Tasks that receive no ongoing progress automatically transition through decay tiers:
* **Days 0 to 3 (Active)**: Visible on status capsule; injected as a two-line structured reference.
* **Days 4 to 7 (Sleeping)**: Excluded from the system prompt, consuming zero tokens.
* **Day 14+ (Graveyard)**: Auto-swept into `.anchor/graveyard.jsonl` to keep active storage bounded.

---

## 📊 Comparison

| Dimension | `gastownhall/beads` (27k ⭐) | `engram` (6.7k ⭐) | `AGENTS.md` / `TODO.md` | **Anchor ⚓ (Ours)** |
| :--- | :--- | :--- | :--- | :--- |
| **Data Model** | Distributed SQL Graph | Passive Knowledge Store | Static text checklist | **Auto-evicting promissory notes** |
| **Dependencies** | Dolt database binary (200MB) | Go binary + SQLite | None | **Zero runtime dependencies (pure TS/Node)** |
| **Token Overhead**| Medium (requires graph payload)| High (injects historical facts)| Severe (accumulates stale text) | **Compact (2 lines active, 0 lines sleeping)** |
| **Exit Settlement** | Manual close command | No task lifecycle tracking | Manual markdown deletion | **Inline single-key confirmation at exit** |
| **Decay Management**| Manual pruning | No decay transition | Retained permanently | **Built-in 3/7/14-day automated decay** |
| **TUI Integration** | Standard CLI output | Catppuccin TUI | Plain text | **Status capsule + interactive modal cockpit** |

---

## 🛠️ Architecture & Storage

Anchor uses atomic file-replacement writes (`state.json.tmp.<pid>` renamed over `state.json`), ensuring consistent JSON structure across abrupt terminal exits.

```
.anchor/
├── state.json           # Live active and sleeping states (< 5KB)
├── archive.jsonl        # Append-only ledger of settled contracts
└── graveyard.jsonl      # Append-only records of expired items
```

---

## 🚀 Quick Start (Pi Native Extension)

Copy the package into your Pi extension directory:
```bash
cp -r projects/anchor ~/.pi/agent/extensions/anchor
```

Invoke through standard terminal commands:
```bash
/anchor               # Open interactive dashboard
/pin "Fix auth bug"   # Create a persistent anchor
/anchor sweep         # Trigger manual decay sweep
```

---

## 🧪 Automated Test Suite

Engineered with 100% standard library test coverage using Node.js native test runner:

```bash
cd projects/anchor
npm test
```

```text
✔ ContextInjector - renders only active anchors, sleeping consume 0 tokens (96ms)
✔ AnchorDecay - status evaluation transitions (1.6ms)
✔ AnchorDecay - sweepStore transitions and graveyard eviction (139ms)
✔ AnchorMatcher - exact, prefix, and tag matching (2.0ms)
✔ AnchorMatcher - findMatchedAnchors prioritizes high-confidence & high-priority (0.5ms)
✔ SessionTouchObserver - records read, edit, write and commits (1.6ms)
✔ AnchorStore - basic CRUD & atomic writes (80ms)
✔ AnchorStore - corrupt state recovery (19ms)

ℹ pass 8, fail 0 (360ms total)
```

---

## 📄 License

MIT License © [Jason Song](https://github.com/3ZEROS12)
