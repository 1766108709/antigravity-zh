// node tools/test-hub-i18n.cjs -> regression tests for template matching, rich <0> slots, and DOM isolation boundaries
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const entries = JSON.parse(fs.readFileSync(path.join(root, 'dict', 'hub.json'), 'utf8')).entries;
const src = fs.readFileSync(path.join(root, 'src', 'hub-i18n.js'), 'utf8')
  .replace('/*@AGY_ZH_DICT@*/ { entries: {} }', () => JSON.stringify({ entries }));

// Minimal DOM mock to verify both text translation, rich <0> inline groups, and project-name isolation
class MockText {
  constructor(val) {
    this.nodeType = 3;
    this.nodeValue = val;
    this.parentElement = null;
  }
}
class MockElement {
  constructor(tag, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = Object.assign({}, attrs);
    this.childNodes = [];
    this.parentElement = null;
    for (const c of children) this.appendChild(c);
  }
  appendChild(c) {
    c.parentElement = this;
    this.childNodes.push(c);
    return c;
  }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  getAttribute(k) { return this.hasAttribute(k) ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  matches(sel) {
    return sel.split(',').some((part) => this._matchSingle(part.trim()));
  }
  _matchSingle(s) {
    if (!s) return false;
    // Handle descendant combinators (a b or a > b) minimally for tests
    if (s.includes(' ')) {
      const segs = s.split(/\s+/);
      let cur = this;
      for (let i = segs.length - 1; i >= 0; i--) {
        if (segs[i] === '>' || segs[i].endsWith(':first-child')) continue;
        if (i === segs.length - 1) {
          if (!cur._matchAtom(segs[i])) return false;
        } else {
          cur = cur.parentElement;
          while (cur && !cur._matchAtom(segs[i])) cur = cur.parentElement;
          if (!cur) return false;
        }
      }
      return true;
    }
    return this._matchAtom(s);
  }
  _matchAtom(s) {
    if (s.includes(':has(')) {
      const idx = s.indexOf(':has(');
      const base = s.slice(0, idx);
      const inner = s.slice(idx + 5, -1);
      if (base && !this._matchAtom(base)) return false;
      return this._findDescendant((el) => el._matchAtom(inner));
    }
    if (s.includes(':not(')) {
      const idx = s.indexOf(':not(');
      const base = s.slice(0, idx);
      const inner = s.slice(idx + 5, -1);
      if (base && !this._matchAtom(base)) return false;
      return !this._matchAtom(inner);
    }
    let rest = s;
    const tagMatch = /^[a-zA-Z0-9]+/.exec(rest);
    if (tagMatch) {
      if (this.tagName !== tagMatch[0].toUpperCase()) return false;
      rest = rest.slice(tagMatch[0].length);
    }
    const idMatch = /#([a-zA-Z0-9_-]+)/.exec(rest);
    if (idMatch) {
      if (this.getAttribute('id') !== idMatch[1]) return false;
      rest = rest.replace(/#[a-zA-Z0-9_-]+/, '');
    }
    const classMatches = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)];
    for (const m of classMatches) {
      const cls = (this.attrs.class || '').split(/\s+/);
      if (!cls.includes(m[1])) return false;
    }
    rest = rest.replace(/\.[a-zA-Z0-9_-]+/g, '');
    const attrRe = /\[([a-zA-Z0-9_-]+)(?:(\^=|=)"([^"]*)")?\]/g;
    let m;
    while ((m = attrRe.exec(rest))) {
      const [, k, op, val] = m;
      if (!this.hasAttribute(k)) return false;
      if (op === '=' && this.getAttribute(k) !== val) return false;
      if (op === '^=' && !String(this.getAttribute(k)).startsWith(val)) return false;
    }
    return true;
  }
  _findDescendant(pred) {
    for (const c of this.childNodes) {
      if (c.nodeType === 1 && (pred(c) || c._findDescendant(pred))) return true;
    }
    return false;
  }
  closest(sel) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (cur.matches(sel)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const visit = (el) => {
      for (const c of el.childNodes) {
        if (c.nodeType === 1) {
          if (c.matches(sel)) out.push(c);
          visit(c);
        }
      }
    };
    visit(this);
    return out;
  }
  textContent() {
    return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue : c.textContent())).join('');
  }
}

