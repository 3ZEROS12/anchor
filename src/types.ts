/**
 * Anchor v1.0 Domain Contracts
 * Cross-Session Task & Todo Dock + Instant Sticky Notes (`~/.anchor/state.json`)
 */

export type AnchorStatus = 'active' | 'sleeping' | 'settled';
export type AnchorPriority = 'p0' | 'p1' | 'p2';
export type StepStatus = 'pending' | 'in_progress' | 'completed' | 'deleted';

export interface AnchorStep {
  /** 1-based step id within the anchor */
  id: number;
  /** Imperative step title */
  subject: string;
  /** 4-state lifecycle matching `todo` tool */
  status: StepStatus;
  /** Live present-continuous activity label (e.g. 'editing src/auth.ts') */
  activeForm?: string;
  /** Prerequisite step IDs within the same anchor (`⛓ #1`) */
  blockedBy?: number[];
}

export interface AnchorProgress {
  /** Completed steps or units */
  done: number;
  /** Total steps or units */
  total: number;
  /** Flat step titles for backward compatibility */
  steps?: string[];
  /** Rich structured step items with status, activeForm, and blockedBy DAG */
  items?: AnchorStep[];
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
  status: StepStatus;
  activeForm?: string;
  description?: string;
  blockedBy?: number[];
  owner?: string;
}

export interface Anchor {
  /** Sequential identifier, e.g. 'anc-1' */
  id: string;
  /** Primary title or sticky note text */
  title: string;
  /** Optional detailed context */
  description?: string;
  /** Lifecycle status: 'active' (recent) or 'sleeping' (>7d untouched, 0 prompt tokens) */
  status: AnchorStatus;
  /** Origin source: 'manual' (user/tool pinned) or 'todo-sync' (auto-bridged from session todos) */
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
  /** Associated file paths or globs */
  files: string[];
  /** Optional domain tags */
  tags: string[];
  /** Live present-continuous activity indicator (e.g. 'editing src/auth.ts') */
  activeForm?: string;
  /** Prerequisite anchor IDs (e.g. ['anc-1']) for cross-task sequencing */
  blockedBy?: string[];
  /** Associated Pi conversation session file (.jsonl) for 1-click session teleport (`/back`) */
  sessionFile?: string;
  /** Progress tracker & structured step tree */
  progress?: AnchorProgress;
  /** Optional due date ('YYYY-MM-DD') */
  targetDate?: string;
  /** Priority tier */
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

export interface StepCounts {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
}

export interface DockStepLayout {
  visible: AnchorStep[];
  hiddenCompleted: number;
  truncatedTail: number;
}

/** 7 days without activity moves a note to quiet mode (still visible in UI, 0 prompt tokens in unrelated workspaces) */
export const QUIET_AFTER_DAYS = 7;
export const MS_PER_DAY = 86_400_000;
export const DEFAULT_MAX_DOCK_LINES = 8;
