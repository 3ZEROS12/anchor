#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task pin for AI coding workflows
 */

import { AnchorStore } from '../src/store.ts';
import { formatOrigin, formatRelativeTime, formatRemainingTtl } from '../src/tui.ts';

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

// 2. Close task: `anchor done <id>` or `anchor rm <id>`
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
