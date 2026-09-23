import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from '../src/tui.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-tui-test-'));
}

test('AnchorTUI - status bar reflects active and sleeping state cleanly without noise', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
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

    // 2. One active anchor -> [anc: 1 active]
    store.create({ title: 'Task Alpha' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[anc: 1 active]');

    // 3. One active and one sleeping -> [anc: 1 active, 1 sleep]
    const a2 = store.create({ title: 'Task Beta' });
    store.update(a2.id, { status: 'sleeping' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[anc: 1 active, 1 sleep]');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - openAnchorDashboard renders clean text ledger notification', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
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
    assert.ok(notifyMsg.includes('No active contracts'));

    // 2. Ledger with active and sleeping items
    store.create({ title: 'Refactor auth', priority: 'p0', files: ['src/auth/jwt.ts'] });
    const a2 = store.create({ title: 'Clean cache', priority: 'p1' });
    store.update(a2.id, { status: 'sleeping' });

    openAnchorDashboard(mockCtx, store);
    assert.ok(notifyMsg.includes('[Anchor Ledger]'));
    assert.ok(notifyMsg.includes('Refactor auth'));
    assert.ok(notifyMsg.includes('Clean cache'));
    assert.ok(notifyMsg.includes('[P0]'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
