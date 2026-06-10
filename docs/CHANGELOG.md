# 更新日志 (Changelog)

> 项目的所有重要变更,按版本倒序。

---

## v0.2.0 (2026-06-10) — v3.8 4-tab 局域网联机 P0+P1+P2

### 新增

#### v3.8 P0 — 4-tab 局域网联机基础(7 个连环 bug 修复)

- `RoomView.vue` 房间号改用 `?roomNo=` URL 参数(joiner 不会自己随机生成新号)
- `RoomView.vue` host 房间号持久化到 `sessionStorage`(HMR/刷新不丢)
- `JoinView.vue` 预填 URL 里的 `?roomNo=`
- `RoomView.vue` 预填 URL 里的 `?nick=&avatar=`(扫码加入)
- `network.js` 删掉老的 `message:JOIN` handler,改用 `connect` 事件(seat=-1 死锁修复)
- `RoomView.vue` host 自己手动 `peers.set(0, ...)`(开局按钮卡在"准备"修复)
- `RoomView.vue` 4-tab 跳转时 `broadcast({ type: 'GAME_START' })`,joiner 也跳 `/game`
- `RoomView.vue` 移除 `onUnmounted(net.close)`(joiner 跳 /game 时 channel 不会关)

#### v3.8 P1 — 4-tab 真玩家名 + 出牌同步

- `network.js` host 收到新 joiner 时也 `broadcast SYNC` 给老 joiner(否则后到的玩家不被老 joiner 知道)
- `network.js` joiner 每 15s 自动 re-JOIN(host 刷新/网络闪断自动恢复)
- `guandan-engine.js` 加 `mulberry32` PRNG 和 `deal(seed)`(4-tab 联机确定性发牌)
- `guandan-game.js` `createGame` 接 `seed` 参数,`firstPlayer` 也用 seeded 随机
- `guandan-game.js` 新增 `applyPlay`/`applyPass`/`applyRoundEnd` 无校验接口(4-tab 联机同步用)
- `guandan-game.js` `aiPlayers=[]` 时跳过 AI 调度(联机 4 人都是真人)
- `guandan-game.js` 新增 `_applySnapshot(snap)` 断线重连用
- `guandan-game.js` 新增 `addAIPlayer`/`removeAIPlayer`/`setAIBroadcast` 动态 AI 接管
- `GameView.vue` `seatData` 按 `selfSeat` 旋转 seat 视图(joiner 不会看错队友)
- `GameView.vue` `myTurn` 按 `selfSeat` 判断(joiner 能出牌)
- `GameView.vue` `applyNetworkPlayers` 从 `net.getPeers()` 覆盖 AI 占位
- `GameView.vue` P2P 模式:host 广播 DEAL(带 seed)→ joiner 用同 seed 发同一手牌
- `GameView.vue` P2P 模式:本地出牌 `broadcast(PLAY)`,其他 tab 监听调 `applyPlay`
- `GameView.vue` P2P 模式:本地过牌 `broadcast(PASS)`,其他 tab 监听调 `applyPass`
- `GameView.vue` P2P 模式:结算广播 `ROUND_END`,所有 tab 同步结算/升级
- `GameView.vue` P2P 模式:断线重连广播 `STATE_SNAPSHOT`,joiner 收到覆盖本地 state
- `GameView.vue` P2P 模式:心跳超时广播 `AI_TAKEOVER`,掉线玩家被 AI 接管

### 修复

- 4-tab 进对局后之前显示 AI-东/北/西 默认名 → 显示真玩家名
- 4-tab 各自发不同手牌 → 同 seed 发同一手牌
- 4-tab 出牌后只有本地更新 → 4 tab 同步更新
- joiner 跳 /game 后 channel 被关 → 不再关
- host 自己不算 seat 0 导致开局按钮不显示 → 手动加
- 4-tab 跳 /game 时 joiner 永远卡在 /room → 广播 GAME_START

### 测试

- engine: 93 / 0(原 85, +8 seeded deal + mulberry32)
- AI: 44 / 0
- game: 24 / 0(原 11, +13 apply/seed/P2P 测试)
- audio: 117 / 0
- card-api: 19 / 0
- network: 71 / 0
- multitab: 28 / 0(原 25, +3 SYNC 广播回归)
- **396 / 0 全过**

### 端到端

- Chrome + CDP 4-tab 联机 demo:4 tab 全进对局、拿同手牌、出牌同步、AI 接管
- 4-tab 截图存档

---

## v0.1.0 (2026-06-09) — v3.7 体验优化 + 完整文档

### 新增

