# ⚓ Anchor (任务锚)

<p align="center">
  <strong>专为 AI 编程打造的零污染、上下文感知、自动承兑跨会话任务协议。</strong><br>
  <em>告别发霉膨胀的 AGENTS.md。跨会话绝不遗忘，上下文绝不发霉。</em>
</p>

<p align="center">
  <a href="README.md">English Documentation</a> •
  <a href="#-为什么需要-anchor现有工具的致命死穴">💡 核心痛点</a> •
  <a href="#-三大破局机制">✨ 三大机制</a> •
  <a href="#-全网同类方案横向对标">📊 横向对比</a> •
  <a href="#-快速上手">🚀 快速上手</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-v20+-brightgreen.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/依赖-零外部依赖-success.svg" alt="零外部依赖">
  <img src="https://img.shields.io/badge/测试-8项通过-brightgreen.svg" alt="8项通过">
  <img src="https://img.shields.io/badge/开源协议-MIT-orange.svg" alt="License: MIT">
</p>

---

## 💡 为什么需要 Anchor？现有工具的致命死穴

每一位深度使用 AI 编程助手（Claude Code、Pi、Cursor、Aider）的开发者，每天都在承受三个不可调和的折磨：

1. **阿尔茨海默虚无（Alzheimer's Void）**：一旦按下 `Ctrl+C` 退出终端，AI 瞬间失忆，昨天定下的重构目标和多轮承诺烟消云散；
2. **文本发霉与 Token 勒索（Markdown Rot）**：为了让它记住，你只能把任务塞进 `AGENTS.md` 或 `TODO.md`。两周后堆积成数百行过时废话，每次发请求都白白烧掉几千个 Token；
3. **完成确认的逻辑自欺（The Completion Paradox）**：现实中 80% 的任务（重构、排查、梳理）根本没有自动化单元测试。期待人类在写完代码后“自觉跑去 Markdown 打勾”，是逆人性的幻想。

**Anchor 的核心哲学：不把任务当“静态死清单（Todo List）”，而是当做「有生命周期的短期商业承兑汇票（Debt Settlement）」——有借有还，触碰唤醒，关门贴脸结案，过期自动沉淀。**

---

## ✨ 三大破局机制

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Anchor 任务生命周期状态机                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 用户或 Agent 挂锚：/pin "重构鉴权"
                                     ▼
             ┌───────────────────────────────────────────────┐
             │            [活跃期 ACTIVE] (0 ~ 3 天)         │
             │ - 终端底部状态胶囊: ⚓ ● 1 active              │
             │ - 仅向 System Prompt 注入 2 行极简承兑标头    │
             └───────┬───────────────────────────────┬───────┘
                     │                               │
        相关代码被修改│                               │ 连续 3 天未触碰
        (File Touch) ▼                               ▼
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│ [关门贴脸一键结案]           │            │    [休眠期 SLEEPING] (4 ~ 7 天) │
│ 会话退出时弹出结案单：       │            │ - 物理从 System Prompt 中剥离   │
│ 按下 [回车] ➔ 瞬间结案归档即焚│            │ - 消耗 Token 严格为 0           │
└──────────────┬───────────────┘            └────────────────┬────────────────┘
               │                                             │
               │ 确认结案                                     │ 超过 14 天未唤醒
               ▼                                             ▼
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│      [已结案 SETTLED]        │            │        [墓园档案 GRAVEYARD]     │
│ 归档沉淀至 archive.jsonl     │            │ 自动脱落移出主库，永不发霉       │
└──────────────────────────────┘            └─────────────────────────────────┘
```

### 1. 🚪 关门贴脸一键结案 (One-Tap Settlement at Exit)
开发者写完代码只想关电脑，绝不会记得去勾选任务。  
Anchor 在你敲下 `/exit` 或按 `Ctrl+C` 退出会话的瞬间，自动扫描本次修改的文件。若命中关联任务，直接贴脸弹出一键结案卡：
```text
───────────────────────────────────────────────────────────────────
⚓ 关门结案提议 | Anchor Settlement
   任务 #anc-1: 修复鉴权模块 Cookie 泄露 [P0]
   证据触发: 本次修改了 src/auth/login.ts, src/auth/jwt.ts
   [Enter 确认结案并归档]  /  [Tab 暂未完成，继续挂起]
