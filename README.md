# Antigravity 简体中文汉化

给 **Windows / macOS** 桌面端 **Antigravity**（Windows 默认路径 `%LOCALAPPDATA%\Programs\antigravity`，macOS 默认路径 `/Applications/Antigravity.app`，当前适配 **2.35.0**）添加一层**免重打包 `app.asar` 的简体中文汉化**。应用自动更新后重新运行一次脚本即可恢复中文。

## 适用环境

- Windows 10 / 11 或 macOS（Apple Silicon / Intel）
- [Node.js](https://nodejs.org/) 18 及以上版本

## 快速开始

1. 克隆仓库或下载 ZIP 并解压到本地目录。
2. 运行一键脚本：
   - **Windows**：双击根目录下的 `apply.cmd`（或运行 `node scripts\apply.mjs`）。若 Antigravity 正在运行并锁定了 `app.asar`，`apply.cmd` 会等待你关闭所有窗口后自动完成切换。
   - **macOS**：双击根目录下的 `apply.command`（或在终端运行 `./apply.command` / `node scripts/apply.mjs`）。
3. 重启 Antigravity 即可看到简体中文界面。

## 常用操作

| 操作 | Windows | macOS | 命令行 / `npm` |
| --- | --- | --- | --- |
| 应用汉化 | `apply.cmd` | `apply.command` | `npm run apply` |
| 检查状态 | `check.cmd` | `check.command` | `npm run check` |
| 还原英文原版 | `restore.cmd` | `restore.command` | `npm run restore` |
| 预演构建（不改安装目录） | — | — | `npm run dry-run` |
| 翻译引擎回归测试 | — | — | `npm test` |

- 安装在其他路径时可加 `--install <安装目录>`（macOS 支持传 `.app` 路径，或设置环境变量 `ANTIGRAVITY_DIR`）。
- 汉化与还原操作均可重复执行。

## 目录结构

```text
antigravity-zh/
├── apply.cmd / check.cmd / restore.cmd  # Windows 一键入口
├── scripts/
│   ├── apply.mjs                        # 解包、主进程替换、注入翻译层、语法校验与切换
│   ├── restore.mjs                      # 删除 resources\app 并恢复原版 app.asar
│   └── lib.mjs                          # 路径解析、asar 解包与状态检测
├── src/
│   ├── hub-i18n.js                      # 注入 preload.js 的主界面 DOM/菜单/通知翻译层
│   └── zh-guard.js                      # 版本保护：防止新版更新后误加载旧版解压目录
├── dict/
│   ├── hub.json                         # 主界面词典（3,452 条）
│   ├── main.json                        # 主进程替换规则（203 条）
│   └── glossary.md                      # 术语统一约定
├── tools/
│   ├── extract-from-ls.mjs              # 从 language_server.exe 提取最新前端 main.js
│   ├── extract-hub-strings.mjs          # AST 提取候选界面英文字符串
│   ├── refine-hub-strings.mjs           # 过滤与对比生成待翻译清单（--missing）
│   ├── add-entries.mjs                  # 合并新词条并按字母序写回 dict/hub.json
│   ├── test-hub-i18n.cjs                # 模板匹配、富文本与 DOM 隔离回归测试
│   ├── launch-sandbox.ps1               # 使用独立用户目录启动带 CDP 端口的测试实例
│   ├── cdp.mjs / ui.mjs / harvest.js    # CDP 界面抓取与漏翻收集辅助脚本
├── package.json
├── .gitignore / .gitattributes
├── LICENSE
└── README.md
```

## 实现原理

1. **主进程文案**：从原始 `resources\app.asar` 解包到 `resources\app`，按 [dict/main.json](dict/main.json) 替换菜单、托盘、对话框与内置页面文本，并对所有改动文件执行 `node --check` 语法校验。
2. **主界面翻译层**：主界面由 `resources\bin\language_server.exe` 在本地端口 `https://127.0.0.1:<端口>/` 提供，无法直接改磁盘静态资源，因此将 [src/hub-i18n.js](src/hub-i18n.js) 连同内联词典追加到 `resources\app\dist\preload.js`。页面渲染后仅在显示层替换文本节点、输入框提示、悬停提示、原生右键菜单与系统通知文字，不修改应用数据与消息内容。
3. **加载切换**：Electron 优先加载 `resources\app.asar`，因此脚本会将原 `app.asar` 备份至 `tmp\backup\<版本>\app.asar` 并改名为 `app.asar.bak`，使 `resources\app` 生效。还原时删除 `resources\app` 并把 `app.asar.bak` 改回即可。

## 应用更新后

Antigravity 自动更新会写回新的 `app.asar` 并覆盖加载优先级，使界面恢复为新版英文。此时只需：

1. 运行 `check.cmd` 确认新版本状态；
2. 运行 `apply.cmd` 基于新版 `app.asar` 重新生成汉化。

词典按英文原文匹配，绝大多数旧词条可跨版本复用；新版本新增文案会显示为英文，可按下方步骤补全。

## 覆盖范围

- **主界面（`dict/hub.json`，3,452 条）**：侧栏与自定义侧边栏/筛选排序（含收件箱/已处理模式、运行中分组与移动对话）、首页、输入区、标题栏菜单、命令面板、对话内联权限与提问卡片、云端对话与智能体创建、远程项目克隆、设置各页（常规、应用、外观、快捷键、Orchestrator 设置与模型选择、通知、模型、内置浏览器与站点数据、账户、反馈）、自定义（插件市场、插件包、插件权限撤销与管理）、自动化及筛选校验、权限、语音听写语言、终端、审查与浏览器等文案。支持 `{0}` 动态占位模板及 `<0>` 内联子元素整句模板。
- **主进程（`dict/main.json`，209 条）**：应用菜单、托盘菜单、退出确认、启动错误、文件选择框、检查更新、设备与通行密钥选择、SSH 远程连接流程、WSL 提示及欢迎向导。

### 刻意保留英文的部分

- 产品名、模型名、档位与专用模式/徽章（如 `Antigravity`、`Gemini`、`High`、`Orchestrator`、`New` 徽章）以及按键名（`Ctrl`、`Cmd`、`Shift`、`Enter` 等）。
- 用户自定名称（项目目录名、对话标题、自定义分组、定时任务、自定义智能体、插件与主机名等）、智能体回复、代码与终端输出。
- 第三方插件目录动态数据与系统原生标准角色菜单（macOS 会随系统语言自动显示中文）。

## 维护：补充新版本词条

1. 安装提取工具依赖（仅需 `acorn` 与 `acorn-walk`）：
   ```powershell
   npm install
   ```
2. 提取最新前端脚本并筛选缺失词条：
   ```powershell
   node tools\extract-from-ls.mjs
   node tools\extract-hub-strings.mjs tmp\main-latest.js tmp\cand.json
   node tools\refine-hub-strings.mjs tmp\cand.json tmp\missing.json --missing
   ```
   （也可使用 `powershell -ExecutionPolicy Bypass -File tools\launch-sandbox.ps1` 启动带 9333 调试端口的隔离实例，配合 `tools\cdp.mjs` 或 `tools\ui.mjs` 在真实界面上抓取。）
3. 将补充译文保存为 `{ "English": "中文" }` JSON 后合并并校验：
   ```powershell
   node tools\add-entries.mjs tmp\new-entries.json
   npm test
   npm run dry-run
   ```

## 免责声明

本项目为非官方社区维护的本地显示层汉化脚本与词典，与 Google 或 Antigravity 官方无任何从属或关联关系；所有操作均基于本地安装目录原文件进行，请保留备份并谨慎确认版本兼容性。
