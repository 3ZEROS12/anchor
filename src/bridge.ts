import path from 'node:path';
import type { AnchorStep, TodoTaskItem } from './types.ts';

/**
 * Inspect session transcript branch (`ctx.sessionManager.getBranch()`) to recover
 * the latest `todo` tool snapshot (`@juicesharp/rpiv-todo` or built-in `todo`).
 */
export function replayTodoSnapshotFromBranch(branch?: Iterable<unknown> | null): TodoTaskItem[] | null {
  if (!branch || typeof (branch as any)[Symbol.iterator] !== 'function') return null;

  let latestTasks: TodoTaskItem[] | null = null;
  for (const entry of branch) {
    const e = entry as {
      type?: string;
      message?: {
        role?: string;
        toolName?: string;
        details?: { tasks?: unknown };
      };
    };
    if (e?.type !== 'message') continue;
    const msg = e.message;
    if (msg?.role !== 'toolResult' || String(msg.toolName || '').toLowerCase() !== 'todo') continue;
    const rawTasks = msg.details?.tasks;
    if (Array.isArray(rawTasks)) {
      latestTasks = rawTasks
        .filter((t: any) => t && typeof t === 'object' && typeof t.subject === 'string')
        .map((t: any, idx: number) => ({
          id: typeof t.id === 'number' ? t.id : idx + 1,
          subject: String(t.subject),
          status:
            t.status === 'in_progress' || t.status === 'completed' || t.status === 'deleted'
              ? t.status
              : 'pending',
          ...(typeof t.activeForm === 'string' && t.activeForm.trim() ? { activeForm: t.activeForm.trim() } : {}),
          ...(Array.isArray(t.blockedBy) ? { blockedBy: t.blockedBy.filter((n: any) => typeof n === 'number') } : {})
        }));
    }
  }

  return latestTasks;
}

/**
 * Convert `TodoTaskItem[]` into structured `AnchorStep[]` preserving `status`, `activeForm`, and `blockedBy` DAG edges.
 */
export function convertTodoTasksToSteps(tasks: readonly TodoTaskItem[]): AnchorStep[] {
  return tasks
    .filter(t => t && typeof t.subject === 'string' && t.status !== 'deleted')
    .map((t, idx) => ({
      id: typeof t.id === 'number' ? t.id : idx + 1,
      subject: t.subject.trim(),
      status: t.status,
      ...(t.activeForm ? { activeForm: t.activeForm.trim() } : {}),
      ...(t.blockedBy && t.blockedBy.length > 0 ? { blockedBy: [...t.blockedBy] } : {})
    }));
}

/**
 * Derive a live present-continuous `activeForm` indicator from a real tool execution
 * (e.g. `editing auth.ts`, `running npm test`, `reading store.ts`).
 */
export function inferLiveActivityLabel(
  toolName: string,
  input?: Record<string, unknown> | null,
  _cwd?: string
): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const lower = (toolName || '').toLowerCase();

  const rawPath = (input as any).path || (input as any).filePath || (input as any).file;
  if (typeof rawPath === 'string' && rawPath.trim()) {
    const base = path.basename(rawPath.trim().replace(/\\/g, '/'));
    if (!base) return undefined;
    if (lower === 'edit' || lower === 'patch' || lower === 'apply_diff' || lower === 'modify') {
      return `editing ${base}`;
    }
    if (lower === 'write' || lower === 'create_file') {
      return `writing ${base}`;
    }
    if (lower === 'read') {
      return `reading ${base}`;
    }
  }

  if (lower === 'bash' || lower === 'powershell') {
    const cmd = String((input as any).command || '').trim();
    if (!cmd) return undefined;
    if (/\b(?:npm\s+test|vitest|pytest|cargo\s+test|go\s+test|tsx\s+--test)\b/i.test(cmd)) {
      return 'running tests';
    }
    if (/\b(?:npm\s+run\s+build|tsc|tsup|cargo\s+build)\b/i.test(cmd)) {
      return 'building project';
    }
    if (/\bgit\s+commit\b/i.test(cmd)) {
      return 'committing changes';
    }
  }

  return undefined;
}
