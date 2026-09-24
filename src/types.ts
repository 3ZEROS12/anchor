/**
 * Anchor Data Contracts & Type Definitions
 * Single Global Source of Truth with Zero Workspace Contamination.
 */

export type AnchorStatus = 'active' | 'sleeping' | 'settled' | 'graveyard';
export type AnchorPriority = 'p0' | 'p1' | 'p2';
export type AnchorDurability = 'ephemeral' | 'durable';

export interface AnchorDecayPolicy {
  /** Days before an untouched active anchor transitions to sleeping */
  activeDays: number;
  /** Days an anchor remains sleeping before dropping to graveyard */
  sleepDays: number;
  /** Total maximum days before permanent graveyard sweep (9999 = never) */
  graveyardDays: number;
}

export interface AnchorEvidence {
  settledAt?: number;
  settledBy?: 'one-tap-settlement' | 'manual-command' | 'verification-test';
  commitHash?: string;
  summary?: string;
  touchedFiles?: string[];
}

export interface Anchor {
  /** Unique sequential identifier, e.g., 'anc-1' */
  id: string;
  /** Short imperative title of the task */
  title: string;
  /** Optional detailed context or notes */
  description?: string;
  /** Task priority */
  priority: AnchorPriority;
  /** Current lifecycle status */
  status: AnchorStatus;
  /** Durability tier: ephemeral (short-lived reminder, 48h TTL) or durable (long-term architecture vision) */
  durability: AnchorDurability;
  /** Canonical project name (e.g. 'PPT', 'X', or 'global') */
  project: string;
  /** Canonical root directory where the task was anchored (empty string for global tasks) */
  cwd: string;
  /** Creation timestamp in ms */
  createdAt: number;
  /** Last update timestamp in ms */
  updatedAt: number;
  /** Last touched timestamp in ms (resets on file touch) */
  lastTouchedAt: number;
  /** Associated file paths or globs, e.g. ['src/auth/*.ts'] */
  files: string[];
  /** Optional shell command for automated physical verification (e.g. 'npm test') */
  verifyCommand?: string;
  /** Topic or domain tags, e.g. ['auth', 'security'] */
  tags: string[];
  /** Optional recurrence pattern: 'daily' for recurring daily habits */
  recurrence?: 'daily';
  /** Last completed date string 'YYYY-MM-DD' for recurring tasks */
  lastCompletedDate?: string;
  /** Decay policy overrides */
  decay: AnchorDecayPolicy;
  /** Settlement evidence metadata upon closure */
  evidence?: AnchorEvidence;
}

export interface AnchorStoreState {
  version: number;
  anchors: Anchor[];
  lastSweepAt: number;
}

export interface TouchMatchResult {
  anchor: Anchor;
  score: number;
  matchedFiles: string[];
  reason: 'exact-file' | 'dir-prefix' | 'tag-keyword';
}

export interface SettlementProposal {
  anchor: Anchor;
  matchedFiles: string[];
  reason: string;
  recommendedAction: 'settle' | 'defer';
}

export const EPHEMERAL_DECAY_POLICY: AnchorDecayPolicy = {
  activeDays: 1,      // 24 hours active
  sleepDays: 1,       // 24 hours sleeping
  graveyardDays: 2    // 48 hours total before auto-clearing
};

export const DURABLE_DECAY_POLICY: AnchorDecayPolicy = {
  activeDays: 3,
  sleepDays: 30,
  graveyardDays: 9999 // Never permanently auto-dropped; preserved indefinitely
};

export const DEFAULT_DECAY_POLICY: AnchorDecayPolicy = {
  activeDays: 3,
  sleepDays: 7,
  graveyardDays: 14
};
