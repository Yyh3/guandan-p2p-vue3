# 掼蛋 P2P 局域网版 — Vue 3 + Vite 版

> 离线 4 人联机掼蛋。一人开热点(无流量),4 人连上即玩。零公网、零账号、零广告、纯绿色。

---

## 一、一句话定义

**掼蛋(Guandan)是中国 4 人 2v2 扑克游戏**(类似升级+跑的快)。这个仓库是它的局域网 P2P 实现,Vue 3 + Vite 工程化,核心算法 100% 自实现。

**为什么离线**:
- 高铁 / 隧道 / 野外 / 飞机,常无公网
- 一人开热点 → 4 人秒连 → 一局 5-15 分钟
- 零流量 / 零卡顿 / 规则正版 / 不会被封号

---

## 二、3 步启动

```bash
# 1. 装依赖(0.5-1 min)
npm install

# 2. 启动开发服务器
npm run dev
# 浏览器自动打开 http://localhost:8848

# 3. 跑测试(可选,验证环境)
npm test
# 期望: 279 用例 / 0 失败
```

**4 标签联机测试**:
1. 标签 1:首页 → 「开热点建房」→ 拿到 6 位房间号
2. 标签 2-4:首页 → 「连热点加入」→ 输入房间号
3. 4 标签都点「准备」→ 房主点「开局」→ 进对局

---

## 三、核心特性

### 3.1 已完成(v0.1.0,2026-06)

- ✅ **完整掼蛋规则**:14 种牌型 + 逢人配(红桃级牌万能)+ 升级 + 进贡
- ✅ **AI 单机对战**:3 个 AI + 1 个玩家,中等难度
- ✅ **局域网 P2P 联机**:同浏览器 4 标签可联(BroadcastChannel 模拟)
- ✅ **零公网依赖**:无后端 / 无 fetch / 无远程字体 / 无 CDN
- ✅ **零第三方 UI 库**:Vue 3 + 原生 CSS + 自写设计 token
- ✅ **零账号系统**:本地 localStorage 存昵称 / 头像 / 设置 / 战绩
- ✅ **完整工程化**:279 单元测试 + Playwright 截图回归
- ✅ **打包就绪**:Capacitor 集成(详见 `BUILD.md`)

### 3.2 已知限制(等 v2.0)

- ❌ 真机跨设备不联(浏览器版网络层限制)
- ❌ 没原生 APK/IPA 打包配置
- ❌ AI 只有中等难度
- ❌ 无录像回放

---

## 四、目录结构

```
guandan-p2p-vue3/
├── README.md                # ← 你正在读
├── AGENTS.md                # AI agent 入口(必读)
├── BUILD.md                 # 打包 / 部署教程
├── TROUBLESHOOTING.md       # 排错指南
├── CHANGELOG.md             # 版本变更(在 docs/)
│
├── docs/                    # 详细文档
│   ├── ARCHITECTURE.md      # 系统架构 ⭐
│   ├── ENGINE.md            # 规则引擎
│   ├── AI.md                # AI 决策
│   ├── NETWORK.md           # 网络层
│   ├── UI.md                # UI 系统
│   ├── TESTING.md           # 测试规范
│   ├── STYLE.md             # 代码风格
│   ├── HOWTO-EXTEND.md      # 扩展指南 ⭐
│   ├── ROADMAP.md           # 路线图
│   └── CHANGELOG.md         # 更新日志
│
├── package.json             # npm 配置(零依赖:Vue 3 + Vite)
├── vite.config.js           # Vite 配置(端口 8848)
├── index.html               # HTML 入口
│
├── src/
│   ├── main.js              # Vue 应用入口 + 路由
│   ├── App.vue              # 根组件
│   ├── benchmark.js         # 性能基准
│   ├── styles/
│   │   └── tokens.css       # 设计 token(色/间距/阴影/动效)
│   ├── common/              # ⭐ 核心模块(纯 JS,无 Vue 依赖)
│   │   ├── guandan-engine.js   # 规则引擎(牌型识别/比较/升级)
│   │   ├── guandan-engine.test.js
│   │   ├── guandan-ai.js       # AI 出牌(规则+贪心)
│   │   ├── guandan-ai.test.js
│   │   ├── guandan-game.js     # 对局状态机
│   │   ├── guandan-game.test.js
│   │   ├── audio.js            # 音效 + BGM(Web Audio API)
│   │   ├── audio.test.js
│   │   ├── deal-animation.js   # 发牌动画
│   │   ├── deal-animation.test.js
│   │   ├── card-api.js         # 卡牌数据 API
│   │   ├── card-api.test.js
│   │   ├── effects.js          # 视觉特效
│   │   ├── network.js          # P2P 网络(BroadcastChannel)
│   │   └── storage.js          # localStorage 封装
│   ├── components/          # Vue 组件
│   │   ├── HudTop.vue          # 顶部 HUD
│   │   ├── PlayerSeat.vue      # 玩家座位
│   │   ├── TableCenter.vue     # 中央牌桌
│   │   ├── CardPlay.vue        # 单张牌
│   │   ├── MainActions.vue     # 底部操作栏
│   │   ├── QuickActions.vue    # 右下快捷按钮
│   │   ├── CountdownClock.vue  # 倒计时
│   │   ├── EffectLayer.vue     # 全屏特效
│   │   ├── NicknameEditor.vue  # 昵称编辑器
│   │   ├── ChatQuickPanel.vue  # 快捷聊天
│   │   ├── PlayHintButton.vue  # 智能理牌
│   │   └── HistoryChart.vue    # 战绩图表
│   └── views/               # 页面级组件
│       ├── index/HomeView.vue     # 首页
│       ├── room/RoomView.vue      # 房间页
│       ├── join/JoinView.vue      # 加入页
│       ├── game/GameView.vue      # 对局页(1257 行)
│       ├── ai/AIView.vue          # AI 单机
│       ├── guide/GuideView.vue    # 新手引导
│       ├── history/HistoryView.vue# 战绩
│       └── settings/SettingsView.vue # 设置
│
└── .harness/                # Mavis 多 agent 团队配置(不影响运行)
```

