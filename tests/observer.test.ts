import test from 'node:test';
import assert from 'node:assert';
import { SessionTouchObserver } from '../src/observer.ts';

test('SessionTouchObserver - records read, edit, write and commits', () => {
  const obs = new SessionTouchObserver();

  // 1. Record read
  obs.recordToolCall('read', { path: 'src/auth/login.ts' });
  // 2. Record edit with backslashes
  obs.recordToolCall('edit', { path: 'src\\auth\\session.ts' });
  // 3. Record git commit in bash
  obs.recordToolCall('bash', { command: 'git commit -m "fix: auth regression"' });

  const touched = obs.getTouchedFiles();
  assert.strictEqual(touched.length, 2);
  assert.ok(touched.includes('src/auth/login.ts'));
  assert.ok(touched.includes('src/auth/session.ts'));
  assert.strictEqual(obs.hasCommitted(), true);

  // 4. Matches commit evidence
  const mockAnchor = {
    id: 'anc-1',
    title: 'auth regression fix',
    files: []
  } as any;
  const matchResult = obs.matchesCommit(mockAnchor);
  assert.strictEqual(matchResult.matched, true);
  assert.ok(matchResult.message?.includes('auth regression'));

  // Clear
  obs.clear();
  assert.strictEqual(obs.getTouchedFiles().length, 0);
  assert.strictEqual(obs.hasCommitted(), false);
});
