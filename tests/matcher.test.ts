import test from 'node:test';
import assert from 'node:assert';
import { matchAnchorAgainstTouchedFiles, findMatchedAnchors } from '../src/matcher.ts';
import type { Anchor } from '../src/types.ts';

test('AnchorMatcher - exact, prefix, and tag matching', () => {
  const anchor: Anchor = {
    id: 'anc-1',
    title: 'Migrate JWT tokens to HTTP-only cookies',
    priority: 'p0',
    status: 'active',
    durability: 'durable',
    project: 'auth',
    cwd: '/workspace/auth',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now(),
    files: ['src/auth/jwt.ts', 'src/auth/'],
    tags: ['security', 'session'],
    decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 }
  };

  // 1. Exact match
  const match1 = matchAnchorAgainstTouchedFiles(anchor, ['src/auth/jwt.ts', 'src/other.ts']);
  assert.ok(match1);
  assert.strictEqual(match1!.score, 1.0);
  assert.strictEqual(match1!.reason, 'exact-file');
  assert.deepStrictEqual(match1!.matchedFiles, ['src/auth/jwt.ts']);

  // 2. Directory prefix match
  const match2 = matchAnchorAgainstTouchedFiles(anchor, ['src/auth/middleware.ts']);
  assert.ok(match2);
  assert.strictEqual(match2!.score, 0.85);
  assert.strictEqual(match2!.reason, 'dir-prefix');

  // 3. Tag keyword match
  const match3 = matchAnchorAgainstTouchedFiles(anchor, ['src/lib/session_cache.ts']);
  assert.ok(match3);
  assert.strictEqual(match3!.score, 0.5);
  assert.strictEqual(match3!.reason, 'tag-keyword');

  // 4. No match
  const match4 = matchAnchorAgainstTouchedFiles(anchor, ['docs/readme.md']);
  assert.strictEqual(match4, null);
});

test('AnchorMatcher - glob pattern matching (*.ts, src/**/*.ts)', () => {
  const anchor: Anchor = {
    id: 'anc-glob',
    title: 'Migrate UI components',
    priority: 'p1',
    status: 'active',
    durability: 'durable',
    project: 'ui',
    cwd: '/workspace/ui',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now(),
    files: ['src/components/*.tsx', 'src/styles/**/*.css'],
    tags: [],
    decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 }
  };

  const match1 = matchAnchorAgainstTouchedFiles(anchor, ['src/components/Button.tsx']);
  assert.ok(match1);
  assert.strictEqual(match1!.reason, 'exact-file');

  const match2 = matchAnchorAgainstTouchedFiles(anchor, ['src/styles/theme/dark.css']);
  assert.ok(match2);
  assert.strictEqual(match2!.reason, 'exact-file');

  const match3 = matchAnchorAgainstTouchedFiles(anchor, ['src/components/sub/Deep.tsx']);
  assert.strictEqual(match3, null);
});

test('AnchorMatcher - findMatchedAnchors prioritizes high-confidence & high-priority', () => {
  const a0: Anchor = {
    id: 'anc-0',
    title: 'P2 low priority exact match',
    priority: 'p2',
    status: 'active',
    durability: 'durable',
    project: 'auth',
    cwd: '/workspace/auth',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now(),
    files: ['src/common/util.ts'],
    tags: [],
    decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 }
  };

  const a1: Anchor = {
    id: 'anc-1',
    title: 'P0 critical prefix match',
    priority: 'p0',
    status: 'active',
    durability: 'durable',
    project: 'auth',
    cwd: '/workspace/auth',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now(),
    files: ['src/auth/'],
    tags: [],
    decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 }
  };

  const a2: Anchor = {
    id: 'anc-2',
    title: 'P0 critical exact match',
    priority: 'p0',
    status: 'active',
    durability: 'durable',
    project: 'auth',
    cwd: '/workspace/auth',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastTouchedAt: Date.now(),
    files: ['src/auth/login.ts'],
    tags: [],
    decay: { activeDays: 3, sleepDays: 7, graveyardDays: 14 }
  };

  const matched = findMatchedAnchors([a0, a1, a2], ['src/auth/login.ts']);
  assert.strictEqual(matched.length, 2);
  // a2 is exact match (score 1.0, p0)
  assert.strictEqual(matched[0].anchor.id, 'anc-2');
  assert.strictEqual(matched[0].score, 1.0);
  // a1 is prefix match (score 0.85, p0)
  assert.strictEqual(matched[1].anchor.id, 'anc-1');
  assert.strictEqual(matched[1].score, 0.85);
});
