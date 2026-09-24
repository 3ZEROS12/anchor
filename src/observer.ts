import { normalizePath } from './matcher.ts';
import type { Anchor } from './types.ts';

const MUTATION_TOOLS = new Set(['edit', 'write', 'patch', 'apply_diff', 'create_file', 'modify']);

export class SessionTouchObserver {
  private touchedFiles: Set<string> = new Set();
  private modifiedFiles: Set<string> = new Set();
  private inspectedFiles: Set<string> = new Set();
  private committed: boolean = false;
  private commitMessages: string[] = [];

  public clear(): void {
    this.touchedFiles.clear();
    this.modifiedFiles.clear();
    this.inspectedFiles.clear();
    this.committed = false;
    this.commitMessages = [];
  }

  /**
   * Observe and record a tool call invocation, separating inspection from mutation
   */
  public recordToolCall(toolName: string, input: Record<string, unknown>): void {
    if (!input || typeof input !== 'object') return;
    const lowerTool = (toolName || '').toLowerCase();
    const isMutation = MUTATION_TOOLS.has(lowerTool);

    const paths: string[] = [];
    const pathField = (input as any).path || (input as any).filePath || (input as any).file;
    if (typeof pathField === 'string') {
      paths.push(normalizePath(pathField));
    }

    if (Array.isArray((input as any).paths)) {
      for (const p of (input as any).paths) {
        if (typeof p === 'string') {
          paths.push(normalizePath(p));
        }
      }
    }

    for (const p of paths) {
      this.touchedFiles.add(p);
      if (isMutation) {
        this.modifiedFiles.add(p);
      } else {
        this.inspectedFiles.add(p);
      }
    }

    // Shell executions that might involve git commits
    if (lowerTool === 'bash' || lowerTool === 'powershell') {
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
  public addTouchedFile(filePath: string, isModified = true): void {
    if (filePath) {
      const norm = normalizePath(filePath);
      this.touchedFiles.add(norm);
      if (isModified) {
        this.modifiedFiles.add(norm);
      } else {
        this.inspectedFiles.add(norm);
      }
    }
  }

  public getModifiedFiles(): string[] {
    return Array.from(this.modifiedFiles);
  }

  public getInspectedFiles(): string[] {
    return Array.from(this.inspectedFiles);
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
}
