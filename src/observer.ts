import { normalizePath } from './matcher.ts';
import type { Anchor } from './types.ts';

export class SessionTouchObserver {
  private touchedFiles: Set<string> = new Set();
  private committed: boolean = false;
  private commitMessages: string[] = [];

  /**
   * Observe and record a tool call invocation
   */
  public recordToolCall(toolName: string, input: Record<string, unknown>): void {
    if (!input || typeof input !== 'object') return;

    // File inspection or editing tools (read, write, edit, replace, etc.)
    const pathField = (input as any).path || (input as any).filePath || (input as any).file;
    if (typeof pathField === 'string') {
      this.touchedFiles.add(normalizePath(pathField));
    }

    // Multiple paths in single call
    if (Array.isArray((input as any).paths)) {
      for (const p of (input as any).paths) {
        if (typeof p === 'string') {
          this.touchedFiles.add(normalizePath(p));
        }
      }
    }

    // Shell executions that might involve git commits
    if (toolName === 'bash' || toolName === 'powershell') {
      const cmd = String((input as any).command || '');
      if (cmd.includes('git commit')) {
        this.committed = true;
        const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
        if (msgMatch && msgMatch[1]) {
          this.commitMessages.push(msgMatch[1]);
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
    const title = anchor.title.toLowerCase();

    // Universal tokenization for CJK & Latin words
    let titleTokens: string[] = [];
    if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
      try {
        const segmenter = new (Intl as any).Segmenter('und', { granularity: 'word' });
        titleTokens = Array.from(segmenter.segment(title))
          .filter((s: any) => s.isWordLike)
          .map((s: any) => s.segment.trim().toLowerCase())
          .filter((t: string) => t.length >= 2);
      } catch {
        titleTokens = title.split(/[\s,._\-\/]+/).filter(t => t.length >= 2);
      }
    } else {
      titleTokens = title.split(/[\s,._\-\/]+/).filter(t => t.length >= 2);
    }

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
