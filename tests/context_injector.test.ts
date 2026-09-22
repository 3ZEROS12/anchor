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