---

## 五、文档地图(给新工程师)

| 你是... | 先读... |
|---------|---------|
| 接手项目的工程师 | **本 README** → `docs/ARCHITECTURE.md` |
| 改规则的工程师 | `docs/ENGINE.md` → `docs/TESTING.md` |
| 改 AI 的工程师 | `docs/AI.md` → `docs/TESTING.md` |
| 改 UI 的工程师 | `docs/UI.md` → `docs/STYLE.md` |
| 改联机的工程师 | `docs/NETWORK.md` |
| 准备打 APK/IPA | `BUILD.md` |
| 遇到 bug | `TROUBLESHOOTING.md` |
| 想加新功能 | `docs/HOWTO-EXTEND.md` |
| AI agent 接手 | `AGENTS.md` |

---

## 六、常用命令

```bash
# 开发
npm run dev               # 起 Vite dev server(http://localhost:8848)
npm run build             # 生产构建(产物 dist/)
npm run preview           # 预览 dist/

# 测试
npm test                  # 全部 279 用例
npm run test:engine       # 规则引擎 85 用例
npm run test:ai           # AI 44 用例
npm run test:game         # 状态机 3 用例
npm run test:anim         # 发牌动画 + 音频 128 用例

# 性能
npm run bench             # 跑性能基准
```

---

## 七、产品决策(已确定,改前看)

> 这 6 条都是 user 已经拍板的,改任何产品逻辑前先回看。

1. **换座 = 只跟队友(对家)换**(不能随便换座位)
2. **昵称 + 头像可自设**(自己挑,不强制随机)
3. **改昵称后其他玩家实时看到**(本地存 + P2P 广播)
4. **对局中禁止改名**(防作弊,v3.7 加)
5. **AI 中等难度**(规则 + 贪心搜索,**非**深度学习)
6. **纯自实现**(不借鉴任何已有掼蛋项目,版权干净)

---

## 八、设计原则

- **离线优先**:零公网、零账号、零流量、零广告
- **零依赖**:Vue 3 + Vite + 原生 CSS,无第三方 UI 库
- **核心独立**:`src/common/` 纯 JS,无 Vue 依赖,可单独在 Node 跑
- **测试覆盖**:279 单测,改算法必加测试
- **设计 token 化**:`src/styles/tokens.css` 集中管理,改色改间距改这里
- **响应式?**:桌面 1280×800 固定布局,移动适配 v2.0

---

## 九、关键技术选择

| 决策 | 方案 | 为什么 |
|------|------|--------|
| 前端框架 | Vue 3 | 组合式 API + Vite 编译快 + Vue DevTools |
| 构建工具 | Vite | 极快冷启动 + 原生 ESM |
| 网络层(v1.0) | BroadcastChannel | 浏览器原生、零依赖,够开发/演示 |
| 网络层(v2.0) | TCP Socket + 移动热点 | 跨设备,真机 |
| 样式 | 原生 CSS + scoped + tokens | 零依赖,版权干净 |
| 测试 | Node 原生 assert + console.log | 零测试框架依赖 |
| 状态管理 | Vue ref + computed | 单页复杂状态,Pinia 过度 |
| 打包 | Capacitor (v2.0) | 跨平台,配置少 |
| 桌面/移动 | 仅 H5 优先 | 移动端 v2.0 |

---

## 十、版本与路线图

| 版本 | 状态 | 主题 |
|------|------|------|
| v1.0 | ✅ 完成 | 规则 + AI + 浏览器版联机 |
| v3.0-3.6 | ✅ 完成 | UI/UX 优化 |
| v3.7 | ✅ 完成 | 体验优化(报数/音效/快捷键/设置) |
| v3.8 | 📋 计划 | P2P 聊天 / 录像回放 |
| v2.0 | 🚧 设计 | 真机 TCP Socket + Capacitor 打包 |
| v4.0 | 💭 构思 | AI 三档难度 |

详见 `docs/ROADMAP.md` / `docs/CHANGELOG.md`。

---

## 十一、贡献者公约

- 改 `common/` 必须有测试(`docs/TESTING.md`)
- 改 UI 用 Playwright 截图回归
- 改 token 跑全页面肉眼对比
- 提交前 `npm test` + `npm run build` 双绿
- Commit 走 Conventional Commits(`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`)
- 描述里写「why」不写「what」

---

## 十二、出问题先看

1. **`TROUBLESHOOTING.md`** — 80% 的常见问题都在
2. **`npm test` 输出** — 基础功能有没有坏
3. **浏览器 F12 控制台** — 前端错误
4. **终端输出** — Vite / Node 错误

**仍然卡住?** 把「做了什么 + 期望什么 + 实际得到什么 + 完整报错」打包给开发者。

---

## 十三、相关链接

- 项目入口:本文件
- AI agent 入口:[AGENTS.md](./AGENTS.md)
- 打包教程:[BUILD.md](./BUILD.md)
- 排错指南:[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- 详细文档:[docs/](./docs/)
- 当前版本:`v0.1.0`(2026-06-09)

---

**最后更新**:2026-06-09(v3.7 完工 + 完整文档齐备)
