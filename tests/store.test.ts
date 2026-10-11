import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  AnchorStore,
  atomicRenameWithRetry,
  detectDurability,
  getEphemeralDecayPolicy
} from '../src/store.ts';
import { normalizePath, isSameOrSubPath, extractPathsFromText, isAnchorTargetingWorkspace } from '../src/matcher.ts';
import { tryRealtimeAutoSettle } from '../src/settlement.ts';
import { SessionTouchObserver } from '../src/observer.ts';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-test-'));
}

test('AnchorStore - basic CRUD & atomic writes', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);

    // 1. Initially empty
    assert.strictEqual(store.list().length, 0);

    // 2. Create anchor
    const anc1 = store.create({
      title: 'Fix auth session bug',
      priority: 'p0',
      files: ['src/auth/login.ts', 'src/auth/session.ts'],
      tags: ['auth', 'security']
    });

    assert.strictEqual(anc1.id, 'anc-1');
    assert.strictEqual(anc1.status, 'active');
    assert.strictEqual(anc1.priority, 'p0');
    assert.deepStrictEqual(anc1.files, ['src/auth/login.ts', 'src/auth/session.ts']);

    // 3. Verify state persisted on disk
    const stateFile = path.join(tempDir, 'state.json');
    assert.ok(fs.existsSync(stateFile));

    // 4. Reload from disk & verify flexible ID matching ('anc-1', '1', '01', '#anc-1')
    const reloadedStore = new AnchorStore(tempDir);
    const loadedAnc = reloadedStore.get('anc-1');
    assert.ok(loadedAnc);
    assert.strictEqual(loadedAnc!.title, 'Fix auth session bug');
    assert.strictEqual(reloadedStore.get('1')?.id, 'anc-1');
    assert.strictEqual(reloadedStore.get('01')?.id, 'anc-1');
    assert.strictEqual(reloadedStore.get('#anc-1')?.id, 'anc-1');

    // 5. Update anchor
    const updated = store.update('anc-1', { title: 'Fix auth session regression' });
    assert.strictEqual(updated.title, 'Fix auth session regression');

    // 6. Touch anchor
    const touched = store.touch('anc-1', 123456789);
    assert.strictEqual(touched.lastTouchedAt, 123456789);

    // 7. Settle anchor
    const settled = store.settle('anc-1', {
      settledBy: 'one-tap-settlement',
      commitHash: 'a1b2c3d'
    });
    assert.strictEqual(settled.status, 'settled');
    assert.strictEqual(store.list().length, 0); // Removed from active state

    // 8. Verify archive.jsonl
    const archiveFile = path.join(tempDir, 'archive.jsonl');
    assert.ok(fs.existsSync(archiveFile));
    const archiveContent = fs.readFileSync(archiveFile, 'utf-8');
    assert.ok(archiveContent.includes('Fix auth session regression'));
    assert.ok(archiveContent.includes('a1b2c3d'));

    // 9. Undo settlement (reverse pop back into active state)
    const restored = store.undoSettle();
    assert.strictEqual(restored.id, 'anc-1');
    assert.strictEqual(restored.status, 'active');
    assert.strictEqual(store.list().length, 1);
    assert.strictEqual(store.get('anc-1')?.title, 'Fix auth session regression');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore - corrupt state recovery', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    // Write corrupted JSON
    fs.writeFileSync(store.statePath, '{ this is corrupted json !!!', 'utf-8');

    // Should safely recover and back up corrupted file
    const state = store.loadState();
    assert.strictEqual(state.anchors.length, 0);

    const files = fs.readdirSync(store.storageDir);
    assert.ok(files.some((f: string) => f.startsWith('state.corrupt.')));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore - daily recurring task completes for today and wakes tomorrow', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const day1 = 100_000_000_000;
    const day2 = day1 + 24 * 3600 * 1000;

    // 1. Create recurring daily task
    const task = store.create({ title: '每天吃一个苹果' });
    assert.strictEqual(task.recurrence, 'daily');
    assert.strictEqual(task.durability, 'durable');

    // Day 1: Active before completion
    const list1 = store.list({ status: 'active', now: day1 });
    assert.strictEqual(list1.length, 1);

    // Day 1: Settle for today
    const settled = store.settle(task.id, { settledBy: 'manual-command' }, day1);
    assert.strictEqual(settled.recurrence, 'daily');
    assert.ok(settled.lastCompletedDate);

    // Day 1: Disappears from active list for today!
    const listToday = store.list({ status: 'active', now: day1 });
    assert.strictEqual(listToday.length, 0);

    // Day 2 (Tomorrow): Naturally reappears in active list!
    const listTomorrow = store.list({ status: 'active', now: day2 });
    assert.strictEqual(listTomorrow.length, 1);
    assert.strictEqual(listTomorrow[0].title, '每天吃一个苹果');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore - temporal durability keywords and project detection', () => {
  // 1. Durability keyword detection
  assert.strictEqual(detectDurability('今天完成后端优化'), 'ephemeral');
  assert.strictEqual(detectDurability('明天完成前端优化'), 'ephemeral');
  assert.strictEqual(detectDurability('后天完成上传优化'), 'ephemeral');
  assert.strictEqual(detectDurability('大后天完成测试'), 'ephemeral');
  assert.strictEqual(detectDurability('重构鉴权架构'), 'durable');

  // 2. Persistent 7-day quiet policy: unfinished tasks are NEVER silently auto-deleted (graveyardDays = 9999)
  assert.strictEqual(getEphemeralDecayPolicy('今天完成优化').activeDays, 7);
  assert.strictEqual(getEphemeralDecayPolicy('今天完成优化').graveyardDays, 9999);
  assert.strictEqual(getEphemeralDecayPolicy('后天完成优化').graveyardDays, 9999);
  assert.strictEqual(getEphemeralDecayPolicy('大后天完成优化').graveyardDays, 9999);

  // 3. Provenance folder reflects creation cwd faithfully
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const a1 = store.create({
      title: '今天完成anchor项目后端优化',
      cwd: 'C:/Users/Jason/Desktop'
    });
    // Faithfully records creation folder
    assert.strictEqual(a1.project, 'Desktop');
    assert.strictEqual(a1.durability, 'ephemeral');

    // Allows explicit project if specified
    const a2 = store.create({
      title: '明天完成前端优化',
      project: 'custom-proj',
      cwd: 'C:/Users/Jason/Desktop'
    });
    assert.strictEqual(a2.project, 'custom-proj');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('AnchorStore - atomicRenameWithRetry successfully replaces files atomically', () => {
  const tempDir = createTempDir();
  try {
    const src = path.join(tempDir, 'temp.json');
    const target = path.join(tempDir, 'final.json');

    fs.writeFileSync(src, JSON.stringify({ ok: true }));
    atomicRenameWithRetry(src, target);

    assert.ok(!fs.existsSync(src));
    assert.ok(fs.existsSync(target));
    const content = JSON.parse(fs.readFileSync(target, 'utf-8'));
    assert.strictEqual(content.ok, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('QA - monotonic nextId prevents ID reuse after settle and undoSettle avoids duplicate IDs', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const a1 = store.create({ title: 'First task' });
    assert.strictEqual(a1.id, 'anc-1');

    store.settle('anc-1');
    const a2 = store.create({ title: 'Second task after settle' });
    assert.strictEqual(a2.id, 'anc-2');

    const restored = store.undoSettle();
    assert.strictEqual(restored.id, 'anc-1');

    const active = store.list({ all: true });
    const ids = active.map(a => a.id);
    assert.deepStrictEqual(ids, ['anc-2', 'anc-1']);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('QA - normalizePath protects sibling folder prefixes and isSameOrSubPath handles subdirectories', () => {
  const sibling = normalizePath('D:/Workspace/project-b/src/a.ts', 'D:/Workspace/proj');
  assert.strictEqual(sibling, 'D:/Workspace/project-b/src/a.ts');

  const child = normalizePath('D:/Workspace/proj/src/a.ts', 'D:/Workspace/proj');
  assert.strictEqual(child, 'src/a.ts');

  assert.strictEqual(isSameOrSubPath('D:/Workspace/proj', 'D:/Workspace/proj/src'), true);
  assert.strictEqual(isSameOrSubPath('D:/Workspace/proj', 'D:/Workspace/project-b'), false);
});

test('v0.3.0 Autonomous - extractPathsFromText and cross-directory workspace matching', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    // Simulate pinning a task for D:/College while sitting in D:/Workspace/X (exact real-world bug scenario)
    const anc = store.create({
      title: 'College重构前置查阅外部架构参考库',
      description: '必须前置查阅 D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md。',
      project: 'D:/College/优化',
      cwd: 'D:/Workspace/X'
    });

    // Automatically extracts path from description when files not explicitly passed
    assert.ok(anc.files.includes('D:/College/优化/EXTERNAL_ARCHITECTURE_INSPIRATIONS.md'));
    // Aligns workspace matching to D:/College even though created in D:/Workspace/X
    assert.strictEqual(isAnchorTargetingWorkspace(anc, 'D:/College'), true);
    assert.strictEqual(isAnchorTargetingWorkspace(anc, 'D:/College/优化'), true);
    assert.strictEqual(store.list({ cwd: 'D:/College' }).some(a => a.id === anc.id), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('v0.3.0 Autonomous - tryRealtimeAutoSettle settles file-less tasks immediately on git commit', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const obs = new SessionTouchObserver();

    // Create a file-less task (files: [])
    const anc = store.create({
      title: '重构鉴权模块为HttpOnly Cookie',
      cwd: 'D:/Workspace/proj'
    });
    assert.strictEqual(anc.files.length, 0);

    // Agent executes git commit in bash during session
    const cmd = 'git commit -m "feat(auth): 重构鉴权模块为HttpOnly Cookie"';
    obs.recordToolCall('bash', { command: cmd });

    const settledNow = tryRealtimeAutoSettle(store, obs, 'D:/Workspace/proj', cmd);
    assert.strictEqual(settledNow.length, 1);
    assert.strictEqual(settledNow[0].anchor.id, anc.id);
    assert.strictEqual(store.list({ cwd: 'D:/Workspace/proj' }).length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});


