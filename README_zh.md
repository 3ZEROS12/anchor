# ⌖ Anchor

> **贴在 Pi 终端边框上的电子便签 —— 带一点刚刚好的小巧思。**  
> 随手贴一张跨会话备忘（`/pin`），AI 读改关联文件时顺手递上一行注释提醒，`git commit` 提交代码时自动撕掉便签。不在代码仓库里留任何 `TODO.md` 垃圾。

[![CI 状态](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Node v20+](https://img.shields.io/badge/Node-v20+-22c55e.svg)](package.json)
[![TypeScript Strict](https://img.shields.io/badge/TypeScript-Strict-3b82f6.svg)](tsconfig.json)
[![Tests: 9 Passed](https://img.shields.io/badge/Tests-9%20通过-22c55e.svg)](tests/store.test.ts)
[![开源协议: MIT](https://img.shields.io/badge/开源协议-MIT-f97316.svg)](LICENSE)

[English](./README.md) | **简体中文**

```bash
pi install npm:pi-anchor
```

<p align="center">
  <img src="assets/hero-zh.svg" alt="Anchor 电子便签预览" width="820">
</p>

```text
⌖ Notes (3):

  01  把登录 Token 改用 HttpOnly Cookie 存储       app · auth.ts          25m ago
  02  检查网关超时后的降级重试边界                 app · gateway.ts       3h ago
  03  College 重构前置查阅外部架构参考库           College/优化 · notes.md 8d ago · quiet

  Run `anchor done <num>` to tear off, or `anchor undo` to put back.
```

---

## 为什么是一张电子便签，而不是 `TODO.md`？

深夜写代码准备关机时，你突然想到 *“明天得把 `src/auth.ts` 里的 Token 改成 Cookie”*。这时候你不需要一套沉重的项目管理系统：
- 往仓库里塞 `TODO.md` 会弄脏 `git status`，而且每一轮对话都在白白消耗上下文 Token；
- 直接关掉终端，AI 的内存记忆瞬间清空。

**Anchor 就是贴在终端显示器边框上的一张电子便签** —— 独立保存在全局 `~/.anchor/state.json`（全工程仅 4 个核心源码文件、0 外部依赖、20KB 体积），只做三件有小巧思的事：

### 1. 随手一贴，自动认路（无需填表打标签）
直接用大白话敲一句：
```text
/pin 把 src/auth.ts 的登录改用 HttpOnly Cookie
```
Anchor 会自动从这句话里认出文件名 `src/auth.ts`（或诸如 `D:/College/...` 的目录路径），自动绑定到对应工程。下次打开终端时，输入框上方安静浮现小便签（`⌖ 1 note`），你一开始打字它就自动收起，绝不挡视线。

### 2. 碰文件时顺手递纸条（平时 0 Token）
会话第 1 轮冷启动时向 AI 交代一眼当前便签，从第 2 轮起 **0 Token 损耗**。  
只有当 AI 真正读取或修改 `src/auth.ts` 时，Anchor 才会在文件内容末尾顺手附上 1 行合法注释（`// ⌖ Note #1: 把 src/auth.ts 的登录改用 HttpOnly Cookie`），遇到 `.json`、`.env` 等文件则严格跳过。

*(超过 7 天没动过的旧便签会自动加上 `· quiet` 静默省流标记，不在无关工程首轮刷存在感，但在 `/anchor` 列表里永远都在，绝不莫名消失；一旦你进入对应工程目录就会自动唤醒。)*

### 3. 提交代码自动撕便签（支持一键反悔）
当你或 AI 执行 `git commit -m "feat: 登录改用 HttpOnly Cookie"` 时，Anchor 发现提交说明与便签吻合，当场自动帮你把这张便签撕掉归档（`⌖ Auto-torn off #1`）。  
撕错了？敲一下 `/anchor undo` 就能原封不动贴回来。

---

## 常用命令

| 场景 | 命令 | 作用 |
| :--- | :--- | :--- |
| **Pi 终端内** | `/pin <内容>` | 随手贴一张新便签（也可以直接对 AI 说 *“记一下明天…”*） |
| **Pi 终端内** | `/anchor` | 打开便签列表，回车即可撕掉（Done）或查看详情 |
| **Pi 终端内** | `/done 1` | 直接按编号撕掉第 1 张便签 |
| **Pi 终端内** | `/anchor undo` | 把刚撕掉的便签重新贴回来 |
| **系统命令行** | `anchor` / `anchor "<内容>"` / `anchor done 1` | 不开 Pi 也能随时在终端查看或贴便签 |

---

## 开源协议

MIT © [Jason Song](https://github.com/3ZEROS12)
