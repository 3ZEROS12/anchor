import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DualAnchorStore } from '../src/store.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from '../src/tui.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-tui-test-'));
}

test('AnchorTUI - status bar reflects active and sleeping state cleanly with benzene ring', () => {
  const tempDir = createTempDir();
  try {
    const store = new DualAnchorStore(tempDir);
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

    // 2. One active anchor -> [⌬ anc: 1 active]
    store.create({ title: 'Task Alpha' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[⌬ anc: 1 active]');

    // 3. One active and one sleeping -> [⌬ anc: 1 active, 1 sleep]
    const a2 = store.create({ title: 'Task Beta' });
    store.projectStore.update(a2.id, { status: 'sleeping' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '[⌬ anc: 1 active, 1 sleep]');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - openAnchorDashboard renders ToolFlow style custom component', async () => {
  const tempDir = createTempDir();
  try {
    const store = new DualAnchorStore(tempDir);
    let customCalled = false;
    let customComponent: any = null;

    const mockTheme = {
      fg: (_color: string, s: string) => s,
      bg: (_color: string, s: string) => s,
      bold: (s: string) => s
    };

    const mockCtx = {
      hasUI: true,
      ui: {
        custom: async (factory: any) => {
          customCalled = true;
          let doneCalled = false;
          customComponent = factory(
            { requestRender: () => {} },
            mockTheme,
            {},
            () => { doneCalled = true; }
          );
        },
        notify: () => {},
        setStatus: () => {}
      }
    } as unknown as ExtensionContext;

    store.create({ title: 'Refactor auth', priority: 'p0', files: ['src/auth/jwt.ts'], scope: 'project' });
    store.create({ title: 'Update Pi rules', priority: 'p1', scope: 'global' });

    await openAnchorDashboard(mockCtx, store);
    assert.strictEqual(customCalled, true);
    assert.ok(customComponent);

    // Test render output width 80
    const renderedLines = customComponent.render(80);
    assert.ok(renderedLines.length > 5);
    const textJoined = renderedLines.join('\n');
    assert.ok(textJoined.includes('⌬ ⚓ Anchor 任务锚点驾驶舱'));
    assert.ok(textJoined.includes('Refactor auth'));

    // Test input handling: 'g' toggles scope to global
    const handledG = customComponent.handleInput('g');
    assert.strictEqual(handledG, true);
    const renderedGlobal = customComponent.render(80).join('\n');
    assert.ok(renderedGlobal.includes('Update Pi rules'));

    // Test escape exits
    const handledEsc = customComponent.handleInput('\x1b');
    assert.strictEqual(handledEsc, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
