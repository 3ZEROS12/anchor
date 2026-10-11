#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task protocol for AI coding workflows
 * Production-ready executable with dual-timeline & 4-quadrant cognitive grouping
 */

import {
  AnchorStore,
  formatOrigin,
  formatTargetDate,
  formatCreationTime,
  sortAnchorsForDisplay,
  padToWidth
} from '../dist/index.js';

const store = new AnchorStore();
const args = process.argv.slice(2);

// 1. View pending tasks: `anchor` or `anchor list`
if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
  const allUnfinished = store
    .list({ cwd: process.cwd(), all: true })
    .filter(a => a.status === 'active' || a.status === 'sleeping');

  if (allUnfinished.length === 0) {
    console.log('\n⌖ No active anchors. Use `anchor <task>` to record.\n');
    process.exit(0);
  }

  const sorted = sortAnchorsForDisplay(allUnfinished, process.cwd());
  const activeCount = sorted.filter(a => a.status === 'active').length;
  const quietCount = sorted.length - activeCount;
  const headerSuffix = quietCount > 0 ? `${activeCount} active, ${quietCount} quiet` : `${activeCount} active`;

  console.log(`\n⌖ Anchors (${headerSuffix}):\n`);

  sorted.forEach((a, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    const badge = a.status === 'sleeping'
      ? padToWidth('[Quiet]', 10)
      : padToWidth(`[${a.priority.toUpperCase()}]`, 10);
    const origin = formatOrigin(a);
    const target = a.status === 'sleeping' ? 'Quiet (0 tok)' : formatTargetDate(a);
    const created = formatCreationTime(a.createdAt);

    const titleWithFiles = (a.files && a.files.length > 0)
      ? `${a.title} [${a.files.slice(0, 1).join(', ')}]`
      : a.title;

    const colNum = `  ${num}  `;
    const colTitle = padToWidth(titleWithFiles, 36);
    const colOrigin = padToWidth(origin, 14);
    const colTarget = padToWidth(target, 14);
    const colCreated = created;

    console.log(`${colNum}${badge}${colTitle}  ${colOrigin}  ${colTarget}  ${colCreated}`);
  });

  console.log('\n  Use `anchor done <id>` to complete, or `anchor undo` to restore.\n');
  process.exit(0);
}

// 2. Undo settlement: `anchor undo`
if (args[0] === 'undo') {
  try {
    const restored = store.undoSettle();
    console.log(`⌖ Restored #${restored.id}: "${restored.title}"`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 3. Help: `anchor --help` or `anchor -h`
if (args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
  console.log(`
⌖ Anchor CLI - Cross-session task protocol for AI coding agents

Usage:
  anchor                    List active anchors
  anchor <task>             Pin a new task across sessions
  anchor done <id>          Settle and evict a task (e.g. anchor done 1)
  anchor undo               Restore the last settled task

Options:
  -h, --help                Show this help message
  -v, --version             Show version
  -d, --due <date>          Specify expected completion date (e.g. tomorrow, friday, 2026-09-28)
`);
  process.exit(0);
}

// 4. Close task: `anchor done <id>` or `anchor rm <id>`
if (args[0] === 'done' || args[0] === 'rm' || args[0] === 'close') {
  const idInput = args[1];
  if (!idInput) {
    console.error('Usage: anchor done <id>');
    process.exit(1);
  }
  try {
    // 1. Check if idInput is a 1-based sequential display number (e.g. '1', '01')
    const allUnfinished = store
      .list({ cwd: process.cwd(), all: true })
      .filter(a => a.status === 'active' || a.status === 'sleeping');
    const sortedActive = sortAnchorsForDisplay(allUnfinished, process.cwd());

    let targetId = idInput;
    const numMatch = idInput.match(/^\d+$/);
    if (numMatch) {
      const seqIndex = parseInt(idInput, 10);
      if (seqIndex >= 1 && seqIndex <= sortedActive.length) {
        targetId = sortedActive[seqIndex - 1].id;
      }
    }

    const settled = store.settle(targetId, { settledBy: 'manual-command' });
    const successMsg = settled.recurrence === 'daily'
      ? `⌖ Completed for today: "${settled.title}" (resets tomorrow)`
      : `⌖ Settled: "${settled.title}"`;
    console.log(successMsg);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 5. Pin new task: `anchor <task description> [--due <date>]`
let targetDateFlag;
const dueIdx = args.findIndex(a => a === '--due' || a === '-d');
if (dueIdx !== -1 && args[dueIdx + 1]) {
  targetDateFlag = args[dueIdx + 1];
  args.splice(dueIdx, 2);
}

const title = args.join(' ').trim();
if (!title) {
  console.error('Error: task description cannot be empty.');
  process.exit(1);
}

const anc = store.create({
  title,
  targetDate: targetDateFlag,
  cwd: process.cwd()
});
const targetBadge = anc.targetDate ? ` · ${formatTargetDate(anc)}` : '';
console.log(`⌖ Pinned #${anc.id}: "${anc.title}" [${anc.project}]${targetBadge}`);
