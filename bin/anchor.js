#!/usr/bin/env node

/**
 * Anchor CLI — Minimalist terminal sticky notes for AI coding
 */

import {
  AnchorStore,
  formatOrigin,
  formatRelativeAge,
  sortAnchorsForDisplay,
  padToWidth
} from '../dist/index.js';

const store = new AnchorStore();
const args = process.argv.slice(2);

// 1. View sticky notes: `anchor` or `anchor list`
if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
  const allNotes = store
    .list({ cwd: process.cwd(), all: true })
    .filter(a => a.status === 'active' || a.status === 'sleeping');

  if (allNotes.length === 0) {
    console.log('\n⌖ No sticky notes. Run `anchor "<note>"` to stick one.\n');
    process.exit(0);
  }

  const sorted = sortAnchorsForDisplay(allNotes, process.cwd());
  console.log(`\n⌖ Notes (${sorted.length}):\n`);

  sorted.forEach((a, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const origin = formatOrigin(a);
    const age = a.status === 'sleeping'
      ? `${formatRelativeAge(a.createdAt)} · quiet`
      : formatRelativeAge(a.createdAt);

    const colNum = `  ${num}  `;
    const colTitle = padToWidth(a.title, 42);
    const colOrigin = padToWidth(origin, 22);

    console.log(`${colNum}${colTitle}  ${colOrigin}  ${age}`);
  });

  console.log('\n  Run `anchor done <num>` to tear off, or `anchor undo` to put back.\n');
  process.exit(0);
}

// 2. Put back last torn-off note: `anchor undo`
if (args[0] === 'undo') {
  try {
    const restored = store.undoSettle();
    console.log(`⌖ Put back #${restored.id.replace(/^anc-/, '')}: "${restored.title}"`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 3. Help: `anchor --help`
if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
  console.log(`
⌖ Anchor — Digital sticky notes for AI coding sessions

Usage:
  anchor                    View all sticky notes
  anchor "<note>"           Stick a new note
  anchor done <num>         Tear off a completed note (e.g. anchor done 1)
  anchor undo               Put back the last torn-off note
`);
  process.exit(0);
}

// 4. Tear off note: `anchor done <num>`
if (args[0] === 'done' || args[0] === 'rm' || args[0] === 'close') {
  const idInput = args[1];
  if (!idInput) {
    console.error('Usage: anchor done <num>');
    process.exit(1);
  }
  try {
    const allNotes = store
      .list({ cwd: process.cwd(), all: true })
      .filter(a => a.status === 'active' || a.status === 'sleeping');
    const sorted = sortAnchorsForDisplay(allNotes, process.cwd());

    let targetId = idInput;
    if (/^\d+$/.test(idInput)) {
      const seqIndex = parseInt(idInput, 10);
      if (seqIndex >= 1 && seqIndex <= sorted.length) {
        targetId = sorted[seqIndex - 1].id;
      }
    }

    const settled = store.settle(targetId, { settledBy: 'manual' });
    console.log(`⌖ Torn off: "${settled.title}"`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 5. Stick a new note: `anchor <note text>`
const title = args.join(' ').trim();
if (!title) {
  console.error('Error: Note text cannot be empty');
  process.exit(1);
}

const created = store.create({
  title,
  cwd: process.cwd()
});
console.log(`⌖ Pinned #${created.id.replace(/^anc-/, '')}: "${created.title}"`);
