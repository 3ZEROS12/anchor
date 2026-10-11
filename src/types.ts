/**
 * Anchor Data Contracts
 * Minimalist cross-session sticky notes stored in ~/.anchor/state.json
 */

export type AnchorStatus = 'active' | 'sleeping' | 'settled';
export type AnchorPriority = 'p0' | 'p1' | 'p2';

export interface AnchorProgress {
  /** Completed steps or units */
  done: number;
  /** Total steps or units */
  total: number;
  /** Optional parsed step labels (e.g. ['抽出接口', '替换Cookie', '补单测']) */
  steps?: string[];
}

export interface AnchorEvidence {
  settledAt?: number;
  settledBy?: 'commit' | 'manual' | 'todo-complete' | 'one-tap-settlement' | 'manual-command' | 'verification-test';
  commitHash?: string;
  summary?: string;
  touchedFiles?: string[];
}

export interface TodoTaskItem {
  id: number;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deleted';
  activeForm?: string;
  description?: string;
}

export interface Anchor {
  /** Sequential identifier, e.g. 'anc-1' */
  id: string;
  /** Sticky note text */
  title: string;
  /** Optional extra context */
  description?: string;
  /** Lifecycle status: 'active' (recent) or 'sleeping' (>7d untouched, 0 prompt tokens) */
  status: AnchorStatus;
  /** Origin source: 'manual' (user/tool pinned) or 'todo-sync' (auto-bridged from unfinished session todos) */
  source?: 'manual' | 'todo-sync';
  /** Short workspace label (e.g. 'anchor', 'College/优化', or 'global') */
  project: string;
  /** Workspace directory path where the note applies */
  cwd: string;
  /** Creation timestamp (ms) */
  createdAt: number;
  /** Last update timestamp (ms) */
  updatedAt: number;
  /** Last activity timestamp (ms) */
  lastTouchedAt: number;
  /** Associated file paths or globs (explicit, auto-extracted from note text, or inherited from active session) */
  files: string[];
  /** Optional tags */
  tags: string[];
  /** Associated Pi conversation session file (.jsonl) for 1-click session jump/resume */
  sessionFile?: string;
  /** Optional lightweight progress tracker for long-term or multi-step notes */
  progress?: AnchorProgress;
  /** Optional due date ('YYYY-MM-DD') */
  targetDate?: string;
  /** Optional priority kept for backward compatibility */
  priority?: AnchorPriority;
  /** Settlement metadata when archived */
  evidence?: AnchorEvidence;
}

export interface AnchorStoreState {
  version: number;
  anchors: Anchor[];
  lastSweepAt: number;
  nextId?: number;
}

export interface TouchMatchResult {
  anchor: Anchor;
  score: number;
  matchedFiles: string[];
  reason: 'exact-file' | 'dir-prefix';
}

/** 7 days without activity moves a note to quiet mode (still visible in UI, 0 prompt tokens in unrelated workspaces) */
export const QUIET_AFTER_DAYS = 7;
export const MS_PER_DAY = 86_400_000;
