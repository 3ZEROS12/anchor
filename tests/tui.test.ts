import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import { updateAnchorStatusBar, openAnchorDashboard, formatRemainingTtl, formatRelativeTime } from '../src/tui.ts';
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

test('AnchorTUI - formatRemainingTtl and formatRelativeTime distinguish left vs ago', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const baseTime = 100_000_000_000;

    const aEphemeral = store.create({ title: '明天吃香蕉' });
    const aDurable = store.create({ title: '每天吃一个苹果' });

    const ttlEphemeral = formatRemainingTtl(aEphemeral, aEphemeral.createdAt + 2 * 3600 * 1000);
    const ttlDurable = formatRemainingTtl(aDurable, aDurable.createdAt + 2 * 3600 * 1000);

    assert.strictEqual(ttlEphemeral, '46h left');
    assert.strictEqual(ttlDurable, undefined);

    const pastRel = formatRelativeTime(baseTime - 23 * 60 * 1000, baseTime);
    assert.strictEqual(pastRel, '23m ago');
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
