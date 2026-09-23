#!/usr/bin/env node

/**
 * Anchor CLI - Minimalist task pin for AI coding workflows
 */

import { AnchorStore } from '../src/store.ts';
import { formatOrigin, formatLifecycle, formatRelativeTime } from '../src/tui.ts';

const store = new AnchorStore();
const args = process.argv.slice(2);

// 1. View pending tasks: `anchor` or `anchor list`
if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
  const active = store.list({ status: 'active', cwd: process.cwd() });

  if (active.length === 0) {
    console.log('⌖ 暂无未完成的任务。使用 `anchor <任务描述>` 记录。\n');
    process.exit(0);
  }

  console.log('\n⌖ 待办清单:');
  active.forEach((a, i) => {
    const num = (i + 1).toString().padStart(2, '0');
    const origin = formatOrigin(a.cwd);
    const lifecycle = formatLifecycle(a.durability);
    const relTime = formatRelativeTime(a.createdAt);
    const fileTag = (a.files && a.files.length > 0) ? ` [${a.files.slice(0, 1).join(', ')}]` : '';
    console.log(`  ${num}  ${a.title}${fileTag}  ${origin}  ${lifecycle}  ${relTime}`);
  });
  console.log('\n  输入 `anchor done <id>` 划掉完成。\n');
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
    console.log(`⌖ 已完成: "${settled.title}"`);
  } catch (err) {
    console.error(`错误: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

// 3. Pin new task: `anchor <task description>`
const title = args.join(' ').trim();
const anc = store.create({ title, cwd: process.cwd() });
const lifecycle = formatLifecycle(anc.durability);
console.log(`⌖ 已记录: "${anc.title}"  ${lifecycle}`);
