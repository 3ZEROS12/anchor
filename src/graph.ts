import type { Anchor, AnchorProgress, AnchorStep, DockStepLayout, StepCounts, StepStatus } from './types.ts';

/**
 * Validate whether adding `newBlockedBy` to `stepId` introduces a cycle, self-dependency,
 * or reference to a non-existent/deleted step.
 */
export function validateStepDependencies(
  steps: readonly AnchorStep[],
  stepId: number,
  newBlockedBy: readonly number[]
): { valid: boolean; error?: string } {
  const visibleMap = new Map<number, AnchorStep>();
  for (const s of steps) {
    if (s.status !== 'deleted') {
      visibleMap.set(s.id, s);
    }
  }

  for (const depId of newBlockedBy) {
    if (depId === stepId) {
      return { valid: false, error: `Step #${stepId} cannot be blocked by itself` };
    }
    if (!visibleMap.has(depId)) {
      return { valid: false, error: `Prerequisite step #${depId} does not exist or is deleted` };
    }
  }

  const edges = new Map<number, number[]>();
  for (const s of visibleMap.values()) {
    if (s.id === stepId) {
      const merged = new Set([...(s.blockedBy ?? []), ...newBlockedBy]);
      edges.set(s.id, [...merged]);
    } else {
      edges.set(s.id, s.blockedBy ? [...s.blockedBy] : []);
    }
  }

  const visiting = new Set<number>();
  const visited = new Set<number>();

  const hasCycle = (node: number): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const nb of edges.get(node) ?? []) {
      if (hasCycle(nb)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of edges.keys()) {
    if (hasCycle(node)) {
      return { valid: false, error: `Dependency cycle detected involving step #${stepId}` };
    }
  }

  return { valid: true };
}

/**
 * Validate cross-anchor `blockedBy` dependencies for cycles or self-blocks
 */
