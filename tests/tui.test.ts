import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from '../src/tui.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-simple-tui-test-'));
}

test('AnchorTUI - status bar reflects active state cleanly with [⚓ N]', () => {
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

    // 2. One active anchor matching cwd -> [⚓ 1]
    store.create({ title: 'Task Alpha', cwd: '/workspace/project-a' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[⚓ 1]');

    // 3. Two active anchors -> [⚓ 2]
    store.create({ title: 'Task Beta', cwd: '/workspace/project-a' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[⚓ 2]');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - openAnchorDashboard renders fast, simple text notification without heavy modals', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    let notifyMsg = '';

    const mockCtx = {
      cwd: '/workspace/project-a',
      hasUI: true,
      ui: {
        notify: (msg: string) => {
          notifyMsg = msg;
        },
        setStatus: () => {}
      }
    } as unknown as ExtensionContext;

    // 1. Empty ledger
    openAnchorDashboard(mockCtx, store);
    assert.ok(notifyMsg.includes('暂无待办任务'));

    // 2. Ledger with active items
    store.create({ title: 'Refactor auth', priority: 'p0', files: ['src/auth/jwt.ts'], cwd: '/workspace/project-a' });
    store.create({ title: 'Global task', priority: 'p1' });

    openAnchorDashboard(mockCtx, store);
    assert.ok(notifyMsg.includes('[⚓ 待办锚点]'));
    assert.ok(notifyMsg.includes('Refactor auth'));
    assert.ok(notifyMsg.includes('Global task'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
