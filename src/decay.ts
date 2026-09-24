import type { Anchor, AnchorStatus } from './types.ts';
import type { AnchorStore } from './store.ts';
import fs from 'node:fs';

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
  if (anchor.status === 'settled' || (anchor.status as string) === 'graveyard') {
    return {
      currentStatus: anchor.status,
      nextStatus: anchor.status,
      daysUntouched: 0,
      remainingActiveDays: 0,
      remainingSleepDays: 0
    };
  }

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

  // Single-pass batch eviction and state save
  if (toEvict.length > 0) {
    const evictIds = new Set(toEvict.map(e => e.id));
    state.anchors = state.anchors.filter(a => !evictIds.has(a.id));
    stateModified = true;

    const graveyardLines = toEvict.map(exp => {
      const rec = {
        ...exp,
        status: 'graveyard',
        updatedAt: now,
        evictedAt: now,
        evictionReason: `Exceeded decay threshold (${exp.decay.graveyardDays} days untouched)`
      };
      return JSON.stringify(rec);
    }).join('\n') + '\n';

    fs.appendFileSync(store.graveyardPath, graveyardLines, 'utf-8');
    for (const exp of toEvict) {
      result.evictedToGraveyard.push(exp.id);
    }
  }

  state.lastSweepAt = now;
  if (stateModified) {
    store.saveState(state);
  }

  return result;
}
