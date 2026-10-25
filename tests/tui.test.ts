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
import initExtension, {
  extractGitCommitMessages,
  parseAnchorCommandInput,
  parseQuickNoteInput,
  resolveAnchorTarget
} from '../src/extension.ts';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

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
      cwd: 'D:/Workspace/x-pulse'
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

  // Ensure ANSI CSI '[' escape sequences are never mistaken for unclosed brackets
  const ansiTruncated = truncateToWidth('\x1b[32mGreen status text that overflows width\x1b[0m', 12);
  assert.ok(ansiTruncated.includes('Green'));
  assert.ok(getDisplayWidth(ansiTruncated) <= 12);

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

test('extractGitCommitMessages - extracts commit messages from multiple -m flags, -am, and --message=', () => {
  assert.deepStrictEqual(
    extractGitCommitMessages('git commit -m "feat: login" -m "ref: tokens"'),
    ['feat: login', 'ref: tokens']
  );
  assert.deepStrictEqual(
    extractGitCommitMessages('git commit -am "fix(auth): handle expired cookies"'),
    ['fix(auth): handle expired cookies']
  );
  assert.deepStrictEqual(
    extractGitCommitMessages('git commit --message="docs: update readme"'),
    ['docs: update readme']
  );
  assert.deepStrictEqual(
    extractGitCommitMessages("git commit -m 'single quoted message' -am 'another'"),
    ['single quoted message', 'another']
  );
  assert.deepStrictEqual(
    extractGitCommitMessages('git commit -m "apostrophe in \'message\'"'),
    ["apostrophe in 'message'"]
  );
  assert.deepStrictEqual(
    extractGitCommitMessages('npm test'),
    []
  );
});

