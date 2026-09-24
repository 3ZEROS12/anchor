#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task protocol for AI coding workflows
 * Production-ready executable with dual-timeline (Target Date + Creation Time)
 */

import {
  AnchorStore,
  formatOrigin,
  formatTargetDate,
  formatCreationTime,
  padToWidth
} from '../dist/index.js';

const store = new AnchorStore();
const args = process.argv.slice(2);

// 1. View pending tasks: `anchor` or `anchor list`
if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
  const active = store.list({ status: 'active', cwd: process.cwd() });

  if (active.length === 0) {
    console.log('\n⌖ No active anchors. Use `anchor <task>` to record.\n');
    process.exit(0);
  }

  console.log('\n⌖ Anchors:');
  active.forEach((a) => {
    const idNum = a.id.replace(/^anc-/, '');
    const num = idNum.padStart(2, '0');
    const origin = formatOrigin(a);
    const target = formatTargetDate(a);
    const created = formatCreationTime(a.createdAt);

    const titleWithFiles = (a.files && a.files.length > 0)
      ? `${a.title} [${a.files.slice(0, 1).join(', ')}]`
      : a.title;

    const colNum = `  ${num}  `;
    const colTitle = padToWidth(titleWithFiles, 28);
    const colOrigin = padToWidth(origin, 10);
    const colTarget = padToWidth(target, 12);
    const colCreated = created;

    console.log(`${colNum}${colTitle}  ${colOrigin}  ${colTarget}  ${colCreated}`);
  });
  console.log('\n  Use `anchor done <id>` to complete.\n');
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
`);
  process.exit(0);
}

// 4. Close task: `anchor done <id>` or `anchor rm <id>`
if (args[0] === 'done' || args[0] === 'rm' || args[0] === 'close') {
  const id = args[1];
  if (!id) {
    console.error('Usage: anchor done <id>');
    process.exit(1);
  }
  try {
    const settled = store.settle(id, { settledBy: 'manual-command' });
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

// 5. Pin new task: `anchor <task description>`
const title = args.join(' ').trim();
const anc = store.create({ title, cwd: process.cwd() });
const targetBadge = anc.targetDate ? ` · ${formatTargetDate(anc)}` : '';
console.log(`⌖ Pinned #${anc.id}: "${anc.title}" [${anc.project}]${targetBadge}`);
