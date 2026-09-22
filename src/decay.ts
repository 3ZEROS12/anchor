import type { Anchor, AnchorStatus } from './types.ts';
import { AnchorStore } from './store.ts';

const MS_PER_DAY = 86_400_000;

export interface DecayEvaluation {
  currentStatus: AnchorStatus;
  nextStatus: AnchorStatus;
  daysUntouched: number;
  remainingActiveDays: number;
  remainingSleepDays: number;
}

/**
 * Calculate precise decay status based on elapsed time since last touch
 */
export function evaluateAnchorDecay(anchor: Anchor, now: number = Date.now()): DecayEvaluation {
  const elapsedMs = Math.max(0, now - anchor.lastTouchedAt);
  const daysUntouched = elapsedMs / MS_PER_DAY;

  const activeDays = anchor.decay.activeDays;
  const graveyardDays = anchor.decay.graveyardDays;

  let nextStatus: AnchorStatus = anchor.status;

  if (daysUntouched <= activeDays) {
    nextStatus = 'active';
  } else if (daysUntouched <= graveyardDays) {
    nextStatus = 'sleeping';
  } else {
    nextStatus = 'graveyard';
  }

  return {
    currentStatus: anchor.status,
    nextStatus,
    daysUntouched: Math.round(daysUntouched * 10) / 10,
    remainingActiveDays: Math.max(0, Math.round((activeDays - daysUntouched) * 10) / 10),
    remainingSleepDays: Math.max(0, Math.round((graveyardDays - daysUntouched) * 10) / 10)
  };
}

export interface SweepResult {
  transitionedToSleeping: string[];
  wokenToActive: string[];
  evictedToGraveyard: string[];
}

/**
 * Run decay sweep across store: transitions statuses and evicts expired anchors
 */
export function sweepStore(store: AnchorStore, now: number = Date.now()): SweepResult {
  const state = store.loadState();
  const result: SweepResult = {
    transitionedToSleeping: [],
    wokenToActive: [],
    evictedToGraveyard: []
  };

  const toEvict: Anchor[] = [];
  let stateModified = false;

  for (const anchor of state.anchors) {
    const evalResult = evaluateAnchorDecay(anchor, now);

    if (evalResult.nextStatus === 'graveyard') {
      toEvict.push(anchor);
    } else if (evalResult.nextStatus !== anchor.status) {
      if (evalResult.nextStatus === 'sleeping' && anchor.status === 'active') {
        anchor.status = 'sleeping';
        anchor.updatedAt = now;
        result.transitionedToSleeping.push(anchor.id);
        stateModified = true;
      } else if (evalResult.nextStatus === 'active' && anchor.status === 'sleeping') {
        anchor.status = 'active';
        anchor.updatedAt = now;
        result.wokenToActive.push(anchor.id);
        stateModified = true;
      }
    }
  }

  state.lastSweepAt = now;
  if (stateModified) {
    store.saveState(state);
  }

  // Drop expired to graveyard
  for (const exp of toEvict) {
    store.dropToGraveyard(exp.id, `Exceeded decay threshold (${exp.decay.graveyardDays} days untouched)`);
    result.evictedToGraveyard.push(exp.id);
  }

  return result;
}
