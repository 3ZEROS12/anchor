import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import { renderActiveAnchorsContext } from '../src/context_injector.ts';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-inject-test-'));
}

test('ContextInjector - renders only active anchors, sleeping consume 0 tokens', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const now = 100_000_000_000;

    // 0 anchors: should return empty string (0 tokens)
    assert.strictEqual(renderActiveAnchorsContext(store, now), '');

    // 1 active anchor
    const a1 = store.create({ title: 'Active task', files: ['src/main.ts'] });
    store.touch(a1.id, now);

    // 1 sleeping anchor (4 days untouched)
    const a2 = store.create({ title: 'Sleeping task' });
    store.touch(a2.id, now - 4 * 86_400_000);

    const rendered = renderActiveAnchorsContext(store, now);
    assert.ok(rendered.includes('Active task'));
    assert.ok(!rendered.includes('Sleeping task')); // Silenced! 0 tokens!
    assert.ok(rendered.includes('<active-anchors count="1">'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ContextInjector - renders targetDate and task aging in prompt', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const now = 100_000_000_000;

    store.create({ title: '今天完成优化' });
    const rendered = renderActiveAnchorsContext(store, now);
    assert.ok(rendered.includes('[今日聚焦·Due Today]'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ContextInjector - renders preflight failure hints into cold-start context', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const now = 100_000_000_000;

    const a1 = store.create({ title: 'Failing test task', verifyCommand: 'npm test' });
    store.touch(a1.id, now);

    const failures = new Map<string, string>();
    failures.set(a1.id, 'AssertionError: expected 200 to be 500');

    const rendered = renderActiveAnchorsContext(store, undefined, now, failures);
    assert.ok(rendered.includes('Failing test task'));
    assert.ok(rendered.includes('物理验证失败'));
    assert.ok(rendered.includes('AssertionError: expected 200 to be 500'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