test('tool_call - drift watchdog only triggers on mutating tools and updates without write amplification', async () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const eventHandlers = new Map<string, Function[]>();
    const mockPi = {
      on: (event: string, handler: Function) => {
        if (!eventHandlers.has(event)) eventHandlers.set(event, []);
        eventHandlers.get(event)!.push(handler);
      },
      registerTool: () => {},
      registerCommand: () => {},
      registerShortcut: () => {}
    } as unknown as ExtensionAPI;

    initExtension(mockPi, store);

    const a1 = store.create({
      title: 'Auth refactor',
      cwd: '/workspace/app',
      files: ['src/auth.ts']
    });

    const mockCtx = {
      cwd: '/workspace/app',
      hasUI: false
    } as unknown as ExtensionContext;

    const toolCallHandler = eventHandlers.get('tool_call')?.[0];
    assert.ok(toolCallHandler, 'tool_call handler must be registered');

    // 1. Read-only tool_call outside p.files (e.g. read package.json)
    await toolCallHandler({
      toolName: 'read',
      input: { path: 'package.json' }
    }, mockCtx);

    let current = store.get(a1.id);
    assert.strictEqual(current?.driftWarning, undefined, 'read tool outside p.files must NOT set driftWarning');

    // 2. Mutating tool_call inside p.files (e.g. edit src/auth.ts)
    await toolCallHandler({
      toolName: 'edit',
      input: { path: 'src/auth.ts' }
    }, mockCtx);

    current = store.get(a1.id);
    assert.strictEqual(current?.driftWarning, undefined, 'edit tool inside p.files must NOT set driftWarning');

    // 3. Mutating tool_call outside p.files (e.g. edit other/config.json)
    await toolCallHandler({
      toolName: 'edit',
      input: { path: 'other/config.json' }
    }, mockCtx);

    current = store.get(a1.id);
    assert.strictEqual(current?.driftWarning, 'config.json', 'edit tool outside p.files MUST set driftWarning');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('session_start - pre-flight verifyCommand auto-settles passing tasks with settledBy: verify', async () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const eventHandlers = new Map<string, Function[]>();
    const mockPi = {
      on: (event: string, handler: Function) => {
        if (!eventHandlers.has(event)) eventHandlers.set(event, []);
        eventHandlers.get(event)!.push(handler);
      },
      registerTool: () => {},
      registerCommand: () => {},
      registerShortcut: () => {}
    } as unknown as ExtensionAPI;

    initExtension(mockPi, store);

    // Anchor with a passing verifyCommand (node -e "process.exit(0)")
    const passingAnchor = store.create({
      title: 'Task with passing verifyCommand',
      cwd: '/workspace/app',
      verifyCommand: 'node -e "process.exit(0)"'
    });

    // Anchor with a failing verifyCommand (node -e "process.exit(1)")
    const failingAnchor = store.create({
      title: 'Task with failing verifyCommand',
      cwd: '/workspace/app',
      verifyCommand: 'node -e "process.exit(1)"'
    });

    let notifiedMessage = '';
    const mockCtx = {
      cwd: '/workspace/app',
      hasUI: true,
      ui: {
        notify: (msg: string) => { notifiedMessage = msg; },
        setStatus: () => {},
        setWidget: () => {}
      }
    } as unknown as ExtensionContext;

    const sessionStartHandler = eventHandlers.get('session_start')?.[0];
    assert.ok(sessionStartHandler, 'session_start handler must be registered');

    await sessionStartHandler({}, mockCtx);

    // Passing anchor should be settled
    assert.strictEqual(store.get(passingAnchor.id), undefined, 'passing anchor should be settled and removed from active list');
    const archived = store.listArchive(10);
    const settled = archived.find(a => a.id === passingAnchor.id);
    assert.ok(settled, 'passing anchor should be in archive');
    assert.strictEqual(settled?.evidence?.settledBy, 'verify');
    assert.strictEqual(settled?.evidence?.summary, 'node -e "process.exit(0)"');

    // Failing anchor should remain active
    const remainingFailing = store.get(failingAnchor.id);
    assert.ok(remainingFailing, 'failing anchor must remain active');
    assert.strictEqual(remainingFailing?.status, 'active');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('parseAnchorCommandInput - parses search and history/archive, and /anchor search & /anchor history notify formatted results', async () => {
  // 1. Test parsing rules
  assert.deepStrictEqual(parseAnchorCommandInput('search auth'), { mode: 'search', query: 'auth' });
  assert.deepStrictEqual(parseAnchorCommandInput('find login session'), { mode: 'search', query: 'login session' });
  assert.deepStrictEqual(parseAnchorCommandInput('grep src/auth.ts'), { mode: 'search', query: 'src/auth.ts' });
  assert.deepStrictEqual(parseAnchorCommandInput('history'), { mode: 'history' });
  assert.deepStrictEqual(parseAnchorCommandInput('archive'), { mode: 'history' });
  assert.deepStrictEqual(parseAnchorCommandInput('archived'), { mode: 'history' });

  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const commands = new Map<string, any>();
    const tools = new Map<string, any>();
    const mockPi = {
      on: () => {},
      registerTool: (tool: any) => { tools.set(tool.name, tool); },
      registerCommand: (name: string, def: any) => { commands.set(name, def); },
      registerShortcut: () => {}
    } as unknown as ExtensionAPI;

    initExtension(mockPi, store);
    const anchorCmd = commands.get('anchor');
    assert.ok(anchorCmd, '/anchor command must be registered');

    let notified: { msg: string; type?: string }[] = [];
    const mockCtx = {
      cwd: '/workspace/app',
      hasUI: true,
      ui: {
        notify: (msg: string, type?: string) => { notified.push({ msg, type }); },
        setStatus: () => {},
        setWidget: () => {}
      }
    } as unknown as ExtensionContext;

    // 2. Empty history notification
    await anchorCmd.handler('history', mockCtx);
    assert.ok(notified.some(n => n.msg.includes('No archived notes yet.')));

    // 3. Empty search notification
    notified = [];
    await anchorCmd.handler('search nonexistent', mockCtx);
    assert.ok(notified.some(n => n.msg.includes('No notes matching "nonexistent".')));

    // 4. Create active and settled notes
    const activeNote = store.create({
      title: 'Active note for authentication',
      cwd: '/workspace/app'
    });
    const toSettle = store.create({
      title: 'Settled note for database cleanup',
      cwd: '/workspace/app'
    });
    store.settle(toSettle.id, { settledBy: 'manual' });

    // 5. Non-empty history notification
    notified = [];
    await anchorCmd.handler('history', mockCtx);
    assert.ok(notified.length > 0);
    const histMsg = notified[0].msg;
    assert.ok(histMsg.includes('#2 "Settled note for database cleanup"'));
    assert.ok(histMsg.includes('app · manual'));

    // 6. Non-empty search notification
    notified = [];
    await anchorCmd.handler('search authentication', mockCtx);
    assert.ok(notified.length > 0);
    const searchActive = notified[0].msg;
    assert.ok(searchActive.includes('[active]'));
    assert.ok(searchActive.includes('Active note for authentication'));

    notified = [];
    await anchorCmd.handler('search database', mockCtx);
    assert.ok(notified.length > 0);
    const searchSettled = notified[0].msg;
    assert.ok(searchSettled.includes('[settled]'));
    assert.ok(searchSettled.includes('Settled note for database cleanup'));

    // 7. Test anchor LLM tool for search and history actions
    const anchorTool = tools.get('anchor');
    assert.ok(anchorTool, 'anchor tool must be registered');

    const searchToolRes = await anchorTool.execute('call-1', { action: 'search', query: 'authentication' }, undefined, undefined, mockCtx);
    assert.strictEqual(searchToolRes.isError, false);
    const searchHits = JSON.parse(searchToolRes.content[0].text);
    assert.strictEqual(searchHits.length, 1);
    assert.strictEqual(searchHits[0].id, activeNote.id);

    const histToolRes = await anchorTool.execute('call-2', { action: 'history' }, undefined, undefined, mockCtx);
    assert.strictEqual(histToolRes.isError, false);
    const histHits = JSON.parse(histToolRes.content[0].text);
    assert.strictEqual(histHits.length, 1);
    assert.strictEqual(histHits[0].id, toSettle.id);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
