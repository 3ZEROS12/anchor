import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import { updateAnchorStatusBar, openAnchorDashboard } from '../src/tui.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-clean-tui-test-'));
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

test('AnchorTUI - openAnchorDashboard renders clean interactive selector', async () => {
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
          return options[0];
        },
        input: async () => 'New Task',
        notify: (msg: string) => {
          notifyMsg = msg;
        },
        setStatus: () => {}
      }
    } as unknown as ExtensionContext;

    // 1. Empty ledger
    await openAnchorDashboard(mockCtx, store);
    assert.ok(selectTitle.includes('暂无待办'));
    assert.ok(selectOptions.includes('➕ 新建任务锚点'));

    // 2. Ledger with active items
    store.create({ title: 'Refactor auth', priority: 'p0', files: ['src/auth/jwt.ts'], cwd: '/workspace/project-a' });
    store.create({ title: 'Global task', priority: 'p1' });

    const allTitles: string[] = [];
    let pickedSettle = false;
    mockCtx.ui.select = async (title: string, options: string[]) => {
      allTitles.push(title);
      selectTitle = title;
      selectOptions = options;
      if (title.includes('操作 #anc-1')) {
        pickedSettle = true;
        return '✓ 标记完成并清除 (Settle)';
      }
      return options[0]; // pick first anchor
    };

    await openAnchorDashboard(mockCtx, store);
    assert.ok(allTitles.some(t => t.includes('待办清单')));
    assert.strictEqual(pickedSettle, true);
    assert.ok(notifyMsg.includes('已完成并清除'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
