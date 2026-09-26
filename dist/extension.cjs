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
  default: () => extension_default
});
module.exports = __toCommonJS(extension_exports);
var import_typebox = require("@sinclair/typebox");

// src/store.ts
var import_node_fs = __toESM(require("fs"), 1);
var import_node_path2 = __toESM(require("path"), 1);
var import_node_os = __toESM(require("os"), 1);

// src/types.ts
var EPHEMERAL_DECAY_POLICY = {
  activeDays: 1,
  // 24 hours active
  sleepDays: 1,
  // 24 hours sleeping
  graveyardDays: 2
  // 48 hours total before auto-clearing
};
var DURABLE_DECAY_POLICY = {
  activeDays: 3,
  sleepDays: 30,
  graveyardDays: 9999
  // Never permanently auto-dropped; preserved indefinitely
};

// src/matcher.ts
var import_node_path = __toESM(require("path"), 1);
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\/\*\*\//g, "___GLOB_DIR_SLASH___").replace(/\*\*/g, "___GLOB_STAR_STAR___").replace(/\*/g, "[^/]*").replace(/___GLOB_DIR_SLASH___/g, "(?:/|/.+/)").replace(/___GLOB_STAR_STAR___/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function normalizePath(filePath, baseCwd) {
  if (typeof filePath !== "string") return "";
  let norm = filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (baseCwd && (import_node_path.default.isAbsolute(filePath) || norm.startsWith("/"))) {
    const normBase = baseCwd.trim().replace(/\\/g, "/");
    if (norm.toLowerCase().startsWith(normBase.toLowerCase())) {
      norm = norm.slice(normBase.length).replace(/^\/+/, "");
    }
  }
  return norm;
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
      if (normPattern.includes("*")) {
        const regex = globToRegExp(normPattern);
        if (regex.test(touched)) {
          matchedExact.push(touched);
          break;
        }
      }
      const dirPrefix = normPattern.endsWith("/") ? normPattern : normPattern + "/";
      if (touched.startsWith(dirPrefix)) {
        matchedPrefix.push(touched);
        break;
      }
    }
  }
  if (matchedExact.length > 0) {
    return {
      anchor,
      score: 1,
      matchedFiles: Array.from(new Set(matchedExact)),
      reason: "exact-file"
    };
  }
  if (matchedPrefix.length > 0) {
    return {
      anchor,
      score: 0.85,
      matchedFiles: Array.from(new Set(matchedPrefix)),
      reason: "dir-prefix"
    };
  }
  return null;
}
function findMatchedAnchors(anchors, touchedFiles) {
  const priorityWeight = { p0: 3, p1: 2, p2: 1 };
  const results = [];
  for (const anchor of anchors) {
    const match = matchAnchorAgainstTouchedFiles(anchor, touchedFiles);
    if (match) {
      results.push(match);
    }
  }
  return results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    const weightA = priorityWeight[a.anchor.priority] || 0;
    const weightB = priorityWeight[b.anchor.priority] || 0;
    if (weightB !== weightA) {
      return weightB - weightA;
    }
    return b.anchor.lastTouchedAt - a.anchor.lastTouchedAt;
  });
}

