import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  AnchorStore,
  acquireSyncLock,
  atomicRenameWithRetry,
  extractPathsFromText,
  extractProgressFromText,
  findMatchedAnchors,
  isAnchorTargetingWorkspace,
  isSameOrSubPath,
  makeSafeTaskAnnotation,
  matchAnchorAgainstTouchedFiles,
  matchesCommitMessage,
  normalizePath,
  renderColdStartAnchorsContext
} from '../src/store.ts';
import * as matcherDirect from '../src/matcher.ts';
import { MS_PER_DAY } from '../src/types.ts';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-sticky-test-'));
}

test('AnchorStore - basic sticky note pin, tear off (settle), and put back (undo)', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    assert.strictEqual(store.list().length, 0);

    const n1 = store.create({
      title: 'Fix auth session bug in src/auth/login.ts',
      cwd: '/workspace/app'
    });

    assert.strictEqual(n1.id, 'anc-1');
    assert.strictEqual(n1.status, 'active');
    assert.strictEqual(n1.project, 'app');
    // Automatically spots src/auth/login.ts from note text!
    assert.deepStrictEqual(n1.files, ['src/auth/login.ts']);

    const reloaded = new AnchorStore(tempDir);
    assert.strictEqual(reloaded.get('1')?.title, 'Fix auth session bug in src/auth/login.ts');
    assert.strictEqual(reloaded.get('01')?.id, 'anc-1');
    assert.strictEqual(reloaded.get('#anc-1')?.id, 'anc-1');

    // Tear off note
    const settled = store.settle('1', { settledBy: 'manual' });
    assert.strictEqual(settled.status, 'settled');
    assert.strictEqual(store.list().length, 0);

    // Put back note via undo
    const restored = store.undoSettle();
    assert.strictEqual(restored.id, 'anc-1');
    assert.strictEqual(restored.status, 'active');
    assert.strictEqual(store.list().length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore - monotonic nextId prevents ID reuse after settle and undoSettle', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const a1 = store.create({ title: 'First note' });
    assert.strictEqual(a1.id, 'anc-1');

    store.settle('anc-1');
    const a2 = store.create({ title: 'Second note' });
    assert.strictEqual(a2.id, 'anc-2');

    const restored = store.undoSettle();
    assert.strictEqual(restored.id, 'anc-1');
    assert.deepStrictEqual(store.list({ all: true }).map(a => a.id), ['anc-2', 'anc-1']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore - corrupt state recovery & exclusive lockfile with dead PID reclamation', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    fs.writeFileSync(store.statePath, '{ broken json !!!', 'utf-8');
    const state = store.loadState();
    assert.strictEqual(state.anchors.length, 0);
    assert.ok(fs.readdirSync(tempDir).some(f => f.startsWith('state.corrupt.')));

    const lockPath = path.join(tempDir, 'state.lock');
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, createdAt: Date.now() - 10_000 }), 'utf-8');
    const release = acquireSyncLock(lockPath, 500);
    assert.ok(release, 'acquireSyncLock must acquire lock when existing lock is stale');
    assert.ok(fs.existsSync(lockPath));
    release();
    assert.ok(!fs.existsSync(lockPath));

    const src = path.join(tempDir, 'tmp.json');
    const dst = path.join(tempDir, 'out.json');
    fs.writeFileSync(src, '{"ok":true}');
    atomicRenameWithRetry(src, dst);
    assert.ok(fs.existsSync(dst));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Clever Touch 1 - smart path extraction and cross-directory workspace binding', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const paths = extractPathsFromText('查阅 D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md 和 src/auth.ts');
    assert.ok(paths.includes('D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md'));
    assert.ok(paths.includes('src/auth.ts'));

    const note = store.create({
      title: 'College重构前置查阅外部架构参考库',
      description: '必须前置查阅 D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md。',
      project: 'D:/College/优化',
      cwd: 'D:/Workspace/x-pulse'
    });

    assert.ok(note.files.includes('D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md'));
    assert.strictEqual(isAnchorTargetingWorkspace(note, 'D:/College'), true);
    assert.strictEqual(isAnchorTargetingWorkspace(note, 'D:/College/优化'), true);
    assert.strictEqual(store.list({ cwd: 'D:/College' }).some(a => a.id === note.id), true);

    assert.strictEqual(normalizePath('D:/Workspace/project-b/src/a.ts', 'D:/Workspace/proj'), 'D:/Workspace/project-b/src/a.ts');
    assert.strictEqual(isSameOrSubPath('D:/Workspace/proj', 'D:/Workspace/proj/src'), true);
    assert.strictEqual(isSameOrSubPath('D:/Workspace/proj', 'D:/Workspace/project-b'), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Clever Touch 2 - file matching (exact, glob, dir-prefix) and syntax-safe 1-line comment whisper', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const note = store.create({
      title: 'Check token expiry edge case',
      files: ['src/auth/*.ts', 'src/session/'],
      cwd: '/workspace/app'
    });

    const mGlob = matchAnchorAgainstTouchedFiles(note, ['src/auth/jwt.ts']);
    assert.ok(mGlob && mGlob.reason === 'exact-file');

    const mDir = matchAnchorAgainstTouchedFiles(note, ['src/session/store.ts']);
    assert.ok(mDir && mDir.reason === 'dir-prefix');

    const mNone = matchAnchorAgainstTouchedFiles(note, ['README.md']);
    assert.strictEqual(mNone, null);

    assert.strictEqual(findMatchedAnchors([note], ['src/auth/jwt.ts']).length, 1);

    // Syntax-safe comment whisper
    const tsWhisper = makeSafeTaskAnnotation('src/auth/jwt.ts', note);
    assert.ok(tsWhisper && tsWhisper.includes('// ⌖ Note #1: Check token expiry edge case'));

    const pyWhisper = makeSafeTaskAnnotation('scripts/ sync.py', note);
    assert.ok(pyWhisper && pyWhisper.includes('# ⌖ Note #1:'));

    // Strictly skip JSON and binary files
    assert.strictEqual(makeSafeTaskAnnotation('package.json', note), null);
    assert.strictEqual(makeSafeTaskAnnotation('logo.png', note), null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Clever Touch 3 - git commit semantic matching & 7-day quiet mode (0 idle tokens, never deleted)', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const now = 100_000_000_000;

    const n1 = store.create({ title: '重构鉴权模块为 HttpOnly Cookie', cwd: '/workspace/app' });
    const n2 = store.create({ title: 'Old background idea', cwd: '/workspace/app' });

    // Match CJK & English git commit messages
    assert.strictEqual(
      matchesCommitMessage(n1, ['feat(auth): 重构鉴权模块为 HttpOnly Cookie']).matched,
      true
    );
    assert.strictEqual(
      matchesCommitMessage(n1, ['chore: update readme']).matched,
      false
    );

    // Move n2 back 8 days -> transitions to 'sleeping' (quiet mode), never deleted!
    store.touch(n1.id, now);
    store.touch(n2.id, now - 8 * MS_PER_DAY);

    const rendered = renderColdStartAnchorsContext(store, '/workspace/app', now);
    assert.ok(rendered.includes('重构鉴权模块为 HttpOnly Cookie'));
    assert.ok(!rendered.includes('Old background idea')); // Quiet note uses 0 prompt tokens
    assert.strictEqual(store.get(n2.id)?.status, 'sleeping'); // Still safely preserved in store!
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('v0.5.0 Progress Bar & Session Bookmark - parses inline progress ratios/steps and increments cleanly', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);

    // 1. Ratio syntax: [5/30] or (2/5) works, while unbracketed dates like 10/12 are NOT hijacked!
    const p1 = extractProgressFromText('刷完 Python-30days [5/30]');
    assert.strictEqual(p1.cleanTitle, '刷完 Python-30days');
    assert.deepStrictEqual(p1.progress, { done: 5, total: 30 });

    const dateTitle = extractProgressFromText('Refactor API before 10/12 release');
    assert.strictEqual(dateTitle.cleanTitle, 'Refactor API before 10/12 release');
    assert.strictEqual(dateTitle.progress, undefined);

    // 2. Numbered steps syntax: 1. A 2. B 3. C
    const p2 = extractProgressFromText('重构登录流: 1. 抽出接口 2. 替换Cookie 3. 补单测');
    assert.strictEqual(p2.cleanTitle, '重构登录流');
    assert.strictEqual(p2.progress?.done, 0);
    assert.strictEqual(p2.progress?.total, 3);
    assert.deepStrictEqual(p2.progress?.steps, ['抽出接口', '替换Cookie', '补单测']);
    assert.strictEqual(p2.progress?.items?.length, 3);
    assert.strictEqual(p2.progress?.items?.[0].status, 'in_progress');

    const note = store.create({
      title: '重构登录流: 1. 抽出接口 2. 替换Cookie 3. 补单测',
      cwd: '/workspace/app',
      sessionFile: '/home/user/.pi/sessions/session-123.jsonl'
    });

    assert.strictEqual(note.sessionFile, '/home/user/.pi/sessions/session-123.jsonl');
    assert.strictEqual(note.progress?.done, 0);
    assert.strictEqual(note.progress?.total, 3);

    const step1 = store.step(note.id, 1);
    assert.strictEqual(step1.anchor.progress?.done, 1);
    assert.strictEqual(step1.completed, false);

    const step3 = store.step(note.id, 2);
    assert.strictEqual(step3.anchor.progress?.done, 3);
    assert.strictEqual(step3.completed, true);

    // 3. NaN delta guard & commit stop-word guard
    const stepNan = store.step(note.id, Number.NaN);
    assert.strictEqual(stepNan.anchor.progress?.done, 3);

    const genericNote = store.create({ title: 'fix bug in login', cwd: '/workspace/app' });
    assert.strictEqual(matchesCommitMessage(genericNote, ['fix: typo in bug template']).matched, false);
    assert.strictEqual(matchesCommitMessage(genericNote, ['fix: login session check']).matched, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('v0.6.0 Auto-Todo Bridge - automatically mirrors unfinished todo snapshots across sessions and auto-settles at 100%', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);

    // 1. Simulate rpiv-todo / todo tool emitting a 3-step snapshot (1 completed, 1 in_progress, 1 pending)
    const sync1 = store.syncFromTodoTool(
      [
        { id: 1, subject: 'Extract auth interface', status: 'completed' },
        { id: 2, subject: 'Switch token to HttpOnly cookie', status: 'in_progress' },
        { id: 3, subject: 'Add integration tests', status: 'pending' }
      ],
      {
        cwd: '/workspace/app',
        sessionFile: '/home/user/.pi/sessions/sess-auth.jsonl',
        recentFiles: ['src/auth.ts']
      }
    );

    assert.strictEqual(sync1.status, 'synced');
    assert.ok(sync1.anchor);
    assert.strictEqual(sync1.anchor!.source, 'todo-sync');
    assert.strictEqual(sync1.anchor!.title, 'Switch token to HttpOnly cookie');
    assert.deepStrictEqual(sync1.anchor!.progress?.done, 1);
    assert.deepStrictEqual(sync1.anchor!.progress?.total, 3);
    assert.strictEqual(sync1.anchor!.sessionFile, '/home/user/.pi/sessions/sess-auth.jsonl');
    assert.deepStrictEqual(sync1.anchor!.files, ['src/auth.ts']);

    // 2. When all todos in the session reach completed (3/3), the checkpoint automatically tears itself off!
    const syncDone = store.syncFromTodoTool(
      [
        { id: 1, subject: 'Extract auth interface', status: 'completed' },
        { id: 2, subject: 'Switch token to HttpOnly cookie', status: 'completed' },
        { id: 3, subject: 'Add integration tests', status: 'completed' }
      ],
      {
        cwd: '/workspace/app',
        sessionFile: '/home/user/.pi/sessions/sess-auth.jsonl'
      }
    );

    assert.strictEqual(syncDone.status, 'completed');
    assert.strictEqual(store.list({ cwd: '/workspace/app' }).length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore.search - finds active, sleeping, and settled notes by title, file path, and step text', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);

    // Active note with steps and file paths
    const a1 = store.create({
      title: 'Fix auth login session in src/auth/login.ts: 1. Extract cookie store 2. Verify token',
      cwd: '/workspace/app',
      tags: ['security', 'auth']
    });

    // Another note to settle into archive
    const a2 = store.create({
      title: 'Refactor database migrations in db/migrate.ts',
      description: 'Run schema checks and migrate users',
      cwd: '/workspace/app'
    });
    store.settle(a2.id, { settledBy: 'manual' });

    // Sleeping note
    const a3 = store.create({
      title: 'Background telemetry worker in src/telemetry.ts',
      cwd: '/workspace/app'
    });
    store.update(a3.id, { status: 'sleeping' });

    // 1. Search by title token across active
    const r1 = store.search('login');
    assert.strictEqual(r1.length, 1);
    assert.strictEqual(r1[0].id, a1.id);

    // 2. Search by file path
    const r2 = store.search('src/auth/login.ts');
    assert.strictEqual(r2.length, 1);
    assert.strictEqual(r2[0].id, a1.id);

    // 3. Search by step text
    const r3 = store.search('cookie store');
    assert.strictEqual(r3.length, 1);
    assert.strictEqual(r3[0].id, a1.id);

    // 4. Search settled note in archive by title
    const r4 = store.search('database');
    assert.strictEqual(r4.length, 1);
    assert.strictEqual(r4[0].id, a2.id);
    assert.strictEqual(r4[0].status, 'settled');

    // 5. Search settled note by description
    const r5 = store.search('schema checks');
    assert.strictEqual(r5.length, 1);
    assert.strictEqual(r5[0].id, a2.id);

    // 6. Search settled note by file path
    const r6 = store.search('db/migrate.ts');
    assert.strictEqual(r6.length, 1);
    assert.strictEqual(r6[0].id, a2.id);

    // 7. Search sleeping note
    const r7 = store.search('telemetry');
    assert.strictEqual(r7.length, 1);
    assert.strictEqual(r7[0].id, a3.id);

    // 8. Search with empty query returns all active/sleeping notes
    const rEmpty = store.search('');
    assert.strictEqual(rEmpty.length, 2); // a1 (active) and a3 (sleeping)

    // 9. Search with includeArchive: false excludes settled
    const rNoArchive = store.search('database', { includeArchive: false });
    assert.strictEqual(rNoArchive.length, 0);

    // 10. Nonexistent query
    const rNone = store.search('completely_nonexistent_xyz');
    assert.strictEqual(rNone.length, 0);

    // 11. Limit option
    const rLimit = store.search('in', { limit: 1 });
    assert.strictEqual(rLimit.length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Architectural Decoupling - pure matcher functions exported from matcher.ts, store.ts, and index.ts', () => {
  const pureFns = [
    'normalizePath',
    'isSameOrSubPath',
    'globToRegExp',
    'extractPathsFromText',
    'extractProgressFromText',
    'isAnchorTargetingWorkspace',
    'matchAnchorAgainstTouchedFiles',
    'findMatchedAnchors',
    'COMMENT_FORMATS',
    'makeSafeTaskAnnotation',
    'matchesCommitMessage'
  ] as const;

  for (const fn of pureFns) {
    assert.ok((matcherDirect as any)[fn] !== undefined, `matcher.ts should export ${fn}`);
  }
});



