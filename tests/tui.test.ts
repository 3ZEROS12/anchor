import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import {
  formatOrigin,
  formatRelativeAge,
  getDisplayWidth,
  openAnchorDashboard,
  padToWidth,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
} from '../src/tui.ts';
import { parseAnchorCommandInput, resolveAnchorTarget } from '../src/extension.ts';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-tui-test-'));
}

test('StickyNoteTUI - status bar badge and clean startup sticky note card', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    let currentStatus: string | undefined = 'init';
    let widgetLines: string[] | undefined;

    const mockCtx = {
      cwd: '/workspace/app',
      hasUI: true,
      ui: {
        setStatus: (_k: string, val: string | undefined) => { currentStatus = val; },
        setWidget: (_k: string, lines: string[] | undefined) => { widgetLines = lines; }
      }
    } as unknown as ExtensionContext;

    updateAnchorStatusBar(mockCtx, store);
    updateStartupBanner(mockCtx, store);
    assert.strictEqual(currentStatus, undefined);
    assert.strictEqual(widgetLines, undefined);

    store.create({ title: 'Migrate auth to cookies in src/auth.ts', cwd: '/workspace/app' });
    updateAnchorStatusBar(mockCtx, store);
    updateStartupBanner(mockCtx, store);

    assert.strictEqual(currentStatus, '⌖ 1');
    const lines = widgetLines as string[] | undefined;
    assert.ok(lines && lines.some((l: string) => l.includes('⌖ 1 note')));
    assert.ok(lines && lines.some((l: string) => l.includes('Migrate auth to cookies') && l.includes('app · auth.ts')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('StickyNoteTUI - openAnchorDashboard renders clean un-tacky list and supports tearing off or waking notes', async () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const n1 = store.create({
      title: 'College重构前置查阅外部架构参考库',
      project: 'D:/College/优化',
      cwd: 'D:/Workspace/X'
    });
    store.update(n1.id, { status: 'sleeping' });

    let renderedOptions: string[] = [];
    const mockCtx = {
      cwd: 'D:/Workspace/other',
      hasUI: true,
      ui: {
        select: async (_title: string, options: string[]) => {
          if (renderedOptions.length === 0) {
            renderedOptions = options;
            return options[0];
          }
          return options.find(o => o.startsWith('⚡')) || options[0];
        },
        notify: () => {},
        setStatus: () => {}
      }
    } as unknown as ExtensionContext;

    await openAnchorDashboard(mockCtx, store);
    assert.strictEqual(renderedOptions.length, 1);
    assert.ok(renderedOptions[0].includes('College重构前置查阅外部架构参考库'));
    assert.ok(renderedOptions[0].includes('College/优化'));
    assert.ok(renderedOptions[0].includes('quiet'));
    // No corporate [P0] / Someday / (0 tok) clutter!
    assert.ok(!renderedOptions[0].includes('[P0]'));
    assert.ok(!renderedOptions[0].includes('Someday'));
    assert.strictEqual(store.get(n1.id)?.status, 'active');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('StickyNoteTUI - CJK width alignment, truncation, and command parsing', () => {
  assert.strictEqual(getDisplayWidth('电子便签'), 8);
  assert.strictEqual(getDisplayWidth(padToWidth('电子便签', 12)), 12);
  assert.strictEqual(formatRelativeAge(100_000, 100_000 + 5000), 'just now');
  assert.strictEqual(formatRelativeAge(100_000, 100_000 + 7200_000), '2h ago');
  assert.strictEqual(formatOrigin('D:/Workspace/anchor'), 'anchor');

  const truncated = truncateToWidth('Fix auth (unclosed bracket', 12);
  assert.ok(getDisplayWidth(truncated) <= 12);
  assert.ok(!truncated.includes('('));

  assert.strictEqual(parseAnchorCommandInput('').mode, 'dashboard');
  assert.strictEqual(parseAnchorCommandInput('undo').mode, 'undo');
  assert.strictEqual(parseAnchorCommandInput('done 1').mode, 'settle');
  assert.strictEqual(parseAnchorCommandInput('Remember to check logs').mode, 'pin');

  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const a1 = store.create({ title: 'Note A', cwd: '/workspace/p' });
    assert.strictEqual(resolveAnchorTarget(store, '1', '/workspace/p'), a1.id);
    assert.strictEqual(resolveAnchorTarget(store, '#anc-1', '/workspace/p'), a1.id);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
