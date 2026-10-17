import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AnchorStore } from '../src/store.ts';
import {
  deriveStepBlocks,
  selectDockStepLayout,
  selectStepCounts,
  validateAnchorDependencies,
  validateStepDependencies
} from '../src/graph.ts';
import {
  convertTodoTasksToSteps,
  inferLiveActivityLabel,
  replayTodoSnapshotFromBranch
} from '../src/bridge.ts';
import { parseAnchorCommandInput } from '../src/extension.ts';
import { AnchorDockController } from '../src/dock.ts';
import type { AnchorStep } from '../src/types.ts';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'anchor-dock-graph-test-'));
}

test('Graph - validateStepDependencies and validateAnchorDependencies reject self-blocks, missing IDs, and cycles', () => {
  const steps: AnchorStep[] = [
    { id: 1, subject: 'Step 1', status: 'completed' },
    { id: 2, subject: 'Step 2', status: 'in_progress', blockedBy: [1] },
    { id: 3, subject: 'Step 3', status: 'pending', blockedBy: [2] }
  ];

  // Self-block
  assert.strictEqual(validateStepDependencies(steps, 2, [2]).valid, false);
  // Missing step
  assert.strictEqual(validateStepDependencies(steps, 2, [99]).valid, false);
  // Cycle: 1 -> 3 when 3 -> 2 -> 1
  const cycleRes = validateStepDependencies(steps, 1, [3]);
  assert.strictEqual(cycleRes.valid, false);
  assert.ok(cycleRes.error?.includes('cycle'));

  // Valid dependency: 3 -> 1
  assert.strictEqual(validateStepDependencies(steps, 3, [1]).valid, true);

  // Inverse blocks map
  const blocks = deriveStepBlocks(steps);
  assert.deepStrictEqual(blocks.get(1), [2]);
  assert.deepStrictEqual(blocks.get(2), [3]);

  // Step counts
  const counts = selectStepCounts(steps);
  assert.deepStrictEqual(counts, { total: 3, completed: 1, inProgress: 1, pending: 1 });
});

test('Bridge - replayTodoSnapshotFromBranch, convertTodoTasksToSteps, and inferLiveActivityLabel', () => {
  const fakeBranch = [
    {
      type: 'message',
      message: {
        role: 'toolResult',
        toolName: 'todo',
        details: {
          tasks: [
            { id: 1, subject: 'Design schema', status: 'completed' },
            { id: 2, subject: 'Implement store', status: 'in_progress', activeForm: 'writing store.ts', blockedBy: [1] },
            { id: 3, subject: 'Lock unit tests', status: 'pending', blockedBy: [2] }
          ],
          nextId: 4
        }
      }
    }
  ];

  const replayed = replayTodoSnapshotFromBranch(fakeBranch);
  assert.ok(replayed);
  assert.strictEqual(replayed!.length, 3);
  assert.strictEqual(replayed![1].activeForm, 'writing store.ts');
  assert.deepStrictEqual(replayed![2].blockedBy, [2]);

  const converted = convertTodoTasksToSteps(replayed!);
  assert.strictEqual(converted.length, 3);
  assert.strictEqual(converted[1].status, 'in_progress');

  assert.strictEqual(inferLiveActivityLabel('edit', { path: 'src/auth/jwt.ts' }), 'editing jwt.ts');
  assert.strictEqual(inferLiveActivityLabel('write', { path: 'src/index.ts' }), 'writing index.ts');
  assert.strictEqual(inferLiveActivityLabel('read', { path: 'README.md' }), 'reading README.md');
  assert.strictEqual(inferLiveActivityLabel('grep', { pattern: 'token' }), 'searching codebase');
  assert.strictEqual(inferLiveActivityLabel('find', { pattern: '*.ts' }), 'locating files');
  assert.strictEqual(inferLiveActivityLabel('ls', {}), 'inspecting directory');
  assert.strictEqual(inferLiveActivityLabel('subagent', { agent: 'oracle' }), 'delegating to oracle');
  assert.strictEqual(inferLiveActivityLabel('bash', { command: 'npm test' }), 'running tests');
  assert.strictEqual(inferLiveActivityLabel('bash', { command: 'npm run build' }), 'building project');
  assert.strictEqual(inferLiveActivityLabel('bash', { command: 'git status' }), 'inspecting git status');
  assert.strictEqual(inferLiveActivityLabel('bash', { command: 'python script.py' }), 'running python script');
  assert.strictEqual(inferLiveActivityLabel('bash', { command: 'cargo check' }), 'running cargo');
  assert.strictEqual(inferLiveActivityLabel('bash', { command: 'typst compile doc.typ' }), 'compiling typst');

  // Command input: now / what / status / hey
  assert.strictEqual(parseAnchorCommandInput('now').mode, 'now');
  assert.strictEqual(parseAnchorCommandInput('what').mode, 'now');
  assert.strictEqual(parseAnchorCommandInput('status').mode, 'now');
  assert.strictEqual(parseAnchorCommandInput('hey').mode, 'now');
});

