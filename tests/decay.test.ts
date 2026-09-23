import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import { evaluateAnchorDecay, sweepStore } from '../src/decay.ts';

const MS_PER_DAY = 86_400_000;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-decay-test-'));
}

test('AnchorDecay - status evaluation transitions', () => {
  const baseTime = 100_000_000_000;

  const anchor = {
    id: 'anc-1',
    title: 'Refactor database client',
    priority: 'p1' as const,
    status: 'active' as const,
    durability: 'durable' as const,
    project: 'test-project',
    cwd: '/test-project',
    createdAt: baseTime,
    updatedAt: baseTime,
    lastTouchedAt: baseTime,
    files: [],
    tags: [],
    decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 }
  };

  // Day 1: Active
  const res1 = evaluateAnchorDecay(anchor, baseTime + 1 * MS_PER_DAY);
  assert.strictEqual(res1.nextStatus, 'active');
  assert.strictEqual(res1.daysUntouched, 1);

  // Day 4: Sleeping (beyond 3 active days, but under 14 graveyard days)
  const res4 = evaluateAnchorDecay(anchor, baseTime + 4 * MS_PER_DAY);
  assert.strictEqual(res4.nextStatus, 'sleeping');
  assert.strictEqual(res4.daysUntouched, 4);

  // Day 15: Graveyard (beyond 14 days)
  const res15 = evaluateAnchorDecay(anchor, baseTime + 15 * MS_PER_DAY);
  assert.strictEqual(res15.nextStatus, 'graveyard');
  assert.strictEqual(res15.daysUntouched, 15);
});

test('AnchorDecay - sweepStore transitions and graveyard eviction', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const baseTime = 100_000_000_000;

    const a1 = store.create({ title: 'Task fresh (1 day)', decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 } });
    const a2 = store.create({ title: 'Task stale (5 days)', decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 } });
    const a3 = store.create({ title: 'Task expired (20 days)', decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 } });

    store.touch(a1.id, baseTime - 1 * MS_PER_DAY);
    store.touch(a2.id, baseTime - 5 * MS_PER_DAY);
    store.touch(a3.id, baseTime - 20 * MS_PER_DAY);

    // Run sweep at baseTime
    const sweepRes = sweepStore(store, baseTime);

    assert.ok(sweepRes.transitionedToSleeping.includes(a2.id));
    assert.ok(sweepRes.evictedToGraveyard.includes(a3.id));

    // Check store state: a3 should be gone from active state
    const remaining = store.list();
    assert.strictEqual(remaining.length, 2);
    assert.strictEqual(store.get(a1.id)?.status, 'active');
    assert.strictEqual(store.get(a2.id)?.status, 'sleeping');
    assert.strictEqual(store.get(a3.id), undefined);

    // Graveyard file should have a3 recorded
    const graveyardFile = path.join(tempDir, 'graveyard.jsonl');
    assert.ok(fs.existsSync(graveyardFile));
    const content = fs.readFileSync(graveyardFile, 'utf-8');
    assert.ok(content.includes('Task expired (20 days)'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