───────────────────────────────────────────────────────────────────
```
不需要敲命令、不需要翻文件，**在刚刚写完代码的高峰体验时刻顺手按一下回车**，完成即焚。

### 2. ⚡ 意图触碰唤醒 (Context-Aware Resurface)
活跃任务绝不在全局提示词里刷屏。只有当你或 Agent 在后续会话中触碰到关联目录时（例如 `read` 了 `src/auth/`），底部状态栏才会亮起提醒：
> `💡 Anchor: 检测到你正在查看 auth 目录，3 天前曾留下锚点 #anc-1，按 Tab 唤出看板。`

### 3. ⏳ 遗忘半衰期自净 (Half-Life Decay & Auto-Sweep)
被你放弃或遗忘的任务，永远不会变成发霉的垃圾：
* **0 ~ 3 天（活跃期）**：底部胶囊可见，注入 2 行极简标头；
* **4 ~ 7 天（休眠期）**：物理切断系统提示词注入，**消耗 Token 为 0**；
* **14 天以上（墓园期）**：自动移入 `.anchor/graveyard.jsonl`，保持工作区绝对整洁。

---

## 📊 全网同类方案横向对标

| 维度 | `gastownhall/beads` (2.7w ⭐) | `engram` (6.7k ⭐) | `AGENTS.md` / `TODO.md` | **Anchor ⚓ (本项目)** |
| :--- | :--- | :--- | :--- | :--- |
| **底层定位** | 分布式 SQL 任务图谱 | 跨会话只读记忆大脑 | 静态 Markdown 纯文本 | **自动即焚的跨会话承兑协议** |
| **外部依赖** | 极重（200MB 的 Dolt 数据库） | Go 编译二进制 + SQLite | 无 | **零外部依赖（纯原生 TypeScript）** |
| **Token 消耗** | 中等（需注入完整图谱） | 高（注入大段历史事实） | 极高（上千行发霉历史死文本）| **极简（活跃期 2 行，休眠期 0 行）** |
| **关门结案** | ❌ 无（必须手动敲 close 命令）| ❌ 无任务生命周期 | ❌ 无（人肉删减文本） | **✅ 退出会话时贴脸一键回车结案** |
| **自净半衰期** | ❌ 无（手动 prune） | ❌ 无衰变 | ❌ 无（永久腐烂） | **✅ 内置 3/7/14 天半衰期自动脱落** |
| **终端体验** | 基础命令行输出 | Catppuccin 静态 TUI | 纯文本编辑 | **状态行微光胶囊 + 交互式驾驶舱** |

---

## 🛠️ 存储架构

采用原子文件替换写入（`state.json.tmp.<pid>` ➔ `renameSync`），即使终端被强制 Kill，也绝不损坏 JSON 状态。

```
.anchor/
├── state.json           # 活跃与休眠状态（单文件通常 < 5KB）
├── archive.jsonl        # 已结案时间线（追加日志）
└── graveyard.jsonl      # 超期脱落墓园（沉淀备查）
```

---

## 🚀 快速上手 (Pi 原生扩展)

1. 将插件软链接或拷贝至 Pi 扩展目录：
```bash
cp -r projects/anchor ~/.pi/agent/extensions/anchor
```

2. 打开终端，直接敲命令使用：
```bash
/anchor               # 唤出终端交互式驾驶舱看板
/pin "修复鉴权 Bug"   # 一键快速落锚
/anchor sweep         # 手动触发半衰期清理
```

---

## 🧪 严密自动化单元测试

纯标准库原生实现，全链路 8 项核心测试 360ms 秒级通过：

```bash
cd projects/anchor
npm test
```

```text
✔ ContextInjector - 仅注入活跃锚点，休眠任务消耗 0 Token (107ms)
✔ AnchorDecay - 半衰期状态迁移计算 (1.4ms)
✔ AnchorDecay - 自动清理与墓园脱落 (149ms)
✔ AnchorMatcher - 精确文件、目录前缀、领域标签匹配 (2.6ms)
✔ AnchorMatcher - 优先级加权排序 (0.5ms)
✔ SessionTouchObserver - 触碰文件与 Git Commit 被动感知 (1.6ms)
✔ AnchorStore - 原子化增删改查与文件落盘 (76ms)
✔ AnchorStore - 损坏状态安全恢复与隔离 (4.5ms)

ℹ 8 项测试全量通过 (总耗时 363ms)
```

---

## 📄 开源协议

MIT License © [Jason Song](https://github.com/3ZEROS12)
