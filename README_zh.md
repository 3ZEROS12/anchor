# ⌖ Anchor

<p align="center">
  <strong>面向 AI 编程智能体的零污染、上下文感知、自消解跨会话任务协议。</strong><br>
  <em>拒绝发霉膨胀的 AGENTS.md。用 0 Token 闲置损耗与 0 仓库文件污染，守住多轮会话工程意图。</em>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <a href="#-核心痛点">💡 核心痛点</a> •
  <a href="#-核心机制">✨ 核心机制</a> •
  <a href="#-界面设计">🖥️ 界面设计</a> •
  <a href="#-竞品对比">📊 竞品对比</a> •
  <a href="#-快速开始">🚀 快速开始</a>
</p>

<p align="center">
  <a href="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml">
    <img src="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg" alt="CI 状态">
  </a>
  <img src="https://img.shields.io/badge/Node-v20+-brightgreen.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-blue.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Tests-13%20通过-brightgreen.svg" alt="Tests: 13 Passed">
  <img src="https://img.shields.io/badge/存储-零仓库污染-success.svg" alt="零仓库污染">
  <img src="https://img.shields.io/badge/开源协议-MIT-orange.svg" alt="License: MIT">
</p>

---

## 💡 核心痛点

使用终端 AI 编程智能体（Pi、Claude Code、Cursor、Aider）时，开发者普遍面临三大交互摩擦：

1. **会话遗忘症**：敲击 `Ctrl+C` 或关闭终端，当前的会话上下文立刻清空，前面积累的跨步重构目标与口头承诺全部丢失。
2. **提示词上下文膨胀**：将任务记入 `AGENTS.md` 或 `TODO.md`，不仅频繁污染 Git 提交历史，而且每轮交互都要给 Prompt 塞入几十行陈旧文本，白白浪费海量 Token。
3. **人工打勾负担重**：真实的重构任务很难一次性配齐完备的自动化单测，开发者写完代码后往往不会专程去翻 Markdown 文件打勾，未结案任务最终堆积发霉。

**Anchor** 将任务抽象为**自带闭环证据的自消解承兑单（Promissory Notes）**：
* **全局唯一安全存储**（`~/.pi/agent/anchors/`）—— 代码仓库内绝对不建 `.anchor/` 目录，0 文件污染。
* **0-Token 稳态控制**——首轮冷启动注入极简说明，后续所有正常对话轮次物理剔除（0 Token 消耗），仅在触碰相关代码时 JIT 唤醒。
* **凭物理证据结案**——Git Commit 语义感知、物理测试验讫跑通自动结案；退出时单键即焚划掉。
* **双轨生命周期**——临时随口一念（48小时无动作自动自净）vs 长期架构愿景（永久安全存续）。

---

