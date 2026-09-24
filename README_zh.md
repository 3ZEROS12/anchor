# ⌖ Anchor

<p align="center">
  <strong>面向 AI 编程智能体的零污染、上下文感知、自消解跨会话任务协议。</strong><br>
  <em>清理堆积发霉的任务清单。用 0 Token 闲置损耗与 0 仓库文件污染，守住多轮会话工程意图。</em>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <a href="#现实摩擦与痛点">💡 现实痛点</a> •
  <a href="#核心机制">✨ 核心机制</a> •
  <a href="#终端界面设计">🖥️ 界面设计</a> •
  <a href="#横向技术对比">📊 竞品对比</a> •
  <a href="#快速上手">🚀 快速开始</a>
</p>

<p align="center">
  <a href="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml">
    <img src="https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg" alt="CI 状态">
  </a>
  <img src="https://img.shields.io/badge/Node-v20+-22c55e.svg" alt="Node v20+">
  <img src="https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg" alt="TypeScript Strict">
  <img src="https://img.shields.io/badge/Tests-18%20通过-22c55e.svg" alt="Tests: 18 Passed">
  <img src="https://img.shields.io/badge/启动耗时-%3C%2090ms-success.svg" alt="启动耗时: < 90ms">
  <img src="https://img.shields.io/badge/存储-零仓库污染-success.svg" alt="零仓库污染">
  <img src="https://img.shields.io/badge/开源协议-MIT-f97316.svg" alt="License: MIT">
</p>

<p align="center">
  <img src="assets/hero.svg" alt="Anchor 终端极客仪表盘" width="820">
</p>

---

## 现实摩擦与痛点

在终端使用自主编程智能体时，开发者普遍面临三重工程阻力：

1. **会话遗忘**：按下 `Ctrl+C` 退出终端，内存上下文灰飞烟灭。未完成的代码重构约定与临时提醒全部丢失。
2. **上下文污染**：在工程根目录写 `TODO.md` 或 `AGENTS.md`，持续产生 Git 杂质提交。每轮会话都给系统提示词塞入几十行陈旧文本，消耗 Token 预算并分散模型注意力。
3. **人工维护成本**：完成功能开发后，开发者极少主动打开文档打勾。未处理项长期留存在代码仓库中，直至腐化。

现有解决方案各有沉重代价。`gastownhall/beads` 在代码仓库内塞入体积达 200MB 的 Dolt 关系型数据库，只为记录少量缺陷依赖。`Gentleman-Programming/engram` 启动常驻后台的 Go 守护进程，搭配 SQLite 与向量检索，带来持续的常驻进程消耗与跨进程通信开销。

Anchor 将跨会话任务定义为自带证据的自消解承兑单。它在保障跨会话记忆的同时，规避了仓库污染、常驻后台与闲置 Token 损耗。

---

