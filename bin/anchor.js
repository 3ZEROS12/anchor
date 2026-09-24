#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task protocol for AI coding workflows
 * Production-ready executable with dual-timeline & 4-quadrant cognitive grouping
 */

import {
  AnchorStore,
  classifyAnchor,
  formatOrigin,
  formatTargetDate,
  formatCreationTime,
  groupAnchorsByQuadrant,
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

  console.log(`\n⌖ Anchors (${active.length} active):\n`);

  const groups = groupAnchorsByQuadrant(active);
  const sections = [
    { title: 'Today · 今日聚焦', list: groups.today },
    { title: 'Upcoming · 近期排期', list: groups.upcoming },
    { title: 'Habits · 每日循环', list: groups.habits },
    { title: 'Backlog · 长期愿景', list: groups.backlog },
  ];

  let seqNum = 1;

  for (const sec of sections) {
    if (sec.list.length === 0) continue;
    console.log(`  [${sec.title}]`);
    sec.list.forEach((a) => {
      const num = seqNum.toString().padStart(2, '0');
      seqNum++;

      const category = padToWidth(`[${classifyAnchor(a)}]`, 12);
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

      console.log(`${colNum}${category}${colTitle}  ${colOrigin}  ${colTarget}  ${colCreated}`);
    });
    console.log('');
  }

  console.log('  Use `anchor done <id>` to complete.\n');
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
    const active = store.list({ status: 'active', cwd: process.cwd() });
    const groups = groupAnchorsByQuadrant(active);
    const sortedActive = [
      ...groups.today,
      ...groups.upcoming,
      ...groups.habits,
      ...groups.backlog
    ];

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
