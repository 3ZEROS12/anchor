# ⌖ Anchor

> **Pi エディタ直下に常駐するデジタル付箋（Sticky Note）拡張機能。**  
> `pin: ...` で **0ms 即時貼り付け**、エディタ直下（`belowEditor`）に 1 行で常駐表示（`aboveEditor` 拡張と干渉ゼロ）、長期タスク用の**ミニ進捗バー `[■■□□ 2/4]`**、**元の会話セッションへのワンタッチ復帰（`↪`）**、および **`git commit` 時の自動剥がし**に対応。

[![npm version](https://img.shields.io/npm/v/pi-anchor?color=blue)](https://www.npmjs.com/package/pi-anchor)
[![npm downloads](https://img.shields.io/npm/dm/pi-anchor?color=22c55e&label=downloads)](https://www.npmjs.com/package/pi-anchor)
[![GitHub stars](https://img.shields.io/github/stars/3ZEROS12/anchor?style=flat&color=f59e0b)](https://github.com/3ZEROS12/anchor/stargazers)
[![CI Status](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml/badge.svg)](https://github.com/3ZEROS12/anchor/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/Tests-10%2F10%20Pass%20(100%25)-brightgreen)](tests/store.test.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-f97316.svg)](LICENSE)

[English](./README.md) | **日本語** | [简体中文](./README_zh.md)

```bash
pi install npm:pi-anchor
```

<p align="center">
  <img src="assets/hero-en.svg" alt="Anchor Sticky Notes" width="820">
</p>

```text
╭─ Pi Editor ──────────────────────────────────────────────────────────────────────╮
│ ❯ pin: Refactor auth flow: 1. Extract interface 2. HttpOnly cookie 3. Unit tests │
╰──────────────────────────────────────────────────────────────────────────────────╯
  ⌖ #1 [■■□□ 2/4] Refactor auth flow ▸ Unit tests (app · auth.ts ↪)
```

---

## なぜ Anchor なのか？

コーディング中にふと *「この後 `src/gateway.ts` のレート制限フォールバックも確認しないと」* と思いついたときや、数日かかるタスクを夜に中断するとき：
- リポジトリ内に `TODO.md` を作ると `git status` が汚れ、毎ターンのプロンプトで無駄なトークンを消費します。
- 起動時だけのバナー表示は、最初のメッセージを送信した瞬間に消えてしまい、書いた内容を忘れてしまいます。

**Anchor は Pi の入力欄のすぐ下（`belowEditor`）に貼る本物のデジタル付箋です。** リポジトリ外の `~/.anchor/state.json` に保存され（全 4 ソースファイル・外部依存ゼロ）、人間の手になじむ 4 つの工夫を備えています：

### 1. エディタ直下に 1 行常駐（`belowEditor`）＆ 0ms 即時貼り付け（`pin: ...`）
- **ウィジェット干渉ゼロ**：付箋バーはエディタ**直下（`placement: "belowEditor"`）**に 1 行で配置されるため、エディタ上部（`aboveEditor`）を `pi-lingual` などのツールに 100% 空けておけます。
- **0ms ダイレクト入力**：入力欄で直接 `pin: トークン有効期限を確認`（または `note: ...`、`/pin ...`）と打つだけ。LLM 呼び出しやトークン消費なしで **0.00ms** で即座に貼り付けられ、直前に編集していたファイルが自動リンクされます。

### 2. 長期タスク用のミニ進捗バー（`[■■□□ 2/4]`）
- メモの中に比率（`[2/4]` や `5/30`）または番号付きステップ（`1. Extract interface 2. HttpOnly cookie 3. Unit tests`）を書くだけ：
  ```text
  /pin Refactor auth flow: 1. Extract interface 2. HttpOnly cookie 3. Unit tests
  ```
- 付箋バーにミニ進捗バーと次のステップ（`[■■□□ 2/3] ▸ Unit tests`）が表示されます。`/step 1`（または `/anchor` メニューの `▶ Advance step`）で 1 ステップ進みます。単発のメモには進捗バーは表示されません。

### 3. 会話セッションのブックマーク（`↪ Jump to session`）
- 各付箋は、作成時や関連ファイル編集時の Pi 会話セッション（`sessionFile`）を自動的にブックマークします。
- 数日後に別ウィンドウから作業を再開したいときも、`/anchor` を開いて **`↪ Jump to session`** を選ぶ（または `/anchor jump 1` を実行する）だけで、当時の会話履歴そのものに直接復帰できます。

### 4. ファイル接触時の 1 行メモ注入 ＆ `git commit` 自動剥がし
- **ファイル接触時の 1 行メモ（待機時 0 トークン）**：Turn 1 で一度だけ AI に概要を伝え、Turn 2 以降は **0 トークン**。AI が関連ファイルを読み書きした際、結果の末尾に構文安全な 1 行コメント（`// ⌖ Note #1: ...`）を添えます（`.json` や `.env` は厳格にスキップ）。
- **コミットで自動剥がし**：`git commit -m "..."` のメッセージが付箋内容と一致すると、自動的に付箋を剥がしてアーカイブします（`⌖ Auto-torn off #1`）。誤って剥がした場合は `/anchor undo` でいつでも戻せます。

---

## コマンド一覧

| 場所 | 入力 / コマンド | 動作 |
| :--- | :--- | :--- |
| **Pi エディタ** | `pin: <メモ>` または `note: <メモ>` | LLM を呼ばずに **0ms** で付箋を貼り付け |
| **スラッシュコマンド** | `/pin <メモ>` | 新しい付箋を貼る（`[1/4]` や `1. A 2. B` で進捗バー自動生成） |
| **スラッシュコマンド** | `/anchor` | 対話ボードを開く（剥がす、進捗 `+1`、`↪` セッション復帰） |
| **スラッシュコマンド** | `/step 1` | 付箋 `#1` の進捗バーを `+1` 進める |
| **スラッシュコマンド** | `/anchor jump 1` | 付箋 `#1` に紐づく元の会話セッションへ切り替え |
| **スラッシュコマンド** | `/done 1` / `/anchor undo` | 付箋 `#1` を剥がす / 直前に剥がした付箋を貼り直す |
| **ターミナル CLI** | `anchor` / `anchor step 1` / `anchor done 1` | Pi の外から付箋の一覧確認・進捗更新・完了を実行 |

---

## Ecosystem: Pi Terminal Suite

4 つの拡張機能はそれぞれ異なるターミナルスロット（`aboveEditor`、`belowEditor`、`status-only` フッター、実行時ツールフック）にマウントされるため、単体でも全種併用でも UI が干渉しません：

| パッケージ | ターミナル配置スロットと機構 | インストール |
| :--- | :--- | :--- |
| **[`pi-lingual`](https://github.com/3ZEROS12/pi-lingual)** | `二 ⇄ two` `aboveEditor` 二言語 HUD（最大 9 行・UAX #11 ツリーレイアウト）＆英語プロンプト変換（履歴トークン消費 0） | `pi install npm:pi-lingual` |
| **[`toolflow`](https://github.com/3ZEROS12/toolflow)** | `⌬` 実行時ツールフック —— フェーズ別 MCP マウント＆40 行超のログ自動ディスク退避（ログトークン 95% 削減） | `pi install npm:toolflow` |
| **[`pi-tui-status-beautifier`](https://github.com/3ZEROS12/pi-tui-status-beautifier)** | `status-only` フッターフック —— 6 種のバッジプリセット、`<80` 列での待機バッジ折りたたみ `(+N idle)`、描画ループ内ディスク I/O ゼロ | `pi install npm:pi-tui-status-beautifier` |
| **[`pi-anchor`](https://github.com/3ZEROS12/anchor)** *(現在)* | `⌖` `belowEditor` 1 行常駐付箋バー、0ms `pin:` インターセプト、ミニ進捗バー `[■■□□]` ＆ `↪` セッション復帰 | `pi install npm:pi-anchor` |

---

## ライセンス

MIT © [Jason Song](https://github.com/3ZEROS12)
