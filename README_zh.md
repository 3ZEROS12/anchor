# ⌖ Anchor

> **贴在 Pi 输入框正下方的电子便签 —— 专为顺手盲打与跨会话续传设计。**  
> 敲 `便签: ...` 0ms 瞬贴上屏，在输入框**正下方 (`belowEditor`)** 常驻 1 行极简便签条（与上方 `pi-lingual` 零冲突），支持长线任务**迷你进度条 `[■■□□ 2/4]`**、**一键穿越回当时的对话上下文 (`↪`)**，以及 **`git commit` 自动撕便签**。

[![CI 状态](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Node v20+](https://img.shields.io/badge/Node-v20+-22c55e.svg)](package.json)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg)](tsconfig.json)
[![Tests: 10 Passed](https://img.shields.io/badge/Tests-10%20通过-22c55e.svg)](tests/store.test.ts)
[![开源协议: MIT](https://img.shields.io/badge/开源协议-MIT-f97316.svg)](LICENSE)

[English](./README.md) | **简体中文**

```bash
pi install npm:pi-anchor
```

<p align="center">
  <img src="assets/hero-zh.svg" alt="Anchor 电子便签预览" width="820">
</p>

```text
╭─ Pi 输入框 ──────────────────────────────────────────────────────────────────────╮
│ ❯ 便签: 重构登录鉴权流: 1. 抽出接口 2. 替换Cookie 3. 补单测 4. 压测              │
╰──────────────────────────────────────────────────────────────────────────────────╯
  ⌖ #1 [■■□□ 2/4] 重构登录鉴权流 ▸ 补单测 (app · auth.ts ↪)
```

---

## 为什么这次真正顺手了？（四大巧思）

### 1. 输入框正下方常驻 1 行便签条 (`belowEditor`) + 0ms 瞬贴
* **绝不跟上方插件抢地盘**：便签条挂载在输入框**正下方 (`belowEditor`)**，把输入框上方 (`aboveEditor`) 完全留给 `pi-lingual` 等高频伴学卡片，上下分工井然有序。
* **真·便签常驻视野**：有便签时在输入框下沿安静显示 1 行，不再像以前那样“刚发第一句话就神秘消失”；无便签时 0 行完全隐形。
* **自己随手写，0ms 上屏**：直接在输入框敲 `便签: 明天检查网关重试`（或 `pin: ...`、`/pin ...`），**0.00ms 当场拦截贴上便签条**，不用苦等大模型转圈调工具，不花 1 个 Token，还会自动关联你当前正在改的代码文件。

### 2. 长线任务迷你进度条 (`[■■□□ 2/4]`)
* 遇到跨天或分步任务，随手在便签里写上进度比（如 `[5/30]`）或分步序号（`1. 抽出接口 2. 替换Cookie 3. 补单测`）：
  ```text
  便签: 重构登录鉴权流: 1. 抽出接口 2. 替换Cookie 3. 补单测
  ```
* 便签条会自动渲染出 4 格迷你进度条与下一步提示：`[■■□□ 2/3] ▸ 补单测`。敲 `/step 1`（或在 `/anchor` 菜单里点 `▶ Advance step`）即可推进一格；普通单句备忘则保持纯粹文字，绝不画蛇添足。

### 3. 绑定原对话 Session，一键穿越回去 (`↪ Jump to session`)
* 贴便签或修改关联代码时，Anchor 会自动记录当前对话的 `sessionFile` 书签（显示 `↪` 标记）。
* 哪怕过了好几天、开了十几个新窗口，当你看到便签想接着干时，打开 `/anchor` 选中它点击 **`↪ Jump to session`**（或敲 `/anchor jump 1`），Pi 就会**直接切换回当时那场对话的完整上下文**！

### 4. 碰文件顺手递纸条 & `git commit` 自动撕便签
* **碰文件递纸条（平时 0 Token）**：首轮对话简要提醒，第 2 轮起 **0 Token**；当 AI 读取或修改关联文件时，在文件结果末尾顺手附带 1 行语法安全注释（`// ⌖ Note #1: ...`，严格跳过 `.json`/`.env`）。
* **提交代码自动撕下**：执行 `git commit -m "..."` 命中便签内容时，当场自动撕下归档；撕错了敲 `/anchor undo` 一秒贴回。

---

## 常用操作速查

| 位置 | 输入 / 命令 | 作用 |
| :--- | :--- | :--- |
| **输入框直接敲** | `便签: <内容>` 或 `pin: <内容>` | **0ms 直接贴便签**（不触发大模型请求，自动绑定当前改过的文件与 Session） |
| **斜杠命令** | `/pin <内容>` | 贴一张新便签（支持写 `[2/5]` 或 `1. A 2. B` 自动生成进度条） |
| **斜杠命令** | `/anchor` | 打开交互面板（支持撕便签、推进度 `+1`、`↪` 穿越回原对话 Session） |
| **斜杠命令** | `/step 1` | 将 `#1` 便签的进度条往前推进 `+1` 步 |
| **斜杠命令** | `/anchor jump 1` | 直接切换回 `#1` 便签绑定的那次历史对话 (`switchSession`) |
| **斜杠命令** | `/done 1` / `/anchor undo` | 撕掉 `#1` 便签，或把刚撕掉的便签重新贴回来 |
| **终端 CLI** | `anchor` / `anchor step 1` / `anchor done 1` | 不进 Pi 也能在外部终端查看、推进度或撕便签 |

---

## 开源协议

MIT © [Jason Song](https://github.com/3ZEROS12)
