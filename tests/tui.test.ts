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

test('AnchorTUI - status bar reflects active and sleeping state correctly', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    let currentStatus: string | undefined;

    const mockCtx = {
      ui: {
        hasUI: true,
        setStatus: (_key: string, text: string | undefined) => {
          currentStatus = text;
        }
      }
    } as unknown as ExtensionContext;

    // 1. Zero active, zero sleeping -> must show '⚓ 0 active' (not undefined)
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '⚓ 0 active');

    // 2. One active anchor
    store.create({ title: 'Task Alpha' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '⚓ ● 1 active');

    // 3. Mark active as sleeping
    const anchors = store.list();
    store.update(anchors[0].id, { status: 'sleeping' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '⚓ 0 active | 💤 1 sleep');

    // 4. One active and one sleeping
    store.create({ title: 'Task Beta' });
    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, '⚓ ● 1 active | 💤 1 sleep');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorTUI - openAnchorDashboard uses string[] options exclusively and executes actions', async () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    let selectTitle = '';
    let selectOptions: any[] = [];
    let notifyMsg = '';

    const mockCtx = {
      ui: {
        hasUI: true,
        select: async (title: string, options: string[]) => {
          selectTitle = title;
          selectOptions = options;
          // Verify every option is strictly a string (not an object!)
          for (const opt of options) {
            assert.strictEqual(typeof opt, 'string', `Option "${opt}" must be string`);
          }
          return options[0]; // pick first option
        },
        input: async (_title: string, _prompt: string) => {
          return 'New Task From Dashboard';
        },
        notify: (msg: string, _type: string) => {
          notifyMsg = msg;
        },
        setStatus: () => {}
      }
    } as unknown as ExtensionContext;

    // 1. Dashboard on empty store
    await openAnchorDashboard(mockCtx, store);
    assert.ok(selectTitle.includes('空空如也'));
    assert.strictEqual(selectOptions.length, 2);
    assert.strictEqual(typeof selectOptions[0], 'string');
    assert.strictEqual(typeof selectOptions[1], 'string');
    assert.ok(notifyMsg.includes('已成功锚定'));
    assert.strictEqual(store.list().length, 1);

    // 2. Dashboard with items
    const titlesSeen: string[] = [];
    mockCtx.ui.select = async (title: string, options: string[]) => {
      titlesSeen.push(title);
      for (const opt of options) {
        assert.strictEqual(typeof opt, 'string', `Dashboard option "${opt}" must be string`);
      }
      return options[0];
    };
    await openAnchorDashboard(mockCtx, store);
    assert.ok(titlesSeen.some(t => t.includes('驾驶舱')));
    assert.ok(titlesSeen.some(t => t.includes('管理任务')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
