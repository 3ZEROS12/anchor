"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AnchorStore: () => AnchorStore,
  COMMENT_FORMATS: () => COMMENT_FORMATS,
  MS_PER_DAY: () => MS_PER_DAY,
  QUIET_AFTER_DAYS: () => QUIET_AFTER_DAYS,
  acquireSyncLock: () => acquireSyncLock,
  atomicRenameWithRetry: () => atomicRenameWithRetry,
  extractPathsFromText: () => extractPathsFromText,
  extractProgressFromText: () => extractProgressFromText,
  findMatchedAnchors: () => findMatchedAnchors,
  formatOrigin: () => formatOrigin,
  formatProgressBar: () => formatProgressBar,
  formatRelativeAge: () => formatRelativeAge,
  getDefaultStorageDir: () => getDefaultStorageDir,
  getDisplayWidth: () => getDisplayWidth,
  globToRegExp: () => globToRegExp,
  hasActiveUI: () => hasActiveUI,
  isAnchorTargetingWorkspace: () => isAnchorTargetingWorkspace,
  isSameOrSubPath: () => isSameOrSubPath,
  makeSafeTaskAnnotation: () => makeSafeTaskAnnotation,
  matchAnchorAgainstTouchedFiles: () => matchAnchorAgainstTouchedFiles,
  matchesCommitMessage: () => matchesCommitMessage,
  normalizePath: () => normalizePath,
  openAnchorDashboard: () => openAnchorDashboard,
  padToWidth: () => padToWidth,
  parseAnchorCommandInput: () => parseAnchorCommandInput,
  parseQuickNoteInput: () => parseQuickNoteInput,
  renderActiveAnchorsContext: () => renderActiveAnchorsContext,
  renderColdStartAnchorsContext: () => renderColdStartAnchorsContext,
  resolveAnchorTarget: () => resolveAnchorTarget,
  sortAnchorsForDisplay: () => sortAnchorsForDisplay,
  stripAnsi: () => stripAnsi,
  sweepQuietNotes: () => sweepQuietNotes,
  truncateToWidth: () => truncateToWidth,
  updateAnchorStatusBar: () => updateAnchorStatusBar,
  updateStartupBanner: () => updateStartupBanner
});
module.exports = __toCommonJS(index_exports);

// src/types.ts
var QUIET_AFTER_DAYS = 7;
var MS_PER_DAY = 864e5;