- 完整开发者文档(9 篇 `docs/*.md`)
- `docs/ARCHITECTURE.md` — 系统架构
- `docs/ENGINE.md` — 规则引擎
- `docs/AI.md` — AI 决策
- `docs/NETWORK.md` — 网络层
- `docs/UI.md` — UI 系统
- `docs/TESTING.md` — 测试规范
- `docs/STYLE.md` — 代码风格
- `docs/ROADMAP.md` — 路线图
- `docs/HOWTO-EXTEND.md` — 扩展指南
- 重新梳理的 `README.md`

### 修复 (v3.7 尾巴)

- 动画开关 disabled 状态不再显示绿色(改灰色,避免误导)
- BGM 风格切换持久化到 localStorage(刷新保留)

### 测试

- 279/0 全过
- 新增 6 个 v3.7 验证截图

---

## v0.1.0 (2026-06-08) — v3.7 体验优化三个等级

### 新增

- **P0**:报数规则 / 对局中禁改名 / 炸弹音效 / BGM 折中 / 自座位位置 C
- **P1**:出牌音效分级 / 紧急蜂鸣 / 桌面快捷键 / 快捷聊天
- **P2**:战绩图表 / 集中设置面板 / /settings 路由

### 改动

- `src/common/audio.js` — 重写 6 种 SFX + Web Audio 拍鼓点 BGM
- `src/components/PlayerSeat.vue` — 报数 + 紧急 + 头像
- `src/components/NicknameEditor.vue` — inline 模式
- `src/components/HudTop.vue` — 自座位位置 C
- `src/views/game/GameView.vue` — 接 urgent / 快捷键 / 聊天
- `src/components/ChatQuickPanel.vue`(新) — 10 颗 pill
- `src/components/HistoryChart.vue`(新) — 零依赖 SVG
- `src/views/settings/SettingsView.vue`(新) — 集中设置
- `src/views/history/HistoryView.vue` — 插图表
- `src/views/index/HomeView.vue` — 加设置入口
- `src/main.js` — 注册 /settings 路由

### 测试

- engine 85 / ai 44 / game 3 / deal-anim 11 / audio 117 / card-api 19
- **总计 279 用例 / 0 失败**

---

## v0.1.0-v3.6 (2026-06) — UI/UX 优化

### v3.6 — 视觉打磨

- 4 角单字(左上玩家名 / 右上倍数 / 左下级牌 / 右下轮数)
- 智能理牌渐变按钮
- 列底 ×N 数量提示
- 大小王 SVG 化(headless 渲染兼容)
- 智能理牌(调 `ai.autoPlayGrouped`)
- 一键理按钮

### v3.5 — Bug 修复

- 修组件重叠 / 牌显示不全
- 大小王用红色/灰色小丑 SVG(替代 emoji,emoji 在 headless 渲染失败)
- 顶 tip 合并
- 列高动态 96+(n-1)*20

### v3.0-3.4 — 核心 UI 重设计

- 顶部 HUD 重组
- 中央牌桌 + 桌面牌 + 首家提示
- 手牌竖叠排版(每列一个 rank)
- 身份三色(自己绿 / 队友蓝 / 对手红)
- 设计 token 系统(`tokens.css`)

---

## v0.1.0-v1.0 (2026-05) — 基础可用

### 完成

- 牌组生成 / 洗牌 / 发牌
- 14 种牌型识别
- 大小比较 + 升级 + 进贡
- 逢人配(红桃级牌万能)
- AI 出牌决策(规则 + 贪心,中等难度)
- 对局状态机(发牌 / 出牌 / 过牌 / 一轮结束 / 一局结束)
- 浏览器版网络层(BroadcastChannel)
- localStorage 存储(昵称 / 头像 / 设置 / 战绩)
- Vue 3 + Vite 工程化
- 80+ 单元测试
- 8 个 view:Home / Room / Join / Game / AI / Guide / History / Settings
- 12 个 component:HudTop / PlayerSeat / TableCenter / CardPlay / ...

### 已知限制

- ❌ 网络层只支持同浏览器标签联机(真机需 v2.0 重写)
- ❌ AI 只有中等难度
- ❌ 没原生 APK/IPA 打包
- ❌ 无录像回放

---

## 版本约定

```
vMAJOR.MINOR.PATCH

MAJOR: 架构级变化(网络层 / 打包)
MINOR: 新功能
PATCH: Bug 修复 / 小调整
```

**当前**:`0.1.0`(v3.7 完工,文档齐备)

**首发目标**:`v1.0.0`(H5 公开版本)