// src/store.ts
function detectDurability(title) {
  const temporalKeywords = [
    "\u4ECA\u5929",
    "\u4ECA\u65E5",
    "\u665A\u4E0A",
    "\u4ECA\u665A",
    "\u660E\u5929",
    "\u540E\u5929",
    "\u5927\u540E\u5929",
    "\u7A0D\u540E",
    "\u5F85\u4F1A",
    "\u4E0B\u5348",
    "\u4E0A\u5348",
    "\u4E34\u65F6",
    "\u4E00\u4F1A\u513F",
    "\u7B49\u7B49",
    "today",
    "tonight",
    "tomorrow",
    "later",
    "temp",
    "soon"
  ];
  const lower = title.toLowerCase();
  for (const kw of temporalKeywords) {
    if (lower.includes(kw)) {
      return "ephemeral";
    }
  }
  return "durable";
}
function getEphemeralDecayPolicy(title) {
  const lower = title.toLowerCase();
  if (lower.includes("\u5927\u540E\u5929")) {
    return { activeDays: 3, sleepDays: 1, graveyardDays: 4 };
  }
  if (lower.includes("\u540E\u5929")) {
    return { activeDays: 2, sleepDays: 1, graveyardDays: 3 };
  }
  return { ...EPHEMERAL_DECAY_POLICY };
}
function detectTargetDate(titleOrDate, now = Date.now()) {
  const lower = titleOrDate.toLowerCase().trim();
  const MS_DAY = 24 * 60 * 60 * 1e3;
  if (lower.includes("\u4ECA\u5929") || lower.includes("\u4ECA\u65E5") || lower.includes("\u4ECA\u665A") || lower === "today" || lower === "tonight") {
    return getTodayDateString(now);
  }
  if (lower.includes("\u660E\u5929") || lower === "tomorrow") {
    return getTodayDateString(now + MS_DAY);
  }
  if (lower.includes("\u540E\u5929")) {
    return getTodayDateString(now + 2 * MS_DAY);
  }
  if (lower.includes("\u5927\u540E\u5929")) {
    return getTodayDateString(now + 3 * MS_DAY);
  }
  const weekdayMap = {
    "\u5468\u65E5": 0,
    "\u661F\u671F\u65E5": 0,
    "sunday": 0,
    "sun": 0,
    "\u5468\u4E00": 1,
    "\u661F\u671F\u4E00": 1,
    "monday": 1,
    "mon": 1,
    "\u5468\u4E8C": 2,
    "\u661F\u671F\u4E8C": 2,
    "tuesday": 2,
    "tue": 2,
    "\u5468\u4E09": 3,
    "\u661F\u671F\u4E09": 3,
    "wednesday": 3,
    "wed": 3,
    "\u5468\u56DB": 4,
    "\u661F\u671F\u56DB": 4,
    "thursday": 4,
    "thu": 4,
    "\u5468\u4E94": 5,
    "\u661F\u671F\u4E94": 5,
    "friday": 5,
    "fri": 5,
    "\u5468\u516D": 6,
    "\u661F\u671F\u516D": 6,
    "saturday": 6,
    "sat": 6
  };
  const isNextWeek = lower.includes("\u4E0B\u5468") || lower.includes("next");
  for (const [name, targetDay] of Object.entries(weekdayMap)) {
    if (lower.includes(name)) {
      const curDay = new Date(now).getDay();
      let diff = targetDay - curDay;
      if (diff <= 0 || isNextWeek) {
        diff += 7;
      }
      return getTodayDateString(now + diff * MS_DAY);
    }
  }
  const fullDateMatch = titleOrDate.match(/\b(20\d\d)-(\d{1,2})-(\d{1,2})\b/);
  if (fullDateMatch) {
    const y = fullDateMatch[1];
    const m = fullDateMatch[2].padStart(2, "0");
    const d = fullDateMatch[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const mmddMatch = titleOrDate.match(/\b(\d{1,2})-(\d{1,2})\b/);
  if (mmddMatch) {
    const curYear = new Date(now).getFullYear();
    const m = mmddMatch[1].padStart(2, "0");
    const d = mmddMatch[2].padStart(2, "0");
    return `${curYear}-${m}-${d}`;
  }
  return void 0;
}
function detectRecurrence(title) {
  const lower = title.toLowerCase();
  if (lower.includes("\u6BCF\u5929") || lower.includes("\u6BCF\u65E5") || lower.includes("daily") || lower.includes("every day")) {
    return "daily";
  }
  return void 0;
}
function getTodayDateString(timestamp = Date.now()) {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function getDefaultStorageDir() {
  if (process.env.ANCHOR_DIR) {
    return import_node_path2.default.resolve(process.env.ANCHOR_DIR);
  }
  const primaryDir = import_node_path2.default.join(import_node_os.default.homedir(), ".anchor");
  const legacyPiDir = import_node_path2.default.join(import_node_os.default.homedir(), ".pi", "agent", "anchors");
  if (!import_node_fs.default.existsSync(primaryDir) && import_node_fs.default.existsSync(legacyPiDir)) {
    try {
      import_node_fs.default.mkdirSync(primaryDir, { recursive: true });
      for (const file of ["state.json", "archive.jsonl", "graveyard.jsonl"]) {
        const src = import_node_path2.default.join(legacyPiDir, file);
        const dest = import_node_path2.default.join(primaryDir, file);
        if (import_node_fs.default.existsSync(src) && !import_node_fs.default.existsSync(dest)) {
          import_node_fs.default.copyFileSync(src, dest);
        }
      }
    } catch {
    }
  }
  return primaryDir;
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
      const meta = { pid: process.pid, createdAt: Date.now() };
      import_node_fs.default.writeFileSync(fd, JSON.stringify(meta), "utf-8");
      import_node_fs.default.closeSync(fd);
      return () => {
        try {
          if (import_node_fs.default.existsSync(lockPath)) {
            import_node_fs.default.unlinkSync(lockPath);
          }
        } catch {
        }
      };
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const content = import_node_fs.default.readFileSync(lockPath, "utf-8");
          const meta = JSON.parse(content);
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
        const delay = Math.min(40, Math.floor(attempt * 4 + Math.random() * 8));
        sleepSync(delay);
        continue;
      }
      break;
    }
  }
  return () => {
  };
}
function atomicRenameWithRetry(tempPath, targetPath, maxAttempts = 6) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      import_node_fs.default.renameSync(tempPath, targetPath);
      return;
    } catch (err) {
      const code = err?.code;
      if ((code === "EBUSY" || code === "EPERM" || code === "EACCES") && attempt < maxAttempts) {
        const delay = Math.floor(attempt * 20 + Math.random() * 15);
        sleepSync(delay);
        continue;
      }
      const crashDump = `${tempPath}.failed`;
      try {
        if (import_node_fs.default.existsSync(tempPath)) import_node_fs.default.renameSync(tempPath, crashDump);
      } catch {
      }
      throw err;
    }
  }
}
var AnchorStore = class {
  storageDir;
  statePath;
  archivePath;
  graveyardPath;
  constructor(customStorageDir) {
    if (customStorageDir) {
      this.storageDir = import_node_path2.default.resolve(customStorageDir);
    } else {
      this.storageDir = getDefaultStorageDir();
    }
    this.statePath = import_node_path2.default.join(this.storageDir, "state.json");
    this.archivePath = import_node_path2.default.join(this.storageDir, "archive.jsonl");
    this.graveyardPath = import_node_path2.default.join(this.storageDir, "graveyard.jsonl");
    this.ensureDirs();
  }
  get lockPath() {
    return import_node_path2.default.join(this.storageDir, "state.lock");
  }
  /**
   * Execute mutation within a cross-process exclusive lock
   */
  withLock(fn) {
    const release = acquireSyncLock(this.lockPath);
    try {
      return fn();
    } finally {
      release();
    }
  }
  ensureDirs() {
    if (!import_node_fs.default.existsSync(this.storageDir)) {
      try {
        import_node_fs.default.mkdirSync(this.storageDir, { recursive: true });
      } catch {
      }
    }
  }
  /**
   * Load store state. If corrupt or missing, returns safe default.
   */
  loadState() {
    this.ensureDirs();
    if (!import_node_fs.default.existsSync(this.statePath)) {
      return {
        version: 1,
        anchors: [],
        lastSweepAt: Date.now()
      };
    }
    let raw = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        raw = import_node_fs.default.readFileSync(this.statePath, "utf-8");
        break;
      } catch (err) {
        if ((err?.code === "EBUSY" || err?.code === "EPERM") && attempt < 3) {
          sleepSync(15);
          continue;
        }
      }
    }
    if (raw === null) {
      return { version: 1, anchors: [], lastSweepAt: Date.now() };
    }
    try {
      const data = JSON.parse(raw);
      if (!Array.isArray(data.anchors)) {
        throw new Error("Invalid state: anchors must be array");
      }
      return data;
    } catch {
      const backupPath = import_node_path2.default.join(this.storageDir, `state.corrupt.${Date.now()}.json`);
      try {
        import_node_fs.default.renameSync(this.statePath, backupPath);
      } catch {
      }
      return {
        version: 1,
        anchors: [],
        lastSweepAt: Date.now()
      };
    }
  }
  /**
   * Atomically save store state via temp file + atomic rename with Windows NTFS spin-retry
   */
  saveState(state) {
    this.ensureDirs();
    const tempPath = import_node_path2.default.join(this.storageDir, `state.tmp.${process.pid}.${Date.now()}`);
    import_node_fs.default.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
    atomicRenameWithRetry(tempPath, this.statePath);
  }
  generateId(existingAnchors) {
    const numbers = existingAnchors.map((a) => {
      const match = a.id.match(/^anc-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    }).filter((n) => n > 0);
    const nextNum = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    return `anc-${nextNum}`;
  }
  /**
   * Create a new Anchor with automatic project and cwd tagging
   */
  create(input) {
    return this.withLock(() => {
      const state = this.loadState();
      const now = Date.now();
      const id = this.generateId(state.anchors);
      const cwd = input.cwd ? normalizePath(input.cwd) : "";
      const projectName = input.project ? input.project.trim() : cwd ? import_node_path2.default.basename(cwd) : "global";
      const recurrence = input.recurrence || detectRecurrence(input.title);
      const targetDate = input.targetDate || detectTargetDate(input.title, now);
      const durability = recurrence ? "durable" : input.durability || detectDurability(input.title);
      const decayPolicy = durability === "ephemeral" ? getEphemeralDecayPolicy(input.title) : DURABLE_DECAY_POLICY;
      const anchor = {
        id,
        title: input.title.trim(),
        description: input.description?.trim(),
        priority: input.priority || "p1",
        status: "active",
        durability,
        recurrence,
        targetDate,
        project: projectName,
        cwd,
        createdAt: now,
        updatedAt: now,
        lastTouchedAt: now,
        files: (input.files || []).map((f) => normalizePath(f)).filter(Boolean),
        tags: (input.tags || []).map((t) => t.trim()).filter(Boolean),
        verifyCommand: input.verifyCommand?.trim() || void 0,
        decay: input.decay ? { ...input.decay } : { ...decayPolicy }
      };
      state.anchors.push(anchor);
      this.saveState(state);
      return anchor;
    });
  }
  findAnchorIndex(anchors, id) {
    const clean = id.trim().replace(/^#/, "");
    return anchors.findIndex(
      (a) => a.id === clean || a.id === `anc-${clean}` || (clean.match(/^\d+$/) ? a.id === `anc-${parseInt(clean, 10)}` : false)
    );
  }
  /**
   * Get an anchor by ID (supports 'anc-1', '#anc-1', '1', '01')
   */
  get(id) {
    const state = this.loadState();
    const idx = this.findAnchorIndex(state.anchors, id);
    return idx === -1 ? void 0 : state.anchors[idx];
  }
  /**
   * List anchors. By default, if cwd is provided, only returns anchors
   * belonging to this cwd or marked as global (''). Pass all: true for global view.
   */
  list(filter) {
    const state = this.loadState();
    const targetCwd = filter?.cwd ? normalizePath(filter.cwd) : null;
    const today = getTodayDateString(filter?.now);
    return state.anchors.filter((a) => {
      if (!filter?.all && filter?.status === "active" && a.recurrence === "daily" && a.lastCompletedDate === today) {
        return false;
      }
      if (filter?.status && a.status !== filter.status) return false;
      if (filter?.priority && a.priority !== filter.priority) return false;
      if (!filter?.all && targetCwd) {
        if (a.files.length > 0 && a.cwd && a.cwd !== targetCwd) {
          return false;
        }
      }
      return true;
    });
  }
  /**
   * Update an existing anchor
   */
  update(id, patch) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) {
        throw new Error(`Anchor not found: ${id}`);
      }
      const current = state.anchors[idx];
      const updated = {
        ...current,
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
  /**
   * Touch an anchor to refresh its decay window and reactivate sleeping state
   */
  touch(id, timestamp = Date.now()) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) {
        throw new Error(`Anchor not found: ${id}`);
      }
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
   * Settle an anchor (recurring daily habits complete for today and wake up tomorrow)
   */
  settle(id, evidence = {}, now = Date.now()) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = this.findAnchorIndex(state.anchors, id);
      if (idx === -1) {
        throw new Error(`Anchor not found: ${id}`);
      }
      const anchor = state.anchors[idx];
      const today = getTodayDateString(now);
      if (anchor.recurrence === "daily") {
        anchor.lastCompletedDate = today;
        anchor.lastTouchedAt = now;
        anchor.updatedAt = now;
        anchor.evidence = {
          ...evidence,
          settledAt: now,
          settledBy: evidence.settledBy || "manual-command"
        };
        this.ensureDirs();
        import_node_fs.default.appendFileSync(this.archivePath, JSON.stringify({ ...anchor, settledForDate: today }) + "\n", "utf-8");
        this.saveState(state);
        return anchor;
      }
      const [settled] = state.anchors.splice(idx, 1);
      settled.status = "settled";
      settled.updatedAt = now;
      settled.evidence = {
        ...evidence,
        settledAt: now,
        settledBy: evidence.settledBy || "manual-command"
      };
      this.ensureDirs();
      import_node_fs.default.appendFileSync(this.archivePath, JSON.stringify(settled) + "\n", "utf-8");
      this.saveState(state);
      return settled;
    });
  }
  /**
   * Reverse/undo the last settled anchor, popping it from archive.jsonl back into state.json
   */
  undoSettle() {
    return this.withLock(() => {
      if (!import_node_fs.default.existsSync(this.archivePath)) {
        throw new Error("No archived anchors to undo");
      }
      const raw = import_node_fs.default.readFileSync(this.archivePath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      if (lines.length === 0) {
        throw new Error("Archive is empty, nothing to undo");
      }
      const lastLine = lines.pop();
      const anchor = JSON.parse(lastLine);
      import_node_fs.default.writeFileSync(this.archivePath, lines.length > 0 ? lines.join("\n") + "\n" : "", "utf-8");
      anchor.status = "active";
      anchor.updatedAt = Date.now();
      delete anchor.evidence;
      const state = this.loadState();
      state.anchors.push(anchor);
      this.saveState(state);
      return anchor;
    });
  }
  /**
   * Evict anchor to graveyard.jsonl upon total decay expiry
   */
  dropToGraveyard(id, reason) {
    return this.withLock(() => {
      const state = this.loadState();
      const idx = state.anchors.findIndex((a) => a.id === id);
      if (idx === -1) {
        throw new Error(`Anchor not found: ${id}`);
      }
      const [anchor] = state.anchors.splice(idx, 1);
      anchor.status = "graveyard";
      anchor.updatedAt = Date.now();
      anchor.evidence = {
        summary: reason,
        settledAt: Date.now()
      };
      this.ensureDirs();
      import_node_fs.default.appendFileSync(this.graveyardPath, JSON.stringify(anchor) + "\n", "utf-8");
      this.saveState(state);
      return anchor;
    });
  }
  getArchive(filter) {
    if (!import_node_fs.default.existsSync(this.archivePath)) return [];
    try {
      const raw = import_node_fs.default.readFileSync(this.archivePath, "utf-8");
      const all = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      if (filter?.all || !filter?.cwd) return all;
      const targetCwd = normalizePath(filter.cwd);
      return all.filter((a) => !a.cwd || a.cwd === targetCwd);
    } catch {
      return [];
    }
  }
  getGraveyard(filter) {
    if (!import_node_fs.default.existsSync(this.graveyardPath)) return [];
    try {
      const raw = import_node_fs.default.readFileSync(this.graveyardPath, "utf-8");
      const all = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      if (filter?.all || !filter?.cwd) return all;
      const targetCwd = normalizePath(filter.cwd);
      return all.filter((a) => !a.cwd || a.cwd === targetCwd);
    } catch {
      return [];
    }
  }
};

