import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import {
  updateAnchorStatusBar,
  openAnchorDashboard,
  formatTargetDate,
  formatCreationTime,
  getDisplayWidth,
  padToWidth
} from '../src/tui.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-clean-tui-test-'));
}

test('AnchorTUI - status bar reflects active state cleanly with ⌖ N', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    let currentStatus: string | undefined = 'initial';

    const mockCtx = {
      cwd: '/workspace/project-a',
      hasUI: true,
      ui: {
        setStatus: (_key: string, text: string | undefined) => {
          currentStatus = text;
        }
      }
    } as unknown as ExtensionContext;

    // 1. Zero active -> undefined (completely invisible)
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, undefined);

    // 2. One active anchor matching cwd -> ⌖ 1
    store.create({ title: 'Task Alpha', cwd: '/workspace/project-a' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '⌖ 1');

    // 3. Two active anchors -> ⌖ 2
    store.create({ title: 'Task Beta', cwd: '/workspace/project-a' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '⌖ 2');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - formatTargetDate and formatCreationTime render clear dual-timeline', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const now = 100_000_000_000;

    const aToday = store.create({ title: '今天完成优化' });
    const aTomorrow = store.create({ title: '明天完成优化' });
    const aIn2d = store.create({ title: '后天完成优化' });
    const aDaily = store.create({ title: '每天吃苹果' });
    const aLongTerm = store.create({ title: '重构底层架构' });

    assert.strictEqual(formatTargetDate(aToday, aToday.createdAt), 'Today');
    assert.strictEqual(formatTargetDate(aTomorrow, aTomorrow.createdAt), 'Tomorrow');
    assert.strictEqual(formatTargetDate(aIn2d, aIn2d.createdAt), 'In 2d');
    assert.strictEqual(formatTargetDate(aDaily, aDaily.createdAt), 'Daily');
    assert.strictEqual(formatTargetDate(aLongTerm, aLongTerm.createdAt), 'Someday');

    const createdStr = formatCreationTime(now, now);
    assert.ok(createdStr.startsWith('Today '));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - openAnchorDashboard renders Plan 2 Neovim/Geek layout with folder metadata', async () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    let selectTitle = '';
    let selectOptions: string[] = [];
    let notifyMsg = '';

    const mockCtx = {
      cwd: '/workspace/project-a',
      hasUI: true,
      ui: {
        select: async (title: string, options: string[]) => {
          selectTitle = title;
          selectOptions = options;
          for (const opt of options) {
            assert.strictEqual(typeof opt, 'string');
          }
          return options[0]; // pick first anchor -> directly settles it!
        },
        notify: (msg: string) => {
          notifyMsg = msg;
        },
        setStatus: () => {}
      }
    } as unknown as ExtensionContext;

    // 1. Empty ledger: quiet notify, 0 popups
    await openAnchorDashboard(mockCtx, store);
    assert.ok(notifyMsg.includes('No active anchors'));

    // 2. Ledger with active items (clean numbers, origin, relative time in English)
    store.create({ title: 'Refactor auth', priority: 'p0', files: ['src/auth/jwt.ts'], cwd: '/workspace/project-a' });
    store.create({ title: 'Global task', priority: 'p1' });

    await openAnchorDashboard(mockCtx, store);
    assert.ok(selectTitle.includes('Anchors'));
    assert.ok(selectOptions.some(o => o.includes('01') && o.includes('Refactor auth') && o.includes('project-a') && o.includes('src/auth/jwt.ts')));
    assert.ok(selectOptions.some(o => o.includes('02') && o.includes('Global task') && o.includes('global')));
    assert.ok(notifyMsg.includes('Settled:'));
    assert.strictEqual(store.list({ cwd: '/workspace/project-a' }).length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - getDisplayWidth and padToWidth properly align CJK full-width columns', () => {
  const cjk = '每天吃苹果';
  assert.strictEqual(getDisplayWidth(cjk), 10);
  assert.strictEqual(getDisplayWidth('hello'), 5);

  const paddedCjk = padToWidth(cjk, 16);
  assert.strictEqual(getDisplayWidth(paddedCjk), 16);

  const paddedAscii = padToWidth('hello', 16);
  assert.strictEqual(getDisplayWidth(paddedAscii), 16);
});
