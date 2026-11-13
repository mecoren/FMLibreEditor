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

## 前端技术原则（新代码默认遵守）

这五条与「跟上游合并」同等重要。违反任意一条时，先在提交信息里说明理由。

1. **依赖极少、启动与构建快。** 新依赖先证明现有代码、浏览器原生能力或标准库做不到；不引 UI 组件库全家桶、不引状态/路由/图表库来做已有的事。
   shadcn/ui 只按需加入**实际使用**的组件，禁止 `--all`；Radix 用按需的 `@radix-ui/react-*`，不用聚合 `radix-ui`。
   交付前跑 `cd app && npm run build`，构建时间明显变慢要说清原因。
2. **Rust 承担全部重计算与分页。** 搜索、过滤、排序、分页、字段解析与校验都在 Rust；前端只拿分页结果做展示和交互，
   不在浏览器里对全量数据排序/过滤，不把游戏数据缓存成第二份真相。
3. **`call()` + mock 是唯一数据通道。** 组件只 import `app/src/api.ts` 的 `call()`，不直接 `invoke`；
   新增 Rust 命令必须同步补 `app/src/dev/mock.ts`，保证 `npm run dev` 在没有游戏、没有 Tauri 的普通浏览器里能跑通。
4. **i18n 与类型系统一起收紧。** 所有可见文本经 `labels.ts` / `strings`，不硬编码英文；新 key 先加 `en.ts`（`Strings` 形状）
   再补 `zh-CN.ts` 等语言，缺 key 必须编译失败；不重排既有 key，不改既有文案措辞。
5. **键盘、焦点、暗色/高对比是完成标准。** 新交互必须能用键盘完成，焦点可见且不丢；弹窗遵守 `useModal` 或
   shadcn/Radix 的焦点管理；暗色随 `prefers-color-scheme` 翻转，高对比用 `forced-colors` 检查；尊重 `prefers-reduced-motion`。

## 分支模型

- `main`：只用来跟踪上游，不直接开发。
- `wait`：当前主线（已跟踪 `origin/wait`）。
- 大改动**按层拆分支**，别一个分支同时重做样式和后端：
  - `wait-ui`：前端样式/组件/交互
  - `wait-core`：Rust 读写逻辑、profile、新功能
  两者的冲突文件几乎不重叠，分开后每个分支的合并都简单，出问题也能单独回滚。

## 合并上游：标准流程

**用户说「合并上游」时，严格按下面步骤执行，不跳步、不自行简化。** 每步的判定标准写在该步末尾。

### 0. 前置检查（缺一项先问用户）

```sh
git rev-parse --abbrev-ref HEAD   # 必须在 wait 或其功能分支上，不能在 main
git status --short                # 必须干净
git remote get-url upstream       # 应为 git@github.com:tozmoz/FMLibreEditor.git
```

工作区不干净时**不要 `stash` 了事**：先列出改动文件问用户如何处理。`app/package-lock.json` 里 4 行 `"peer": true`
的消失属于 npm 版本噪音，可以 `git checkout -- <file>`，但必须先说明。

### 1. 取上游并报告落后量

```sh
git fetch upstream
git rev-list --count HEAD..upstream/main      # 落后多少个提交
git diff --stat HEAD...upstream/main          # 即将并入的改动范围
```

落后超过 50 个提交时，先把数字和涉及的文件报给用户再继续。

**节奏**：每完成一个可运行阶段就同步一次，不要憋到几周后一次性合。落后越多，冲突越难判断语义。

### 2. 无副作用预演（必做）

```sh
git merge-tree --write-tree --name-only upstream/main HEAD
```

- **退出码 0**：无冲突，跳到第 4 步。
- **退出码 1**：输出列出冲突文件。**先把列表报给用户**，再进第 3 步。

这是唯一安全的预演方式：不碰工作区、不产生 merge 状态。不要用 `git merge --no-commit` 当预演——它会真的留下冲突态，
容易忘记 abort。

### 3. 真正合并

```sh
git merge upstream/main
```

冲突时**不要立刻动手改文件**，先做完 3.1 的信息收集。信息缺失就只能猜着解，那是冲突反复的根源。

#### 3.1 为每个冲突文件收集三方证据

```sh
git show :1:<file>                          # 共同祖先 base
git show :2:<file>                          # ours，本地
git show :3:<file>                          # theirs，上游
git log --merge --oneline -- <file>         # 冲突双方各是哪个提交
git diff <base> upstream/main -- <file>     # 上游在这文件上改了什么、为什么
```

#### 3.2 切成 zdiff3，让 base 显示在冲突块内

```sh
git checkout --conflict=zdiff3 --merge -- <file>   # 可按单文件重做
```

