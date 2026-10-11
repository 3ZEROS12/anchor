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
  findMatchedAnchors,
  isAnchorTargetingWorkspace,
  isSameOrSubPath,
  makeSafeTaskAnnotation,
  matchAnchorAgainstTouchedFiles,
  matchesCommitMessage,
  normalizePath,
  renderColdStartAnchorsContext,
  sweepQuietNotes
} from '../src/store.ts';
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
      cwd: 'D:/Workspace/X'
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
