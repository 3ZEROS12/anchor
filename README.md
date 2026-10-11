# ⌖ Anchor

> **A digital sticky note for Pi Coding Agent — with three clever touches.**  
> Stick a quick note across sessions (`/pin`), get a 1-line comment whisper when the AI touches that file, and watch the note tear itself off when you `git commit`. Zero `TODO.md` clutter in your repo.

[![CI Status](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Node v20+](https://img.shields.io/badge/Node-v20+-22c55e.svg)](package.json)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg)](tsconfig.json)
[![Tests: 9 Passed](https://img.shields.io/badge/Tests-9%20Passed-22c55e.svg)](tests/store.test.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)

**English** | [简体中文](./README_zh.md)

```bash
pi install npm:pi-anchor
```

<p align="center">
  <img src="assets/hero-en.svg" alt="Anchor Sticky Notes" width="820">
</p>

```text
⌖ Notes (3):

  01  Switch session token to HttpOnly cookie      app · auth.ts          25m ago
  02  Double-check rate limit fallback on timeout  app · gateway.ts       3h ago
  03  Read external architecture notes first       College/优化 · notes.md 8d ago · quiet

  Run `anchor done <num>` to tear off, or `anchor undo` to put back.
```

---

## Why a Sticky Note Instead of `TODO.md`?

When you're deep in a coding session at 11 PM and realize *"I still need to fix the token expiry in `src/auth.ts` tomorrow"*, you don't want a heavy task manager:
- Putting a `TODO.md` inside your repo pollutes `git status` and forces the AI to re-read stale checklists on every single turn.
- Closing the terminal wipes the agent's working memory clean.

**Anchor is just a physical sticky note stuck to the bezel of your terminal** — stored outside your repo in `~/.anchor/state.json` (<10 KB, zero external dependencies, 4 source files), with three small, thoughtful touches:

### 1. Stick It & Forget It (Smart Path Spotting)
Write a note in plain language:
```text
/pin Switch session token to HttpOnly cookie in src/auth.ts
```
Anchor spots `src/auth.ts` (or any project path like `D:/College/...`) directly from your sentence — no forms or tags to fill out. Next time you open Pi in that project, a quiet card sits above your editor (`⌖ 1 note`) and disappears the moment you start typing.

### 2. A Gentle Whisper When Touching the File (0 Idle Tokens)
Anchor briefs the AI once on Turn 1 of a session, then drops to **0 tokens** from Turn 2 onwards.  
When the AI reads or edits `src/auth.ts`, Anchor slips a single syntax-safe comment onto the end of that file read (`// ⌖ Note #1: Switch session token to HttpOnly cookie`), while strictly skipping `.json`, `.env`, and lockfiles.

*(Notes untouched for more than 7 days automatically enter `quiet` mode so they don't spend Turn-1 tokens in unrelated workspaces, while staying 100% visible in `/anchor` and waking up as soon as you open their project.)*

### 3. Auto-Tears Off on `git commit`
When you or the AI commits the fix (`git commit -m "feat: switch session token to HttpOnly cookie"`), Anchor matches the commit message against your sticky notes and tears the note off in real time (`⌖ Auto-torn off #1`).  
Tore one off by mistake? Run `/anchor undo` to stick it right back.

---

## Commands

| Where | Command | What It Does |
| :--- | :--- | :--- |
| **Inside Pi** | `/pin <note>` | Stick a new note (or just tell the AI *"Remember to..."*) |
| **Inside Pi** | `/anchor` | Open the interactive sticky note list (press Enter to tear off or read) |
| **Inside Pi** | `/done 1` | Tear off note `#01` directly |
| **Inside Pi** | `/anchor undo` | Put back the last torn-off note |
| **Terminal CLI** | `anchor` / `anchor "<note>"` / `anchor done 1` | Manage the exact same sticky notes outside Pi |

---

## License

MIT © [Jason Song](https://github.com/3ZEROS12)