## 核心机制

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Anchor 生命周期状态机                                  │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ 记录任务: /pin "重构鉴权为 HttpOnly Cookie"
                                       ▼
               ┌───────────────────────────────────────────────┐
               │           [活跃期 ACTIVE] (首轮注入提示)        │
               │ - 底部状态栏微光准星: ⌖ 4                      │
               │ - 第 2 轮起完全脱离提示词 (0 Token 稳态)        │
               └───────┬───────────────────────────────┬───────┘
                       │                               │
        Git 提交命中 /  │                               │ 闲置时间衰退
        触碰关联代码文件  ▼                               ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │      [JIT 代码注释级唤醒]     │            │    [休眠期 SLEEPING] (0 Token) │
  │ 触碰 src/auth/* 时优雅淡入:   │            │ 全局安全封存，不打扰当前心流，   │
  │ // ⌖ anchor context: #anc-1  │            │ 触碰代码时重新唤醒              │
  └──────────────┬───────────────┘            └────────────────┬───────────────┘
                 │                                             │
        关门承兑 / 自动匹配完成                                 │ 后台静默自净
                 ▼                                             ▼
  ┌──────────────────────────────┐            ┌────────────────────────────────┐
  │     [结案归档 SETTLED]        │            │     [自动脱落 GRAVEYARD]       │
  │ 追加写入 archive.jsonl 账本   │            │ 扫入墓园归档，防止长期发霉       │
  │ 物理从活跃上下文中脱落        │            │                                │
  └──────────────────────────────┘            └────────────────────────────────┘
```

### 1. 绝对零仓库污染
Anchor 不在被管理的代码工程内新建 `.anchor/` 目录，也不修改本地 Git 树。所有任务状态统一托管在用户主目录：
```text
~/.pi/agent/anchors/
├── state.json           # 活跃与休眠任务状态表（原子写入，< 10KB）
├── archive.jsonl        # 结案归档的承兑历史账本
└── graveyard.jsonl      # 衰减超期自动脱落的墓园账本
```

状态落盘采用临时文件（`state.tmp.${pid}.${timestamp}`）配合操作系统底层 `fs.renameSync` 原子替换，杜绝终端强制退出时的半截 JSON 文件撕裂。若读取时检测到损坏，自动留存备份并初始化空状态返回，确保终端会话永远稳定。

### 2. 0-Token 稳态与 JIT 触碰唤醒
* **第 1 轮（冷启动）**：通过 `before_agent_start` 识别会话轮次。在首轮为大模型注入当前工程未完成的契约概览与交互指引。
* **第 2 轮及后续**：彻底从 System Prompt 中隐形。正常工作轮次消耗 **0 Token**，不稀释大模型注意力。
* **代码触碰 JIT 唤醒**：当 Agent 在后续工作流中读取了相关文件（如 `src/auth/*`），Anchor 仅在工具结果末尾以单行极简代码注释形式淡入提示：
  ```text
  // ⌖ anchor context: #anc-1 重构鉴权为 HttpOnly Cookie (P0)
  ```
* **标签与物理路径解耦**：标签仅作为检索分类元数据，绝不参与文件路径匹配。无关联代码文件的任务（`files: []`）在工具读写时保持绝对静默，杜绝误报。

### 3. 正交双时轴与四象限认知看板
* **预期交付（`targetDate`）**：计划交工日期。自然语言词汇（今天、今晚、明天、后天、周五、下周一）自动折算为标准公历日期。界面呈现为 `Today`、`Tomorrow`、`In 2d`、`Daily`、`Someday`。
* **现场立项（`createdAt`）**：立项时的真实物理时间戳。界面呈现为 `Today 10:02`、`Yesterday 21:34`。

任务按认知象限结构化分组：
* **`[Today]`（今日聚焦 & 逾期）**：当前最优先攻坚项。
* **`[Upcoming]`（近期排期）**：明天、后天或指定截期的待办事项（支持 `--due friday`）。
* **`[Habits]`（每日循环）**：日常习惯循环打卡（如“每天吃一个苹果”）。当天完成隐身，明日零点自动复苏。
* **`[Backlog]`（长期愿景）**：无指定日期的宏观架构愿景（`Someday`）。

### 4. 多源凭据自消解闭环
* **Git 提交语义识别**：集成基于标准 `Intl.Segmenter` 的多语系分词引擎。提交信息（如 `git commit -m "fix(auth): 修复鉴权 Cookie 泄露"`）命中任务描述时自动结案。
* **退出单键贴脸承兑**：检测到本会话修改了关联代码时，在退出终端前触发单键确认：
  ```text
  ⌖ 跨会话任务结案提议
  任务 #anc-1 [重构鉴权模块] 关联的文件已在本会话中修改 (src/auth/jwt.ts)。
  是否标记已完成并结案归档？ [回车确认] / [Esc保留]
  ```
* **一键撤销（Undo）**：误划掉任务时，敲入 `anchor undo` 瞬间逆向回滚恢复。

---

## 终端界面设计

### 状态栏微光准星
* 存在活跃任务时：终端底部状态栏显示极简准星 `⌖ 4`。
* 无任务时：100% 物理隐身（0 字符输出）。

### 全局命令行 (`anchor`) 与交互面板 (`/anchor`)
```text
⌖ Anchors (4 active):

  [Today · 今日聚焦]
  01  [Today]     今天完成anchor项目后端优化    Desktop     Today         Today 10:02

  [Upcoming · 近期排期]
  02  [Upcoming]  明天吃香蕉                    Desktop     Tomorrow      Yesterday 21:34
  03  [Upcoming]  明天完成anchor项目前端优化    Desktop     Tomorrow      Today 10:02
  04  [Upcoming]  后天完成anchor项目上传优化    Desktop     In 2d         Today 10:02

  Use `anchor done <id>` to complete.
```
* **严格连续行号**：`01`、`02`、`03` 顺序排列，消除跳号困扰。
* **双通道智能结案**：敲 `anchor done 1` 划掉屏幕第 1 行；敲 `anchor done anc-5` 精准结算特定 ID。
* **CJK 字符等宽对齐**：终端纯列宽计算，杜绝中英文混排时的横向锯齿撕裂。

---

## 横向技术对比

| 对比维度 | `gastownhall/beads` | `Gentleman-Programming/engram` | `AGENTS.md` / `TODO.md` | **Anchor ⚓** |
| :--- | :--- | :--- | :--- | :--- |
| **底层架构** | 分布式 SQL 关系图谱 | 向量与 SQLite 外部库 | 静态 Markdown 纯文本 | **轻量原子化自消解状态机** |
| **工作区清洁度** | 仓库内塞入 200MB Dolt 数据库 | 外部系统服务 | **频繁产生 Git 杂质提交** | **100% 零仓库污染 (`~/.pi/agent/anchors/`)** |
| **Token 损耗** | 每轮中/高消耗 | 高（注入长文历史） | 极高（陈旧文本成倍累积） | **0 Token 稳态（仅文件触碰 JIT 唤醒）** |
| **认知时轴** | 单层平铺 | 单层平铺 | 静态复选框 | **正交双时轴（预期交付 + 现场立项时间）** |
| **结案闭环** | 人工命令 `close` | 无闭环概念 | 人工修改文本打勾 | **Git Commit 自动识别 + 关门单键承兑** |
| **衰减机制** | 手动 prune | 无衰退机制 | 长期堆积发霉 | **静默半衰期（临时备忘自净 vs 长期愿景）** |
| **启动开销** | 重型 CLI 初始化 | Go 守护常驻 | 无 | **< 90ms 预编译生产制品瞬时秒开** |
| **环境依赖** | 外部 Dolt 二进制 | 外部 Go 编译产物 | 无 | **零原生二进制外部依赖（纯 TS）** |

---

## 快速上手

### 1. 全局独立命令行 CLI
```bash
# 全局安装
npm install -g @3zeros12/anchor

# 或直接通过 npx 免安装即用
npx @3zeros12/anchor
```

常用命令：
```bash
anchor                                  # 查看待办清单
anchor "重构鉴权 Cookie"                 # 记录新任务
anchor "提交周报" --due friday          # 指定预期交付时间
anchor done 1                           # 划掉第 1 行任务
anchor undo                             # 撤销上次结案
```

### 2. 作为 Pi Coding Agent 扩展
在 Pi 扩展目录中直接引入：
```bash
# 在 ~/.pi/agent/extensions/ 目录下
npm install @3zeros12/anchor
```

---

## 自动化测试与质量保障

采用标准 Node 原生测试运行器，执行严格的类型检查与测试：

```bash
npm run build      # tsup 双格式打包 (ESM/CJS) 与 .d.ts 生成
npm run typecheck  # TypeScript 严格模式检查 (0 错误)
npm test           # 全套自动化单元测试 (18/18 全绿通过)
```

```text
✔ ContextInjector - 仅注入活跃锚点，休眠任务消耗 0 Token (59ms)
✔ ContextInjector - 注入 prompt 携带预期交付与老化天数 (10ms)
✔ AnchorDecay - 遗忘半衰期计算 (1.2ms)
✔ AnchorDecay - 自动退化与墓园清理 (102ms)
✔ AnchorMatcher - 精确文件、前缀、领域标签匹配 (2.5ms)
✔ AnchorMatcher - 通配符 Glob 模式匹配 (*.ts, src/**/*.ts) (0.7ms)
✔ AnchorMatcher - 置信度与优先级复合排序 (0.4ms)
✔ SessionTouchObserver - 工具调用与文件触碰监听 (25ms)
✔ SessionTouchObserver - 多语系 Git 提交语义分词匹配 (2.0ms)
✔ AnchorStore - 增删改查、原子写入与自适应编号匹配 (77ms)
✔ AnchorStore - 状态损坏自动安全容灾恢复 (9.1ms)
✔ AnchorStore - 每日循环习惯当天完成、次日自动复苏 (19ms)
✔ AnchorStore - 自然时间词表与阶梯半衰期判定 (10ms)
✔ AnchorTUI - 状态栏准星组件 ⌖ N (23ms)
✔ AnchorTUI - 正交双时轴渲染 (Target Date + Creation Time) (38ms)
✔ AnchorTUI - 极客面板排版与出处溯源 (26ms)
✔ AnchorTUI - CJK 全角字宽感知网格严整对齐 (0.3ms)
✔ AnchorTUI - 启动悬浮任务胶囊与开工自动淡出 (8.7ms)

ℹ pass 18, fail 0 (384ms 全绿通过)
```

---

## 开源许可

[MIT License](LICENSE) © 2025 [Jason Song (@3ZEROS12)](https://github.com/3ZEROS12)
