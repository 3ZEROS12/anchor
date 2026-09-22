# ⚓ Anchor (任务锚)

<p align="center">
  <strong>专为 AI 编码会话设计的零污染、上下文感知、自动承兑跨会话任务协议。</strong><br>
  <em>清理膨胀的 AGENTS.md。跨会话保持追踪，上下文拒绝冗余。</em>
</p>

<p align="center">
  <a href="README.md">English Documentation</a> •
  <a href="#-设计背景与工程痛点">💡 工程背景</a> •
  <a href="#-三大运行机制">✨ 核心机制</a> •
  <a href="#-同类方案横向对标">📊 横向对比</a> •
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

## 💡 设计背景与工程痛点

日常使用终端 AI 编程助手（Claude Code、Pi、Cursor、Aider）时，开发者普遍面临三项工程摩擦：

1. **终端退出即状态丢失（Session State Loss）**：按下 `Ctrl+C` 退出终端，多轮探索中的架构意图和待办承诺随之消散。
2. **上下文持久化膨胀（Context Bloat）**：将任务写入 `AGENTS.md` 或 `TODO.md`，两周后文件往往堆积数百行陈旧记录。每次请求均被动消耗数千 Token。
3. **人工勾选闭环失效（Manual Ticking Failure）**：多数重构与排查任务缺乏自动化校验脚本。依赖开发者事后手动修改 Markdown 文件打勾，往往导致任务长期滞留。

Anchor 将跨会话任务定义为自带生命周期与验讫机制的承兑契约：关联具体文件路径，触碰代码时唤醒提示，退出会话时就地核验，超时未推进自动休眠脱落。

---

## ✨ 三大运行机制

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           Anchor 任务生命周期状态机                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ 用户或 Agent 挂锚：/pin "重构鉴权"
                                     ▼
             ┌───────────────────────────────────────────────┐
             │            [活跃期 ACTIVE] (0 ~ 3 天)         │
             │ - 终端状态栏显示: ⚓ ● 1 active                │
             │ - 仅向 System Prompt 注入 2 行紧凑标头        │
             └───────┬───────────────────────────────┬───────┘
                     │                               │
        相关代码被修改│                               │ 连续 3 天未触碰
        (File Touch) ▼                               ▼
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│ [关门贴脸一键结案]           │            │    [休眠期 SLEEPING] (4 ~ 7 天) │
│ 会话退出时弹出结案单：       │            │ - 物理移出 System Prompt        │
│ 按下 [回车] 立即结案归档     │            │ - 消耗 Token 严格为 0           │
└──────────────┬───────────────┘            └────────────────┬────────────────┘
               │                                             │
               │ 确认结案                                     │ 超过 14 天未唤醒
               ▼                                             ▼
┌──────────────────────────────┐            ┌─────────────────────────────────┐
│      [已结案 SETTLED]        │            │        [墓园档案 GRAVEYARD]     │
│ 写入 archive.jsonl 归档      │            │ 移出活动状态库，避免陈旧累积     │
└──────────────────────────────┘            └─────────────────────────────────┘
```

### 1. 关门贴脸一键结案 (One-Tap Settlement at Exit)
开发者退出终端时往往不会主动清理任务列表。
Anchor 在捕获到 `/exit` 命令或退出信号时，读取本次会话修改的文件列表。若修改范围命中活跃锚点，直接在终端当前行输出交互核验卡：

```text
───────────────────────────────────────────────────────────────────
⚓ 关门结案提议 | Anchor Settlement
   任务 #anc-1: 修复鉴权模块 Cookie 泄露 [P0]
   证据触发: 本次修改了 src/auth/login.ts, src/auth/jwt.ts
   [Enter 确认结案并归档]  /  [Tab 暂未完成，继续挂起]
