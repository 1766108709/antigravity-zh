# Antigravity 简体中文汉化

给本机安装的 Antigravity 桌面应用（`%LOCALAPPDATA%\Programs\antigravity`，当前 2.32.1）加一层简体中文翻译，不重新打包 `app.asar`，应用自动更新后重新运行一次脚本即可。

需要 Node.js 18 或更高版本。

## 用法

| 操作 | 双击 | 命令行 |
| --- | --- | --- |
| 应用汉化 | `apply.cmd` | `node scripts\apply.mjs` |
| 查看状态 | `check.cmd` | `node scripts\apply.mjs --check` |
| 还原英文原版 | `restore.cmd` | `node scripts\restore.mjs` |

- 应用和还原都可以重复执行。Antigravity 正在运行时也能执行，重启 Antigravity 后生效。
- 安装在别处时加 `--install <安装目录>`。

## 原理

1. 从原始的 `resources\app.asar` 解包到 `resources\app`，在里面改主进程文件里的界面文字（菜单、托盘、对话框、几个内置页面），每改一个文件都用 `node --check` 检查语法。
2. 主界面不在 `app.asar` 里，而是 `resources\bin\language_server.exe` 在本机 `https://127.0.0.1:<端口>/` 提供的网页，没法在磁盘上改。所以把翻译层追加到 `resources\app\dist\preload.js`：页面加载后按词典替换显示出来的文字（以及输入框提示、悬停提示、原生右键菜单和系统通知的文字）。只改显示，不改程序数据；对话内容、代码、文件名、终端等区域不替换。
3. 把 `app.asar` 改名为 `app.asar.bak`。实测这个版本（Electron 44.9.1）在 `app.asar` 存在时优先加载它，`resources\app` 不会生效，所以必须改名。改名前会把 `app.asar` 备份到 `tmp\backup\<版本>\app.asar`。

还原就是删除 `resources\app`，再把 `app.asar.bak` 改回 `app.asar`。

## 应用更新之后

自动更新会装回新的 `app.asar`，它会优先于 `resources\app` 加载，所以更新后启动的是新版本的英文界面，不会运行旧代码。这时：

1. 运行 `check.cmd`，会提示"app.asar 又出现了"或版本不一致。
2. 运行 `apply.cmd`，从新的 `app.asar` 重新生成汉化，并删掉旧版本留下的 `app.asar.bak`。

词典按英文原文匹配，大部分条目跨版本仍然有效；新版本新增的文字会显示英文，见下面"维护"。

## 覆盖范围

- 主界面（`dict\hub.json`，约 2900 条）：侧栏、首页、输入区、标题栏菜单（工作区/查看/窗口）、命令面板、设置各页（常规、应用、外观、快捷键、通知、模型、浏览器、账户、反馈）、自定义（插件市场的框架和 Google 自家插件说明）、自动化、权限、终端、审查、浏览器等界面的按钮、标题、说明、提示和错误信息。
- 主进程（`dict\main.json`，98 条）：托盘菜单、退出确认、启动错误、选择文件夹对话框、检查更新、设备和通行密钥选择、网页连接信息、SSH 远程相关对话框和断开页面、WSL 提示、新版欢迎向导。

## 仍是英文的部分

- 产品名、模型名和档位（Antigravity、Gemini 3.8 Flash、High 等）、按键名（Ctrl、Shift、Enter 等）：按约定保留。
- 第三方插件的名称和介绍：来自插件目录数据，经常变化，没有翻译。
- 智能体的回复、你发的消息、文件内容、代码和终端输出：有意不替换。
- 由多段拼成、中间夹着链接或动态内容的少数句子，以及代码里没有提取到的文字：可能仍有零星英文或中英混排。
- Windows 上看不到的 Electron 默认应用菜单（标题栏是自绘的），以及只在 macOS 出现的菜单项：没有翻译。

## 文件

| 路径 | 内容 |
| --- | --- |
| `apply.cmd` / `check.cmd` / `restore.cmd` | 双击入口 |
| `scripts\apply.mjs` | 解包、替换、注入、检查、改名 |
| `scripts\restore.mjs` | 还原 |
| `scripts\lib.mjs` | 路径、asar 读取、状态检查 |
| `src\hub-i18n.js` | 主界面翻译层（追加到 preload.js，词典在生成时内联） |
| `src\zh-guard.js` | 版本保护：万一 `resources\app` 被优先加载而版本和 `app.asar` 不一致，改为加载 `app.asar` |
| `dict\hub.json` | 主界面词典：英文原文 → 中文，`{0}` 等是运行时的值 |
| `dict\main.json` | 主进程替换规则：文件 → 原文片段 → 替换片段 |
| `dict\glossary.md` | 术语表 |
| `tools\` | 维护用脚本（见下） |
| `tmp\` | 中间产物、备份、截图（不纳入 git） |

## 维护（补新版本的词条）

1. `npm install`（只装提取工具用的 acorn）。
2. 用隔离环境启动 Antigravity 并打开调试端口：`powershell -ExecutionPolicy Bypass -File tools\launch-sandbox.ps1`。它把用户目录、AppData 和 `--user-data-dir` 都指到 `tmp\sandbox`，不碰正在用的设置和数据（账户登录状态仍从 Windows 凭据管理器读取）。
3. `node tools\cdp.mjs list` 找到 `https://127.0.0.1:...` 页面，`node tools\cdp.mjs scripts 9333 <页面ID> tmp\hub-scripts` 导出界面脚本。
4. `node tools\extract-hub-strings.mjs tmp\hub-scripts\<序号>_main.js tmp\cand.json`，再 `node tools\refine-hub-strings.mjs tmp\cand.json tmp\missing.json --missing` 得到词典里还没有的文字。
5. 翻译后写成 `{ "英文": "中文" }` 的 JSON，用 `node tools\add-entries.mjs <文件>` 合并进 `dict\hub.json`，再运行 `apply.cmd`。
6. 也可以用 `node tools\ui.mjs 9333 <页面ID> harvest tmp\harvest.txt` 收集当前界面上仍是英文的文字。

`dict\main.json` 的规则在新版本里对不上时，`apply.cmd` 会列出"未匹配"的条目（其余照常应用），按新源码改规则即可。
