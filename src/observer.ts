/**
 * Session Touch Observer
 * Silently monitors tool calls during a session to accumulate touched files and commit evidence.
 */

import { normalizePath } from './matcher.ts';
import type { Anchor } from './types.ts';

export class SessionTouchObserver {
  private touchedFiles: Set<string> = new Set();
  private committed: boolean = false;
  private commitMessages: string[] = [];

  /**
   * Record file interactions and commit messages from tool calls
   */
  public recordToolCall(toolName: string, input: Record<string, any>): void {
    if (!input) return;

    // File operation tools (read, edit, write, etc.)
    if (typeof input.path === 'string') {
      this.touchedFiles.add(normalizePath(input.path));
    }

    // Multiple edits
    if (Array.isArray(input.edits) && typeof input.path === 'string') {
      this.touchedFiles.add(normalizePath(input.path));
    }

    // Git commit detection in terminal execution
    if (toolName === 'bash' || toolName === 'powershell') {
      const cmd = typeof input.command === 'string' ? input.command : '';
      if (/\bgit\s+commit\b/i.test(cmd)) {
        this.committed = true;
        const match = cmd.match(/-m\s+["']([^"']+)["']/i);
        if (match && match[1]) {
          this.commitMessages.push(match[1]);
        }
      }
    }
  }

  /**
   * Add a file path manually (e.g. from git status diff)
   */
  public addTouchedFile(filePath: string): void {
    if (filePath) {
      this.touchedFiles.add(normalizePath(filePath));
    }
  }

  public getTouchedFiles(): string[] {
    return Array.from(this.touchedFiles);
  }

  public hasCommitted(): boolean {
    return this.committed;
  }

  public getCommitMessages(): string[] {
    return [...this.commitMessages];
  }

  /**
   * Check if any commit message explicitly references or resolves an anchor
   */
  public matchesCommit(anchor: Anchor): { matched: boolean; message?: string } {
    const idLower = anchor.id.toLowerCase();
    const titleTokens = anchor.title.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    for (const msg of this.commitMessages) {
      const msgLower = msg.toLowerCase();
      // 1. Explicit ID reference, e.g. "fix: auth leak (#anc-1)" or "anc-1"
      if (msgLower.includes(idLower)) {
        return { matched: true, message: msg };
      }

      // 2. High-confidence token intersection
      if (titleTokens.length > 0) {
        const matchingCount = titleTokens.filter(tok => msgLower.includes(tok)).length;
        if (matchingCount >= Math.min(2, titleTokens.length)) {
          return { matched: true, message: msg };
        }
      }
    }

    return { matched: false };
  }

  public clear(): void {
    this.touchedFiles.clear();
    this.committed = false;
    this.commitMessages = [];
  }
}
