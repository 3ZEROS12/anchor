/**
 * Session Touch Observer
 * Silently monitors tool calls during a session to accumulate touched files.
 */

import { normalizePath } from './matcher.ts';

export class SessionTouchObserver {
  private touchedFiles: Set<string> = new Set();
  private committed: boolean = false;

  /**
   * Record file interactions from tool calls
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

  public clear(): void {
    this.touchedFiles.clear();
    this.committed = false;
  }
}
