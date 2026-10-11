# ⌖ Anchor

> **A digital sticky note docked below your Pi editor — with four clever touches.**  
> Stick a note in 0ms (`pin: ...`), see it persistently below your editor (`belowEditor`, zero collision with `aboveEditor` extensions), track long tasks with micro progress bars `[■■□□ 2/4]`, jump straight back to the original conversation session (`↪`), and auto-tear off on `git commit`.

[![CI Status](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Node v20+](https://img.shields.io/badge/Node-v20+-22c55e.svg)](package.json)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg)](tsconfig.json)
[![Tests: 10 Passed](https://img.shields.io/badge/Tests-10%20Passed-22c55e.svg)](tests/store.test.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)

**English** | [简体中文](./README_zh.md)

```bash
pi install npm:pi-anchor
```

<p align="center">
  <img src="assets/hero-en.svg" alt="Anchor Sticky Notes" width="820">
</p>

```text
╭─ Pi Editor ──────────────────────────────────────────────────────────────────────╮
│ ❯ pin: Refactor auth flow: 1. Extract interface 2. HttpOnly cookie 3. Unit tests │
╰──────────────────────────────────────────────────────────────────────────────────╯
  ⌖ #1 [■■□□ 2/4] Refactor auth flow ▸ Unit tests (app · auth.ts ↪)
```

---

## Why Anchor?

When you're deep in a coding session and think *"Wait — I need to check the rate-limit fallback in `src/gateway.ts` after this"*, or when you pause a multi-day task for the night:
- Writing a `TODO.md` inside your repo pollutes `git status` and burns prompt tokens on every turn.
- Normal startup banners vanish the second you send a message, so you forget what you wrote.

**Anchor is a real sticky note stuck right under your Pi input box (`belowEditor`)** — stored outside your repo in `~/.anchor/state.json` (4 source files, 0 dependencies), designed for **human hands first**:

### 1. Docked Below Your Editor & 0ms Instant Stick (`pin: ...`)
- **Zero Widget Collision**: Anchor docks its 1-line strip **below** your editor (`placement: "belowEditor"`), leaving the space above your editor (`aboveEditor`) 100% free for tools like `pi-lingual`.
- **0ms Human Input**: Type `pin: Check token expiry` (or `note: ...`, `便签: ...`, `/pin ...`) directly in the editor. Anchor intercepts it in **0.00ms** without triggering an LLM call or burning tokens, and automatically links the file you were just editing.

### 2. Micro Progress Bar for Long Tasks (`[■■□□ 2/4]`)
- Write a ratio (`[2/4]` or `5/30`) or numbered steps (`1. Extract interface 2. HttpOnly cookie 3. Unit tests`) in your note:
  ```text
  /pin Refactor auth flow: 1. Extract interface 2. HttpOnly cookie 3. Unit tests
  ```
- Anchor renders a crisp micro progress bar (`[■■□□ 2/3] ▸ Unit tests`) right on the sticky strip. Run `/step 1` (or select `▶ Advance step` in `/anchor`) to tick it forward. Simple one-off notes stay 100% bar-free.

### 3. Conversation Session Bookmark (`↪ Jump to session`)
- Every sticky note automatically bookmarks the Pi conversation session (`sessionFile`) where it was created or last worked on.
- Days later, open `/anchor` and pick **`↪ Jump to session`** (or run `/anchor jump 1`) to teleport Pi straight back into that exact conversation history.

### 4. File Whisper & Auto-Tear on `git commit`
- **1-Line File Whisper (0 Idle Tokens)**: Briefs the AI once on Turn 1, then consumes **0 tokens** on Turn 2+. When the AI reads or edits a matching file, Anchor slips a 1-line comment (`// ⌖ Note #1: ...`) onto that file result (strictly skipping `.json` and `.env`).
- **Auto-Tear on Commit**: When `git commit -m "..."` matches your note, Anchor tears the note off automatically (`⌖ Auto-torn off #1`). Run `/anchor undo` anytime to put it back.

---

## Commands

| Where | Input / Command | What It Does |
| :--- | :--- | :--- |
| **Pi Editor** | `pin: <note>` or `便签: <note>` | Stick a note in **0ms** without calling the LLM |
| **Pi Slash** | `/pin <note>` | Stick a note (supports `[1/4]` or `1. A 2. B` steps) |
| **Pi Slash** | `/anchor` | Open interactive board (tear off, `+1` step, or `↪` jump to session) |
| **Pi Slash** | `/step 1` | Advance progress bar on note `#1` by `+1` |
| **Pi Slash** | `/anchor jump 1` | Switch Pi back to the conversation session linked to note `#1` |
| **Pi Slash** | `/done 1` / `/anchor undo` | Tear off note `#1`, or put back the last torn-off note |
| **Terminal CLI** | `anchor` / `anchor step 1` / `anchor done 1` | View, step, or tear off notes outside Pi |

---

## License

MIT © [Jason Song](https://github.com/3ZEROS12)
