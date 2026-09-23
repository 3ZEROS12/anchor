#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task pin for AI coding workflows
 * Touchpoint 3 (Plan 2): Geometric Neovim/Geek output with folder metadata.
 */

import { AnchorStore } from '../src/store.ts';
import { evaluateAnchorDecay } from '../src/decay.ts';
import path from 'node:path';

const store = new AnchorStore();
const args = process.argv.slice(2);

// 1. View pending tasks: `anchor` or `anchor list`
if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
  const showAll = args.includes('-a') || args.includes('--all');
  const active = store.list({ status: 'active', cwd: showAll ? undefined : process.cwd(), all: showAll });
  const sleeping = store.list({ status: 'sleeping', cwd: showAll ? undefined : process.cwd(), all: showAll });

  const currentScope = showAll ? 'All Workspaces' : (path.basename(process.cwd()) || 'Current');
  console.log(`\n⌖ 跨会话任务 · ${currentScope}`);

  if (active.length === 0 && sleeping.length === 0) {
    console.log('  暂无未完成的任务。使用 `anchor <任务描述>` 记录。\n');
    process.exit(0);
  }

  if (active.length > 0) {
    active.forEach((a, i) => {
      const decay = evaluateAnchorDecay(a);
      const icon = a.durability === 'ephemeral' ? '◇' : '◈';
      const num = (i + 1).toString().padStart(2, '0');

      let folder = '[全局]';
      if (a.files && a.files.length > 0) {
        folder = `[${a.files.slice(0, 1).join(', ')}]`;
      } else if (a.cwd) {
        folder = `[${path.basename(a.cwd)}]`;
      }

      const decayInfo = a.durability === 'ephemeral' ? '48h' : `${decay.remainingActiveDays}d`;
      console.log(`  ${icon} ${num}  ${a.title.padEnd(28, ' ')}  ${folder.padEnd(16, ' ')}  (${decayInfo})`);
    });
  }

  if (sleeping.length > 0) {
    console.log('\n  休眠中 (0 context tokens):');
    sleeping.forEach((a, i) => {
      const decay = evaluateAnchorDecay(a);
      const num = (i + 1).toString().padStart(2, '0');
      let folder = a.cwd ? `[${path.basename(a.cwd)}]` : '[全局]';
      console.log(`  ○ ${num}  ${a.title.padEnd(28, ' ')}  ${folder.padEnd(16, ' ')}  (${decay.remainingSleepDays}d 后脱落)`);
    });
  }

  console.log(`\n  输入 'anchor done <id>' 结案。\n`);
  process.exit(0);
}

// 2. Close task: `anchor done <id>` or `anchor rm <id>`
if (args[0] === 'done' || args[0] === 'rm' || args[0] === 'close') {
  const id = args[1];
  if (!id) {
    console.error('用法: anchor done <id>');
    process.exit(1);
  }
  try {
    const settled = store.settle(id, { settledBy: 'manual-command' });
    console.log(`⌖ 已完成并清除 #${id}: "${settled.title}"`);
  } catch (err) {
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 3. Pin new task: `anchor <task description>`
const title = args.join(' ').trim();
const anc = store.create({ title, cwd: process.cwd() });
const icon = anc.durability === 'ephemeral' ? '◇' : '◈';
console.log(`⌖ 已记录 ${icon} #${anc.id}: "${anc.title}"`);
