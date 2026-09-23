import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';

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

    // 4. Reload from disk
    const reloadedStore = new AnchorStore(tempDir);
    const loadedAnc = reloadedStore.get('anc-1');
    assert.ok(loadedAnc);
    assert.strictEqual(loadedAnc!.title, 'Fix auth session bug');

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