// src/observer.ts
var MUTATION_TOOLS = /* @__PURE__ */ new Set(["edit", "write", "patch", "apply_diff", "create_file", "modify"]);
var SessionTouchObserver = class {
  touchedFiles = /* @__PURE__ */ new Set();
  modifiedFiles = /* @__PURE__ */ new Set();
  inspectedFiles = /* @__PURE__ */ new Set();
  committed = false;
  commitMessages = [];
  clear() {
    this.touchedFiles.clear();
    this.modifiedFiles.clear();
    this.inspectedFiles.clear();
    this.committed = false;
    this.commitMessages = [];
  }
  /**
   * Observe and record a tool call invocation, separating inspection from mutation
   */
  recordToolCall(toolName, input) {
    if (!input || typeof input !== "object") return;
    const lowerTool = (toolName || "").toLowerCase();
    const isMutation = MUTATION_TOOLS.has(lowerTool);
    const paths = [];
    const pathField = input.path || input.filePath || input.file;
    if (typeof pathField === "string") {
      paths.push(normalizePath(pathField));
    }
    if (Array.isArray(input.paths)) {
      for (const p of input.paths) {
        if (typeof p === "string") {
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
    if (lowerTool === "bash" || lowerTool === "powershell") {
      const cmd = String(input.command || "");
      if (cmd.includes("git commit")) {
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
  addTouchedFile(filePath, isModified = true) {
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
  getModifiedFiles() {
    return Array.from(this.modifiedFiles);
  }
  getInspectedFiles() {
    return Array.from(this.inspectedFiles);
  }
  getTouchedFiles() {
    return Array.from(this.touchedFiles);
  }
  hasCommitted() {
    return this.committed;
  }
  getCommitMessages() {
    return [...this.commitMessages];
  }
  /**
   * Check if any commit message explicitly references or resolves an anchor
   */
  matchesCommit(anchor) {
    const idLower = anchor.id.toLowerCase();
    const title = anchor.title.toLowerCase();
    let titleTokens = [];
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter("und", { granularity: "word" });
        titleTokens = Array.from(segmenter.segment(title)).filter((s) => s.isWordLike).map((s) => s.segment.trim().toLowerCase()).filter((t) => t.length >= 2);
      } catch {
        titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2);
      }
    } else {
      titleTokens = title.split(/[\s,._\-\/]+/).filter((t) => t.length >= 2);
    }
    for (const msg of this.commitMessages) {
      const msgLower = msg.toLowerCase();
      if (msgLower.includes(idLower)) {
        return { matched: true, message: msg };
      }
      if (titleTokens.length > 0) {
        const matchingCount = titleTokens.filter((tok) => msgLower.includes(tok)).length;
        if (matchingCount >= Math.min(2, titleTokens.length)) {
          return { matched: true, message: msg };
        }
      }
    }
    return { matched: false };
  }
};

// src/decay.ts
var import_node_fs2 = __toESM(require("fs"), 1);
var MS_PER_DAY = 864e5;
function evaluateAnchorDecay(anchor, now = Date.now()) {
  if (anchor.status === "settled" || anchor.status === "graveyard") {
    return {
      currentStatus: anchor.status,
      nextStatus: anchor.status,
      daysUntouched: 0,
      remainingActiveDays: 0,
      remainingSleepDays: 0
    };
  }
  const elapsedMs = Math.max(0, now - anchor.lastTouchedAt);
  const daysUntouched = elapsedMs / MS_PER_DAY;
  const activeDays = anchor.decay.activeDays;
  const graveyardDays = anchor.decay.graveyardDays;
  let nextStatus = anchor.status;
  if (daysUntouched <= activeDays) {
    nextStatus = "active";
  } else if (daysUntouched <= graveyardDays) {
    nextStatus = "sleeping";
  } else {
    nextStatus = "graveyard";
  }
  return {
    currentStatus: anchor.status,
    nextStatus,
    daysUntouched: Math.round(daysUntouched * 10) / 10,
    remainingActiveDays: Math.max(0, Math.round((activeDays - daysUntouched) * 10) / 10),
    remainingSleepDays: Math.max(0, Math.round((graveyardDays - daysUntouched) * 10) / 10)
  };
}
function sweepStore(store, now = Date.now()) {
  const state = store.loadState();
  const result = {
    transitionedToSleeping: [],
    wokenToActive: [],
    evictedToGraveyard: []
  };
  const toEvict = [];
  let stateModified = false;
  for (const anchor of state.anchors) {
    const evalResult = evaluateAnchorDecay(anchor, now);
    if (evalResult.nextStatus === "graveyard") {
      toEvict.push(anchor);
    } else if (evalResult.nextStatus !== anchor.status) {
      if (evalResult.nextStatus === "sleeping" && anchor.status === "active") {
        anchor.status = "sleeping";
        anchor.updatedAt = now;
        result.transitionedToSleeping.push(anchor.id);
        stateModified = true;
      } else if (evalResult.nextStatus === "active" && anchor.status === "sleeping") {
        anchor.status = "active";
        anchor.updatedAt = now;
        result.wokenToActive.push(anchor.id);
        stateModified = true;
      }
    }
  }
  if (toEvict.length > 0) {
    const evictIds = new Set(toEvict.map((e) => e.id));
    state.anchors = state.anchors.filter((a) => !evictIds.has(a.id));
    stateModified = true;
    const graveyardLines = toEvict.map((exp) => {
      const rec = {
        ...exp,
        status: "graveyard",
        updatedAt: now,
        evictedAt: now,
        evictionReason: `Exceeded decay threshold (${exp.decay.graveyardDays} days untouched)`
      };
      return JSON.stringify(rec);
    }).join("\n") + "\n";
    import_node_fs2.default.appendFileSync(store.graveyardPath, graveyardLines, "utf-8");
    for (const exp of toEvict) {
      result.evictedToGraveyard.push(exp.id);
    }
  }
  state.lastSweepAt = now;
  if (stateModified) {
    store.saveState(state);
  }
  return result;
}

// src/context_injector.ts
var import_node_path3 = __toESM(require("path"), 1);
var COMMENT_FORMATS = {
  // Double slash //
  ".ts": (m) => `// ${m}`,
  ".tsx": (m) => `// ${m}`,
  ".js": (m) => `// ${m}`,
  ".jsx": (m) => `// ${m}`,
  ".mjs": (m) => `// ${m}`,
  ".cjs": (m) => `// ${m}`,
  ".java": (m) => `// ${m}`,
  ".kt": (m) => `// ${m}`,
  ".swift": (m) => `// ${m}`,
  ".go": (m) => `// ${m}`,
  ".rs": (m) => `// ${m}`,
  ".c": (m) => `// ${m}`,
  ".cpp": (m) => `// ${m}`,
  ".h": (m) => `// ${m}`,
  ".hpp": (m) => `// ${m}`,
  ".cs": (m) => `// ${m}`,
  ".dart": (m) => `// ${m}`,
  ".scala": (m) => `// ${m}`,
  ".zig": (m) => `// ${m}`,
  ".proto": (m) => `// ${m}`,
  // Hash #
  ".py": (m) => `# ${m}`,
  ".rb": (m) => `# ${m}`,
  ".sh": (m) => `# ${m}`,
  ".bash": (m) => `# ${m}`,
  ".zsh": (m) => `# ${m}`,
  ".yaml": (m) => `# ${m}`,
  ".yml": (m) => `# ${m}`,
  ".toml": (m) => `# ${m}`,
  ".conf": (m) => `# ${m}`,
  ".dockerfile": (m) => `# ${m}`,
  ".ps1": (m) => `# ${m}`,
  ".r": (m) => `# ${m}`,
  // HTML / XML <!-- -->
  ".html": (m) => `<!-- ${m} -->`,
  ".xml": (m) => `<!-- ${m} -->`,
  ".svg": (m) => `<!-- ${m} -->`,
  ".vue": (m) => `<!-- ${m} -->`,
  ".svelte": (m) => `<!-- ${m} -->`,
  // Block comment /* */
  ".css": (m) => `/* ${m} */`,
  ".scss": (m) => `/* ${m} */`,
  ".less": (m) => `/* ${m} */`,
  // SQL / Lua / Haskell --
  ".sql": (m) => `-- ${m}`,
  ".lua": (m) => `-- ${m}`,
  ".hs": (m) => `-- ${m}`,
  // Batch REM
  ".bat": (m) => `REM ${m}`,
  ".cmd": (m) => `REM ${m}`
};
function makeSafeTaskAnnotation(filePath, anchor) {
  const ext = import_node_path3.default.extname(filePath).toLowerCase();
  const formatter = COMMENT_FORMATS[ext];
  if (!formatter) {
    return null;
  }
  return "\n\n" + formatter(`\u2316 anchor context: #${anchor.id} ${anchor.title} (${anchor.priority.toUpperCase()})`);
}
function renderColdStartAnchorsContext(store, cwdOrNow, nowArg) {
  let cwd;
  let now = Date.now();
  if (typeof cwdOrNow === "number") {
    now = cwdOrNow;
  } else if (typeof cwdOrNow === "string") {
    cwd = cwdOrNow;
    if (typeof nowArg === "number") {
      now = nowArg;
    }
  }
  sweepStore(store, now);
  const activeAnchors = store.list({ status: "active", cwd });
  if (activeAnchors.length === 0) {
    return "";
  }
  const lines = activeAnchors.map((a) => {
    const fileHint = a.files.length > 0 ? ` (${a.files.slice(0, 2).join(", ")})` : "";
    const tagHint = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
    const projHint = a.cwd ? `[${a.project}]` : "[global]";
    let targetHint = "";
    if (a.recurrence === "daily") {
      targetHint = " [\u4ECA\u65E5\u5FAA\u73AF\xB7Daily]";
    } else if (a.targetDate) {
      const todayStr = getTodayDateString(now);
      if (a.targetDate === todayStr) {
        targetHint = " [\u4ECA\u65E5\u805A\u7126\xB7Due Today]";
      } else if (a.targetDate < todayStr) {
        targetHint = " [\u5DF2\u903E\u671F\xB7Overdue]";
      } else {
        targetHint = ` [\u6392\u671F:${a.targetDate}]`;
      }
    } else {
      targetHint = " [\u957F\u671F\u613F\u666F\xB7Someday]";
    }
    const ageDays = Math.floor((now - a.createdAt) / (24 * 60 * 60 * 1e3));
    const ageHint = ageDays > 0 ? ` (${ageDays}d old)` : "";
    return `\u2022 #${a.id} ${projHint}${targetHint} [${a.priority.toUpperCase()}] ${a.title}${ageHint}${tagHint}${fileHint}`;
  });
  return [
    `<active-anchors count="${activeAnchors.length}">`,
    `Unfinished cross-session commitments from previous sessions:`,
    lines.join("\n"),
    ``,
    `CONVERSATIONAL PROTOCOL (HUMAN PARTNER TONE):`,
    `- If the user opens the session with a casual greeting or continuation ("hi", "\u5728\u5417", "\u7EE7\u7EED", "\u65E9\u4E0A\u597D"), naturally prioritize items tagged [\u4ECA\u65E5\u805A\u7126\xB7Due Today] in a friendly assistant tone (e.g. "\u55E8\uFF01\u4ECA\u5929\u89C4\u5212\u7684\u3010...\u3011\u73B0\u5728\u5904\u7406\u8FD8\u662F\u770B\u522B\u7684\uFF1F").`,
    `- If the user issues a direct, concrete new instruction (e.g. "\u5E2E\u6211\u67E5\u4E0B\u8FD9\u4E2A\u62A5\u9519"), DO NOT interrupt their flow. Focus directly on their instruction.`,
    `- When a commitment is satisfied during work, automatically call anchor(action="settle", id=...) to clear it.`,
    `</active-anchors>`
  ].join("\n");
}

// src/settlement.ts
var import_node_child_process = require("child_process");
function runPhysicalVerification(anchor, cwd) {
  if (!anchor.verifyCommand) {
    return { success: false, output: "No verification command specified" };
  }
  try {
    const stdout = (0, import_node_child_process.execSync)(anchor.verifyCommand, {
      cwd,
      encoding: "utf-8",
      timeout: 3e4,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { success: true, output: stdout.trim() };
  } catch (err) {
    return { success: false, output: String(err.stderr || err.stdout || err.message).trim() };
  }
}
function generateSettlementProposals(store, touchedFiles, cwd) {
  const activeAndSleeping = store.list({ cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
  const matches = findMatchedAnchors(activeAndSleeping, touchedFiles);
  const proposals = [];
  for (const match of matches) {
    const fileList = match.matchedFiles.slice(0, 3).join(", ");
    const moreSuffix = match.matchedFiles.length > 3 ? ` \u7B49 ${match.matchedFiles.length} \u4E2A\u6587\u4EF6` : "";
    proposals.push({
      anchor: match.anchor,
      matchedFiles: match.matchedFiles,
      reason: `\u672C\u6B21\u4F1A\u8BDD\u4FEE\u6539\u4E86 ${fileList}${moreSuffix}`,
      recommendedAction: match.score >= 0.85 ? "settle" : "defer"
    });
  }
  return proposals;
}

// src/tui.ts
var import_node_path4 = __toESM(require("path"), 1);
function classifyAnchor(anchor, now = Date.now()) {
  if (anchor.recurrence === "daily") {
    return "Habits";
  }
  if (!anchor.targetDate) {
    return "Backlog";
  }
  const todayStr = getTodayDateString(now);
  if (anchor.targetDate <= todayStr) {
    return "Today";
  }
  return "Upcoming";
}
function groupAnchorsByQuadrant(anchors, now = Date.now()) {
  const groups = {
    today: [],
    upcoming: [],
    habits: [],
    backlog: []
  };
  for (const a of anchors) {
    const q = classifyAnchor(a, now);
    if (q === "Today") groups.today.push(a);
    else if (q === "Upcoming") groups.upcoming.push(a);
    else if (q === "Habits") groups.habits.push(a);
    else groups.backlog.push(a);
  }
  return groups;
}
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
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
function truncateToWidth(str, maxWidth, ellipsis = "\u2026") {
  const current = getDisplayWidth(str);
  if (current <= maxWidth) return str;
  const ellipsisWidth = getDisplayWidth(ellipsis);
  const target = maxWidth - ellipsisWidth;
  if (target <= 0) return ellipsis.slice(0, maxWidth);
  let accumulated = "";
  let accumWidth = 0;
  for (const char of str) {
    const charWidth = getDisplayWidth(char);
    if (accumWidth + charWidth > target) {
      break;
    }
    accumulated += char;
    accumWidth += charWidth;
  }
  return accumulated + ellipsis;
}
function padToWidth(str, targetWidth) {
  const truncated = truncateToWidth(str, targetWidth);
  const current = getDisplayWidth(truncated);
  if (current >= targetWidth) return truncated;
  return truncated + " ".repeat(targetWidth - current);
}
function formatTargetDate(anchor, now = Date.now()) {
  if (anchor.recurrence === "daily") {
    return "Daily";
  }
  if (!anchor.targetDate) {
    return "Someday";
  }
  const todayStr = getTodayDateString(now);
  if (anchor.targetDate === todayStr) {
    return "Today";
  }
  const MS_DAY = 24 * 60 * 60 * 1e3;
  const tomorrowStr = getTodayDateString(now + MS_DAY);
  if (anchor.targetDate === tomorrowStr) {
    return "Tomorrow";
  }
  const in2dStr = getTodayDateString(now + 2 * MS_DAY);
  if (anchor.targetDate === in2dStr) {
    return "In 2d";
  }
  const in3dStr = getTodayDateString(now + 3 * MS_DAY);
  if (anchor.targetDate === in3dStr) {
    return "In 3d";
  }
  if (anchor.targetDate < todayStr) {
    return "Overdue";
  }
  const parts = anchor.targetDate.split("-");
  if (parts.length === 3) {
    return `${parts[1]}-${parts[2]}`;
  }
  return anchor.targetDate;
}
function formatCreationTime(timestamp, now = Date.now()) {
  const d = new Date(timestamp);
  const nowD = new Date(now);
  const pad = (n) => String(n).padStart(2, "0");
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const todayStr = getTodayDateString(now);
  const createdDayStr = getTodayDateString(timestamp);
  if (createdDayStr === todayStr) {
    return `Today ${timeStr}`;
  }
  const yesterdayStr = getTodayDateString(now - 24 * 60 * 60 * 1e3);
  if (createdDayStr === yesterdayStr) {
    return `Yesterday ${timeStr}`;
  }
  const mmdd = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (d.getFullYear() === nowD.getFullYear()) {
    return `${mmdd} ${timeStr}`;
  }
  return `${d.getFullYear()}-${mmdd}`;
}
function formatOrigin(anchor) {
  if (typeof anchor === "object") {
    if (!anchor.cwd) return anchor.project || "global";
    return import_node_path4.default.basename(anchor.cwd) || "global";
  }
  if (!anchor) return "global";
  return import_node_path4.default.basename(anchor) || "global";
}
function updateAnchorStatusBar(ctx, store) {
  if (!ctx.hasUI || !ctx.ui) return;
  const active = store.list({ status: "active", cwd: ctx.cwd });
  if (active.length === 0) {
    ctx.ui.setStatus("anchor", void 0);
    return;
  }
  ctx.ui.setStatus("anchor", `\u2316 ${active.length}`);
}
function updateStartupBanner(ctx, store) {
  if (!ctx.hasUI || !ctx.ui) return;
  const active = store.list({ status: "active", cwd: ctx.cwd });
  if (active.length === 0) {
    ctx.ui.setWidget("anchor-startup", void 0);
    return;
  }
  const groups = groupAnchorsByQuadrant(active);
  const sorted = [...groups.today, ...groups.upcoming, ...groups.habits, ...groups.backlog];
  const topItems = sorted.slice(0, 3);
  const factory = (_tui, theme) => ({
    render: (width) => {
      const maxTitleWidth = Math.max(16, width - 36);
      const fg = theme?.fg ? theme.fg.bind(theme) : (_c, text) => text;
      const lines = [
        fg("accent", `\u2316 Anchor \xB7 ${active.length} active commitments:`)
      ];
      for (let i = 0; i < topItems.length; i++) {
        const a = topItems[i];
        const num = (i + 1).toString().padStart(2, "0");
        const q = classifyAnchor(a);
        const tgt = formatTargetDate(a);
        const titlePadded = truncateToWidth(a.title, maxTitleWidth);
        lines.push(`  \u2022 ${fg("muted", `[${q}]`)}  ${fg("dim", num)} ${titlePadded} ${fg("dim", `(${tgt})`)}`);
      }
      if (sorted.length > 3) {
        lines.push(fg("dim", `  (+${sorted.length - 3} more \xB7 run /anchor to inspect)`));
      }
      return lines;
    },
    invalidate: () => {
    }
  });
  const content = ctx.ui?.theme ? factory : factory().render(80);
  ctx.ui.setWidget("anchor-startup", content, { placement: "aboveEditor" });
}
async function openAnchorDashboard(ctx, store) {
  if (!ctx.hasUI || !ctx.ui) return;
  const list = store.list({ status: "active", cwd: ctx.cwd });
  if (list.length === 0) {
    ctx.ui.notify("\u2316 No active anchors. Use /pin <task> to record.", "info");
    return;
  }
  const groups = groupAnchorsByQuadrant(list);
  const sortedList = [
    ...groups.today,
    ...groups.upcoming,
    ...groups.habits,
    ...groups.backlog
  ];
  const optionMap = /* @__PURE__ */ new Map();
  const displayOptions = [];
  for (let i = 0; i < sortedList.length; i++) {
    const a = sortedList[i];
    const num = (i + 1).toString().padStart(2, "0");
    const category = padToWidth(`[${classifyAnchor(a)}]`, 12);
    const origin = formatOrigin(a);
    const target = formatTargetDate(a);
    const created = formatCreationTime(a.createdAt);
    const titleWithFiles = a.files && a.files.length > 0 ? `${a.title} [${a.files.slice(0, 1).join(", ")}]` : a.title;
    const colNum = `${num}  `;
    const colTitle = padToWidth(titleWithFiles, 34);
    const colOrigin = padToWidth(origin, 10);
    const colTarget = padToWidth(target, 12);
    const colCreated = created;
    const label = `${colNum}${category}${colTitle}  ${colOrigin}  ${colTarget}  ${colCreated}`.trimEnd();
    optionMap.set(label, a);
    displayOptions.push(label);
  }
  const selected = await ctx.ui.select("\u2316 Anchors (enter to complete):", displayOptions);
  if (!selected) return;
  const anchor = optionMap.get(selected);
  if (!anchor) return;
  store.settle(anchor.id, { settledBy: "manual-command" });
  const successMsg = anchor.recurrence === "daily" ? `\u2316 Completed for today: "${anchor.title}" (resets tomorrow)` : `\u2316 Settled: "${anchor.title}"`;
  ctx.ui.notify(successMsg, "info");
  updateAnchorStatusBar(ctx, store);
}

// src/extension.ts
var import_node_child_process2 = require("child_process");
var MUTATION_TOOLS2 = /* @__PURE__ */ new Set(["edit", "write", "patch", "apply_diff", "create_file", "modify"]);
function extension_default(pi) {
  const store = new AnchorStore();
  const observer = new SessionTouchObserver();
  const annotatedThisSession = /* @__PURE__ */ new Set();
  pi.on("session_start", async (event, ctx) => {
    observer.clear();
    annotatedThisSession.clear();
    const sweep = sweepStore(store);
    if (sweep.transitionedToSleeping.length > 0) {
      ctx.ui.notify(`Anchor: ${sweep.transitionedToSleeping.length} \u4E2A\u975E\u6D3B\u8DC3\u4EFB\u52A1\u5DF2\u8FDB\u5165\u4F11\u7720`, "info");
    }
    updateAnchorStatusBar(ctx, store);
    if (event.reason !== "resume") {
      updateStartupBanner(ctx, store);
    }
  });
  pi.on("agent_start", async (_event, ctx) => {
    if (ctx.hasUI && ctx.ui) {
      ctx.ui.setWidget("anchor-startup", void 0);
    }
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const entries = ctx.sessionManager?.getEntries() || [];
    const messageTurns = entries.filter((e) => e.type === "message");
    const isColdStart = messageTurns.length <= 1;
    if (isColdStart) {
      const contextSnippet = renderColdStartAnchorsContext(store, ctx.cwd);
      if (contextSnippet) {
        return {
          systemPrompt: `${event.systemPrompt}

${contextSnippet}`
        };
      }
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    if (!event.isError) {
      observer.recordToolCall(event.toolName, event.input || {});
    }
    const pathInput = event.input?.path;
    if (typeof pathInput !== "string") return;
    const touchedPath = normalizePath(pathInput);
    const anchors = store.list({ cwd: ctx.cwd }).filter((a) => a.status === "active" || a.status === "sleeping");
    const matches = findMatchedAnchors(anchors, [touchedPath]);
    if (matches.length > 0) {
      const isMutation = MUTATION_TOOLS2.has((event.toolName || "").toLowerCase());
      if (isMutation && !event.isError) {
        for (const m of matches) {
          store.touch(m.anchor.id);
        }
        updateAnchorStatusBar(ctx, store);
      }
      const a = matches[0].anchor;
      if (!annotatedThisSession.has(a.id)) {
        annotatedThisSession.add(a.id);
        const alert = makeSafeTaskAnnotation(touchedPath, a);
        if (alert) {
          const contents = [...event.content || []];
          for (let i = contents.length - 1; i >= 0; i--) {
            const item = contents[i];
            if (item && item.type === "text") {
              contents[i] = { ...item, text: item.text + alert };
              return { content: contents };
            }
          }
        }
      }
    }
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const gitStatus = (0, import_node_child_process2.execSync)("git status --porcelain", {
        cwd: ctx.cwd,
        encoding: "utf-8",
        timeout: 3e3,
        stdio: ["ignore", "pipe", "ignore"]
      });
      const changed = gitStatus.split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
      for (const f of changed) {
        observer.addTouchedFile(f);
      }
    } catch {
    }
    const modified = observer.getModifiedFiles();
    if (modified.length === 0) return;
    const proposals = generateSettlementProposals(store, modified, ctx.cwd);
    if (proposals.length === 0) return;
    for (const prop of proposals) {
      const a = prop.anchor;
      const commitMatch = observer.matchesCommit(a);
      if (commitMatch.matched) {
        store.settle(a.id, {
          settledBy: "verification-test",
          summary: `Auto-settled via Git commit: ${commitMatch.message}`,
          touchedFiles: prop.matchedFiles
        });
        ctx.ui.notify(`\u2316 Auto-settled #${a.id} via Git commit (run /anchor undo to revert)`, "info");
        continue;
      }
      if (a.verifyCommand) {
        const verifyRes = runPhysicalVerification(a, ctx.cwd);
        if (verifyRes.success) {
          store.settle(a.id, {
            settledBy: "verification-test",
            summary: `Automated test passed: ${a.verifyCommand}`,
            touchedFiles: prop.matchedFiles
          });
          ctx.ui.notify(`\u2316 Test passed (${a.verifyCommand}), auto-settled #${a.id}`, "info");
          continue;
        }
      }
      if (!ctx.hasUI || !ctx.ui) continue;
      const ok = await ctx.ui.confirm(
        "\u2316 Settle Anchor Task",
        `Task #${a.id} [${a.title}] touched files (${prop.matchedFiles.slice(0, 2).join(", ")}).
Mark as completed and archive?`
      );
      if (ok) {
        store.settle(a.id, {
          settledBy: "one-tap-settlement",
          touchedFiles: prop.matchedFiles
        });
        ctx.ui.notify(`\u2316 Settled #${a.id}: "${a.title}"`, "info");
      }
    }
  });
  pi.registerTool({
    name: "anchor",
    label: "Anchor (Cross-session Task Protocol)",
    description: "Manage cross-session persistent tasks that survive terminal restarts and auto-evict upon code changes or settlement. Use when the user asks to retain, pin, remember, or track a multi-session goal across sessions, or when an ongoing commitment must not be forgotten. Actions: pin (create new cross-session anchor), list (view active and sleeping anchors), settle (close and archive a completed anchor), touch (refresh activity), sweep (run decay cleanup). Stored in ~/.anchor/ with zero project repository pollution.",
    promptSnippet: "Anchor cross-session task contracts that survive terminal restarts and auto-evict",
    promptGuidelines: [
      'Use `anchor` when the user asks to retain a goal across sessions or record a reminder for later/tonight/tomorrow (e.g. "\u665A\u4E0A\u6E05\u7406\u5783\u573E", "\u660E\u5929\u4F18\u5316X", "\u4FDD\u7559\u4EFB\u52A1\u76F4\u5230\u5B8C\u6210").',
      "BOUNDARY WITH TODO: `todo` is strictly for intra-session active work breakdown (step 1, step 2, step 3 right now). For future reminders or cross-session goals, ONLY use `anchor`. NEVER duplicate a cross-session reminder into both `todo` and `anchor`.",
      "DO NOT over-engineer or assume automated scheduled tasks unless the user explicitly requests Windows Task Scheduler or cron.",
      "Tasks are automatically scoped to the current project context without cluttering the project git repository.",
      'When code for an anchor is completed and verified, call `anchor` with action "settle" to archive it and free context.',
      "Active anchors are automatically injected into future sessions in an ultra-compact block."
    ],
    parameters: import_typebox.Type.Object({
      action: import_typebox.Type.Union([
        import_typebox.Type.Literal("pin"),
        import_typebox.Type.Literal("list"),
        import_typebox.Type.Literal("settle"),
        import_typebox.Type.Literal("touch"),
        import_typebox.Type.Literal("sweep")
      ]),
      title: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Short imperative task title (for pin)" })),
      description: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Detailed context, acceptance criteria, or technical notes" })),
      priority: import_typebox.Type.Optional(import_typebox.Type.Union([import_typebox.Type.Literal("p0"), import_typebox.Type.Literal("p1"), import_typebox.Type.Literal("p2")])),
      project: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Target project name or workspace (defaults to current directory if omitted)" })),
      targetDate: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Expected completion date (e.g. YYYY-MM-DD, today, tomorrow)" })),
      files: import_typebox.Type.Optional(import_typebox.Type.Array(import_typebox.Type.String(), { description: "Associated file paths or directory prefixes" })),
      tags: import_typebox.Type.Optional(import_typebox.Type.Array(import_typebox.Type.String(), { description: "Domain tags" })),
      verifyCommand: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Optional shell command for automated physical verification" })),
      id: import_typebox.Type.Optional(import_typebox.Type.String({ description: "Anchor ID, e.g. anc-1 (for settle or touch)" }))
    }),
    renderCall(args, theme) {
      const action = args.action || "list";
      let title = theme.fg("toolTitle", theme.bold("\u2316 anchor ")) + theme.fg("accent", action);
      if (action === "pin" && args.title) {
        const due = args.targetDate ? ` ${theme.fg("dim", `[${args.targetDate}]`)}` : "";
        const files = args.files && args.files.length > 0 ? ` ${theme.fg("muted", `(${args.files.slice(0, 2).join(", ")})`)}` : "";
        title += ` "${args.title}"${due}${files}`;
      } else if (action === "settle" && args.id) {
        title += ` ${theme.fg("dim", `#${args.id}`)}`;
      } else if (action === "touch" && args.id) {
        title += ` ${theme.fg("dim", `#${args.id}`)}`;
      } else if (action === "list") {
        if (args.priority) title += ` ${theme.fg("muted", `[${args.priority}]`)}`;
      }
      return {
        render: () => [title],
        invalidate: () => {
        }
      };
    },
    renderResult(result, _options, theme) {
      if (result.isError) {
        const errText = result.content?.[0]?.text || "Execution failed";
        return {
          render: () => [theme.fg("error", `\u2717 ${errText}`)],
          invalidate: () => {
          }
        };
      }
      const text = result.content?.[0]?.text || "OK";
      return {
        render: () => [theme.fg("success", `\u2714 ${text}`)],
        invalidate: () => {
        }
      };
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx) return { content: [{ type: "text", text: "Error: context required" }], isError: true };
      if (params.action === "pin") {
        if (!params.title) {
          return { content: [{ type: "text", text: "Error: title is required for pin action" }], isError: true };
        }
        const anc = store.create({
          title: params.title,
          description: params.description,
          priority: params.priority || "p1",
          project: params.project,
          targetDate: params.targetDate,
          cwd: ctx.cwd,
          files: params.files || [],
          tags: params.tags || [],
          verifyCommand: params.verifyCommand
        });
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{
            type: "text",
            text: `Successfully anchored task #${anc.id}: "${anc.title}" [${anc.project}]. Stored in ~/.anchor/.`
          }],
          isError: false
        };
      }
      if (params.action === "list") {
        const active = store.list({ status: "active", cwd: ctx.cwd });
        const sleeping = store.list({ status: "sleeping", cwd: ctx.cwd });
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ active, sleeping }, null, 2)
          }],
          isError: false
        };
      }
      if (params.action === "settle") {
        if (!params.id) {
          return { content: [{ type: "text", text: "Error: id is required for settle action" }], isError: true };
        }
        try {
          const settled = store.settle(params.id, { settledBy: "verification-test" });
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{
              type: "text",
              text: `Anchor #${settled.id} successfully settled and evicted from active context.`
            }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "touch") {
        if (!params.id) {
          return { content: [{ type: "text", text: "Error: id is required for touch action" }], isError: true };
        }
        try {
          const touched = store.touch(params.id);
          updateAnchorStatusBar(ctx, store);
          return {
            content: [{
              type: "text",
              text: `Anchor #${touched.id} touched and decay timer refreshed.`
            }],
            isError: false
          };
        } catch (err) {
          return { content: [{ type: "text", text: err.message }], isError: true };
        }
      }
      if (params.action === "sweep") {
        const res = sweepStore(store);
        updateAnchorStatusBar(ctx, store);
        return {
          content: [{
            type: "text",
            text: `Sweep complete: ${res.transitionedToSleeping.length} sleeping, ${res.evictedToGraveyard.length} evicted to graveyard.`
          }],
          isError: false
        };
      }
      return { content: [{ type: "text", text: "Unknown action" }], isError: true };
    }
  });
  pi.registerCommand("anchor", {
    description: "Inspect and settle active anchors",
    handler: async (args, ctx) => {
      const input = (args || "").trim();
      if (!input || input === "list" || input === "ls") {
        await openAnchorDashboard(ctx, store);
        return;
      }
      if (input === "undo") {
        try {
          const restored = store.undoSettle();
          ctx.ui.notify(`\u2316 Restored #${restored.id}: "${restored.title}"`, "info");
          updateAnchorStatusBar(ctx, store);
        } catch (err) {
          ctx.ui.notify(`Revert failed: ${err.message}`, "error");
        }
        return;
      }
      const targetId = input.startsWith("#") ? input.slice(1) : input;
      const item = store.get(targetId);
      if (item) {
        store.settle(targetId, { settledBy: "manual-command" });
        ctx.ui.notify(`\u2316 Settled: "${item.title}"`, "info");
        updateAnchorStatusBar(ctx, store);
        return;
      }
      const anc = store.create({ title: input, cwd: ctx.cwd });
      ctx.ui.notify(`\u2316 Pinned #${anc.id}: "${anc.title}"`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
  pi.registerCommand("pin", {
    description: "Quickly pin a task across sessions",
    handler: async (args, ctx) => {
      const title = (args || "").trim();
      if (!title) {
        await openAnchorDashboard(ctx, store);
        return;
      }
      const anc = store.create({ title, cwd: ctx.cwd });
      ctx.ui.notify(`\u2316 Pinned #${anc.id}: "${anc.title}"`, "info");
      updateAnchorStatusBar(ctx, store);
    }
  });
}