export function validateAnchorDependencies(
  anchors: readonly Anchor[],
  anchorId: string,
  newBlockedBy: readonly string[]
): { valid: boolean; error?: string } {
  const normId = (raw: string) => {
    const clean = raw.trim().replace(/^#/, '');
    return /^\d+$/.test(clean) ? `anc-${parseInt(clean, 10)}` : clean;
  };

  const targetId = normId(anchorId);
  const activeMap = new Map<string, Anchor>();
  for (const a of anchors) {
    activeMap.set(a.id, a);
  }

  const normalizedDeps = newBlockedBy.map(normId);
  for (const depId of normalizedDeps) {
    if (depId === targetId) {
      return { valid: false, error: `Note #${targetId} cannot depend on itself` };
    }
    if (!activeMap.has(depId)) {
      return { valid: false, error: `Prerequisite note #${depId} does not exist` };
    }
  }

  const edges = new Map<string, string[]>();
  for (const a of activeMap.values()) {
    if (a.id === targetId) {
      edges.set(a.id, Array.from(new Set([...(a.blockedBy ?? []), ...normalizedDeps])));
    } else {
      edges.set(a.id, a.blockedBy ? [...a.blockedBy] : []);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const nb of edges.get(node) ?? []) {
      if (hasCycle(nb)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  for (const node of edges.keys()) {
    if (hasCycle(node)) {
      return { valid: false, error: `Dependency cycle detected involving #${targetId}` };
    }
  }

  return { valid: true };
}

/**
 * Build inverse adjacency map: for each step S, which other steps are blocked by S
 */
export function deriveStepBlocks(steps: readonly AnchorStep[]): Map<number, number[]> {
  const blocks = new Map<number, number[]>();
  for (const s of steps) {
    if (s.status === 'deleted') continue;
    for (const dep of s.blockedBy ?? []) {
      const arr = blocks.get(dep) ?? [];
      arr.push(s.id);
      blocks.set(dep, arr);
    }
  }
  return blocks;
}

/**
 * Materialize structured `AnchorStep[]` from an `AnchorProgress` object
 * (supports both rich `progress.items` and legacy flat `progress.steps` string arrays)
 */
export function materializeSteps(progress?: AnchorProgress): AnchorStep[] {
  if (!progress) return [];
  if (Array.isArray(progress.items) && progress.items.length > 0) {
    return progress.items.filter(s => s.status !== 'deleted').map(s => ({ ...s }));
  }
  if (Array.isArray(progress.steps) && progress.steps.length > 0) {
    const done = Math.max(0, progress.done || 0);
    return progress.steps.map((subject, idx) => {
      let status: StepStatus = 'pending';
      if (idx < done) status = 'completed';
      else if (idx === done) status = 'in_progress';
      return {
        id: idx + 1,
        subject,
        status
      };
    });
  }
  return [];
}

/**
 * Synchronize `progress.done`, `progress.total`, and `progress.steps` from structured `AnchorStep[]`
 */
export function syncProgressFromItems(items: readonly AnchorStep[], existing?: AnchorProgress): AnchorProgress {
  const visible = items.filter(i => i.status !== 'deleted');
  const completed = visible.filter(i => i.status === 'completed').length;
  return {
    ...(existing || {}),
    done: completed,
    total: visible.length,
    steps: visible.map(i => i.subject),
    items: items.map(i => ({ ...i }))
  };
}

/**
 * Compute status counts across structured steps
 */
export function selectStepCounts(steps: readonly AnchorStep[]): StepCounts {
  const visible = steps.filter(s => s.status !== 'deleted');
  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  for (const s of visible) {
    if (s.status === 'completed') completed++;
    else if (s.status === 'in_progress') inProgress++;
    else pending++;
  }
  return {
    total: visible.length,
    pending,
    inProgress,
    completed
  };
}

/**
 * Select which steps to display in the `belowEditor` Dock within a row budget:
 * 1. Hides completed steps that already had their 1-turn strikethrough grace period (`hiddenCompletedIds`).
 * 2. If remaining steps fit within `budget`, shows all of them.
 * 3. On overflow, drops remaining completed steps first, then truncates tail pending steps,
 *    returning exact `hiddenCompleted` and `truncatedTail` counts for the `+N more` summary line.
 */
export function selectDockStepLayout(
  steps: readonly AnchorStep[],
  budget: number,
  hiddenCompletedIds: ReadonlySet<number> = new Set()
): DockStepLayout {
  const allVisible = steps.filter(
    s => s.status !== 'deleted' && !(s.status === 'completed' && hiddenCompletedIds.has(s.id))
  );
  const preHiddenCompleted = steps.filter(
    s => s.status === 'completed' && hiddenCompletedIds.has(s.id)
  ).length;

  if (budget <= 0) {
    return { visible: [], hiddenCompleted: preHiddenCompleted, truncatedTail: allVisible.length };
  }

  if (allVisible.length <= budget && preHiddenCompleted === 0) {
    return { visible: allVisible, hiddenCompleted: 0, truncatedTail: 0 };
  }

  const innerBudget = preHiddenCompleted > 0 ? Math.max(1, budget - 1) : (allVisible.length <= budget ? budget : Math.max(1, budget - 1));
  if (allVisible.length <= innerBudget && preHiddenCompleted === 0) {
    return { visible: allVisible, hiddenCompleted: 0, truncatedTail: 0 };
  }

  const nonCompleted = allVisible.filter(s => s.status !== 'completed');
  const newlyCompletedCount = allVisible.length - nonCompleted.length;

  if (nonCompleted.length <= innerBudget) {
    const kept = new Set<AnchorStep>(nonCompleted);
    for (const s of allVisible) {
      if (kept.size >= innerBudget) break;
      if (s.status === 'completed') kept.add(s);
    }
    const visible = allVisible.filter(s => kept.has(s));
    const shownCompleted = visible.filter(s => s.status === 'completed').length;
    return {
      visible,
      hiddenCompleted: preHiddenCompleted + (newlyCompletedCount - shownCompleted),
      truncatedTail: 0
    };
  }

  const visible = nonCompleted.slice(0, innerBudget);
  return {
    visible,
    hiddenCompleted: preHiddenCompleted + newlyCompletedCount,
    truncatedTail: nonCompleted.length - innerBudget
  };
}
