import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DualAnchorStore } from '../src/store.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from '../src/tui.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-simple-tui-test-'));
}

test('AnchorTUI - status bar reflects active and sleeping state cleanly with original anchor icon', () => {
  const tempDir = createTempDir();
  try {
    const store = new DualAnchorStore(tempDir, path.join(tempDir, 'global_anchors'));
    let currentStatus: string | undefined = 'initial';

    const mockCtx = {
      hasUI: true,
      ui: {
        setStatus: (_key: string, text: string | undefined) => {
          currentStatus = text;
        }
      }
    } as unknown as ExtensionContext;

    // 1. Zero active, zero sleeping -> must be undefined (completely invisible)
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, undefined);

    // 2. One active anchor -> [⚓ 1 active]
    store.create({ title: 'Task Alpha' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[⚓ 1 active]');

    // 3. One active and one sleeping -> [⚓ 1 active, 1 sleep]
    const a2 = store.create({ title: 'Task Beta' });
    store.projectStore.update(a2.id, { status: 'sleeping' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[⚓ 1 active, 1 sleep]');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - openAnchorDashboard renders fast, simple text notification without heavy modals', () => {
  const tempDir = createTempDir();
  try {
    const store = new DualAnchorStore(tempDir, path.join(tempDir, 'global_anchors'));
    let notifyMsg = '';

    const mockCtx = {
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
    assert.ok(notifyMsg.includes('暂无活跃锚点'));

    // 2. Ledger with active project and global items
    store.create({ title: 'Refactor auth', priority: 'p0', files: ['src/auth/jwt.ts'], scope: 'project' });
    store.create({ title: 'Learn Pi update', priority: 'p1', scope: 'global' });

    openAnchorDashboard(mockCtx, store);
    assert.ok(notifyMsg.includes('[⚓ Anchor 任务清单]'));
    assert.ok(notifyMsg.includes('Refactor auth'));
    assert.ok(notifyMsg.includes('Learn Pi update'));
    assert.ok(notifyMsg.includes('[全局]'));
    assert.ok(notifyMsg.includes('[项目]'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
