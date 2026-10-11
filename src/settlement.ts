import type { AnchorStore } from './store.ts';
import { findMatchedAnchors, isAnchorTargetingWorkspace } from './matcher.ts';
import type { SessionTouchObserver } from './observer.ts';
import type { Anchor, SettlementProposal } from './types.ts';
import { execSync } from 'node:child_process';

/**
 * Execute physical verification test command for an anchor
 */
export function runPhysicalVerification(anchor: Anchor, cwd: string): { success: boolean; output: string } {
  if (!anchor.verifyCommand?.trim()) {
    return { success: false, output: 'No verification command specified' };
  }

  const targetCwd = anchor.cwd || cwd;
  try {
    const stdout = execSync(anchor.verifyCommand, {
      cwd: targetCwd,
      encoding: 'utf-8',
      timeout: 8000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { success: true, output: stdout.trim() };
  } catch (err: any) {
    return { success: false, output: String(err.stderr || err.stdout || err.message).trim() };
  }
}

/**
 * Real-time autonomous settlement during active session:
 * Triggered immediately when a non-error shell command runs `git commit` or a matching `verifyCommand`.
 * Works for BOTH file-bound and file-less (`files: []`) anchors!
 */
export function tryRealtimeAutoSettle(
  store: AnchorStore,
  observer: SessionTouchObserver,
  cwd?: string,
  executedCommand?: string
): Array<{ anchor: Anchor; reason: string }> {
  const candidates = store.list({ cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
  if (candidates.length === 0) return [];

  const settledList: Array<{ anchor: Anchor; reason: string }> = [];
  const cmdTrimmed = (executedCommand || '').trim();

  for (const a of candidates) {
    // 1. Check real-time Git Commit semantic match (works even when a.files is empty!)
    if (observer.hasCommitted()) {
      const commitMatch = observer.matchesCommit(a);
      if (commitMatch.matched && (!cwd || isAnchorTargetingWorkspace(a, cwd))) {
        const settled = store.settle(a.id, {
          settledBy: 'verification-test',
          summary: `Auto-settled via Git commit: ${commitMatch.message}`,
          touchedFiles: observer.getModifiedFiles()
        });
        settledList.push({ anchor: settled, reason: `git commit ("${commitMatch.message}")` });
        continue;
      }
    }

    // 2. Check if the executed shell command directly ran and passed the anchor's verifyCommand
    if (a.verifyCommand && cmdTrimmed && cmdTrimmed.includes(a.verifyCommand.trim())) {
      const settled = store.settle(a.id, {
        settledBy: 'verification-test',
        summary: `Auto-settled via passing command: ${a.verifyCommand}`,
        touchedFiles: observer.getModifiedFiles()
      });
      settledList.push({ anchor: settled, reason: `verifyCommand (${a.verifyCommand})` });
    }
  }

  return settledList;
}

/**
 * Generate settlement candidates based on files touched or commits made during the session
 */
export function generateSettlementProposals(
  store: AnchorStore,
  touchedFiles: string[],
  cwd?: string,
  observer?: SessionTouchObserver
): SettlementProposal[] {
  const activeAndSleeping = store.list({ cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
  const matches = findMatchedAnchors(activeAndSleeping, touchedFiles);
  const seenIds = new Set<string>();

  const proposals: SettlementProposal[] = [];

  for (const match of matches) {
    seenIds.add(match.anchor.id);
    const fileList = match.matchedFiles.slice(0, 3).join(', ');
    const moreSuffix = match.matchedFiles.length > 3 ? ` (+${match.matchedFiles.length - 3} more)` : '';

    proposals.push({
      anchor: match.anchor,
      matchedFiles: match.matchedFiles,
      reason: `Modified ${fileList}${moreSuffix}`,
      recommendedAction: match.score >= 0.85 ? 'settle' : 'defer'
    });
  }

  // Also include file-less (or un-matched) anchors if a git commit message matched them
  if (observer && observer.hasCommitted()) {
    for (const a of activeAndSleeping) {
      if (seenIds.has(a.id)) continue;
      const cm = observer.matchesCommit(a);
      if (cm.matched) {
        seenIds.add(a.id);
        proposals.push({
          anchor: a,
          matchedFiles: touchedFiles.slice(0, 3),
          reason: `Matched git commit: "${cm.message}"`,
          recommendedAction: 'settle'
        });
      }
    }
  }

  return proposals;
}

/**
 * Format settlement proposal into terminal-ready card
 */
export function formatSettlementCard(proposal: SettlementProposal): string {
  const a = proposal.anchor;
  const tagStr = a.tags.length > 0 ? ` [${a.tags.join(', ')}]` : '';
  const fileStr = proposal.matchedFiles.slice(0, 2).join(', ');

  return [
    `───────────────────────────────────────────────────────────────────`,
    `⚓ 关门结案提议 | Anchor Settlement`,
    `   任务 #${a.id}: ${a.title}${tagStr} (${a.priority.toUpperCase()})`,
    `   证据触发: 修改了 ${fileStr}`,
    `   [Enter 确认结案并归档]  /  [Tab 暂未完成，继续挂起]`,
    `───────────────────────────────────────────────────────────────────`
  ].join('\n');
}