// src/store.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path = __toESM(require("path"), 1);
var import_node_os = __toESM(require("os"), 1);
function normalizePath(filePath, baseCwd) {
  if (typeof filePath !== "string") return "";
  let norm = filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (baseCwd && (import_node_path.default.isAbsolute(filePath) || norm.startsWith("/") || /^[a-zA-Z]:\//.test(norm))) {
    const normBase = baseCwd.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    const lowerNorm = norm.toLowerCase();
    const lowerBase = normBase.toLowerCase();
    if (lowerNorm === lowerBase) {
      norm = "";
    } else if (lowerNorm.startsWith(lowerBase + "/")) {
      norm = norm.slice(normBase.length + 1).replace(/^\/+/, "");
    }
  }
  return norm;
}
function isSameOrSubPath(dirA, dirB) {
  if (!dirA || !dirB) return false;
  const normA = dirA.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const normB = dirB.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const isWin = process.platform === "win32" || /^[a-zA-Z]:\//.test(normA) || /^[a-zA-Z]:\//.test(normB);
  const a = isWin ? normA.toLowerCase() : normA;
  const b = isWin ? normB.toLowerCase() : normB;
  return a === b || b.startsWith(a + "/") || a.startsWith(b + "/");
}
function globToRegExp(pattern) {
  const collapsed = pattern.slice(0, 512).replace(/\/+(\*\*\/+)+/g, "/**/").replace(/\*{3,}/g, "**");
  const escaped = collapsed.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\/\*\*\//g, "___GLOB_DIR_SLASH___").replace(/\*\*/g, "___GLOB_STAR_STAR___").replace(/\*/g, "[^/]*").replace(/___GLOB_DIR_SLASH___/g, "(?:/|/(?:[^/]+/)+)").replace(/___GLOB_STAR_STAR___/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function extractPathsFromText(text) {
  if (!text) return [];
  const results = /* @__PURE__ */ new Set();
  const regex = /(?:[a-zA-Z]:[\\/][^\s"'`，。；！？、,;)>\]]+|(?:\b(?:src|lib|dist|tests|test|docs|scripts|packages|extensions|bin|assets)[\\/][^\s"'`，。；！？、,;)>\]]+)|(?:\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cpp|h|cs|md|json|yaml|yml|toml|html|css|sql|sh)\b))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const cleaned = normalizePath(match[0].replace(/[.:;,'")\]}>]+$/, ""));
    if (cleaned && cleaned.length >= 3) {
      results.add(cleaned);
    }
  }
  return Array.from(results);
}
function extractProgressFromText(rawTitle) {
  if (!rawTitle) return { cleanTitle: "" };
  const stepParts = Array.from(rawTitle.matchAll(/(?:^|\s)(\d+)\.\s*([^\d]+?)(?=\s+\d+\.\s|$)/g));
  if (stepParts.length >= 2) {
    const steps = stepParts.map((m) => m[2].trim().replace(/[;；,，]+$/, "")).filter(Boolean);
    const firstMatchIdx = rawTitle.indexOf(stepParts[0][0]);
    const prefix = rawTitle.slice(0, firstMatchIdx).replace(/[:：\-—\s]+$/, "").trim();
    return {
      cleanTitle: prefix || steps.join(" \u2192 "),
      progress: { done: 0, total: steps.length, steps }
    };
  }
  const ratioMatch = rawTitle.match(/(?:\[(\d{1,3})\/(\d{1,3})\]|\((\d{1,3})\/(\d{1,3})\))/);
  if (ratioMatch) {
    const done = parseInt(ratioMatch[1] ?? ratioMatch[3], 10);
    const total = parseInt(ratioMatch[2] ?? ratioMatch[4], 10);
    if (!isNaN(done) && !isNaN(total) && total >= 2 && total <= 500 && done >= 0 && done <= total) {
      const stripped = rawTitle.replace(ratioMatch[0], " ").replace(/\s+/g, " ").trim();
      return {
        cleanTitle: stripped || rawTitle.trim(),
        progress: { done, total }
      };
    }
  }
  return { cleanTitle: rawTitle.trim() };
}
function isAnchorTargetingWorkspace(anchor, targetCwd) {
  if (!targetCwd) return true;
  const normTarget = targetCwd.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const targetBase = import_node_path.default.basename(normTarget).toLowerCase();
  if (anchor.project && anchor.project !== "global") {
    const normProj = anchor.project.trim().replace(/\\/g, "/").replace(/\/+$/, "");
    if (isSameOrSubPath(normProj, normTarget)) return true;
    if (import_node_path.default.basename(normProj).toLowerCase() === targetBase) return true;
  }
  if (anchor.files && anchor.files.length > 0) {
    for (const f of anchor.files) {
      const resolvedFile = !import_node_path.default.isAbsolute(f) && !/^[a-zA-Z]:\//.test(f) && anchor.cwd ? `${anchor.cwd.replace(/\\/g, "/").replace(/\/+$/, "")}/${f.replace(/^\/+/, "")}` : f;
      if (isSameOrSubPath(resolvedFile, normTarget)) return true;
    }
  }
  if (anchor.cwd && isSameOrSubPath(anchor.cwd, normTarget)) {
    return true;
  }
  return false;
}
function matchAnchorAgainstTouchedFiles(anchor, touchedFiles) {
  if (!anchor.files || anchor.files.length === 0) return null;
  const normTouched = touchedFiles.map((f) => normalizePath(f, anchor.cwd)).filter(Boolean);
  if (normTouched.length === 0) return null;
  const matchedExact = [];
  const matchedPrefix = [];
  for (const touched of normTouched) {
    for (const pattern of anchor.files) {
      const normPattern = normalizePath(pattern, anchor.cwd);
      if (normPattern === touched) {
        matchedExact.push(touched);
        break;
      }
      if (normPattern.includes("*") && globToRegExp(normPattern).test(touched)) {
        matchedExact.push(touched);
        break;
      }
      const dirPrefix = normPattern.endsWith("/") ? normPattern : normPattern + "/";
      if (touched.startsWith(dirPrefix)) {
        matchedPrefix.push(touched);
        break;
      }
    }
  }
  if (matchedExact.length > 0) {
    return { anchor, score: 1, matchedFiles: Array.from(new Set(matchedExact)), reason: "exact-file" };
  }
  if (matchedPrefix.length > 0) {
    return { anchor, score: 0.85, matchedFiles: Array.from(new Set(matchedPrefix)), reason: "dir-prefix" };
  }
  return null;
}
function findMatchedAnchors(anchors, touchedFiles) {
  const results = [];
  for (const anchor of anchors) {
    const m = matchAnchorAgainstTouchedFiles(anchor, touchedFiles);
    if (m) results.push(m);
  }
  return results.sort((a, b) => b.score - a.score);
}
var COMMENT_FORMATS = {
  ".ts": (m) => `// ${m}`,
  ".tsx": (m) => `// ${m}`,
  ".js": (m) => `// ${m}`,
  ".jsx": (m) => `// ${m}`,
  ".mjs": (m) => `// ${m}`,
  ".cjs": (m) => `// ${m}`,
  ".go": (m) => `// ${m}`,
  ".rs": (m) => `// ${m}`,
  ".c": (m) => `// ${m}`,
  ".cpp": (m) => `// ${m}`,
  ".h": (m) => `// ${m}`,
  ".cs": (m) => `// ${m}`,
  ".java": (m) => `// ${m}`,
  ".kt": (m) => `// ${m}`,
  ".swift": (m) => `// ${m}`,
  ".dart": (m) => `// ${m}`,
  ".py": (m) => `# ${m}`,
  ".rb": (m) => `# ${m}`,
  ".sh": (m) => `# ${m}`,
  ".bash": (m) => `# ${m}`,
  ".yaml": (m) => `# ${m}`,
  ".yml": (m) => `# ${m}`,
  ".toml": (m) => `# ${m}`,
  ".ps1": (m) => `# ${m}`,
  ".html": (m) => `<!-- ${m} -->`,
  ".xml": (m) => `<!-- ${m} -->`,
  ".svg": (m) => `<!-- ${m} -->`,
  ".vue": (m) => `<!-- ${m} -->`,
  ".svelte": (m) => `<!-- ${m} -->`,
  ".css": (m) => `/* ${m} */`,
  ".scss": (m) => `/* ${m} */`,
  ".sql": (m) => `-- ${m}`,
  ".lua": (m) => `-- ${m}`
};
function makeSafeTaskAnnotation(filePath, anchor) {
  const ext = import_node_path.default.extname(filePath).toLowerCase();
  const fmt = COMMENT_FORMATS[ext];
  if (!fmt) return null;
  const num = anchor.id.replace(/^anc-/, "");
  return "\n\n" + fmt(`\u2316 Note #${num}: ${anchor.title}`);
}
var COMMIT_STOP_WORDS = /* @__PURE__ */ new Set([
  "fix",
  "feat",
  "chore",
  "docs",
  "test",
  "tests",
  "refactor",
  "style",
  "perf",
  "build",
  "ci",
  "bug",
  "issue",
  "update",
  "add",
  "remove",
  "todo",
  "note",
  "task",
  "the",
  "and",
  "for",
  "with",
  "\u4FEE\u590D",
  "\u4F18\u5316",
  "\u66F4\u65B0",
  "\u6DFB\u52A0",
  "\u4FEE\u6539",
  "\u5B8C\u6210",
  "\u95EE\u9898",
  "\u4EFB\u52A1",
  "\u6A21\u5757",
  "\u529F\u80FD"
]);
function matchesCommitMessage(anchor, commitMessages) {
  const idLower = anchor.id.toLowerCase();
  const numId = `#${anchor.id.replace(/^anc-/, "")}`;
  const title = anchor.title.toLowerCase();
  let titleTokens = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter("und", { granularity: "word" });
      titleTokens = Array.from(seg.segment(title)).filter((s) => s.isWordLike).map((s) => s.segment.trim().toLowerCase()).filter((t) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
    } catch {
      titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
    }
  } else {
    titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2 && !COMMIT_STOP_WORDS.has(t));
  }
  for (const msg of commitMessages) {
    const msgLower = msg.toLowerCase();
    if (msgLower.includes(idLower) || new RegExp(`(?:^|\\s|\\()${numId}(?:\\b|\\)|$)`).test(msgLower)) {
      return { matched: true, message: msg };
    }
    if (titleTokens.length > 0) {
      const hits = titleTokens.filter((tok) => msgLower.includes(tok)).length;
      const requiredHits = titleTokens.length === 1 ? 1 : 2;
      if (hits >= requiredHits) {
        return { matched: true, message: msg };
      }
    }
  }
  return { matched: false };
}
function renderColdStartAnchorsContext(store, cwdOrNow, nowArg) {
  let cwd;
  let now = Date.now();
  if (typeof cwdOrNow === "number") now = cwdOrNow;
  else if (typeof cwdOrNow === "string") cwd = cwdOrNow;
  if (typeof nowArg === "number") now = nowArg;
  sweepQuietNotes(store, now);
  const activeNotes = store.list({ status: "active", cwd });
  if (activeNotes.length === 0) return "";
  const lines = activeNotes.map((a) => {
    const num = a.id.replace(/^anc-/, "");
    const files = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(", ")})` : "";
    const prog = a.progress ? ` [${a.progress.done}/${a.progress.total}${a.progress.steps && a.progress.steps[a.progress.done] ? ` \xB7 next: ${a.progress.steps[a.progress.done]}` : ""}]` : "";
    const desc = a.description ? ` \u2014 ${a.description}` : "";
    return `\u2022 #${num} [${a.project}] ${a.title}${prog}${files}${desc}`;
  });
  return [
    `<sticky-notes count="${activeNotes.length}">`,
    `Pinned notes from previous sessions:`,
    lines.join("\n"),
    `When a note is completed, call anchor(action="settle", id="...") to tear it off.`,
    `</sticky-notes>`
  ].join("\n");
}
var renderActiveAnchorsContext = renderColdStartAnchorsContext;
function sweepQuietNotes(store, now = Date.now()) {
  return store.withLock(() => {
    const state = store.loadState();
    const quieted = [];
    for (const a of state.anchors) {
      if (a.status === "active" && now - a.lastTouchedAt > QUIET_AFTER_DAYS * MS_PER_DAY) {
        a.status = "sleeping";
        a.updatedAt = now;
        quieted.push(a.id);
      }
    }
    if (quieted.length > 0) {
      state.lastSweepAt = now;
      store.saveState(state);
    }
    return { quieted };
  });
}
function getDefaultStorageDir() {
  if (process.env.ANCHOR_DIR) return import_node_path.default.resolve(process.env.ANCHOR_DIR);
  return import_node_path.default.join(import_node_os.default.homedir(), ".anchor");
}
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
  }
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}
function acquireSyncLock(lockPath, maxWaitMs = 1500, staleTimeoutMs = 5e3) {
  const start = Date.now();
  let attempt = 0;
  while (Date.now() - start < maxWaitMs) {
    attempt++;
    try {
      const fd = import_node_fs.default.openSync(lockPath, "wx");
      import_node_fs.default.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf-8");
      import_node_fs.default.closeSync(fd);
      return () => {
        try {
          if (import_node_fs.default.existsSync(lockPath)) import_node_fs.default.unlinkSync(lockPath);
        } catch {
        }
      };
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const meta = JSON.parse(import_node_fs.default.readFileSync(lockPath, "utf-8"));
          const isStale = Date.now() - meta.createdAt > staleTimeoutMs;
          const isDead = meta.pid && !isProcessAlive(meta.pid);
          if (isStale || isDead) {
            try {
              import_node_fs.default.unlinkSync(lockPath);
              continue;
            } catch {
            }
          }
        } catch {
        }
        sleepSync(Math.min(40, Math.floor(attempt * 4 + Math.random() * 8)));
        continue;
      }
      break;
    }
  }
  return () => {
  };
}
function atomicRenameWithRetry(tempPath, targetPath, maxRetries = 5) {
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      import_node_fs.default.renameSync(tempPath, targetPath);
      return;
    } catch (err) {
      lastErr = err;
      if (err.code === "EPERM" || err.code === "EACCES" || err.code === "EBUSY") {
        sleepSync(15 * (i + 1));
        continue;
      }
      break;
    }
  }
  try {
    import_node_fs.default.copyFileSync(tempPath, targetPath);
    import_node_fs.default.unlinkSync(tempPath);
  } catch {
    throw lastErr;
  }
}
var AnchorStore = class {
  storageDir;
  statePath;
  lockPath;
  archivePath;
  constructor(storageDir) {
    this.storageDir = storageDir ? import_node_path.default.resolve(storageDir) : getDefaultStorageDir();
    this.statePath = import_node_path.default.join(this.storageDir, "state.json");
    this.lockPath = import_node_path.default.join(this.storageDir, "state.lock");
    this.archivePath = import_node_path.default.join(this.storageDir, "archive.jsonl");
  }
  ensureDirs() {
    if (!import_node_fs.default.existsSync(this.storageDir)) {
      import_node_fs.default.mkdirSync(this.storageDir, { recursive: true });
    }
  }
  withLock(fn) {
    this.ensureDirs();
    const release = acquireSyncLock(this.lockPath);
    try {
      return fn();
    } finally {
      release();
    }
  }
  loadState() {
    this.ensureDirs();
    if (!import_node_fs.default.existsSync(this.statePath)) {
      return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
    }
    try {
      const parsed = JSON.parse(import_node_fs.default.readFileSync(this.statePath, "utf-8"));
      if (!parsed || !Array.isArray(parsed.anchors)) {
        return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
      }
      return parsed;
    } catch {
      try {
        import_node_fs.default.copyFileSync(this.statePath, import_node_path.default.join(this.storageDir, `state.corrupt.${Date.now()}.json`));
      } catch {
      }
      return { version: 1, anchors: [], lastSweepAt: Date.now(), nextId: 1 };
    }
  }
  saveState(state) {
    this.ensureDirs();
    const tempPath = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
    import_node_fs.default.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
    atomicRenameWithRetry(tempPath, this.statePath);
  }
  generateId(state) {
    const numbers = state.anchors.map((a) => {
      const m = a.id.match(/^anc-(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    }).filter((n) => n > 0);
    const maxExisting = numbers.length > 0 ? Math.max(...numbers) : 0;
    const nextNum = Math.max(maxExisting + 1, state.nextId || 1);
    state.nextId = nextNum + 1;
    return `anc-${nextNum}`;
  }
  /**
   * Pin a new sticky note
   */
  create(input) {
    return this.withLock(() => {
      const state = this.loadState();
      const now = Date.now();
      const id = this.generateId(state);
      const { cleanTitle, progress: parsedProgress } = extractProgressFromText(input.title);
      const explicitFiles = (input.files || []).map((f) => normalizePath(f)).filter(Boolean);
      const inferredFiles = explicitFiles.length > 0 ? explicitFiles : extractPathsFromText(`${cleanTitle} ${input.description || ""}`);
      let cwd = input.cwd ? normalizePath(input.cwd) : "";
      if (input.project && (/^[a-zA-Z]:[\\/]/.test(input.project.trim()) || input.project.trim().startsWith("/"))) {
        cwd = normalizePath(input.project.trim());
      } else if (inferredFiles.length > 0 && (/^[a-zA-Z]:\//.test(inferredFiles[0]) || inferredFiles[0].startsWith("/"))) {
        const firstDir = import_node_path.default.dirname(inferredFiles[0]);
        if (firstDir && firstDir !== ".") cwd = normalizePath(firstDir);
      }
      const projectName = input.project ? input.project.trim() : cwd ? import_node_path.default.basename(cwd) : "global";
      const anchor = {
        id,
        title: cleanTitle,
        description: input.description?.trim(),
        priority: input.priority || "p1",
        status: "active",
        project: projectName,
        cwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: (input.tags || []).map((t) => t.trim()).filter(Boolean),
        ...input.sessionFile ? { sessionFile: normalizePath(input.sessionFile) } : {},
        ...input.progress || parsedProgress ? { progress: input.progress || parsedProgress } : {}
      };
      state.anchors.push(anchor);
      this.saveState(state);
      return anchor;
    });
  }
  findAnchorIndex(anchors, id) {
    const clean = id.trim().replace(/^#/, "");
    return anchors.findIndex(
      (a) => a.id === clean || a.id === `anc-${clean}` || (/^\d+$/.test(clean) ? a.id === `anc-${parseInt(clean, 10)}` : false)
    );
  }
  get(id) {
    const state = this.loadState();
    const idx = this.findAnchorIndex(state.anchors, id);
    return idx === -1 ? void 0 : state.anchors[idx];
  }
  list(filter) {
    const state = this.loadState();
    const targetCwd = filter?.cwd ? normalizePath(filter.cwd) : null;
    return state.anchors.filter((a) => {
      if (filter?.status && a.status !== filter.status) return false;
      if (!filter?.all && targetCwd) {
        if (a.files.length > 0 && (a.cwd || a.project) && !isAnchorTargetingWorkspace(a, targetCwd)) {
          return false;
        }
      }
      return true;
    });
  }
  update(id, patch) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const updated = {
        ...state.anchors[idx],
        ...patch,
        updatedAt: Date.now()
      };
      if (patch.files) {
        updated.files = patch.files.map((f) => normalizePath(f)).filter(Boolean);
      }
      state.anchors[idx] = updated;
      this.saveState(state);
      return updated;
    });
  }
  touch(id, timestamp = Date.now(), sessionFile) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const current = state.anchors[idx];
      current.lastTouchedAt = timestamp;
      current.updatedAt = timestamp;
      if (current.status === "sleeping") {
        current.status = "active";
      }
      if (sessionFile) {
        current.sessionFile = normalizePath(sessionFile);
      }
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
    });
  }
  /**
   * Advance (or set) progress on a sticky note:
   * - If delta is provided (default +1), increments `done` up to `total`.
   * - If note had no progress yet, initializes a 4-step bar (`1/4`).
   */
  step(id, delta = 1, explicitTotal) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const current = state.anchors[idx];
      const now = Date.now();
      const safeDelta = Number.isFinite(delta) ? delta : 1;
      const total = explicitTotal && Number.isFinite(explicitTotal) && explicitTotal >= 1 ? explicitTotal : current.progress?.total || 4;
      const prevDone = current.progress?.done || 0;
      const nextDone = Math.max(0, Math.min(total, prevDone + safeDelta));
      current.progress = {
        ...current.progress || {},
        done: nextDone,
        total
      };
      current.lastTouchedAt = now;
      current.updatedAt = now;
      if (current.status === "sleeping") {
        current.status = "active";
      }
      state.anchors[idx] = current;
      this.saveState(state);
      return { anchor: current, completed: nextDone >= total };
    });
  }
  /**
   * Tear off (settle) a completed sticky note and archive it to archive.jsonl
   */
  settle(id, evidence = {}, now = Date.now()) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) throw new Error(`Note not found: ${id}`);
      const [settled] = state.anchors.splice(idx, 1);
      settled.status = "settled";
      settled.updatedAt = now;
      settled.evidence = {
        ...evidence,
        settledAt: now,
        settledBy: evidence.settledBy || "manual"
      };
      this.ensureDirs();
      import_node_fs.default.appendFileSync(this.archivePath, JSON.stringify(settled) + "\n", "utf-8");
      this.saveState(state);
      return settled;
    });
  }
  /**
   * Put back (undo) the last torn-off sticky note
   */
  undoSettle() {
    return this.withLock(() => {
      if (!import_node_fs.default.existsSync(this.archivePath)) {
        throw new Error("No archived notes to restore");
      }
      const raw = import_node_fs.default.readFileSync(this.archivePath, "utf-8");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      let anchor = null;
      while (lines.length > 0 && !anchor) {
        const candidate = lines.pop();
        try {
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed.id === "string" && typeof parsed.title === "string") {
            anchor = parsed;
          }
        } catch {
        }
      }
      if (!anchor) throw new Error("Archive is empty, nothing to undo");
      import_node_fs.default.writeFileSync(this.archivePath, lines.length > 0 ? lines.join("\n") + "\n" : "", "utf-8");
      anchor.status = "active";
      anchor.updatedAt = Date.now();
      anchor.lastTouchedAt = Date.now();
      delete anchor.evidence;
      const state = this.loadState();
      const existingIdx = state.anchors.findIndex((a) => a.id === anchor.id);
      if (existingIdx !== -1) {
        if (state.anchors[existingIdx].title === anchor.title) {
          state.anchors[existingIdx] = anchor;
        } else {
          anchor.id = this.generateId(state);
          state.anchors.push(anchor);
        }
      } else {
        const m = anchor.id.match(/^anc-(\d+)$/);
        if (m) state.nextId = Math.max(state.nextId || 1, parseInt(m[1], 10) + 1);
        state.anchors.push(anchor);
      }
      this.saveState(state);
      return anchor;
    });
  }
};

