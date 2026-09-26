import {
  AnchorStore,
  COMMENT_FORMATS,
  DEFAULT_DECAY_POLICY,
  DURABLE_DECAY_POLICY,
  EPHEMERAL_DECAY_POLICY,
  SessionTouchObserver,
  acquireSyncLock,
  atomicRenameWithRetry,
  classifyAnchor,
  detectDurability,
  detectRecurrence,
  detectTargetDate,
  evaluateAnchorDecay,
  findMatchedAnchors,
  formatCreationTime,
  formatOrigin,
  formatRelativeTime,
  formatRemainingTtl,
  formatSettlementCard,
  formatTargetDate,
  generateSettlementProposals,
  getDefaultStorageDir,
  getDisplayWidth,
  getEphemeralDecayPolicy,
  getTodayDateString,
  globToRegExp,
  groupAnchorsByQuadrant,
  makeSafeTaskAnnotation,
  matchAnchorAgainstTouchedFiles,
  normalizePath,
  openAnchorDashboard,
  padToWidth,
  renderActiveAnchorsContext,
  renderColdStartAnchorsContext,
  runPhysicalVerification,
  stripAnsi,
  sweepStore,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
} from "./chunk-QKBUATPO.js";

// src/protocol.ts
var AnchorProtocol = class {
  store;
  observer;
  annotatedThisSession = /* @__PURE__ */ new Set();
  constructor(store) {
    this.store = store;
    this.observer = new SessionTouchObserver();
  }
  /**
   * Run session initialization lifecycle: sweeps stale anchors and resets session state
   */
  handleSessionStart(now = Date.now()) {
    this.observer.clear();
    this.annotatedThisSession.clear();
    const sweep = sweepStore(this.store, now);
    return { sleepingCount: sweep.transitionedToSleeping.length };
  }
  /**
   * Handle turn lifecycle: injects cold-start prompt on turn 1, returns null (0 tokens) on turn 2+
   */
  handleBeforeTurn(turnCount, cwd, now = Date.now()) {
    if (turnCount <= 1) {
      return renderColdStartAnchorsContext(this.store, cwd, now) || null;
    }
    return null;
  }
  /**
   * Handle tool execution result: detects touched paths, refreshes mutation touch timers,
   * and returns safe language-specific JIT annotation (or null if syntax incompatible/already annotated).
   */
  handleToolResult(input) {
    if (!input.isError) {
      this.observer.recordToolCall(input.toolName, input.filePath ? { path: input.filePath } : {});
    }
    if (!input.filePath) {
      return { annotation: null, matchedAnchors: [] };
    }
    const touchedPath = normalizePath(input.filePath);
    const anchors = this.store.list({ cwd: input.cwd }).filter((a2) => a2.status === "active" || a2.status === "sleeping");
    const matches = findMatchedAnchors(anchors, [touchedPath]);
    if (matches.length === 0) {
      return { annotation: null, matchedAnchors: [] };
    }
    if (input.isMutation && !input.isError) {
      for (const m of matches) {
        this.store.touch(m.anchor.id);
      }
    }
    const a = matches[0].anchor;
    if (!this.annotatedThisSession.has(a.id)) {
      this.annotatedThisSession.add(a.id);
      const annotation = makeSafeTaskAnnotation(touchedPath, a);
      return { annotation, matchedAnchors: matches.map((m) => m.anchor) };
    }
    return { annotation: null, matchedAnchors: matches.map((m) => m.anchor) };
  }
};
export {
  AnchorProtocol,
  AnchorStore,
  COMMENT_FORMATS,
  DEFAULT_DECAY_POLICY,
  DURABLE_DECAY_POLICY,
  EPHEMERAL_DECAY_POLICY,
  SessionTouchObserver,
  acquireSyncLock,
  atomicRenameWithRetry,
  classifyAnchor,
  detectDurability,
  detectRecurrence,
  detectTargetDate,
  evaluateAnchorDecay,
  findMatchedAnchors,
  formatCreationTime,
  formatOrigin,
  formatRelativeTime,
  formatRemainingTtl,
  formatSettlementCard,
  formatTargetDate,
  generateSettlementProposals,
  getDefaultStorageDir,
  getDisplayWidth,
  getEphemeralDecayPolicy,
  getTodayDateString,
  globToRegExp,
  groupAnchorsByQuadrant,
  makeSafeTaskAnnotation,
  matchAnchorAgainstTouchedFiles,
  normalizePath,
  openAnchorDashboard,
  padToWidth,
  renderActiveAnchorsContext,
  renderColdStartAnchorsContext,
  runPhysicalVerification,
  stripAnsi,
  sweepStore,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
};
