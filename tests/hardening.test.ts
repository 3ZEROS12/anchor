import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AnchorStore, normalizeAnchor, renderColdStartAnchorsContext } from '../src/store.ts';
import initExtension, { createGitWipSnapshot, parseAnchorCommandInput } from '../src/extension.ts';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-hardening-'));
}

function writeState(dir: string, anchors: unknown[]): void {
  fs.writeFileSync(
    path.join(dir, 'state.json'),
    JSON.stringify({ version: 1, anchors, lastSweepAt: Date.now() })
  );
}

function gitInit(dir: string): void {
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run(['init']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'Anchor Test']);
}

function commitTrackedFile(dir: string): void {
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'original\n');
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  run(['add', 'tracked.txt']);
  run(['commit', '-m', 'initial']);
}

test('state schema - a partial anchor no longer throws in list() or cold-start context', () => {
  const dir = createTempDir();
  try {
    // Shape written by pre-1.2 releases / hand edits: no files, no tags, no timestamps.
    writeState(dir, [{ id: 'anc-1', title: 'Legacy note', project: 'anchor', status: 'active' }]);
    const store = new AnchorStore(dir);

    const listed = store.list({ all: true });
    assert.strictEqual(listed.length, 1);
    assert.deepStrictEqual(listed[0].files, []);
    assert.deepStrictEqual(listed[0].tags, []);
    assert.strictEqual(listed[0].cwd, '');
    assert.ok(Number.isFinite(listed[0].createdAt));

    // Filtered read used to dereference a.files.length and crash.
    assert.strictEqual(store.list({ cwd: dir }).length, 1);
    assert.doesNotThrow(() => renderColdStartAnchorsContext(store, dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('state schema - unusable entries are dropped instead of poisoning the store', () => {
  const dir = createTempDir();
  try {
    writeState(dir, [
      null,
      'nope',
      { title: 'no id' },
      { id: '   ', title: 'blank id' },
      { id: 'anc-2', title: 'Keep me', files: ['a.ts', 42], tags: ['x', null], progress: { done: 5, total: 2 } }
    ]);
    const store = new AnchorStore(dir);
    const listed = store.list({ all: true });

    assert.deepStrictEqual(listed.map((a) => a.id), ['anc-2']);
    assert.deepStrictEqual(listed[0].files, ['a.ts']);
    assert.deepStrictEqual(listed[0].tags, ['x']);
    assert.deepStrictEqual(listed[0].progress, { done: 2, total: 2 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('normalizeAnchor - coerces a current-schema anchor without losing fields', () => {
  const normalized = normalizeAnchor({
    id: 'anc-7',
    title: 'Ship it',
    status: 'settled',
    source: 'todo-sync',
    project: 'toolflow',
    cwd: 'D:/Workspace/projects/toolflow',
    createdAt: 1000,
    updatedAt: 2000,
    lastTouchedAt: 3000,
    files: ['src/a.ts'],
    tags: ['ship'],
    priority: 'p1',
    targetDate: '2026-12-01',
    blockedBy: ['anc-6'],
    progress: {
      done: 1,
      total: 2,
      steps: ['one', 'two'],
      items: [{ id: 1, subject: 'one', status: 'completed', blockedBy: [0] }, { id: 2, title: 'two', status: 'bogus' }]
    }
  });

  assert.ok(normalized);
  assert.strictEqual(normalized.id, 'anc-7');
  assert.strictEqual(normalized.status, 'settled');
  assert.strictEqual(normalized.priority, 'p1');
  assert.deepStrictEqual(normalized.blockedBy, ['anc-6']);
  assert.deepStrictEqual(normalized.progress?.steps, ['one', 'two']);
  assert.deepStrictEqual(normalized.progress?.items?.[0], {
    id: 1,
    subject: 'one',
    status: 'completed',
    blockedBy: [0]
  });
  assert.strictEqual(normalized.progress?.items?.[1].subject, 'two');
  assert.strictEqual(normalized.progress?.items?.[1].status, 'pending');
});

test('snap - clean tree reports the HEAD commit and no snapshot ref', () => {
  const dir = createTempDir();
  try {
    gitInit(dir);
    commitTrackedFile(dir);

    const res = createGitWipSnapshot(dir, 'checkpoint');
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isClean, true);
    assert.match(res.commitHash || '', /^[0-9a-f]{7}$/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('snap - untracked-only tree fails loudly instead of claiming a clean checkpoint', () => {
  const dir = createTempDir();
  try {
    gitInit(dir);
    commitTrackedFile(dir);
    fs.writeFileSync(path.join(dir, 'brand-new.txt'), 'untracked\n');

    const res = createGitWipSnapshot(dir, 'checkpoint');
    assert.strictEqual(res.success, false);
    assert.match(res.error || '', /untracked/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('snap - tracked changes are captured and the message is passed as argv, not shell', () => {
  const dir = createTempDir();
  try {
    gitInit(dir);
    commitTrackedFile(dir);
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'changed\n');

    const hostile = 'note $(touch pwned) `touch pwned2`';
    const res = createGitWipSnapshot(dir, hostile);

    assert.strictEqual(res.success, true, res.error ?? '');
    assert.strictEqual(res.isClean, undefined);
    assert.ok(!fs.existsSync(path.join(dir, 'pwned')), 'command substitution must not execute');
    assert.ok(!fs.existsSync(path.join(dir, 'pwned2')), 'backticks must not execute');

    const refMessage = execFileSync('git', ['log', '-1', '--format=%s', 'refs/anchor/snap'], {
      cwd: dir,
      encoding: 'utf-8'
    }).trim();
    assert.ok(refMessage.includes(hostile), `ref message lost the raw text: ${refMessage}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy toggle - reports the load-time constraint and never mutates the environment', async () => {
  const dir = createTempDir();
  const previous = process.env.ANCHOR_LEGACY_COMMANDS;
  delete process.env.ANCHOR_LEGACY_COMMANDS;
  try {
    const store = new AnchorStore(dir);
    const commands = new Map<string, any>();
    const pi = {
      on: () => {},
      registerTool: () => {},
      registerCommand: (name: string, def: any) => {
        commands.set(name, def);
      },
      registerShortcut: () => {}
    } as unknown as ExtensionAPI;
    initExtension(pi, store);

    const notifications: string[] = [];
    const ctx = {
      ui: { notify: (msg: string) => notifications.push(msg) },
      cwd: dir
    } as any;

    await commands.get('anchor').handler('legacy on', ctx);
    assert.strictEqual(process.env.ANCHOR_LEGACY_COMMANDS, undefined);
    assert.match(notifications.join('\n'), /export ANCHOR_LEGACY_COMMANDS=1/);

    await commands.get('anchor').handler('legacy off', ctx);
    assert.strictEqual(process.env.ANCHOR_LEGACY_COMMANDS, undefined);
    assert.match(notifications.join('\n'), /unset ANCHOR_LEGACY_COMMANDS/);

    await commands.get('anchor').handler('legacy', ctx);
    assert.match(notifications[notifications.length - 1], /Menu mode: decluttered/);
  } finally {
    if (previous !== undefined) process.env.ANCHOR_LEGACY_COMMANDS = previous;
    else delete process.env.ANCHOR_LEGACY_COMMANDS;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('command parse - a bare action verb opens the dock instead of pinning a note', () => {
  for (const verb of ['done', 'steer', 'check', 'jump', 'resume', 'session', 'step']) {
    assert.deepStrictEqual(parseAnchorCommandInput(verb), { mode: 'dashboard' }, verb);
  }
  // Verbs with a target keep their meaning.
  assert.deepStrictEqual(parseAnchorCommandInput('done 2'), { mode: 'settle', targetId: '2' });
});

test('check - a ratio-only note explains itself instead of leaking an internal error', () => {
  const dir = createTempDir();
  try {
    const store = new AnchorStore(dir);
    const note = store.create({ title: 'Ratio task [2/4]', cwd: dir });
    assert.strictEqual(note.progress?.total, 4);

    assert.throws(
      () => store.updateStep(note.id, 2, { status: 'completed' }),
      /no checklist items.*\/anchor step 1/s
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('archive - undoSettle keeps lines it cannot parse', () => {
  const dir = createTempDir();
  try {
    const store = new AnchorStore(dir);
    const note = store.create({ title: 'Finished task', cwd: dir });
    store.settle(note.id, { settledBy: 'manual' });

    const archive = fs.readFileSync(store.archivePath, 'utf-8');
    fs.writeFileSync(store.archivePath, `${archive.trimEnd()}\n{"torn write": tru\n`, 'utf-8');

    const restored = store.undoSettle();
    assert.strictEqual(restored.id, note.id);

    const after = fs.readFileSync(store.archivePath, 'utf-8');
    assert.ok(after.includes('{"torn write": tru'), `unparsable line was dropped: ${after}`);
    assert.ok(!after.includes('Finished task'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