───────────────────────────────────────────────────────────────────
```
会话退出时按下回车，任务完成并即刻归档，上下文即时释放。

### 2. 意图触碰唤醒 (Context-Aware Resurface)
未触碰的锚点不干扰全局系统提示词。后续会话中调用 `read` 或 `edit` 读取对应路径（如 `src/auth/`）时，状态栏提示关联锚点存在：
> `💡 Anchor: 检测到查看 auth 目录，3 天前留下锚点 #anc-1，按 Tab 唤出看板。`

### 3. 遗忘半衰期自净 (Half-Life Decay & Auto-Sweep)
未完成且长期搁置的任务通过时间窗口自动降级：
* **0 至 3 天（活跃期）**：状态栏可见，系统提示词注入 2 行结构化标头。
* **4 至 7 天（休眠期）**：从系统提示词完全剥离，Token 占用降为 0。
* **14 天以上（墓园期）**：自动归档至 `.anchor/graveyard.jsonl`，主配置保持轻量。

---

## 📊 同类方案横向对标

| 维度 | `gastownhall/beads` (2.7w ⭐) | `engram` (6.7k ⭐) | `AGENTS.md` / `TODO.md` | **Anchor ⚓ (本项目)** |
| :--- | :--- | :--- | :--- | :--- |
| **底层定位** | 分布式 SQL 任务图谱 | 跨会话只读记忆库 | 静态 Markdown 纯文本 | **自消解跨会话承兑协议** |
| **外部依赖** | 依赖 Dolt 数据库 (200MB) | Go 编译二进制 + SQLite | 无 | **零外部依赖 (原生 TypeScript)** |
| **Token 消耗** | 需注入依赖图谱 | 注入历史事实段落 | 堆积历史未清理文本 | **活跃状态 2 行，休眠状态 0 行** |
| **结案机制** | 手动执行 close 命令 | 无任务生命周期 | 人工编辑源文件 | **退出会话时单键确认归档** |
| **衰变脱落** | 手动执行 prune 命令 | 无衰变机制 | 长期留存无衰减 | **内置 3/7/14 天阶梯自动脱落** |
| **终端集成** | 基础命令行输出 | 独立 TUI 界面 | 静态文本查看 | **状态栏常驻指示 + 交互驾驶舱** |

---

## 🛠️ 存储架构

采用写入临时文件后执行原子替换机制（`state.json.tmp.<pid>` 重命名覆盖），终端进程意外中断不损坏数据结构。

```
.anchor/
├── state.json           # 活跃与休眠状态（单文件体积 < 5KB）
├── archive.jsonl        # 已结案时间线记录（行分隔 JSON）
└── graveyard.jsonl      # 超期脱落记录（行分隔 JSON）
```

---

## 🚀 快速上手 (Pi 原生扩展)

将插件拷贝至 Pi 扩展目录：
```bash
cp -r projects/anchor ~/.pi/agent/extensions/anchor
```

在终端中输入命令调用：
```bash
/anchor               # 唤出终端交互式驾驶舱看板
/pin "修复鉴权 Bug"   # 快速建立任务锚点
/anchor sweep         # 手动触发半衰期衰变核验
```

---

## 🧪 自动化单元测试

基于 Node.js 原生测试运行器执行，无第三方测试框架依赖：

```bash
cd projects/anchor
npm test
```

```text
✔ ContextInjector - 仅注入活跃锚点，休眠任务消耗 0 Token (96ms)
✔ AnchorDecay - 半衰期状态迁移计算 (1.6ms)
✔ AnchorDecay - 自动清理与墓园脱落 (139ms)
✔ AnchorMatcher - 精确文件、目录前缀、领域标签匹配 (2.0ms)
✔ AnchorMatcher - 优先级加权排序 (0.5ms)
✔ SessionTouchObserver - 触碰文件与 Git Commit 被动感知 (1.6ms)
✔ AnchorStore - 原子化增删改查与文件落盘 (80ms)
✔ AnchorStore - 损坏状态安全恢复与隔离 (19ms)

ℹ 8 项测试全量通过
```

---

## 📄 开源协议

MIT License © [Jason Song](https://github.com/3ZEROS12)