## ✨ 核心机制

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Anchor 生命周期状态机                                  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ 记录任务: /pin "重构鉴权为 HttpOnly Cookie"
                                       ▼
               ┌───────────────────────────────────────────────┐
               │           [活跃期 ACTIVE] (首轮注入提示)        │
               │ - 底部状态栏微光准星: ⌖ 1                      │
               │ - 第 2 轮起完全剥离出提示词 (0 Token 稳态)      │
               └───────┬───────────────────────────────┬───────┘
                       │                               │
        Git 提交命中 /  │                               │ 闲置半衰期衰退
        触碰关联代码文件  ▼                               ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │      [JIT 代码注释级唤醒]     │            │    [休眠期 SLEEPING] (0 Token) │
  │ 触碰 src/auth/* 时优雅淡入:   │            │ 全局安全封存，不打扰当前心流，   │
  │ // ⌖ anchor context: #anc-1  │            │ 触碰代码时重新唤醒              │
  └──────────────┬───────────────┘            └────────────────┬───────────────┘
                 │                                             │
        关门承兑 / 自动匹配完成                                 │ 48小时超时 (临时备忘)
                 ▼                                             ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │     [结案归档 SETTLED]        │            │     [自动自净 GRAVEYARD]       │
  │ 追加写入 archive.jsonl 账本   │            │ 自动扫入墓园归档，绝不堆积发霉   │
  │ 物理从活跃上下文中即刻脱落    │            │                                │
  └──────────────────────────────┘            └────────────────────────────────┘
```

### 1. 绝对零仓库污染
Anchor 不会在你的工程目录中建立任何文件夹，也不会留下任何本地缓存。所有任务状态统一托管于用户全局目录：
```
~/.pi/agent/anchors/
├── state.json           # 活跃与休眠任务状态表 (< 10KB，原子化写入)
├── archive.jsonl        # 已结案归档的承兑历史账本
└── graveyard.jsonl      # 自动自净脱落的临时备忘墓园
```

### 2. 0-Token 稳态与 JIT 触碰唤醒
* **第 1 轮（冷启动）**：注入精简的未结清单与真人助手搭话协议。
* **第 2 轮及后续**：彻底从 System Prompt 中隐形，**0 Token 消耗**，不稀释大模型注意力。
* **代码触碰 JIT 唤醒**：当 Agent 在后续工作流中读取了相关文件（如 `src/auth/*`），Anchor 仅在工具结果末尾以单行极简代码注释形式淡入提示：
  ```text
  // ⌖ anchor context: #anc-1 重构鉴权为 HttpOnly Cookie (P0)
  ```

### 3. 双轨寿命契约（长短期分层）
* **短期临时备忘（`48h left`）**：针对“今晚”、“明天”、“稍后”等随口一说的临时事项，若 48 小时内未触碰自动无声脱落，绝不跨周死缠烂打。
* **长期架构愿景（常驻）**：针对核心重构、设计规划、日常习惯，永久存续，系统绝不擅自丢弃。

### 4. 零负担多源证据结案
* **Git 提交语义感知**：内置基于 `Intl.Segmenter` 的多语系分词引擎。例如敲入 `git commit -m "fix(auth): 修复鉴权 Cookie 泄露"` 时，自动识别并闭环结案 `#anc-1`。
* **会话关门贴脸结案**：当退出终端且本会话修改过关联代码时，触发一次单键确认：
  ```text
  ⌖ 跨会话任务结案提议
  任务 #anc-1 [重构鉴权模块] 关联的文件已在本会话中修改 (src/auth/jwt.ts)。
  是否标记已完成并结案归档？ [回车确认] / [Esc保留]
  ```
* **一键撤销（Undo）**：若发生误判，敲入 `/anchor undo` 瞬间逆向回滚恢复。

---

## 🖥️ 界面设计

遵循冷峻低饱和度的 Neovim / 极客终端呼吸感：

### 底部状态栏组件
* 无任务时：**100% 物理隐身**（0 字符，零干扰）。
* 有任务时：呈现极简准星专注标点：**`⌖ 1`**。

### 交互面板 (`/anchor`)
```text
⌖ Anchors (enter to complete):

> 01  明天吃香蕉                  · Desktop · 46h left · 2h ago
  02  每天吃一个苹果              · Desktop · 2h ago
  03  完成针对桌面的优化          · Desktop · 2h ago
  04  Refactor auth session      · backend · src/auth/* · 3h ago
```
* **上下键 + 回车**：直接划掉完成并释放上下文，无多级菜单困扰。
* **时间语义清晰正交**：`46h left`（未来自净倒计时） vs `2h ago`（过去创建时间）。

### 独立终端 CLI (`anchor`)
无需启动 AI 环境，在任何系统命令行中独立使用：
```bash
anchor                           # 查看待办清单
anchor "明天看下 PR #42"         # 记录新任务 (自动识别为 48h 临时备忘)
anchor done anc-1                # 划掉并归档任务
```

---

## 📊 竞品对比

| 对比维度 | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **底层架构** | 分布式 SQL 依赖图谱 | 向量与 SQLite 外部库 | 静态 Markdown 纯文本 | **轻量原子化自消解状态机** |
| **工作区清洁度** | 仓库内塞入 200MB Dolt 数据库 | 系统后台服务 | **频繁污染 Git 历史与引发冲突** | **100% 零仓库污染 (`~/.pi/agent/anchors/`)** |
| **Token 损耗** | 每轮中/高消耗 | 高（注入长文历史） | 极高（陈旧文本成倍累积） | **0 Token 稳态（仅文件触碰 JIT 唤醒）** |
| **结案闭环** | 人工命令 `close` | 无闭环概念 | 人工修改文本打勾 | **Git Commit 自动识别 + 关门单键承兑** |
| **衰减自净** | 手动 prune | 无衰退机制 | 长期堆积发霉 | **双轨自净（48小时极速自净 vs 长期常驻）** |
| **环境依赖** | 外部 Dolt 二进制 | 外部 Go 编译产物 | 无 | **零原生二进制外部依赖（纯 TS）** |

---

## 🚀 快速开始

### 安装

#### 1. 作为 Pi Coding Agent 扩展
```bash
# 在 ~/.pi/agent/extensions/ 目录下
npm install @3zeros12/anchor
```

#### 2. 全局独立命令行 CLI
```bash
npm install -g @3zeros12/anchor
```

---

## 🧪 自动化测试与质量保障

采用标准 Node 原生测试运行器，执行严格的类型检查与测试：

```bash
npm run build      # tsup 双格式打包 (ESM/CJS) 与 .d.ts 生成
npm run typecheck  # TypeScript 严格模式检查 (0 错误)
npm test           # 全套自动化单元测试
```

```text
✔ ContextInjector - 仅注入活跃锚点，休眠任务消耗 0 Token (64ms)
✔ AnchorDecay - 遗忘半衰期计算 (1.5ms)
✔ AnchorDecay - 自动退化与墓园清理 (142ms)
✔ AnchorMatcher - 精确文件、前缀、领域标签匹配 (5.6ms)
✔ AnchorMatcher - 通配符 Glob 模式匹配 (*.ts, src/**/*.ts) (1.1ms)
✔ AnchorMatcher - 置信度与优先级复合排序 (0.5ms)
✔ SessionTouchObserver - 工具调用与文件触碰监听 (32ms)
✔ SessionTouchObserver - 多语系 Git 提交语义分词匹配 (3ms)
✔ AnchorStore - 原子化增删改查与文件落盘 (90ms)
✔ AnchorStore - 状态损坏自动安全容灾恢复 (5.2ms)
✔ AnchorTUI - 状态栏准星组件 ⌖ N (31ms)
✔ AnchorTUI - 正交区分未来倒计时 (left) 与过去创建时间 (ago) (17ms)
✔ AnchorTUI - 极客面板排版与出处溯源 (42ms)

ℹ pass 13, fail 0 (455ms 全绿通过)
```

---

## 📄 开源许可

[MIT License](LICENSE) © 2025 [Jason Song (@3ZEROS12)](https://github.com/3ZEROS12)