test('Dock - AnchorDockController renders multi-row Tree Dock, folds completed steps on next turn, and toggles 1-line mode', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const dock = new AnchorDockController();

    const syncRes = store.syncFromTodoTool(
      [
        { id: 1, subject: 'Extract auth interface', status: 'completed' },
        { id: 2, subject: 'Switch token to HttpOnly cookie', status: 'in_progress', activeForm: 'editing auth.ts' },
        { id: 3, subject: 'Add integration tests', status: 'pending', blockedBy: [2] }
      ],
      { cwd: '/workspace/app', sessionFile: '/tmp/sess.jsonl', recentFiles: ['src/auth.ts'] }
    );
    assert.ok(syncRes.anchor);

    const active = store.list({ status: 'active', cwd: '/workspace/app' });

    // 1. Turn 1: Expanded Tree Dock shows completed step #1 with ✓, in_progress #2 with ◐ and (editing auth.ts), pending #3 with ○ and ⛓ #2
    const turn1Lines = dock.renderDockLines(active, { width: 96, cwd: '/workspace/app' });
    assert.ok(turn1Lines.length >= 4);
    assert.ok(turn1Lines[0].includes('[■□□□ 1/3]'));
    assert.ok(turn1Lines.some(l => l.includes('✓') && l.includes('1.') && l.includes('Extract auth interface')));
    assert.ok(turn1Lines.some(l => l.includes('◐') && l.includes('2.') && l.includes('(editing auth.ts)')));
    assert.ok(turn1Lines.some(l => l.includes('○') && l.includes('3.') && l.includes('⛓ #2')));

    // 2. Turn 2 (`foldCompletedStepsFromPreviousTurn`): completed step #1 folds into `+1 steps (1 done)` footer!
    const folded = dock.foldCompletedStepsFromPreviousTurn();
    assert.strictEqual(folded, true);

    const turn2Lines = dock.renderDockLines(active, { width: 96, cwd: '/workspace/app' });
    assert.ok(!turn2Lines.some(l => l.includes('Extract auth interface')));
    assert.ok(turn2Lines.some(l => l.includes('+1 steps (1 done)')));

    // 3. Alt+A toggle (`toggleCollapsed`): collapses to a single-line strip
    dock.toggleCollapsed();
    const collapsedLines = dock.renderDockLines(active, { width: 96, cwd: '/workspace/app' });
    assert.strictEqual(collapsedLines.length, 1);
    assert.ok(collapsedLines[0].includes('[■□□□ 1/3]'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Store Step Workbench - addStep, updateStep with DAG cycle guard, and listArchive', () => {
  const tempDir = createTempDir();
  try {
    const store = new AnchorStore(tempDir);
    const anc = store.create({ title: 'Multi-step feature', cwd: '/workspace/app' });

    store.addStep(anc.id, 'First step');
    store.addStep(anc.id, 'Second step', { blockedBy: [1] });

    const afterAdd = store.get(anc.id)!;
    assert.strictEqual(afterAdd.progress?.total, 2);
    assert.strictEqual(afterAdd.progress?.done, 0);

    // Reject cycle: Step 1 blockedBy Step 2
    assert.throws(() => {
      store.updateStep(anc.id, 1, { addBlockedBy: [2] });
    }, /cycle/i);

    // Complete Step 1
    const afterStep1 = store.updateStep(anc.id, 1, { status: 'completed' });
    assert.strictEqual(afterStep1.progress?.done, 1);

    // Settle and verify listArchive
    store.settle(anc.id);
    const archived = store.listArchive(10);
    assert.strictEqual(archived.length, 1);
    assert.strictEqual(archived[0].title, 'Multi-step feature');

    // Cross-anchor dependency validation
    const a1 = store.create({ title: 'Base task' });
    const a2 = store.create({ title: 'Dependent task', blockedBy: [a1.id] });
    assert.strictEqual(validateAnchorDependencies(store.list({ all: true }), a1.id, [a2.id]).valid, false);
    assert.strictEqual(selectDockStepLayout([], 0).visible.length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