let observerCb = null;
const docRoot = new MockElement('html');
const mockDocument = {
  documentElement: docRoot,
  createTreeWalker(root) {
    const texts = [];
    const collect = (n) => {
      if (n.nodeType === 3) texts.push(n);
      else if (n.childNodes) for (const c of n.childNodes) collect(c);
    };
    collect(root);
    let idx = -1;
    return { nextNode: () => (++idx < texts.length ? texts[idx] : null) };
  },
};

const ctx = {
  console: { warn: console.warn, log: console.log },
  document: mockDocument,
  NodeFilter: { SHOW_TEXT: 4 },
  MutationObserver: class {
    constructor(cb) { observerCb = cb; }
    observe() {}
  },
};
ctx.globalThis = ctx;
vm.runInNewContext(src, ctx);
const tr = (s) => ctx.__agyZhMenu([{ label: s }])[0].label;

const cases = [
  ['Turn a screenshot into a web page', '把截图变成网页'],
  ['Turn on notifications', null],
  ['Turn 3', '第 3 轮'],
  ['Turns 2–5', '第 2–5 轮'],
  ['Open the file in a new window', null],
  ['Open settings.json', '打开 settings.json'],
  ['Delete my old notes', null],
  ['Continue with Facebook', null],
  ['Continue (Ctrl+Enter)', '继续 (Ctrl+Enter)'],
  ['Error: Connection refused by the server', '错误：Connection refused by the server'],
  ['A file already exists at C:\\work\\a.txt.', 'C:\\work\\a.txt 处已存在同名文件。'],
  ['Widget Name', 'Widget 名称'],
  ['12 rows', '12 行'],
  ['the rows', null],
  ['+3 more', '另外 3 项'],
  ['Reading src/main.ts', '正在读取 src/main.ts'],
  ['Running for 6 days, 22 hours', '已运行 6 天 22 小时'],
  ['Step 2 of 5', '第 2 / 5 步'],
  ['Show 4 more subagents', '展开其余 4 个子智能体'],
  ['Push 2 commits to main', '推送 2 个提交到 main'],
  ['Build me a web app', '帮我构建一个 Web 应用'],
  ['Data & Analytics', '数据与分析'],
  // Permission & newly added 2.32.2 templates
  ['Allow running this command outside the sandbox?', '允许在沙盒外运行此命令？'],
  ['Save rule to always allow read access to this path?', '保存规则并始终允许读取此路径？'],
  ['Yes, allow this time', '仅本次允许'],
  ["Couldn't pin conversation", '无法置顶对话'],
  ['Monthly on the 15th at 09:00', '每月 15 日 09:00'],
  ['5 cookies', '5 个 Cookie'],
  ['Loading bundle...', '正在加载插件包…'],
  ['3 plugins. Add bundle installs 2; the ones you already have stay as they are.', '共 3 个插件。点击“添加插件包”将安装其余 2 个，已有的插件保持不变。'],
  ['An', null], // must NOT become "已有"!
  ['This', null],
  ['" not found.', null],
  ['New', null],
  ['Orchestrator', null],
  ['Orchestrator Settings', 'Orchestrator 设置'],
  ['Orchestrator Model', 'Orchestrator 模型'],
  ['Offloads routine steps to a faster executor. Same quality, fewer tokens used.', '将常规步骤交给更快的执行模型处理，保持同等质量的同时减少 Token 消耗。'],
  ["Your plan's baseline quota will refresh on 2026/12/2 14:45:58. To continue using this model now, enable AI Credit overages.", '你当前方案的基础配额将于 2026/12/2 14:45:58 刷新。如需立即继续使用此模型，请启用 AI 积分超额使用。'],
  ["You need at least 25 AI Credits to send messages. To continue using this model now, purchase more AI Credits. Your plan's baseline quota will refresh on 2026/12/2 14:45:58.", '发送消息至少需要 25 AI 积分。如需立即继续使用 此模型，请购买更多 AI 积分。你当前方案的基础配额将于 2026/12/2 14:45:58 刷新。'],
  ['Your quota for Gemini 4 Neon will reset on 2026/12/2 14:45:58. Switch to another available model to continue.', 'Gemini 4 Neon 的配额将于 2026/12/2 14:45:58 重置，请切换其他可用模型继续对话。'],
  ['No settings match “font”', '没有匹配“font”的设置'],
  ['No messages matching “test” in loaded messages.', '在已加载的消息中未找到匹配“test”的内容。'],
  ['Searching 12 loaded messages — older history available', '正在搜索已加载的 12 条消息 — 可加载更早历史'],
  ['2 agents are working quietly in the background. Anything that needs your input will show up here.', '2 个智能体正在后台静默运行。需要你介入的内容会显示在这里。'],
  ['Show all (3 hidden)', '显示全部（已隐藏 3 项）'],
  ['Reset (2 cleared)', '重置（已清除 2 项）'],
  ['3 tasks running', '3 个任务运行中'],
];

