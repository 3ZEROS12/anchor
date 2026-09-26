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
var DEFAULT_DECAY_POLICY = {
  activeDays: 3,
  sleepDays: 7,
  graveyardDays: 14
};

// src/matcher.ts
import path from "path";
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\/\*\*\//g, "___GLOB_DIR_SLASH___").replace(/\*\*/g, "___GLOB_STAR_STAR___").replace(/\*/g, "[^/]*").replace(/___GLOB_DIR_SLASH___/g, "(?:/|/.+/)").replace(/___GLOB_STAR_STAR___/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function normalizePath(filePath, baseCwd) {
  if (typeof filePath !== "string") return "";
  let norm = filePath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (baseCwd && (path.isAbsolute(filePath) || norm.startsWith("/"))) {
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
import fs from "fs";
import path2 from "path";
import os from "os";
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
    return path2.resolve(process.env.ANCHOR_DIR);
  }
  const primaryDir = path2.join(os.homedir(), ".anchor");
  const legacyPiDir = path2.join(os.homedir(), ".pi", "agent", "anchors");
  if (!fs.existsSync(primaryDir) && fs.existsSync(legacyPiDir)) {
    try {
      fs.mkdirSync(primaryDir, { recursive: true });
      for (const file of ["state.json", "archive.jsonl", "graveyard.jsonl"]) {
        const src = path2.join(legacyPiDir, file);
        const dest = path2.join(primaryDir, file);
        if (fs.existsSync(src) && !fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
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
      const fd = fs.openSync(lockPath, "wx");
      const meta = { pid: process.pid, createdAt: Date.now() };
      fs.writeFileSync(fd, JSON.stringify(meta), "utf-8");
      fs.closeSync(fd);
      return () => {
        try {
          if (fs.existsSync(lockPath)) {
            fs.unlinkSync(lockPath);
          }
        } catch {
        }
      };
    } catch (err) {
      if (err.code === "EEXIST") {
        try {
          const content = fs.readFileSync(lockPath, "utf-8");
          const meta = JSON.parse(content);
          const isStale = Date.now() - meta.createdAt > staleTimeoutMs;
          const isDead = meta.pid && !isProcessAlive(meta.pid);
          if (isStale || isDead) {
            try {
              fs.unlinkSync(lockPath);
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
      fs.renameSync(tempPath, targetPath);
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
        if (fs.existsSync(tempPath)) fs.renameSync(tempPath, crashDump);
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
      this.storageDir = path2.resolve(customStorageDir);
    } else {
      this.storageDir = getDefaultStorageDir();
    }
    this.statePath = path2.join(this.storageDir, "state.json");
    this.archivePath = path2.join(this.storageDir, "archive.jsonl");
    this.graveyardPath = path2.join(this.storageDir, "graveyard.jsonl");
    this.ensureDirs();
  }
  get lockPath() {
    return path2.join(this.storageDir, "state.lock");
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
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch {
      }
    }
  }
  /**
   * Load store state. If corrupt or missing, returns safe default.
   */
  loadState() {
    this.ensureDirs();
    if (!fs.existsSync(this.statePath)) {
      return {
        version: 1,
        anchors: [],
        lastSweepAt: Date.now()
      };
    }
    let raw = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        raw = fs.readFileSync(this.statePath, "utf-8");
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
      const backupPath = path2.join(this.storageDir, `state.corrupt.${Date.now()}.json`);
      try {
        fs.renameSync(this.statePath, backupPath);
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
    const tempPath = path2.join(this.storageDir, `state.tmp.${process.pid}.${Date.now()}`);
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), "utf-8");
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
      const projectName = input.project ? input.project.trim() : cwd ? path2.basename(cwd) : "global";
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
        fs.appendFileSync(this.archivePath, JSON.stringify({ ...anchor, settledForDate: today }) + "\n", "utf-8");
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
      fs.appendFileSync(this.archivePath, JSON.stringify(settled) + "\n", "utf-8");
      this.saveState(state);
      return settled;
    });
  }
  /**
   * Reverse/undo the last settled anchor, popping it from archive.jsonl back into state.json
   */
  undoSettle() {
    return this.withLock(() => {
      if (!fs.existsSync(this.archivePath)) {
        throw new Error("No archived anchors to undo");
      }
      const raw = fs.readFileSync(this.archivePath, "utf-8");
      const lines = raw.split("\n").filter(Boolean);
      if (lines.length === 0) {
        throw new Error("Archive is empty, nothing to undo");
      }
      const lastLine = lines.pop();
      const anchor = JSON.parse(lastLine);
      fs.writeFileSync(this.archivePath, lines.length > 0 ? lines.join("\n") + "\n" : "", "utf-8");
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
      fs.appendFileSync(this.graveyardPath, JSON.stringify(anchor) + "\n", "utf-8");
      this.saveState(state);
      return anchor;
    });
  }
  getArchive(filter) {
    if (!fs.existsSync(this.archivePath)) return [];
    try {
      const raw = fs.readFileSync(this.archivePath, "utf-8");
      const all = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
      if (filter?.all || !filter?.cwd) return all;
      const targetCwd = normalizePath(filter.cwd);
      return all.filter((a) => !a.cwd || a.cwd === targetCwd);
    } catch {
      return [];
    }
  }
  getGraveyard(filter) {
    if (!fs.existsSync(this.graveyardPath)) return [];
    try {
      const raw = fs.readFileSync(this.graveyardPath, "utf-8");
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
import fs2 from "fs";
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
    fs2.appendFileSync(store.graveyardPath, graveyardLines, "utf-8");
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
import path3 from "path";
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
  const ext = path3.extname(filePath).toLowerCase();
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
var renderActiveAnchorsContext = renderColdStartAnchorsContext;

// src/settlement.ts
import { execSync } from "child_process";
function runPhysicalVerification(anchor, cwd) {
  if (!anchor.verifyCommand) {
    return { success: false, output: "No verification command specified" };
  }
  try {
    const stdout = execSync(anchor.verifyCommand, {
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
function formatSettlementCard(proposal) {
  const a = proposal.anchor;
  const tagStr = a.tags.length > 0 ? ` [${a.tags.join(", ")}]` : "";
  const fileStr = proposal.matchedFiles.slice(0, 2).join(", ");
  return [
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
    `\u2693 \u5173\u95E8\u7ED3\u6848\u63D0\u8BAE | Anchor Settlement`,
    `   \u4EFB\u52A1 #${a.id}: ${a.title}${tagStr} (${a.priority.toUpperCase()})`,
    `   \u8BC1\u636E\u89E6\u53D1: \u4FEE\u6539\u4E86 ${fileStr}`,
    `   [Enter \u786E\u8BA4\u7ED3\u6848\u5E76\u5F52\u6863]  /  [Tab \u6682\u672A\u5B8C\u6210\uFF0C\u7EE7\u7EED\u6302\u8D77]`,
    `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`
  ].join("\n");
}

// src/tui.ts
import path4 from "path";
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
function formatRelativeTime(timestamp, now = Date.now()) {
  return formatCreationTime(timestamp, now);
}
function formatRemainingTtl(anchor, now = Date.now()) {
  return formatTargetDate(anchor, now);
}
function formatOrigin(anchor) {
  if (typeof anchor === "object") {
    if (!anchor.cwd) return anchor.project || "global";
    return path4.basename(anchor.cwd) || "global";
  }
  if (!anchor) return "global";
  return path4.basename(anchor) || "global";
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

export {
  EPHEMERAL_DECAY_POLICY,
  DURABLE_DECAY_POLICY,
  DEFAULT_DECAY_POLICY,
  globToRegExp,
  normalizePath,
  matchAnchorAgainstTouchedFiles,
  findMatchedAnchors,
  detectDurability,
  getEphemeralDecayPolicy,
  detectTargetDate,
  detectRecurrence,
  getTodayDateString,
  getDefaultStorageDir,
  acquireSyncLock,
  atomicRenameWithRetry,
  AnchorStore,
  SessionTouchObserver,
  evaluateAnchorDecay,
  sweepStore,
  COMMENT_FORMATS,
  makeSafeTaskAnnotation,
  renderColdStartAnchorsContext,
  renderActiveAnchorsContext,
  runPhysicalVerification,
  generateSettlementProposals,
  formatSettlementCard,
  classifyAnchor,
  groupAnchorsByQuadrant,
  stripAnsi,
  getDisplayWidth,
  truncateToWidth,
  padToWidth,
  formatTargetDate,
  formatCreationTime,
  formatRelativeTime,
  formatRemainingTtl,
  formatOrigin,
  updateAnchorStatusBar,
  updateStartupBanner,
  openAnchorDashboard
};
