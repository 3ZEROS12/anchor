# ⚓ Anchor

<p align="center">
  <strong>The Zero-Pollution, Context-Aware, Self-Evicting Task Protocol for AI Coding Agents.</strong><br>
  <em>Stop polluting your AGENTS.md. Never forget across sessions; never rot inside context.</em>
</p>

<p align="center">
  <a href="README_zh.md">🇨🇳 简体中文</a> •
  <a href="#-the-fatal-flaw-of-existing-solutions">💡 Why Anchor</a> •
  <a href="#-three-core-mechanisms">✨ Core Mechanisms</a> •
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

## 💡 The Fatal Flaw of Existing Solutions

Every software engineer working daily with AI coding agents (Claude Code, Pi, Cursor, Aider) suffers from three inescapable dilemmas:

1. **The Alzheimer's Void**: Press `Ctrl+C` or restart your terminal, and your agent forgets yesterday's crucial multi-turn commitments and architectural refactoring goals.
2. **The Markdown Rot Trap**: To prevent forgetting, developers stuff tasks into `AGENTS.md`, `CLAUDE.md`, or `TODO.md`. Two weeks later, it festers into 800 lines of obsolete debris, burning thousands of precious context tokens on every single turn.
3. **The Completion Paradox**: Unit tests only cover a fraction of real-world tasks (e.g., refactoring logic, reviewing design, triaging tech debt). Expecting humans to remember to manually tick checkboxes in a markdown file is a psychological impossibility.

**Anchor treats tasks not as static todo lists, but as short-term commercial promissory notes (Settlement Contracts): backed by evidence, resurfaced upon touch, closed face-to-face at session exit, and naturally decayed if abandoned.**

---

## ✨ Three Core Mechanisms

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

### 1. 🚪 One-Tap Exit Settlement (贴脸一键结案)
When you finish coding and exit the session (typing `/exit` or pressing `Ctrl+C`), Anchor observes the files modified during the turn (e.g., via `tool_call` interception and `git status`). If modified files correlate with an active anchor, Anchor prompts a direct one-tap dialog:
```text
───────────────────────────────────────────────────────────────────
⚓ Anchor Settlement Proposal
   Task #anc-1: Migrate JWT cookies to HTTP-only [P0]
   Trigger: Modified src/auth/login.ts, src/auth/jwt.ts
   [Enter Confirm Settle & Evict]  /  [Tab Keep Pending]
───────────────────────────────────────────────────────────────────
```
No manual commands to remember. You hit **Enter** at the peak moment of completion, and the task is closed, archived, and evicted from context.

### 2. ⚡ Context-Aware Resurface (意图触碰唤醒)
Active tasks remain silent and never flood the prompt. When you or the agent touch a related directory (e.g., calling `read` on `src/auth/`), Anchor gently pulses an awareness indicator on the footer status line:
> `💡 Anchor: Touched auth module. Anchor #anc-1 (JWT migration) is active. Press Tab to view.`

### 3. ⏳ Half-Life Decay & Auto-Sweep (遗忘半衰期自净)
Tasks that you abandon never rot inside your agent's instructions:
* **Days 0–3 (Active)**: Visible on footer status capsule; injected as a 2-line minimal tag.
* **Days 4–7 (Sleeping)**: Automatically silenced from System Prompt. **Consumes exactly 0 tokens.**
* **Day 14+ (Graveyard)**: Auto-swept into `.anchor/graveyard.jsonl` without manual intervention.

---

## 📊 Comparison

| Dimension | `gastownhall/beads` (27k ⭐) | `engram` (6.7k ⭐) | `AGENTS.md` / `TODO.md` | **Anchor ⚓ (Ours)** |
| :--- | :--- | :--- | :--- | :--- |
| **Philosophy** | Distributed SQL Graph | Passive Knowledge Brain | Static text checklist | **Auto-evicting promissory notes** |
| **Dependencies** | Heavy (200MB Dolt DB) | Go binary + SQLite | None | **Zero runtime dependencies (pure TS/Node)** |
| **Context Overhead**| Medium (requires `bd prime`) | High (injects facts) | Severe (>500 lines of rot) | **Ultra-compact (2 lines active, 0 lines sleeping)** |
| **Exit Settlement** | ❌ None (must manually close) | ❌ No task lifecycle | ❌ None (manual delete) | **✅ Yes (One-Tap prompt on exit)** |
| **Decay / Auto-Sweep**| ❌ No (manual prune) | ❌ No decay | ❌ No (rots permanently) | **✅ Built-in 3/7/14-day half-life machine** |
| **TUI Experience** | Basic CLI output | Catppuccin TUI | Plain text | **Footer capsule + interactive Cockpit modal** |

---

## 🛠️ Architecture & Storage

Anchor uses atomic file-replacement writes (`state.json.tmp.<pid>` ➔ `renameSync`) guaranteeing zero JSON corruption even if the terminal is abruptly killed.

```
.anchor/
├── state.json           # Live state (active & sleeping anchors, < 5KB)
├── archive.jsonl        # Append-only history of settled contracts
└── graveyard.jsonl      # Append-only records of expired & swept items
```

---

## 🚀 Quick Start

### For Pi Coding Agent (Native Extension)

1. Clone or copy into your Pi extension directory:
```bash
# Link to global Pi extensions
cp -r projects/anchor ~/.pi/agent/extensions/anchor
```

2. Open any project and use native commands:
```bash
/anchor                # Open the interactive Cockpit dashboard
/pin "Fix auth bug"    # Instantly anchor a commitment
/anchor sweep          # Manually trigger decay sweep
```

### Standalone Node Usage

```typescript
import { AnchorStore, evaluateAnchorDecay } from '@3zeros12/anchor';

const store = new AnchorStore('./my-project');
const anchor = store.create({
  title: 'Optimize memory leak in export worker',
  priority: 'p0',
  files: ['src/worker/export.ts']
});

// Settle with evidence
store.settle(anchor.id, { settledBy: 'one-tap-settlement' });
```

---

## 🧪 Rigorous Automated Tests

Engineered with 100% standard library test coverage using Node.js native test runner:

```bash
cd projects/anchor
npm test
```

```text
✔ ContextInjector - renders only active anchors, sleeping consume 0 tokens (107ms)
✔ AnchorDecay - status evaluation transitions (1.4ms)
✔ AnchorDecay - sweepStore transitions and graveyard eviction (149ms)
✔ AnchorMatcher - exact, prefix, and tag matching (2.6ms)
✔ AnchorMatcher - findMatchedAnchors prioritizes high-confidence & high-priority (0.5ms)
✔ SessionTouchObserver - records read, edit, write and commits (1.6ms)
✔ AnchorStore - basic CRUD & atomic writes (76ms)
✔ AnchorStore - corrupt state recovery (4.5ms)

ℹ pass 8, fail 0 (363ms total)
```

---

## 📄 License

MIT © [Jason Song](https://github.com/3ZEROS12)
