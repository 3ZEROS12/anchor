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

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  default: () => extension_default,
  parseAnchorCommandInput: () => parseAnchorCommandInput,
  resolveAnchorTarget: () => resolveAnchorTarget
});
module.exports = __toCommonJS(extension_exports);
var import_typebox = require("@sinclair/typebox");

// src/store.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path = __toESM(require("path"), 1);
var import_node_os = __toESM(require("os"), 1);

// src/types.ts
var QUIET_AFTER_DAYS = 7;
var MS_PER_DAY = 864e5;

// src/store.ts
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
      if (isSameOrSubPath(f, normTarget)) return true;
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
function matchesCommitMessage(anchor, commitMessages) {
  const idLower = anchor.id.toLowerCase();
  const numId = `#${anchor.id.replace(/^anc-/, "")}`;
  const title = anchor.title.toLowerCase();
  let titleTokens = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const seg = new Intl.Segmenter("und", { granularity: "word" });
      titleTokens = Array.from(seg.segment(title)).filter((s) => s.isWordLike).map((s) => s.segment.trim().toLowerCase()).filter((t) => t.length >= 2);
    } catch {
      titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2);
    }
  } else {
    titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2);
  }
  for (const msg of commitMessages) {
    const msgLower = msg.toLowerCase();
    if (msgLower.includes(idLower) || msgLower.includes(numId)) {
      return { matched: true, message: msg };
    }
    if (titleTokens.length > 0) {
      const hits = titleTokens.filter((tok) => msgLower.includes(tok)).length;
      if (hits >= Math.min(2, titleTokens.length)) {
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
    const desc = a.description ? ` \u2014 ${a.description}` : "";
    return `\u2022 #${num} [${a.project}] ${a.title}${files}${desc}`;
  });
  return [
    `<sticky-notes count="${activeNotes.length}">`,
    `Pinned notes from previous sessions:`,
    lines.join("\n"),
    `When a note is completed, call anchor(action="settle", id="...") to tear it off.`,
    `</sticky-notes>`
  ].join("\n");
}
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
      const explicitFiles = (input.files || []).map((f) => normalizePath(f)).filter(Boolean);
      const inferredFiles = explicitFiles.length > 0 ? explicitFiles : extractPathsFromText(`${input.title} ${input.description || ""}`);
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
        title: input.title.trim(),
        description: input.description?.trim(),
        priority: input.priority || "p1",
        status: "active",
        project: projectName,
        cwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: inferredFiles,
        tags: (input.tags || []).map((t) => t.trim()).filter(Boolean)
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
  touch(id, timestamp = Date.now()) {
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
      state.anchors[idx] = current;
      this.saveState(state);
      return current;
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
  } catch {
  }
}
function updateStartupBanner(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  try {
    const active = store.list({ status: "active", cwd: ctx.cwd });
    if (active.length === 0) {
      ctx.ui.setWidget("anchor-startup", void 0);
      return;
    }
    const sorted = sortAnchorsForDisplay(active, ctx.cwd);
    const topItems = sorted.slice(0, 3);
    const factory = (_tui, theme) => ({
      render: (width) => {
        const maxTitleWidth = Math.max(14, width - 34);
        const fg = theme?.fg ? theme.fg.bind(theme) : (_c, text) => text;
        const label = active.length === 1 ? "1 note" : `${active.length} notes`;
        const lines = [
          truncateToWidth(fg("accent", `\u2316 ${label}`), width)
        ];
        for (const a of topItems) {
          const num = a.id.replace(/^anc-/, "").padStart(2, "0");
          const origin = formatOrigin(a);
          const age = formatRelativeAge(a.createdAt);
          const titleClipped = truncateToWidth(a.title, maxTitleWidth);
          lines.push(
            truncateToWidth(
              `  ${fg("dim", num)}  ${titleClipped}  ${fg("muted", `\xB7 ${origin}`)} ${fg("dim", `(${age})`)}`,
              width
            )
          );
        }
        if (sorted.length > 3) {
          lines.push(truncateToWidth(fg("dim", `  +${sorted.length - 3} more \xB7 /anchor`), width));
        }
        return lines;
      },
      invalidate: () => {
      }
    });
    const content = ctx.ui?.theme ? factory : factory().render(80);
    ctx.ui.setWidget("anchor-startup", content, { placement: "aboveEditor" });
  } catch {
  }
}
async function openAnchorDashboard(ctx, store) {
  if (!hasActiveUI(ctx)) return;
  const allNotes = store.list({ cwd: ctx.cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
  if (allNotes.length === 0) {
    ctx.ui.notify("\u2316 No sticky notes. Use /pin <note> to stick one.", "info");
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
    const origin = formatOrigin(a);
    const age = a.status === "sleeping" ? `${formatRelativeAge(a.createdAt)} \xB7 quiet` : formatRelativeAge(a.createdAt);
    const colNum = `${num}  `;
    const colTitle = padToWidth(a.title, titleWidth);
    const colOrigin = padToWidth(origin, 22);
    const label = isNarrow ? `${colNum}${colTitle}  ${age}`.trimEnd() : `${colNum}${colTitle}  ${colOrigin}  ${age}`.trimEnd();
    optionMap.set(label, a);
    displayOptions.push(label);
  }
  const selected = await ctx.ui.select("\u2316 Notes (select a note):", displayOptions);
  if (!selected) return;
  const anchor = optionMap.get(selected);
  if (!anchor) return;
  const actions = [
    "\u2713 Done (tear off note)",
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
  } else if (action.startsWith("\u26A1")) {
    store.touch(anchor.id);
    ctx.ui.notify(`\u2316 Woke up #${anchor.id.replace(/^anc-/, "")}: "${anchor.title}"`, "info");
    updateAnchorStatusBar(ctx, store);
  } else if (action.startsWith("\u2139")) {
    const details = [
      `\u2316 Note #${anchor.id.replace(/^anc-/, "")}: ${anchor.title}`,
      anchor.description ? `Details: ${anchor.description}` : null,
      anchor.files.length > 0 ? `Files: ${anchor.files.join(", ")}` : null,
      `Workspace: ${anchor.project || "global"} \xB7 Pinned ${formatRelativeAge(anchor.createdAt)}`
    ].filter(Boolean).join("\n");
    ctx.ui.notify(details, "info");
  }
}

// src/extension.ts
var MUTATION_TOOLS = /* @__PURE__ */ new Set(["edit", "write", "patch", "apply_diff", "create_file", "modify"]);
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
  return {
    mode: "pin",
    title: trimmed
  };
}
function resolveAnchorTarget(store, idOrIndex, cwd) {
  const clean = idOrIndex.trim().replace(/^#/, "");
  if (/^\d+$/.test(clean)) {
    const seqIndex = parseInt(clean, 10);
    const visible = store.list({ cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
    const sorted = sortAnchorsForDisplay(visible, cwd);
    if (seqIndex >= 1 && seqIndex <= sorted.length) {
      return sorted[seqIndex - 1].id;
    }
  }
  return store.get(clean)?.id;
}
function extension_default(pi) {
  const store = new AnchorStore();
  const annotatedThisSession = /* @__PURE__ */ new Set();
  pi.on("session_start", async (event, ctx) => {
    annotatedThisSession.clear();
    sweepQuietNotes(store);
    const quietForHere = store.list({ status: "sleeping", all: true }).filter((a) => (a.files.length > 0 || a.project && a.project !== "global" || a.cwd) && isAnchorTargetingWorkspace(a, ctx.cwd));
    for (const q of quietForHere) {
      store.touch(q.id);
    }
    updateAnchorStatusBar(ctx, store);
    if (event.reason !== "resume") {
      updateStartupBanner(ctx, store);
    } else if (hasActiveUI(ctx)) {
      try {
        ctx.ui.setWidget("anchor-startup", void 0);
      } catch {
      }
    }
  });
  pi.on("agent_start", async (_event, ctx) => {
    if (hasActiveUI(ctx)) {
      try {
        ctx.ui.setWidget("anchor-startup", void 0);
      } catch {
      }
    }
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const entries = ctx.sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e) => e.type === "message");
    if (messageTurns.length <= 1) {
      const snippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (snippet) {
        return { systemPrompt: `${event.systemPrompt}

${snippet}` };
      }
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    if (event.isError) return;
    const lowerTool = String(event.toolName || "").toLowerCase();
    if (lowerTool === "bash" || lowerTool === "powershell") {
      const cmd = String(event.input?.command || "");
      if (cmd.includes("git commit")) {
        const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
        if (msgMatch && msgMatch[1]) {
          const commitMsg = msgMatch[1];
          const candidates = store.list({ cwd: ctx.cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
          for (const a of candidates) {
            if (matchesCommitMessage(a, [commitMsg]).matched && isAnchorTargetingWorkspace(a, ctx.cwd)) {
              store.settle(a.id, { settledBy: "commit", summary: commitMsg });
              updateAnchorStatusBar(ctx, store);
              if (hasActiveUI(ctx)) {
                try {
                  ctx.ui.notify(`\u2316 Auto-torn off #${a.id.replace(/^anc-/, "")} ("${a.title}") on git commit`, "info");
                } catch {
                }
              }
            }
          }
        }
      }
    }
    const pathInput = event.input?.path;
    if (typeof pathInput !== "string") return;
    const touchedPath = normalizePath(pathInput, ctx.cwd);
    const notes = store.list({ cwd: ctx.cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
    const matches = findMatchedAnchors(notes, [touchedPath]);
    if (matches.length === 0) return;
    if (MUTATION_TOOLS.has(lowerTool)) {
      for (const m of matches) store.touch(m.anchor.id);
      updateAnchorStatusBar(ctx, store);
    }
    const targetNote = matches[0].anchor;
    if (!annotatedThisSession.has(targetNote.id)) {
      annotatedThisSession.add(targetNote.id);
      const whisper = makeSafeTaskAnnotation(touchedPath, targetNote);
      if (whisper) {
        const contents = [...event.content || []];
        for (let i = contents.length - 1; i >= 0; i--) {
          const item = contents[i];
          if (item && item.type === "text") {
            contents[i] = { ...item, text: item.text + whisper };
            return { content: contents };
          }
        }
      }
    }
  });
  pi.registerTool({
    name: "anchor",
    label: "Anchor (Sticky Note)",
    description: "Pin, list, or tear off cross-session sticky notes stored in ~/.anchor/ (zero git repo clutter). Actions: pin (stick a new note), list (view notes), settle (tear off completed note).",
    promptSnippet: "Pin or tear off cross-session sticky notes that survive terminal restarts",
    promptGuidelines: [
      'Use `anchor` when the user asks to remember something for later/tomorrow or across sessions (e.g. "\u8BB0\u4E00\u4E0B\u660E\u5929\u91CD\u6784\u9274\u6743", "\u665A\u4E0A\u6E05\u7406\u7F13\u5B58").',
      "BOUNDARY WITH TODO: `todo` is for multi-step work right now in this session; `anchor` is a sticky note for future sessions.",
      'When a pinned note is completed, call `anchor` with action "settle" to tear it off.'
    ],
    parameters: import_typebox.Type.Object({
      action: import_typebox.Type.Union([
        import_typebox.Type.Literal("pin"),
        import_typebox.Type.Literal("list"),
        import_typebox.Type.Literal("settle"),
        import_typebox.Type.Literal("touch"),
        import_typebox.Type.Literal("sweep")
      ]),
      title: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Sticky note text (for pin)" })),
      description: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Optional extra details" })),
      project: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Optional project name or folder" })),
      files: import_typebox.Type.Optional(import_typebox.Type.Array(import_typebox.Type.String(), { description: "Optional associated file paths" })),
      id: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Note ID, e.g. anc-1 or 1 (for settle)" }))
    }),
    renderCall(args, theme) {
      const action = args.action || "list";
      let title = theme.fg("toolTitle", theme.bold("\u2316 anchor ")) + theme.fg("accent", action);
      if (action === "pin" && args.title) {
        title += ` "${args.title}"`;
      } else if ((action === "settle" || action === "touch") && args.id) {
        title += ` ${theme.fg("dim", `#${String(args.id).replace(/^anc-/, "")}`)}`;
      }
      return {
        render: (width) => [truncateToWidth(title, width)],
        invalidate: () => {
        }
      };
    },
    renderResult(result, _options, theme) {
      const text = result.content?.[0]?.text || (result.isError ? "Failed" : "OK");
      const color = result.isError ? "error" : "success";
      const icon = result.isError ? "\u2717" : "\u2714";
      return {
        render: (width) => [truncateToWidth(theme.fg(color, `${icon} ${text}`), width)],
        invalidate: () => {
        }
      };
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) return { content: [{ type: "text", text: "Error: context required" }], isError: true };
      if (params.action === "pin") {
        if (!params.title) {
          return { content: [{ type: "text", text: "Error: title is required for pin" }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          description: params.description,
          project: params.project,
          cwd: ctx.cwd,
          files: params.files || []
        });
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{ type: "text", text: `Pinned note #${anc.id.replace(/^anc-/, "")}: "${anc.title}"` }],
          isError: false
        };
      }
      if (params.action === "list") {
        const notes = store.list({ cwd: ctx.cwd, all: true }).filter((a) => a.status === "active" || a.status === "sleeping");
        return {
          content: [{ type: "text", text: JSON.stringify(notes, null, 2) }],
          isError: false
        };
      }
      if (params.action === "settle") {
        if (!params.id) {
          return { content: [{ type: "text", text: "Error: id is required for settle" }], isError: true };
        }
        try {
          const targetId = resolveAnchorTarget(store, String(params.id), ctx.cwd) || String(params.id);
          const settled = store.settle(targetId, { settledBy: "manual" });
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{ type: "text", text: `Torn off note #${settled.id.replace(/^anc-/, "")}: "${settled.title}"` }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "touch" && params.id) {
        try {
          const touched = store.touch(String(params.id));
          updateAnchorStatusBar(ctx, store);
          return { content: [{ type: "text", text: `Refreshed note #${touched.id}` }], isError: false };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "sweep") {
        const res = sweepQuietNotes(store);
        updateAnchorStatusBar(ctx, store);
        return { content: [{ type: "text", text: `Quieted ${res.quieted.length} old note(s).` }], isError: false };
      }
      return { content: [{ type: "text", text: "Unknown action" }], isError: true };
    }
  });
  pi.registerCommand("anchor", {
    description: "View, pin, or tear off sticky notes (/anchor, /anchor done 1, /anchor undo)",
    handler: async (args, ctx) => {
      const parsed = parseAnchorCommandInput(args);
      if (parsed.mode === "dashboard") {
        await openAnchorDashboard(ctx, store);
        return;
      }
      if (parsed.mode === "undo") {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`\u2316 Put back #${restored.id.replace(/^anc-/, "")}: "${restored.title}"`, "info");
          updateAnchorStatusBar(ctx, store);
        } catch (err) {
          ctx.ui.notify(`Undo failed: ${err.message}`, "error");
        }
        return;
      }
      if (parsed.mode === "settle" && parsed.targetId) {
        const resolvedId = resolveAnchorTarget(store, parsed.targetId, ctx.cwd);
        if (!resolvedId) {
          ctx.ui.notify(`\u2316 Note not found: ${parsed.targetId}`, "error");
          return;
        }
        const settled = store.settle(resolvedId, { settledBy: "manual" });
        ctx.ui.notify(`\u2316 Torn off #${settled.id.replace(/^anc-/, "")}: "${settled.title}" (/anchor undo to put back)`, "info");
        updateAnchorStatusBar(ctx, store);
        return;
      }
      const rawTrimmed = (args || "").trim();
      if (/^(?:#?anc-\d+|#\d+)$/i.test(rawTrimmed)) {
        const resolvedId = resolveAnchorTarget(store, rawTrimmed, ctx.cwd);
        if (resolvedId) {
          const settled = store.settle(resolvedId, { settledBy: "manual" });
          ctx.ui.notify(`\u2316 Torn off #${settled.id.replace(/^anc-/, "")}: "${settled.title}" (/anchor undo to put back)`, "info");
          updateAnchorStatusBar(ctx, store);
          return;
        }
      }
      const anc = store.create({ title: parsed.title || rawTrimmed, cwd: ctx.cwd });
      ctx.ui.notify(`\u2316 Pinned #${anc.id.replace(/^anc-/, "")}: "${anc.title}"`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("pin", {
    description: "Stick a quick note across sessions (e.g. /pin Check auth token expiry)",
    handler: async (args, ctx) => {
      const text = (args || "").trim();
      if (!text) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = store.create({ title: text, cwd: ctx.cwd });
      ctx.ui.notify(`\u2316 Pinned #${anc.id.replace(/^anc-/, "")}: "${anc.title}"`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("done", {
    description: "Tear off a sticky note by number or ID (e.g. /done 1)",
    handler: async (args, ctx) => {
      const target = (args || "").trim();
      if (!target) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const resolvedId = resolveAnchorTarget(store, target, ctx.cwd);
      if (!resolvedId) {
        ctx.ui.notify(`\u2316 Note not found: ${target}`, "error");
        return;
      }
      const settled = store.settle(resolvedId, { settledBy: "manual" });
      ctx.ui.notify(`\u2316 Torn off #${settled.id.replace(/^anc-/, "")}: "${settled.title}" (/anchor undo to put back)`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("anchors", {
    description: "View sticky notes",
    handler: async (_args, ctx) => {
      await openAnchorDashboard(ctx, store);
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  parseAnchorCommandInput,
  resolveAnchorTarget
});
