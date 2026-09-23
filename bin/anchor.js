#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task pin for AI coding workflows
 * Production-ready executable importing from prebuilt dist/
 */

import { AnchorStore, formatOrigin, formatRelativeTime, formatRemainingTtl } from '../dist/index.js';

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
  active.forEach((a, i) => {
    const num = (i + 1).toString().padStart(2, '0');
    const origin = formatOrigin(a.cwd);
    const relTime = formatRelativeTime(a.createdAt);
    const ttl = formatRemainingTtl(a);

    const metaParts = [origin];
    if (a.files && a.files.length > 0) {
      metaParts.push(a.files.slice(0, 1).join(', '));
    }
    if (ttl) {
      metaParts.push(ttl);
    }
    metaParts.push(relTime);

    console.log(`  ${num}  ${a.title.padEnd(28, ' ')} · ${metaParts.join(' · ')}`);
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
    console.log(`⌖ Settled: "${settled.title}"`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 3. Pin new task: `anchor <task description>`
const title = args.join(' ').trim();
const anc = store.create({ title, cwd: process.cwd() });
const expireBadge = anc.durability === 'ephemeral' ? ' · 48h left' : '';
console.log(`⌖ Pinned #${anc.id}: "${anc.title}"${expireBadge}`);
