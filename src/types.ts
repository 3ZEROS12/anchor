/**
 * Anchor Data Contracts & Type Definitions
 * Designed for zero-pollution, evidence-based cross-session task lifecycle.
 */

export type AnchorStatus = 'active' | 'sleeping' | 'settled' | 'graveyard';
export type AnchorPriority = 'p0' | 'p1' | 'p2';

export interface AnchorDecayPolicy {
  /** Days before an untouched active anchor transitions to sleeping (default: 3) */
  activeDays: number;
  /** Days an anchor remains sleeping before dropping to graveyard (default: 7) */
  sleepDays: number;
  /** Total maximum days before permanent graveyard sweep (default: 14) */
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
  /** Unique identifier, e.g., 'anc-1' or 'anc-a8f2' */
  id: string;
  /** Short imperative title of the task */
  title: string;
  /** Optional detailed context or notes */
  description?: string;
  /** Task priority */
  priority: AnchorPriority;
  /** Current lifecycle status */
  status: AnchorStatus;
  /** Creation timestamp in ms */
  createdAt: number;
  /** Last update timestamp in ms */
  updatedAt: number;
  /** Last touched timestamp in ms (resets on file touch) */
  lastTouchedAt: number;
  /** Associated file paths or globs, e.g. ['src/auth/*.ts'] */
  files: string[];
  /** Topic or domain tags, e.g. ['auth', 'security'] */
  tags: string[];
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

export const DEFAULT_DECAY_POLICY: AnchorDecayPolicy = {
  activeDays: 3,
  sleepDays: 7,
  graveyardDays: 14
};