没有 base 的冲突块看不出「上游是为了修什么才改这行」，只能二选一，等于瞎猜。解乱了随时用这条命令复原冲突标记。

#### 3.3 逐块决策

| 情况 | 做法 |
|---|---|
| 双方改同一小段（默认） | **L1 逐块重写**：保住双方意图，摩擦参数取折中 |
| 上游重构了该区域（拆函数、改签名） | **L2 整段重写**：按上游新结构移植自己的逻辑 |
| 上游改了架构（拆文件、换 API） | **L3 重做功能**：`git diff <base> HEAD -- <file>` 当需求清单，在新结构上重新实现 |

#### 3.4 禁止事项

- **禁止 `git checkout --theirs` / `--ours` 整文件。** 实测：取上游整文件会连带丢掉你在同一文件里**不冲突**的改动，
  `git status` 里看不出来，工作量静默蒸发。要整段取用时，只复制那一段文本。
- **禁止 `git merge -X ours` / `-X theirs`。** 同上，整片覆盖会静默丢掉上游的修复。
- 禁止为让冲突「消失」而删除一方代码却不读它的提交说明。

### 4. 解完必须验证

```sh
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cd app && npm run build
```

**语义冲突不会让构建失败**：两边各自自洽、合起来行为矛盾，只有测试和实际跑起来才看得见。构建通过不等于合并正确。

### 5. 提交

保留 Git 默认的 merge message，或在其后补一段：哪些文件按 L2/L3 重写过、放弃了什么、为什么。
**不要 squash 上游的提交历史。**

### 6. 收尾

- `push` 前先问用户。
- `git config rerere.enabled true`：同一处冲突解过一次，下次自动复用。

### 什么时候停下来问用户，不要自己解

- 冲突文件超过 10 个。
- 上游删除或改名了你依赖的 API，且调用点超过 10 处。
- 冲突涉及 `crates/fmlibre-core/src/profile.rs`、`app/src-tauri/src/lib.rs` 的核心结构（而不只是加一行注册）。
- **语义冲突**：两边都能编译，但上游故意禁止了你的功能所依赖的行为。
- `profiles/fm27/*.toml` 的偏移表数值冲突——这不是代码，不存在「重写」，只能重新逆向或采用上游的值。

## 按层改动指南

### 前端样式（主要风险区）

`App.css` 是 5352 行的单一全局文件，上游仍在频繁改它。

- 改配色、间距、圆角、字体：**抽成 CSS 变量集中一处**，冲突面从 5000 行降到几十行。
- 真要大改 UI：**新建 `app/src/styles/<模块>.css` 按模块 `import`**，与上游对 `App.css` 的改动并存，冲突近乎为零。
- Tailwind/shadcn 的样式入口是 `app/src/styles/shadcn.css`，不合并进 `App.css`，也不对 `App.css` 做整体格式化。
- `App.css` 里两条兼容规则不要删：`button:not([data-slot])`（旧的全局按钮样式避开 shadcn 按钮）和
  `table.grid { display: table; }`（`.grid` 同时是 Tailwind 的网格工具类，表格必须保留 table 布局）。
- 最忌讳：在原文件里大范围移动/重排已有规则块。

### shadcn/ui 与 Tailwind（前端新组件的默认选择）

shadcn 是**源码进仓库**，不是运行时组件库；引入它是为了少写按钮、输入框、弹窗和焦点逻辑，不是换一套设计系统。

- **位置**：组件在 `app/src/components/ui/`，`cn()` 在 `app/src/lib/utils.ts`，配置是 `app/components.json`。
- **先后顺序**：新组件/新面板先看 shadcn 有没有合适的 Button、Card、Input、Badge、Alert、Tabs、Dialog、Select 等；旧组件按需迁移，
  不为了统一而整体重写 `App.tsx`、`SquadTab.tsx`、`App.css`。当前试点是 `CopyDiagnostics.tsx`（Button）和 masthead 的
  `Tabs`（`TabsList` / `TabsTrigger`）。
- **依赖预算**：`npx shadcn@latest add <component>` 只加本次要用的组件，禁止 `--all`。Radix 原语用按需的 `@radix-ui/react-*`，
  不要引入聚合 `radix-ui`（会带上全部 primitives）。图标先复用现有内联 SVG；确需 `lucide-react` 时在提交信息里说明。
- **CLI 落盘后的手工步骤**：CLI 新版组件默认从聚合 `radix-ui` 导入（`Slot.Root`、`Dialog.Root` 等）。落盘后改成按需包
  （如 Dialog → `@radix-ui/react-dialog`），把 `X.Root` 改成直接导入的 `X`，并从 `package.json` 移除 CLI 装上的 `radix-ui`。