// src/tui.ts
var import_node_fs2 = __toESM(require("fs"), 1);
var import_node_path2 = __toESM(require("path"), 1);
var ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, "");
}
function getDisplayWidth(str) {
  const clean = stripAnsi(str);
  let width = 0;
  for (const char of clean) {
    const code = char.codePointAt(0) || 0;
    if (code === 8205 || code === 65039 || code === 65038 || code >= 768 && code <= 879 || code >= 8203 && code <= 8207) {
      continue;
    }
    if (code >= 19968 && code <= 40959 || code >= 13312 && code <= 19903 || code >= 131072 && code <= 173791 || code >= 173824 && code <= 177983 || code >= 65281 && code <= 65376 || code >= 12288 && code <= 12351 || code >= 44032 && code <= 55215 || code >= 4352 && code <= 4607 || code >= 12592 && code <= 12687 || code >= 12352 && code <= 12447 || code >= 12448 && code <= 12543 || code >= 127744 && code <= 129535 || code >= 128512 && code <= 128591 || code >= 128640 && code <= 128767 || code >= 9728 && code <= 10175 || code >= 129648 && code <= 129791) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}
function hasActiveUI(ctx) {
  if (!ctx) return false;
  try {
    return Boolean(ctx.hasUI && ctx.ui);
  } catch {
    return false;
  }
}
function truncateToWidth(str, maxWidth, ellipsis = "\u2026") {
  if (maxWidth <= 0) return "";
  const singleLine = str.replace(/[\r\n\t]+/g, " ");
  const totalWidth = getDisplayWidth(singleLine);
  if (totalWidth <= maxWidth) return singleLine;
  const ellipsisWidth = getDisplayWidth(ellipsis);
  const target = Math.max(0, maxWidth - ellipsisWidth);
  if (target === 0) return ellipsis.slice(0, maxWidth);
  let accumulated = "";
  let accumWidth = 0;
  let i = 0;
  while (i < singleLine.length) {
    ANSI_REGEX.lastIndex = i;
    const match = ANSI_REGEX.exec(singleLine);
    if (match && match.index === i) {
      accumulated += match[0];
      i += match[0].length;
      continue;
    }
    const codePoint = singleLine.codePointAt(i) || 0;
    const charLen = codePoint > 65535 ? 2 : 1;
    const fullChar = singleLine.slice(i, i + charLen);
    const charWidth = getDisplayWidth(fullChar);
    if (accumWidth + charWidth > target) break;
    accumulated += fullChar;
    accumWidth += charWidth;
    i += charLen;
  }
  accumulated = accumulated.replace(/\s*[\(\[\{（【][^)\]}）】]*$/, "");
  return accumulated + ellipsis + (singleLine.includes("\x1B") ? "\x1B[0m" : "");
}
function padToWidth(str, targetWidth) {
  const truncated = truncateToWidth(str, targetWidth);
  const current = getDisplayWidth(truncated);
  if (current >= targetWidth) return truncated;
  return truncated + " ".repeat(targetWidth - current);
}
function formatProgressBar(progress, cells = 4) {
  if (!progress || !progress.total || progress.total < 1) return "";
  const done = Math.max(0, Math.min(progress.total, progress.done || 0));
  const filled = Math.min(cells, Math.max(done > 0 ? 1 : 0, Math.round(done / progress.total * cells)));
  const finalFilled = done >= progress.total ? cells : done === 0 ? 0 : filled;
  const bar = "\u25A0".repeat(finalFilled) + "\u25A1".repeat(Math.max(0, cells - finalFilled));
  return `[${bar} ${done}/${progress.total}]`;
}
function formatRelativeAge(timestamp, now = Date.now()) {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1e3));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
function formatOrigin(anchor) {
  if (typeof anchor === "string") {
    if (!anchor) return "global";
    return import_node_path2.default.basename(anchor.replace(/\\/g, "/")) || "global";
  }
  let proj = "global";
  if (anchor.project && anchor.project !== "global") {
    const normProj = anchor.project.replace(/\\/g, "/").replace(/\/+$/, "");
    if (normProj.includes("/")) {
      const parts = normProj.split("/").filter(Boolean);
      proj = parts.slice(-2).join("/");
    } else {
      proj = normProj;
    }
  } else if (anchor.cwd) {
    proj = import_node_path2.default.basename(anchor.cwd.replace(/\\/g, "/")) || "global";
  }
  if (anchor.files && anchor.files.length > 0) {
    const shortFile = import_node_path2.default.basename(anchor.files[0].replace(/\\/g, "/"));
    if (shortFile && !proj.endsWith(shortFile)) {
      return `${proj} \xB7 ${shortFile}`;
    }
  }
  return proj;
}
function sortAnchorsForDisplay(anchors, cwd) {
  return [...anchors].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "active" ? -1 : 1;
    }
    if (cwd) {
      const aMatch = isAnchorTargetingWorkspace(a, cwd) ? 0 : 1;
      const bMatch = isAnchorTargetingWorkspace(b, cwd) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    return b.lastTouchedAt - a.lastTouchedAt;
  });
}
function updateAnchorStatusBar(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: "active", cwd: ctx.cwd });
    ctx.ui.setStatus("anchor", active.length > 0 ? `\u2316 ${active.length}` : void 0);
    updateStartupBanner(ctx, store);
  } catch {
  }
}
function updateStartupBanner(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: "active", cwd: ctx.cwd });
    if (active.length === 0) {
      ctx.ui.setWidget("anchor-startup", void 0, { placement: "belowEditor" });
      return;
    }
    const sorted = sortAnchorsForDisplay(active, ctx.cwd);
    const factory = (_tui, theme) => ({
      render: (width) => {
        const fg = theme?.fg ? theme.fg.bind(theme) : (_c, text) => text;
        if (sorted.length === 1) {
          const a = sorted[0];
          const num = a.id.replace(/^anc-/, "");
          const bar = a.progress ? `${fg("accent", formatProgressBar(a.progress))} ` : "";
          const nextStep = a.progress?.steps && a.progress.steps[a.progress.done] ? fg("muted", ` \u25B8 ${a.progress.steps[a.progress.done]}`) : "";
          const origin = formatOrigin(a);
          const sessionIcon = a.sessionFile ? " \u21AA" : "";
          const prefix = `${fg("accent", "\u2316")} ${fg("dim", `#${num}`)} ${bar}`;
          const suffix = ` ${fg("muted", `(${origin}${sessionIcon})`)}`;
          const availTitle = Math.max(12, width - getDisplayWidth(prefix) - getDisplayWidth(nextStep) - getDisplayWidth(suffix) - 2);
          const titleClipped = truncateToWidth(a.title, availTitle);
          return [truncateToWidth(`${prefix}${titleClipped}${nextStep}${suffix}`, width)];
        }
        const maxItems = width < 68 ? 1 : width < 100 ? 2 : 3;
        const visibleSlice = sorted.slice(0, maxItems);
        const countTag = fg("accent", `\u2316 ${sorted.length}: `);
        const moreCount = sorted.length - visibleSlice.length;
        const moreSuffix = moreCount > 0 ? fg("dim", ` +${moreCount}`) : "";
        const perSlotWidth = Math.max(
          10,
          Math.floor((width - getDisplayWidth(countTag) - getDisplayWidth(moreSuffix) - (visibleSlice.length - 1) * 5) / visibleSlice.length)
        );
        const segments = visibleSlice.map((a) => {
          const num = a.id.replace(/^anc-/, "");
          const bar = a.progress ? `${formatProgressBar(a.progress)} ` : "";
          const prefix = `#${num} ${bar}`;
          const titleBudget = Math.max(6, perSlotWidth - getDisplayWidth(prefix));
          const shortTitle = truncateToWidth(a.title, titleBudget);
          return `${fg("dim", `#${num}`)} ${bar}${shortTitle}`;
        });
        return [truncateToWidth(`${countTag}${segments.join(fg("dim", " \xB7 "))}${moreSuffix}`, width)];
      },
      invalidate: () => {
      }
    });
    const content = ctx.ui?.theme ? factory : factory().render(80);
    ctx.ui.setWidget("anchor-startup", content, { placement: "belowEditor" });
  } catch {
  }
}
async function openAnchorDashboard(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  const allNotes = store.list({ cwd: ctx.cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
  if (allNotes.length === 0) {
    ctx.ui.notify("\u2316 No sticky notes. Type `pin: <note>` or `/pin <note>` to stick one.", "info");
    return;
  }
  const sorted = sortAnchorsForDisplay(allNotes, ctx.cwd);
  const optionMap = /* @__PURE__ */ new Map();
  const displayOptions = [];
  const termCols = process.stdout?.columns || 96;
  const isNarrow = termCols < 84;
  const titleWidth = isNarrow ? Math.max(20, termCols - 30) : 42;
  for (const a of sorted) {
    const num = a.id.replace(/^anc-/, "").padStart(2, "0");
    const bar = a.progress ? `${formatProgressBar(a.progress)} ` : "";
    const origin = formatOrigin(a) + (a.sessionFile ? " \u21AA" : "");
    const age = a.status === "sleeping" ? `${formatRelativeAge(a.createdAt)} \xB7 quiet` : formatRelativeAge(a.createdAt);
    const colNum = `${num}  `;
    const colTitle = padToWidth(`${bar}${a.title}`, titleWidth);
    const colOrigin = padToWidth(origin, 22);
    const label = isNarrow ? `${colNum}${colTitle}  ${age}`.trimEnd() : `${colNum}${colTitle}  ${colOrigin}  ${age}`.trimEnd();
    optionMap.set(label, a);
    displayOptions.push(label);
  }
  const selected = await ctx.ui.select("\u2316 Notes (select a note):", displayOptions);
  if (!selected) return;
  const anchor = optionMap.get(selected);
  if (!anchor) return;
  const currentSessionFile = ctx.sessionManager?.getSessionFile?.();
  const canJumpSession = Boolean(
    anchor.sessionFile && import_node_fs2.default.existsSync(anchor.sessionFile) && typeof ctx.switchSession === "function" && (!currentSessionFile || !isSameOrSubPath(anchor.sessionFile, currentSessionFile))
  );
  const stepLabel = anchor.progress ? `\u25B6 Advance step (${anchor.progress.done}/${anchor.progress.total} \u2794 ${Math.min(anchor.progress.total, anchor.progress.done + 1)}/${anchor.progress.total})` : "\u25B6 Start progress bar (1/4)";
  const actions = [
    "\u2713 Done (tear off note)",
    stepLabel,
    ...canJumpSession ? ["\u21AA Jump to session (resume linked conversation)"] : [],
    ...anchor.status === "sleeping" ? ["\u26A1 Wake up (mark active)"] : [],
    "\u2139 Read full note",
    "\u21A9 Back"
  ];
  const action = await ctx.ui.select(`\u2316 #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}"`, actions);
  if (!action || action.startsWith("\u21A9")) return;
  if (action.startsWith("\u2713")) {
    store.settle(anchor.id, { settledBy: "manual" });
    ctx.ui.notify(`\u2316 Torn off #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}" (/anchor undo to put back)`, "info");
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith("\u25B6")) {
    const { anchor: updated, completed } = store.step(anchor.id, 1);
    updateAnchorStatusBar(ctx, store);
    if (completed) {
      ctx.ui.notify(
        `\u2316 #${updated.id.replace(/^anc-/, "")} reached ${formatProgressBar(updated.progress)}! Run /done ${updated.id.replace(/^anc-/, "")} to tear off.`,
        "info"
      );
    } else {
      ctx.ui.notify(`\u2316 Advanced #${updated.id.replace(/^anc-/, "")} to ${formatProgressBar(updated.progress)}`, "info");
    }
  } else if (action.startsWith("\u21AA") && anchor.sessionFile) {
    try {
      await ctx.switchSession(anchor.sessionFile);
    } catch (err) {
      ctx.ui.notify(`Could not switch session: ${err.message}`, "error");
    }
  } else if (action.startsWith("\u26A1")) {
    store.touch(anchor.id);
    ctx.ui.notify(`\u2316 Woke up #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}"`, "info");
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith("\u2139")) {
    const details = [
      `\u2316 Note #${anchor.id.replace(/^anc-/, "")}: ${anchor.title}`,
      anchor.progress ? `Progress: ${formatProgressBar(anchor.progress)}${anchor.progress.steps ? ` (${anchor.progress.steps.join(" \u2192 ")})` : ""}` : null,
      anchor.description ? `Details: ${anchor.description}` : null,
      anchor.files.length > 0 ? `Files: ${anchor.files.join(", ")}` : null,
      anchor.sessionFile ? `Session: ${import_node_path2.default.basename(anchor.sessionFile)}` : null,
      `Workspace: ${anchor.project || "global"} \xB7 Pinned ${formatRelativeAge(anchor.createdAt)}`
    ].filter(Boolean).join("\n");
    ctx.ui.notify(details, "info");
  }
}

// src/extension.ts
var import_typebox = require("@sinclair/typebox");
var import_node_fs3 = __toESM(require("fs"), 1);
function parseAnchorCommandInput(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed || trimmed === "list" || trimmed === "ls") {
    return { mode: "dashboard" };
  }
  if (trimmed === "undo") {
    return { mode: "undo" };
  }
  const settleMatch = trimmed.match(/^(?:done|rm|close|settle)\s+(.+)$/i);
  if (settleMatch) {
    return {
      mode: "settle",
      targetId: settleMatch[1].trim().replace(/^#/, "")
    };
  }
  const stepMatch = trimmed.match(/^(?:step|\+)\s*(\S+)(?:\s+([+-]?\d+))?$/i);
  if (stepMatch) {
    return {
      mode: "step",
      targetId: stepMatch[1].trim().replace(/^#/, ""),
      delta: stepMatch[2] ? parseInt(stepMatch[2], 10) : 1
    };
  }
  const jumpMatch = trimmed.match(/^(?:jump|resume|session)\s+(.+)$/i);
  if (jumpMatch) {
    return {
      mode: "jump",
      targetId: jumpMatch[1].trim().replace(/^#/, "")
    };
  }
  return {
    mode: "pin",
    title: trimmed
  };
}
function parseQuickNoteInput(text) {
  const m = (text || "").trim().match(/^(?:pin|note|便签|备忘)\s*[:：]\s*(.*)$/i);
  if (!m) return null;
  return m[1].trim();
}
function resolveAnchorTarget(store, idOrIndex, cwd) {
  const clean = idOrIndex.trim().replace(/^#/, "");
  const direct = store.get(clean);
  if (direct) return direct.id;
  if (/^\d+$/.test(clean)) {
    const seqIndex = parseInt(clean, 10);
    const visible = store.list({ cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
    const sorted = sortAnchorsForDisplay(visible, cwd);
    if (seqIndex >= 1 && seqIndex <= sorted.length) {
      return sorted[seqIndex - 1].id;
    }
  }
  return void 0;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AnchorStore,
  COMMENT_FORMATS,
  MS_PER_DAY,
  QUIET_AFTER_DAYS,
  acquireSyncLock,
  atomicRenameWithRetry,
  extractPathsFromText,
  extractProgressFromText,
  findMatchedAnchors,
  formatOrigin,
  formatProgressBar,
  formatRelativeAge,
  getDefaultStorageDir,
  getDisplayWidth,
  globToRegExp,
  hasActiveUI,
  isAnchorTargetingWorkspace,
  isSameOrSubPath,
  makeSafeTaskAnnotation,
  matchAnchorAgainstTouchedFiles,
  matchesCommitMessage,
  normalizePath,
  openAnchorDashboard,
  padToWidth,
  parseAnchorCommandInput,
  parseQuickNoteInput,
  renderActiveAnchorsContext,
  renderColdStartAnchorsContext,
  resolveAnchorTarget,
  sortAnchorsForDisplay,
  stripAnsi,
  sweepQuietNotes,
  truncateToWidth,
  updateAnchorStatusBar,
  updateStartupBanner
});
