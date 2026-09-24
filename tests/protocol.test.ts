import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore, acquireSyncLock } from '../src/store.ts';
import { makeSafeTaskAnnotation, COMMENT_FORMATS } from '../src/context_injector.ts';
import { AnchorProtocol } from '../src/protocol.ts';

test('Lock - acquireSyncLock acquires, holds, and releases exclusive lockfile', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-lock-test-'));
  const lockPath = path.join(tempDir, 'state.lock');

  try {
    const release1 = acquireSyncLock(lockPath, 500);
    assert.ok(fs.existsSync(lockPath));

    // Release and verify lock is deleted
    release1();
    assert.ok(!fs.existsSync(lockPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Lock - acquireSyncLock safely reclaims stale lock from dead PID', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-lock-stale-'));
  const lockPath = path.join(tempDir, 'state.lock');

  try {
    // Write stale lock from dead PID 999999
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, createdAt: Date.now() - 10000 }), 'utf-8');

    // Should detect dead PID and acquire successfully
    const release = acquireSyncLock(lockPath, 500);
    assert.ok(fs.existsSync(lockPath));

    const meta = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    assert.strictEqual(meta.pid, process.pid);

    release();
    assert.ok(!fs.existsSync(lockPath));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Context - makeSafeTaskAnnotation produces language-accurate comments and skips JSON', () => {
  const dummyAnchor = {
    id: 'anc-1',
    title: 'Refactor engine',
    priority: 'p0'
  } as any;

  // TypeScript / JavaScript
  const tsComment = makeSafeTaskAnnotation('src/index.ts', dummyAnchor);
  assert.ok(tsComment && tsComment.includes('// ⌖ anchor context: #anc-1 Refactor engine (P0)'));

  // Python
  const pyComment = makeSafeTaskAnnotation('scripts/run.py', dummyAnchor);
  assert.ok(pyComment && pyComment.includes('# ⌖ anchor context: #anc-1 Refactor engine (P0)'));

  // HTML
  const htmlComment = makeSafeTaskAnnotation('public/index.html', dummyAnchor);
  assert.ok(htmlComment && htmlComment.includes('<!-- ⌖ anchor context: #anc-1 Refactor engine (P0) -->'));

  // SQL
  const sqlComment = makeSafeTaskAnnotation('migrations/001.sql', dummyAnchor);
  assert.ok(sqlComment && sqlComment.includes('-- ⌖ anchor context: #anc-1 Refactor engine (P0)'));

  // JSON -> MUST RETURN NULL to prevent syntax corruption
  const jsonComment = makeSafeTaskAnnotation('package.json', dummyAnchor);
  assert.strictEqual(jsonComment, null);

  // Unknown / Binary -> NULL
  const binComment = makeSafeTaskAnnotation('image.png', dummyAnchor);
  assert.strictEqual(binComment, null);
});

test('Protocol - AnchorProtocol lifecycle handles cold-start and safe JIT', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-protocol-test-'));
  try {
    const store = new AnchorStore(tempDir);
    const protocol = new AnchorProtocol(store);

    store.create({
      title: 'Fix auth jwt',
      files: ['src/auth.ts'],
      priority: 'p0',
      cwd: tempDir
    });

    // 1. Session start
    const startRes = protocol.handleSessionStart();
    assert.strictEqual(startRes.sleepingCount, 0);

    // 2. Turn 1 cold-start: returns prompt
    const promptTurn1 = protocol.handleBeforeTurn(1, tempDir);
    assert.ok(promptTurn1 && promptTurn1.includes('Fix auth jwt'));

    // 3. Turn 2: returns null (0 tokens!)
    const promptTurn2 = protocol.handleBeforeTurn(2, tempDir);
    assert.strictEqual(promptTurn2, null);

    // 4. Tool result: read inspection
    const readRes = protocol.handleToolResult({
      toolName: 'read',
      filePath: 'src/auth.ts',
      isMutation: false,
      cwd: tempDir
    });
    assert.ok(readRes.annotation && readRes.annotation.includes('// ⌖ anchor context: #anc-1'));
    assert.strictEqual(readRes.matchedAnchors.length, 1);

    // 5. Tool result deduplication: second read of same anchor returns null
    const secondRead = protocol.handleToolResult({
      toolName: 'read',
      filePath: 'src/auth.ts',
      isMutation: false,
      cwd: tempDir
    });
    assert.strictEqual(secondRead.annotation, null);

    // 6. Tool error guard: failed tool call does not record or corrupt
    const errRes = protocol.handleToolResult({
      toolName: 'edit',
      filePath: 'src/auth.ts',
      isError: true,
      isMutation: true,
      cwd: tempDir
    });
    assert.strictEqual(errRes.annotation, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