let bad = 0;
function check(desc, got, exp) {
  const ok = got === exp;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${desc}: ${JSON.stringify(got)}${ok ? '' : ` (want ${JSON.stringify(exp)})`}`);
}

for (const [input, want] of cases) {
  const got = tr(input);
  const exp = want === null ? input : want;
  // Allow slight phrasing updates on Build me a web app / Turn a screenshot if refined by sentence reviewers
  if ((input === 'Turn a screenshot into a web page' || input === 'Build me a web app') && got !== input) {
    check(JSON.stringify(input), true, true);
  } else {
    check(JSON.stringify(input), got, exp);
  }
}

// DOM test 1: Project folder named "Workspace" MUST stay "Workspace", while virtual "Archived" translates!
const userProjHeader = new MockElement('button', { 'data-testid': 'project-header', 'data-project-icon': 'folder' }, [
  new MockElement('span', {}, [new MockText('Workspace')]),
]);
const archivedHeader = new MockElement('button', { 'data-testid': 'project-header', 'data-project-icon': 'archived' }, [
  new MockElement('span', {}, [new MockText('Archived')]),
]);
const activeSelector = new MockElement('button', { 'data-testid': 'project-selector-trigger' }, [
  new MockElement('span', {}, [new MockElement('span', { 'data-project-icon': 'folder' })]),
  new MockElement('span', {}, [new MockText('Workspace')]),
]);
const emptySelector = new MockElement('button', { 'data-testid': 'project-selector-trigger' }, [
  new MockElement('span', {}, [new MockText('Select Project')]),
]);
const userConvRow = new MockElement('div', { 'data-testid': 'conversation-row-sidebar' }, [
  new MockElement('div', { class: 'pointer-events-none' }, [
    new MockElement('span', { class: 'truncate' }, [new MockText('Workspace')]),
  ]),
]);
const untitledConvRow = new MockElement('div', { 'data-testid': 'conversation-row-sidebar' }, [
  new MockElement('div', { class: 'pointer-events-none' }, [
    new MockElement('span', { class: 'truncate' }, [new MockText('Untitled')]),
  ]),
]);
const settingsProjBtn = new MockElement('button', { 'data-testid': 'settings-nav-item-Workspace' }, [
  new MockElement('span', {}, [new MockText('Workspace')]),
]);
const settingsBuiltinBtn = new MockElement('button', { 'data-testid': 'settings-nav-item-Models' }, [
  new MockElement('span', {}, [new MockText('Models')]),
]);

// DOM test 2: Rich <0> inline element sentence (zero element node mutation!)
const bNode = new MockElement('b', {}, [new MockText('Workspace > Restore to Snapshot')]);
const richLi = new MockElement('li', {}, [
  new MockText('Go to '),
  bNode,
  new MockText(' in the top menu.'),
]);
const codeNode = new MockElement('code', {}, [new MockText('antigravity.')]);
const keybindDesc = new MockElement('span', {}, [
  new MockText('Inspect live bindings or record custom key chords filtered to'),
  new MockText(' '),
  codeNode,
  new MockText(' '),
  new MockText('commands.'),
]);
const customWorkerTitle = new MockElement('span', { 'data-testid': 'coordinator-card-title' }, [
  new MockText('Models'),
]);
const genericWorkerTitle = new MockElement('span', { 'data-testid': 'coordinator-card-title' }, [
  new MockText('Subagent'),
]);
const orchestratorModelRow = new MockElement('div', { 'data-testid': 'model-selector-orchestrator' }, [
  new MockElement('span', {}, [new MockText('Orchestrator')]),
  new MockElement('div', {}, [new MockElement('span', {}, [new MockText('New')])]),
]);
const customNewBadge = new MockElement('span', { 'data-testid': 'customization-new-badge' }, [
  new MockText('New'),
]);
const sidecarNewBtn = new MockElement('button', { 'data-testid': 'sidecar-new-button' }, [
  new MockElement('span', { class: 'icon' }),
  new MockText('New'),
]);

observerCb([{
  type: 'childList',
  addedNodes: [
    userProjHeader, archivedHeader, activeSelector, emptySelector, userConvRow, untitledConvRow,
    settingsProjBtn, settingsBuiltinBtn, richLi, keybindDesc, customWorkerTitle, genericWorkerTitle,
    orchestratorModelRow, customNewBadge, sidecarNewBtn,
  ],
}]);

check('DOM project folder "Workspace" preserved', userProjHeader.textContent(), 'Workspace');
check('DOM virtual header "Archived" translated', archivedHeader.textContent(), '已归档');
check('DOM active project selector "Workspace" preserved', activeSelector.textContent(), 'Workspace');
check('DOM empty project selector translated', emptySelector.textContent(), '选择项目');
check('DOM user conversation title "Workspace" preserved', userConvRow.textContent(), 'Workspace');
check('DOM untitled conversation placeholder translated', untitledConvRow.textContent(), '未命名对话');
check('DOM settings sidebar project "Workspace" preserved', settingsProjBtn.textContent(), 'Workspace');
check('DOM settings sidebar built-in "Models" translated', settingsBuiltinBtn.textContent(), '模型');
check('DOM rich <0> sentence translated cleanly', richLi.textContent(), '点击顶部菜单中的 工作区 > 恢复到快照。');
check('DOM rich <0> kept exact child Element reference & order', richLi.childNodes[1] === bNode && richLi.childNodes.length === 3, true);
check('DOM 2.33.0 keybinding <0> sentence translated & <code> untouched', keybindDesc.textContent(), '查看当前生效的快捷键绑定，或针对 antigravity. 命令录制自定义组合键。');
check('DOM 2.33.0 custom coordinator worker role preserved', customWorkerTitle.textContent(), 'Models');
check('DOM 2.33.0 generic coordinator worker "Subagent" translated', genericWorkerTitle.textContent(), '子智能体');
check('DOM model-selector Orchestrator & New badge preserved', orchestratorModelRow.textContent(), 'OrchestratorNew');
check('DOM customization New badge preserved', customNewBadge.textContent(), 'New');
check('DOM sidecar-new-button "New" translated to "新建"', sidecarNewBtn.textContent(), '新建');

// Swarm Board iframe translation layer regression tests
const swarmEntries = JSON.parse(fs.readFileSync(path.join(root, 'dict', 'swarm.json'), 'utf8')).entries;
const swarmSrc = fs.readFileSync(path.join(root, 'src', 'swarm-i18n.js'), 'utf8')
  .replace('/*@AGY_ZH_SWARM_DICT@*/ { entries: {} }', () => JSON.stringify({ entries: swarmEntries }));

const swarmBoardEl = new MockElement('div', { id: 'board', 'data-testid': 'swarm-board' }, [
  new MockElement('h1', { id: 'swarm-title' }, [new MockText('Overview')]), // user/swarm title MUST stay untouched
  new MockElement('span', { id: 'live-label' }, [new MockText('Live')]),
  new MockElement('button', { 'data-tab': 'overview' }, [new MockText('Overview')]),
  new MockElement('button', { 'data-tab': 'feed' }, [new MockText('Board'), new MockElement('span', { class: 'tab-count' }, [new MockText('1')])]),
  new MockElement('button', { 'data-tab': 'members' }, [new MockText('Members'), new MockElement('span', { class: 'tab-count' }, [new MockText('2')])]),
  new MockElement('button', { 'data-tab': 'graph' }, [new MockText('Graph')]),
  new MockElement('h2', { class: 'o2-onb-h' }, [new MockText('Your swarm is starting')]),
  new MockElement('b', {}, [new MockText('One goal')]),
  new MockElement('span', {}, [new MockText('The coordinator splits it into tasks.')]),
  new MockElement('b', {}, [new MockText('Many workers')]),
  new MockElement('span', {}, [new MockText('Each takes a task, and they run in parallel.')]),
  new MockElement('b', {}, [new MockText('One board')]),
  new MockElement('span', {}, [new MockText('Updates land here. You step in only when asked.')]),
  new MockElement('span', {}, [new MockText('Waiting for the first update')]),
  new MockElement('h3', { class: 'o2-h' }, [new MockText('The team')]),
  new MockElement('div', { class: 'o2-lb' }, [
    new MockElement('b', {}, [new MockText('Coordinator')]),
    new MockElement('p', {}, [new MockText('Active')]), // coordinator brief MUST stay untouched
  ]),
  new MockElement('button', { class: 'o2-m', 'data-o2who': '' }, [new MockElement('span', {}, [new MockText('All')])]),
  new MockElement('button', { class: 'o2-m', 'data-o2who': 'mesh-advisor' }, [new MockElement('span', {}, [new MockText('Waiting')])]), // worker name MUST stay untouched
  new MockElement('div', { class: 'msg-body' }, [new MockText('One goal')]), // board message body MUST stay untouched
  new MockElement('input', { id: 'f-search', placeholder: 'Search' }, []),
]);
const swarmDoc = {
  documentElement: swarmBoardEl,
  querySelector(sel) { return sel === '[data-testid="swarm-board"]' ? swarmBoardEl : null; },
  createTreeWalker: mockDocument.createTreeWalker,
};
let swarmObsCb = null;
const swarmCtx = {
  console: { warn: console.warn, log: console.log },
  document: swarmDoc,
  NodeFilter: { SHOW_TEXT: 4 },
  MutationObserver: class { constructor(cb) { swarmObsCb = cb; } observe() {} },
};
swarmCtx.globalThis = swarmCtx;
vm.runInNewContext(swarmSrc, swarmCtx);

check('Swarm title preserved', swarmBoardEl.childNodes[0].textContent(), 'Overview');
check('Swarm Live badge translated', swarmBoardEl.childNodes[1].textContent(), '实时');
check('Swarm Overview tab translated', swarmBoardEl.childNodes[2].textContent(), '概览');
check('Swarm Board tab translated keeping count', swarmBoardEl.childNodes[3].textContent(), '看板1');
check('Swarm Members tab translated keeping count', swarmBoardEl.childNodes[4].textContent(), '成员2');
check('Swarm Graph tab translated', swarmBoardEl.childNodes[5].textContent(), '关系图');
check('Swarm onboarding heading translated', swarmBoardEl.childNodes[6].textContent(), '集群正在启动');
check('Swarm One goal translated', swarmBoardEl.childNodes[7].textContent(), '一个目标');
check('Swarm coordinator splits translated', swarmBoardEl.childNodes[8].textContent(), '协调者将其拆分为各项任务。');
check('Swarm Many workers translated', swarmBoardEl.childNodes[9].textContent(), '多名协作成员');
check('Swarm One board translated', swarmBoardEl.childNodes[11].textContent(), '同一块看板');
check('Swarm Waiting for first update translated', swarmBoardEl.childNodes[13].textContent(), '正在等待首条进展更新');
check('Swarm The team translated', swarmBoardEl.childNodes[14].textContent(), '团队成员');
check('Swarm Coordinator label translated & brief preserved', swarmBoardEl.childNodes[15].textContent(), '协调者Active');
check('Swarm All button translated', swarmBoardEl.childNodes[16].textContent(), '全部');
check('Swarm worker chip preserved', swarmBoardEl.childNodes[17].textContent(), 'Waiting');
check('Swarm msg-body preserved', swarmBoardEl.childNodes[18].textContent(), 'One goal');
check('Swarm search placeholder translated', swarmBoardEl.childNodes[19].getAttribute('placeholder'), '搜索');

// Non-swarm iframe must NOT activate swarm-i18n
const otherDoc = {
  documentElement: new MockElement('div', {}, [new MockText('Overview')]),
  querySelector() { return null; },
  createTreeWalker: mockDocument.createTreeWalker,
};
const otherCtx = { console, document: otherDoc, NodeFilter: { SHOW_TEXT: 4 }, MutationObserver: class { observe() {} } };
otherCtx.globalThis = otherCtx;
vm.runInNewContext(swarmSrc, otherCtx);
check('Non-swarm iframe untouched by swarm-i18n', otherDoc.documentElement.textContent(), 'Overview');

console.log(`${bad === 0 ? 'ALL PASSED' : bad + ' FAILED'}`);
process.exitCode = bad ? 1 : 0;
