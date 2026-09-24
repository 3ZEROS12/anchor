import type { AnchorStore } from './store.ts';
import type { Anchor } from './types.ts';
import { renderColdStartAnchorsContext, makeSafeTaskAnnotation } from './context_injector.ts';
import { findMatchedAnchors, normalizePath } from './matcher.ts';
import { sweepStore } from './decay.ts';
import { SessionTouchObserver } from './observer.ts';

/**
 * Universal Agent Adapter Interface.
 * Any AI coding harness (Pi, Claude Code, Cursor, Aider, custom MCP server) implements this thin layer.
 */
export interface AgentAdapter {
  readonly name: string;
  getCwd(): string;
  notify?(message: string, level: 'info' | 'warn' | 'error'): void;
}

/**
 * Anchor protocol engine for cross-session task management.
 * Decoupled, harness-agnostic core managing state, decay, JIT annotations, and settlement.
 */
export class AnchorProtocol {
  public readonly store: AnchorStore;
  public readonly observer: SessionTouchObserver;
  private readonly annotatedThisSession = new Set<string>();

  constructor(store: AnchorStore) {
    this.store = store;
    this.observer = new SessionTouchObserver();
  }

  /**
   * Run session initialization lifecycle: sweeps stale anchors and resets session state
   */
  public handleSessionStart(now: number = Date.now()): { sleepingCount: number } {
    this.observer.clear();
    this.annotatedThisSession.clear();
    const sweep = sweepStore(this.store, now);
    return { sleepingCount: sweep.transitionedToSleeping.length };
  }

  /**
   * Handle turn lifecycle: injects cold-start prompt on turn 1, returns null (0 tokens) on turn 2+
   */
  public handleBeforeTurn(turnCount: number, cwd: string, now: number = Date.now()): string | null {
    if (turnCount <= 1) {
      return renderColdStartAnchorsContext(this.store, cwd, now) || null;
    }
    return null;
  }

  /**
   * Handle tool execution result: detects touched paths, refreshes mutation touch timers,
   * and returns safe language-specific JIT annotation (or null if syntax incompatible/already annotated).
   */
  public handleToolResult(input: {
    toolName: string;
    filePath?: string;
    isError?: boolean;
    isMutation?: boolean;
    cwd: string;
  }): { annotation: string | null; matchedAnchors: Anchor[] } {
    if (!input.isError) {
      this.observer.recordToolCall(input.toolName, input.filePath ? { path: input.filePath } : {});
    }

    if (!input.filePath) {
      return { annotation: null, matchedAnchors: [] };
    }

    const touchedPath = normalizePath(input.filePath);
    const anchors = this.store.list({ cwd: input.cwd }).filter(a => a.status === 'active' || a.status === 'sleeping');
    const matches = findMatchedAnchors(anchors, [touchedPath]);

    if (matches.length === 0) {
      return { annotation: null, matchedAnchors: [] };
    }

    // Physical mutations refresh decay timer and wake sleeping anchors
    if (input.isMutation && !input.isError) {
      for (const m of matches) {
        this.store.touch(m.anchor.id);
      }
    }

    const a = matches[0].anchor;
    if (!this.annotatedThisSession.has(a.id)) {
      this.annotatedThisSession.add(a.id);
      const annotation = makeSafeTaskAnnotation(touchedPath, a);
      return { annotation, matchedAnchors: matches.map(m => m.anchor) };
    }

    return { annotation: null, matchedAnchors: matches.map(m => m.anchor) };
  }
}