- **样式边界**：Tailwind 只导入 `theme` 和 `utilities`，**不导入 preflight**（它会重置 `App.css` 已定义多年的元素样式）；
  需要的重置在 `shadcn.css` 里用 `[data-slot]` 局部恢复。`App.css` 没有包 `@layer`，所以它的规则优先于 Tailwind utilities；
  新 shadcn 组件不要直接放进 `.masthead`、`.toolbar`、`.pager`、`.settings-menu`、`.squad-teams`、`.move-mode`、
  `.scout-subtabs`、`.changes-grid`、`.colophon` 等已有专门 `button` 规则的容器；要放就新建容器类名，或先确认没有旧规则命中。
- **局部 reset 只作用于带 `data-slot` 的元素本身**：不要把 `shadcn.css` 里的 `:where([data-slot])` 改回
  `[data-slot] *`。后者会在 `Card`、`Dialog`、`TabsContent` 包住旧界面时给所有后代补上 `border-style: solid` 和 `margin: 0`，
  整个界面会出现黑边、间距被压平。`border-width: 0` 和 `border-style: solid` 必须成对保留：只设 style 会让没有 border 宽度的
  shadcn 元素（如 `TabsList`）出现 3px 白边。`Tabs` 的根和 `TabsContent` 不当作皮肤组件，用 `display: contents` 保持原
  `.app` / `.views` 的 flex 布局；masthead 的皮肤仍是 `.tabs` / `.tab`，不要换成 shadcn 默认的灰底胶囊。
- **主题**：只用 `@theme inline` 映射出的语义 token（`bg-background`、`text-muted-foreground`、`border-border` 等），
  禁止 `text-white`、`bg-blue-500` 这类硬编码；圆角用 `rounded-md` 等映射到现有 `--radius`。不要新增 `--background`、
  `--accent`、`--muted` 等第二套变量：它们会和现有 `--accent`（墨色主操作）、`--muted`（弱化文字）、`--border` 撞名。
  暗色靠现有变量随 `prefers-color-scheme` 翻转，不引入 `.dark` class 开关。
- **圆角**：控件的圆角统一走 `--radius`（当前 6px）；tab 的顶角写 `var(--radius) var(--radius) 0 0`，不要写死 4px。
  新增组件尽量用 `rounded-md` / `var(--radius)`，不要引入第二套圆角尺度。
- **字号换算**：根字号是 14px，Tailwind 的 rem 尺度会整体缩小：`text-sm` ≈ 12.25px、`text-base` = 14px。按这个换算选字号，
  不要直接套 shadcn 示例按 16px 根字号写的视觉预期。
- **文案与无障碍**：组件不硬编码可见文案；`DialogTitle`、`aria-label`、`sr-only` 关闭文案也要从 `strings` 取。图标按钮必须有
  `aria-label`；不删 `:focus-visible`；新弹窗用 shadcn/Radix 的 Dialog/AlertDialog，旧弹窗继续用 `useModal`，不要两套混在同一个弹窗里。
- **升级**：shadcn 组件是本地源码。升级先 `npx shadcn@latest add <component> --dry-run` / `--diff` 后再人工合并，不要 `--overwrite`。
  CLI 可能往 `shadcn.css` 追加标准 `--background` 变量块或带 preflight 的 `@import "tailwindcss"`，**合并前删掉**，保留本仓库的映射与无 preflight 结构。
  本机 `npx` 缓存异常时，可从 `https://ui.shadcn.com/r/styles/new-york-v4/<component>.json` 取源码落盘，`components.json` 保持标准。

### 前端组件与状态

- 新页面/新面板优先**新建文件**（参照上游自己做的 `MyClub.tsx`、`CommandPalette.tsx`），在 `App.tsx` 只加挂载点。
- 新组件先看 `app/src/components/ui/` 的 shadcn 源码；能复用就不再手写一套按钮、输入框或卡片。数据仍只通过 `call()`。
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
- shadcn 组件的可见文案、`aria-label`、`sr-only` 关闭文案同样必须走 `strings`；不要把英文留在 `components/ui/` 里。

## 提交粒度

- 一个提交只做一件事，**提交信息说清改了什么、为什么**（上游是这种风格，合并时靠它判断冲突语义）。
- 一次性大提交在跟上游合并时无法按语义取舍，只能整体保留或整体丢弃。

## 与上游的关系

本 fork 的改动**不打算提 PR 回上游**时，`AGENTS.md`、本地脚本、个人配置类文件保持独立提交，避免混进功能改动里影响后续合并判断。
若打算回上游，先读 `CONTRIBUTING.md` 的「Your first pull request」。
