import type { AnchorStore, DualAnchorStore } from './store.ts';
import { findMatchedAnchors } from './matcher.ts';
import type { Anchor, SettlementProposal } from './types.ts';
import { execSync } from 'node:child_process';

/**
 * Execute physical verification test command for an anchor
 */
export function runPhysicalVerification(anchor: Anchor, cwd: string): { success: boolean; output: string } {
  if (!anchor.verifyCommand) {
    return { success: false, output: 'No verification command specified' };
  }

  try {
    const stdout = execSync(anchor.verifyCommand, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { success: true, output: stdout.trim() };
  } catch (err: any) {
    return { success: false, output: String(err.stderr || err.stdout || err.message).trim() };
  }
}

/**
 * Generate settlement candidates based on files touched during the session
 */
export function generateSettlementProposals(
  store: AnchorStore | DualAnchorStore,
  touchedFiles: string[]
): SettlementProposal[] {
  const activeAndSleeping = store.list().filter(a => a.status === 'active' || a.status === 'sleeping');
  const matches = findMatchedAnchors(activeAndSleeping, touchedFiles);

  const proposals: SettlementProposal[] = [];

  for (const match of matches) {
    const fileList = match.matchedFiles.slice(0, 3).join(', ');
    const moreSuffix = match.matchedFiles.length > 3 ? ` 等 ${match.matchedFiles.length} 个文件` : '';

    proposals.push({
      anchor: match.anchor,
      matchedFiles: match.matchedFiles,
      reason: `本次会话修改了 ${fileList}${moreSuffix}`,
      recommendedAction: match.score >= 0.85 ? 'settle' : 'defer'
    });
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
