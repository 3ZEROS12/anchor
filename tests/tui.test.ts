import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import {
  formatOrigin,
  formatProgressBar,
  formatRelativeAge,
  getDisplayWidth,
  openAnchorDashboard,
  padToWidth,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
} from '../src/tui.ts';
import { parseAnchorCommandInput, parseQuickNoteInput, resolveAnchorTarget } from '../src/extension.ts';
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
    let widgetPlacement: string | undefined;

    const mockCtx = {
      cwd: '/workspace/app',
      hasUI: true,
      ui: {
        setStatus: (_k: string, val: string | undefined) => { currentStatus = val; },
        setWidget: (_k: string, lines: string[] | undefined, opts?: { placement?: string }) => {
          widgetLines = lines;
          widgetPlacement = opts?.placement;
        }
      }
    } as unknown as ExtensionContext;

    updateAnchorStatusBar(mockCtx, store);
    assert.strictEqual(currentStatus, undefined);
    assert.strictEqual(widgetLines, undefined);
    assert.strictEqual(widgetPlacement, 'belowEditor');

    store.create({ title: 'Migrate auth to cookies in src/auth.ts [2/4]', cwd: '/workspace/app' });
    updateAnchorStatusBar(mockCtx, store);

    assert.strictEqual(currentStatus, '⌖ 1');
    assert.strictEqual(widgetPlacement, 'belowEditor');
    const lines = widgetLines as string[] | undefined;
    assert.ok(lines && lines.length === 1);
    assert.ok(lines && lines[0].includes('[■■□□ 2/4]'));
    assert.ok(lines && lines[0].includes('Migrate auth to cookies') && lines[0].includes('app · auth.ts'));
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
  assert.strictEqual(parseAnchorCommandInput('step 1').mode, 'step');
  assert.strictEqual(parseAnchorCommandInput('jump 1').mode, 'jump');
  assert.strictEqual(parseAnchorCommandInput('Remember to check logs').mode, 'pin');
  assert.strictEqual(parseQuickNoteInput('pin: 明天把Token改Cookie'), '明天把Token改Cookie');
  assert.strictEqual(parseQuickNoteInput('便签：检查网关重试 [1/4]'), '检查网关重试 [1/4]');
  assert.strictEqual(parseQuickNoteInput('pin:   '), '');
  assert.strictEqual(parseQuickNoteInput('normal chat message'), null);
  assert.strictEqual(formatProgressBar({ done: 2, total: 4 }), '[■■□□ 2/4]');

  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const a1 = store.create({ title: 'Note A', cwd: '/workspace/p' });
    const a2 = store.create({ title: 'Note B', cwd: '/workspace/p' });
    // Touch a2 more recently so a2 sorts to Row 1 while its ID is anc-2
    store.touch(a2.id, Date.now() + 5000);
    // Exact ID match must win over row index so `/done 2` settles anc-2 (not Row 2 anc-1)!
    assert.strictEqual(resolveAnchorTarget(store, '2', '/workspace/p'), a2.id);
    assert.strictEqual(resolveAnchorTarget(store, '1', '/workspace/p'), a1.id);
    assert.strictEqual(resolveAnchorTarget(store, '#anc-1', '/workspace/p'), a1.id);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
