# Contributing to Anchor

Thank you for your interest in contributing to Anchor! We welcome contributions that preserve our core engineering invariants:
1. **Zero workspace contamination**: Anchor must never pollute project git trees;
2. **0-token idle economy**: Inactive/sleeping anchors must never consume prompt tokens;
3. **No heavy binary bloat**: Zero native binary dependencies (pure TypeScript/Node).

---

## 🛠️ Development Setup

### Prerequisites
- Node.js >= 20.0.0 (LTS)
- npm or pnpm

### Clone & Install
```bash
git clone https://github.com/3ZEROS12/anchor.git
cd anchor
npm install
```

### Build & Typecheck
```bash
# Build dual ESM/CJS bundles + declaration maps
npm run build

# Strict TypeScript check (0 errors required)
npm run typecheck
```

### Running Tests
We use Node's native test runner without third-party test runners:
```bash
npm test
```

---

## 📐 Pull Request Guidelines

1. **Keep diffs minimal & targeted**: Shortest working diff wins (Ponytail principle).
2. **Add runnable unit tests**: Every non-trivial algorithm change must include at least one test in `tests/`.
3. **Strict type safety**: All code must pass `tsc --noEmit` with zero errors.
4. **Preserve CJK full-width awareness**: Any CLI/TUI output changes must use `getDisplayWidth` / `padToWidth` to prevent visual column tearing on multi-byte characters.
