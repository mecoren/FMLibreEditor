# AGENTS.md

给在本仓库上长期开发的 AI 代理（以及人）的约定。本仓库是
[tozmoz/FMLibreEditor](https://github.com/tozmoz/FMLibreEditor) 的 **fork**
（`origin` = `git@github.com:mecoren/FMLibreEditor.git`），本地改动要长期跟上上游。
本文件只讲**怎么改才不把自己焊死**，功能与架构见 `docs/DEVELOPING.md`，贡献流程见 `CONTRIBUTING.md`。

## 先验证，再交付

上游 CI 的检查，本地等价命令：

```sh
cargo fmt --all
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd app && npm run build
```

纯界面改动不需要游戏：`cd app && npm install && npm run dev`，用 `app/src/dev/mock.ts` 的假数据在浏览器里看。
涉及写游戏数据的改动，按 `tools/smoke/README.md` 跑 `node tools/smoke/run.mjs`（写入类需 `--writes` 且只能对着可丢弃的存档）。

## 上游现状（统计于 2026-11-12，基点 `87982ad`）

上游很活跃，**这三个月的 463 个提交**说明不同步一两周就会落后几十个提交。近 300 个提交中被改动最多的文件：

| 文件 | 次数 | 行数 | 含义 |
|---|---|---|---|
| `app/src/i18n/en.ts` | 111 | ~2300 | 改动最热，几乎每个功能 PR 都碰 |
| `app/src-tauri/src/lib.rs` | 95 | — | Tauri 命令集中处 |
| `crates/fmlibre-core/src/profile.rs` | 80 | — | 版本 profile 集中处 |
| `app/src/App.css` | 72 | 5352 | 单一全局样式文件 |

数字会过期，结论不会：**冲突量取决于是否碰了这几个热点，而不是改了多少行。** 复算：

```sh
git log --since="3 months ago" --oneline | wc -l
git log --oneline -300 -- app/src/i18n/en.ts | wc -l
```

## 硬性禁令

违反任意一条，后续合并会退化成逐行人工比对：

1. **不对整文件做格式化/重排。** 禁止用 prettier、rustfmt 对 `App.css`、`lib.rs`、`en.ts` 等已存在文件整体重排——
   Git 会认为每行都变了，整个文件冲突。
2. **不重排 `i18n/*.ts` 的既有 key 顺序，不改既有文案措辞**（除非任务就是改它）。新增 key 追加到对应区块末尾。
3. **不 rebase 已推送到 `origin` 的分支。** 同步上游一律用 `merge`，保留历史，冲突解法可复用。
4. **不移动已有代码块的位置**（跨文件搬函数、调整 `App.css` 规则顺序都算），除非确实必要。增删局部代码无妨。

## 分支模型

- `main`：只用来跟踪上游，不直接开发。
- `wait`：当前主线（已跟踪 `origin/wait`）。
- 大改动**按层拆分支**，别一个分支同时重做样式和后端：
  - `wait-ui`：前端样式/组件/交互
  - `wait-core`：Rust 读写逻辑、profile、新功能
  两者的冲突文件几乎不重叠，分开后每个分支的合并都简单，出问题也能单独回滚。

## 同步上游

```sh
git remote add upstream git@github.com:tozmoz/FMLibreEditor.git   # 只需一次，当前未配置

git fetch upstream
git merge --no-commit --no-ff upstream/main   # 预演：先看冲突量
git merge --abort                              # 不想现在解就撤掉

git merge upstream/main                        # 真正合并
```

- **节奏**：每完成一个可运行阶段就同步一次，不要憋到几周后一次性合。落后越多，冲突越难判断语义。
- **开 `rerere`**：`git config rerere.enabled true`。同一处冲突解过一次，后续合并自动复用，长期跟上游收益极大。
- 冲突集中在热点文件时优先手工解，**不要用 `-X ours` / `-X theirs` 整片覆盖**——会静默丢掉上游的对端修复。

## 按层改动指南

### 前端样式（主要风险区）

`App.css` 是 5352 行的单一全局文件，上游仍在频繁改它。

- 改配色、间距、圆角、字体：**抽成 CSS 变量集中一处**，冲突面从 5000 行降到几十行。
- 真要大改 UI：**新建 `app/src/styles/<模块>.css` 按模块 `import`**，与上游对 `App.css` 的改动并存，冲突近乎为零。
- 最忌讳：在原文件里大范围移动/重排已有规则块。

### 前端组件与状态

- 新页面/新面板优先**新建文件**（参照上游自己做的 `MyClub.tsx`、`CommandPalette.tsx`），在 `App.tsx` 只加挂载点。
- 改动 `App.tsx`、`SquadTab.tsx` 这类集中文件时保持小步，避免与上游同区域并行改动。

### Rust 后端

- 新功能**新建模块**（参照 `crates/fmlibre-core/src/concerns.rs`、`tree.rs`），在 `lib.rs` 只加注册行。
- 改已有读取逻辑会撞 `profile.rs` 与 `lib.rs`——冲突是函数级的，好解，但这是主要冲突来源，改动应尽量局部。
- 写游戏数据的改动遵守 `CONTRIBUTING.md`：**一个字段需两次独立确认才可写**，并在 `docs/recon/` 记下偏移量是怎么找到的。
- `profiles/fm27/*.toml` 基本都是新增文件，**冲突风险最低**；新增平台/profile 时照此办理。

### i18n

- 只做中文时**只改 `zh-CN.ts`**，不要动 `en.ts` 的既有结构。
- 新增 key 时 `en.ts` 仍需加（类型是 `satisfies` 的强约束，缺 key 编译失败），但只追加、不重排。
- 追加位置放在语义相邻区块末尾，别插到文件开头，减少与上游同一 hunk 相撞。

## 提交粒度

- 一个提交只做一件事，**提交信息说清改了什么、为什么**（上游是这种风格，合并时靠它判断冲突语义）。
- 一次性大提交在跟上游合并时无法按语义取舍，只能整体保留或整体丢弃。

## 与上游的关系

本 fork 的改动**不打算提 PR 回上游**时，`AGENTS.md`、本地脚本、个人配置类文件保持独立提交，避免混进功能改动里影响后续合并判断。
若打算回上游，先读 `CONTRIBUTING.md` 的「Your first pull request」。
