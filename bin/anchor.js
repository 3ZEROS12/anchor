#!/usr/bin/env node

/**
 * Anchor - Minimalist task pin for AI coding workflows
 * 3 actions only:
 *   anchor                (view pending)
 *   anchor <task>         (pin new)
 *   anchor done <id>      (close completed)
 */

import { AnchorStore } from '../src/store.ts';

const store = new AnchorStore();
const args = process.argv.slice(2);

// 1. View pending tasks (anchor or anchor list)
if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
  const showAll = args.includes('-a') || args.includes('--all');
  const active = store.list({ status: 'active', cwd: showAll ? undefined : process.cwd(), all: showAll });
  if (active.length === 0) {
    console.log('⚓ 暂无未完成的锚点任务。用 `anchor <任务描述>` 记录。');
  } else {
    console.log('⚓ 待办锚点:');
    for (const a of active) {
      const dura = a.durability === 'ephemeral' ? ' [短期备忘]' : '';
      console.log(`  #${a.id}  ${a.title}${dura}`);
    }
  }
  process.exit(0);
}

// 2. Close task: anchor done <id> / anchor rm <id>
if (args[0] === 'done' || args[0] === 'rm' || args[0] === 'close') {
  const id = args[1];
  if (!id) {
    console.error('用法: anchor done <id>');
    process.exit(1);
  }
  try {
    store.settle(id, { settledBy: 'manual-command' });
    console.log(`⚓ 已完成并清除 #${id}`);
  } catch (err) {
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 3. Pin new task: anchor "my task description"
const title = args.join(' ').trim();
const anc = store.create({ title, cwd: process.cwd() });
console.log(`⚓ 已记录 #${anc.id}: "${anc.title}"`);
