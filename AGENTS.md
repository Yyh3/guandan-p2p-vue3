# AGENTS.md

> 掼蛋 P2P 局域网版 —— AI agent / coding 工具的协作入口
>
> 任何 AI agent 接手本项目前**先读这个文件**，能少走 90% 的弯路。

## 构建环境（本机 Windows,2026-07-19 配置）

- JDK 21：`C:\dev\jdk-21`（TUNA 镜像 Temurin）
- Android SDK：`C:\dev\android-sdk`（build-tools 35.0.0/36.0.0 + platform android-36，腾讯镜像；licenses 已接受）
- Gradle 8.14.3：`C:\dev\gradle-8.14.3`（腾讯镜像；用 `gradle.bat assembleDebug`，gradlew 会去官方源下载）
- Maven 依赖：`~/.gradle/init.gradle` 配了阿里云镜像（google/central/gradle-plugin），`android/local.properties` 指 `sdk.dir`
- 构建命令：`export JAVA_HOME='C:\dev\jdk-21' ANDROID_HOME='C:\dev\android-sdk' && cd android && /c/dev/gradle-8.14.3/bin/gradle.bat assembleDebug --no-daemon`
- 产物：`android/app/build/outputs/apk/debug/app-debug.apk`（约 18MB）

## 当前任务记录

- 2026-07-20：完成 v0.4.27 全项目对抗性审查修复 + web/安卓一致性 + UI 留存建议（用户要求“对抗性审查查出整个项目 bug”）：
  - 网络层 P0-1（换座×心跳检查器×解散三者叠加，任何一次换座必在 ~6-23s 内解散房间）：心跳检查器不跳过 `hostSeat`，换座后 host 新座位无心跳被收割 → RoomView `peer:leave` 命中 hostSeat 即解散。修复：真实/测试版心跳检查器均跳过 `hostSeat`（收割时补清 token/connAlive）；`swapSeats(a,b)` 同步互换 `lastHeartbeat`/`seatResumeTokens`/`seatConnAlive` 账目（顺带修二次换座 token 不匹配 P1-2）。
  - 网络层 P1-1：joiner 收到涉及自身的 `SEAT_SWAP_COMMITTED` 后不重绑 ws↔seat → 加 `scheduleJoinRetry()`。
  - 网络层 P2-1：`relayFromClient` 三处 seat 0 硬编码改 `hostSeat`（换座后 host 不在 0 号位时转发全断）。
  - 网络层 P2-2：`_scanHttpWsRooms` 加 `stopOnFirst` 提前终止；JoinView 输房号快扫接线（命中即选中）。
  - 视图一致性（web/安卓，按用户友好取舍）：web 房主「邀请好友」弹窗不再被 `return` 拦死（落房间号分支）；web 输房号点加入自动扫描同网房主；JoinView 误导文案改引导式；`onNickConfirm` 加幽灵座位守卫（`selfSeat===-1` 不写 `peers.set(-1)`）。web 无扫码入口判为有意设计不强制对齐。
  - 暂缓：P1-3（ws 瞬断即踢回首页 / AndroidWs 无重连）——需 transport 层重连状态机，架构改动大。
  - 测试：新增 `v0427-adversarial-fixes.test.js`（29 case，含真 WS 链路换座收割场景）并注册；`v0425-joker-lastplay-ui.test.js` 字符窗口断言放宽（400→700 / 500→800，行为未变仅注释拉长）；`npm test` 全绿；`npm run build` 成功。
  - 文档：`docs/UI-RETENTION-SUGGESTIONS.md`（UI 美化与留存建议，P0/P1/P2 三档 + 设计原则）。

- 2026-07-20：完成发牌稳定性加固 + 聊天配音（用户真机反馈）：
  - 真机"AI 模式不自动发牌"：根因疑似真机 WebView 冻结/节流定时器链导致 `dealAnim` onComplete 永不到达；`startDealAnimation` 新增 3.2s 软兜底（动画理论时长 2.3s）——超时强制 `dealAnim.cancel()` + `isDealing=false` + `finishDeal`，不弹超时遮罩只留日志；新增 `[deal] anim start/complete` 面包屑日志便于现场诊断；8s 硬兜底保留。
  - 聊天配音：`audio.js` 新增导出 `speakText`（与牌型播报同 `_speak` 通道，voiceEnabled 开关 + cancel 顶掉旧播报）；`onChatSelect` 发送时本地朗读、`onChatQuick` 收到对方快捷聊天也朗读（"打得不错"等两侧都有配音）。
  - 测试：`audio.test.js` speakText 2 case（149 全过）；`v0425` 套件块 M（8 case，累计 124）；`npm run build` 成功。

- 2026-07-20：完成体验五件套（用户真机/实机反馈）：
  - 昵称/头像本地不刷新：`RoomView.onNickConfirm` 旧版只改 ref + 广播，`peers` 里自己没更新且未持久化；改为同步更新本地座位 + `storage.setNickname/setAvatar`。
  - 进 App 自动 BGM：`main.js` 原生直接 `startBgm`，浏览器注册一次性 `pointerdown` 解锁 AudioContext 后启动（autoplay 策略）。
  - 按钮轻音效：`audio.js` 新增 `sfxClick`（1250→900Hz triangle 50ms、音量 0.12 不吵）；`main.js` 全局 `pointerdown` 委托 `button/a/[role=button]` 触发。
  - 二维码放大：生成宽度 180→320，展示 100→168px。
  - 息屏掉线解析与修复：息屏后 WebView 冻结 JS/WebSocket，心跳停发 6s 被 host 释放（局域网没断）；`RoomView` 新增 `visibilitychange` 监听，唤醒发现断线自动 `joinRemoteRoom`（uuid+resumeToken 恢复原 seat，已释放则新分配）。
  - 测试：`v0425` 套件块 L（12 case，累计 116）；`npm run build` 成功。

- 2026-07-19：完成真机跨设备入房链路修复（用户真机反馈"多手机同热点进不了同一房间"）：
  - 根因：浏览器版默认 BroadcastChannel（仅同机多标签），跨设备必须一台手机装 APK 当 host（AndroidWs 起真 WS server）；浏览器当 host 根本没法被加入。
  - App 扫码自动进房：`JoinView` 扫码成功后直接 `router.push('/room?...')`（旧版只填地址还要手点加入）；`parseQrScanResult` 支持 `guandan://room|join` scheme。
  - guandan:// 深链桥：`qr-fallback.js` 新增 `buildAppDeepLink`；`AndroidManifest.xml` 注册 `guandan` scheme；`main.js` 监听 `appUrlOpen` + `getLaunchUrl` 直达 `/room?role=joiner&host=...`；`QrFallbackCard` 展示「点此直接拉起 App 加入」链接；JoinView 浏览器页展示 App 深链桥。
  - 测试：`qr-fallback.test.js` 深链 10 case（63 全过）；`v0425` 套件块 K（104 case）；`npm run build` 成功；`network-weaknet.test.js` kick 断言加固（KICKED/PEER_LEAVE 双路径任一 + 等待 600→1200ms）；v0410/v0417~v0421 版本断言随 0.4.25 刷新；v0424 扫码复查断言窗口放宽（自动进房回调变长）。
  - APK 构建（国内镜像工具链）：JDK 21 `C:\dev\jdk-21`（TUNA）+ Android SDK `C:\dev\android-sdk`（腾讯，build-tools 35/36 + platform 36）+ Gradle `C:\dev\gradle-8.14.3` + 阿里云 maven 镜像（`~/.gradle/init.gradle`）；产物 `android/app/build/outputs/apk/debug/app-debug.apk`（约 18MB，已含 guandan:// 深链）。

- 2026-07-19：完成四项体验修复（用户反馈）：
  - 桌面出牌分不清几张 3：归属胶囊加牌型名（`lastPlayTypeName`，数字/字符串 type 双映射），TableCenter `lp-type` 高亮显示（"AI-西 · 顺子"）。
  - AI 开局就扔炸弹：`chooseLead` 重排（对子→三张→顺子→残局炸弹（≤6 张）→单张→兜底炸），`chooseLeadHard` 保留阈值反转（>6 张保留、≤6 张才领炸）；单张选择不拆炸弹 rank（`nonBomb` 池优先）；`guandan-ai.test.js` 块 24/25 反转 + 25b 新增（80 case）。
  - 一键理牌理顺子/同花顺：引擎新增 `groupHandCombo`（王→鬼→炸弹→同花顺→顺子→连对→钢板→三张→对子→单张，combo 列带中文 label）；`sortMode` 三模式循环（rank→combo→custom），理牌按钮循环 + toast；`guandan-engine.test.js` 块 13b（14 case）。
  - 自定义理牌：`customOrder` 卡牌顺序 + `moveCustomCard` 换位；拖动=换位（桌面 mouse/移动 touch 命中检测）与拖动连选按模式分流；新牌兜底附加；单列隐藏 ×1 角标。
  - 测试：`v0425` 套件加块 J（14 case，累计 97）；`npm run build` 成功；Playwright 截图核对三模式切换。
  - 手牌布局三调（用户截图反馈）：绿色点数角标全删（仅保留牌型名列标）；`sortMode` 默认改 `combo`（炸弹/同花顺统一靠左）；桌面列负 margin -18px 横向重叠收紧、列底/分隔线去除、选中列 z-index 20；`groupHandCombo` 长顺/长连对/长钢板按 5 张/3 对/2 组切列（防 12 连张单列竖叠冲出屏幕）；`guandan-engine.test.js` 补切分用例（158 case）。

- 2026-07-19：完成主流掼蛋手游对标 UX 六件套 + P1-16（用户调研驱动）：
  - 选中牌型实时预览：`useGameLogic.selectedPreview`（`E.recognize` 识别 + `E.canBeat` 判可压），两端手牌区上方胶囊「顺子·5 张 ✓可压 / ✗压不过 / 无效牌型」。
  - 拖动连选：`useGameLogic` 拖动状态机（`dragStart/dragOver/dragEnd/dragIsActive/consumeDragSuppress` + `setCardSelected`）；桌面 mousedown/mouseenter/mouseup，移动 touchstart/touchmove 命中检测（`data-card-key`）/touchend，与长按选列共存，拖动后合成 click 吞掉。
  - 记牌器：`cardCounter` computed（总数 8/2 - playedHistory - 自己手牌），新组件 `CardCounter.vue`（右缘悬浮 + 折叠面板，级牌高亮、剩 0 置灰）。
  - 飞牌轨迹：`lastPlayerPos` computed（lastPlay.who → bottom/top/left/right），TableCenter 牌堆按方位 class + `--fly-x/y` CSS 变量从出牌者方向飞入。
  - 简洁模式：storage `simpleMode` + SettingsView 外观区开关 + 全局 `simple-mode.css`（隐藏牌桌花纹/光效/牌面纹理，收敛阴影），两端 `.page` 挂 class。
  - 级牌进度轨：新组件 `LevelTrack.vue`（2→A 节点 + 双方队伍圆点），挂进 TableCenter 信息条下方（top:34px 避开座位遮挡）；`teamLevels` ref 在 refreshUiFromGameState 同步。
  - P1-16：横屏 `.hand-card::before` 透明 hit area 扩到 44px（36px 牌不达触控标准）。
  - 发牌音效时序修复（用户反馈"发牌动画没过完就有炸弹声"）：`useGameLogic._afterDeal`（`watch(isDealing)`，动画结束再执行）；'play' 事件的音效/特效/语音/报数全部经 `_afterDeal` 延迟；顺带修正特效触发窄条件（旧版只限炸弹系，顺子/连对/钢板/三带二的弹跳大字实际从未触发），统一交 `showBombFx` 按 `bombFxForType` 判定；`v0425` 测试块 H 锁定（80 case）。
  - 橙色倍数卡解读：`HudTop` mult-card = ×N 倍数 + 房间号；AI 单机无房间概念，随机房号误导用户 → 新增 `showRoomCode` prop，桌面端按 `isP2PMode` 传入（AI 模式隐藏）；`v0425` 测试块 I 锁定（83 case）。
  - 困难模式"不能自动发牌"排查结论：桌面（用户首家/AI 首家）+ 移动竖屏真实动画路径复现均正常发牌并推进，未能复现；疑似热更新期偶发 dealTimeout，如再出现需记录复现步骤。
  - 测试：`v0425` 套件加块 G（23 case，累计 75）；`npm run build` 成功；Playwright 截图人工核对。

- 2026-07-19：完成 55fb3cc 对抗性审查报告（`tmp/` 外文件，用户上传）第一阶段修复：
  - P0-01 UUID 冒名：host 分配 seat 时生成不可预测 `resumeToken`，仅经 connId 单播（WS/AndroidWs）或 seat 定向 SYNC（BC）下发本人，广播 SYNC 绝不含 token；重连必须 uuid+token——token 不符 + 原连接活跃 → `DUPLICATE_SESSION` 拒绝且 peers 不动；原连接已断 → 不顶替按新玩家分配（原 seat 保留）；被踢/心跳释放/close 清理 token；joiner 端 token 存 sessionStorage 按 roomId 恢复。配套协议修复：加入阶段（selfSeat=-1）放行定向 SYNC（否则 token SYNC 被自身过滤）；joiner seat 解析优先 host 权威 `seat` 字段且分配后不再重扫（否则同 uuid 双 entry 时广播 SYNC 把 seat 误扫回旧 entry）；`network.test.js` 块 13 适配新协议。
  - P0-05 RoomView 角色以 network 为准：进入房间页有活跃 session 时 `isHost` 取 `net.isHost()`，路由 query 仅作首次初始化（迁移后的新 host 返回房间不再被降级关 server）。
  - P0-07 `cachePeerHostAddress` 放行 seat 0（换座后 seat 0 也可成候选）。
  - P0-08 `validateHands` 增加四手牌间 card id 全局唯一校验（同一实体牌不得在两家）。
  - P1-01/02 两端退出迁移候选选举统一走 `net.selectNextHostCandidate([selfSeat])`（确定性 + canHost 优先），兜底座位优先级后无候选则不迁移（旧版 `?? 2` 会对不存在的 seat 2 发起迁移）。
  - P1-15 横屏 safe-area 四值 shorthand 左右写反修复：GameViewMobile hud-top/hand-area/action-bar 右侧改 `inset-right`；HomeView 横屏底部改 `inset-bottom`。
  - 测试：新增 `v0425-adversarial-fixes.test.js`（31 case：3 个真 WS 链路攻击场景 + 全部源码断言）并注册；`network-weaknet.test.js` 修隐性竞态（并发 JOIN 按到达顺序分座，kick 改用 joiner 实际 seat 而非硬编码 3）；`network-multitab.test.js` 块 2 模拟刷新时迁移 resumeToken（sessionStorage 保留语义），SYNC 已分配 seat 的自愈路径保留（entry 消失/易主才重试 JOIN）。
  - 暂缓（报告第二阶段起）：P0-02/03 迁移 await/ACK 状态机、P0-04 host 崩溃选举重发牌、P0-06 finished 控制权迁移、P0-09 横屏牌列展开、P0-10 大厅 grid、P1-03~14 协议硬化、UX-01~15。

- 2026-07-19：完成 v0.4.25 大小王牌面重做 + 出牌归属标签（用户反馈驱动）：
  - 大小王：`CardPlay.vue` 弃用 kawaii 卡通小丑 PNG（与传统奶油白+金边牌面风格冲突），改经典扑克设计——奶油白底 + 对角竖排 JOKER + 自绘卡通小丑 SVG（三尖铃铛帽+笑脸+拉夫领，大王红帽金球 / 小王蓝灰帽银球）+ 横排「大王/小王」；sm 尺寸精简；PNG 资产保留给 `ui-preview` 旧演示页。
  - 出牌感知：`useGameLogic.js` 新增 `lastPlayerName`/`lastPlayerEmoji` computed（`lastPlay.who` → name/avatar）并导出；`TableCenter.vue` 牌堆正上方加 `last-play-tag` 金边胶囊（头像+名字+「出的牌」，`last-pop` 弹入动画，key 随出牌人+牌数变化重播）；桌面/移动两端接线。
  - 测试：新增 `v0425-joker-lastplay-ui.test.js`（32 case）并注册；`npm run build` 成功。
  - 音频：`audio.js` `sfxBomb` 重做真爆炸音（次声冲击 70→24Hz + 白噪声低通扫频 2600→120Hz + 碎裂高频 5kHz，替换旧"电子嘟"）；语音播报从仅炸弹/王炸扩展为全部特殊牌型（顺子/连对/钢板/三带二/同花顺，`TYPE_SPEECH_TEXT` 映射，单张/对子/三张不播报防吵）；新播报 `speechSynthesis.cancel()` 顶掉旧播报防排队；`speakBomb` 重构为通用 `_speak`/`speakType`；`audio.test.js` 块 15 扩展（147 case）。
  - 手牌收紧：`GameViewDesktop.vue` 列宽 78→64、gap 4→2、牌保持 60px 不缩（手牌总宽缩 ~20%）；移动端已有动态重叠（40px/列）不动；`v0425` 测试块 E 锁定（37 case）。
  - 特殊牌型特效：`effects.js` `bombFxForType` 扩展顺子/连对/钢板/三带二（新增 `shake` 字段，仅炸弹级 true）；`EffectLayer.vue` 新增四色弹跳大字（顺子蓝/连对青/钢板橙/三带二紫，字号为炸弹 0.72，`combo-pop` 弹簧动画不震屏）；`useGameLogic.showBombFx` 震屏按 `fx.shake` 门控；`v0425` 测试块 F 锁定（52 case）。

- 2026-07-17：完成 v0.4.24 四路并行对抗性审查修复 + UI/HCI 改进（细节见 git log `HEAD`）：
  - 3 个 P0：GameViewDesktop 补 `import * as haptics`（菜单/退出全灭）；host 主动退出迁移改 `game.getSnapshot()` + `net.close({broadcast,newHostSeat,newHostAddress})`（一退全房解散）；JoinView `parseHostAddress` 默认导出 + `{hostIp,hostPort}` 解构（真机加房全灭，network.js 迁移路径同源修复）。
  - P1 对局：`'play'` 数字 type 统一映射牌型名（炸弹特效/语音/音效复活）；`scheduleAI` 仅 host + 兜底 pass；AI 鬼牌不压 rank17；`dealTimeout` 导出 + 快照清理；超时自动行动 `findMinBeat`/`commitPass`；`_broadcastPerSeatDeal` 遍历 0..3 跳过自己；URL `firstSeat` 只消费一次；`getSnapshot()` 重算 `handCounts`。
  - P1 网络/房间：`smartReconnectToPeers` 三重修复；`_DISCONNECT` 读 `payload.seat`；`SEAT_SWAP_REQUEST` 先广播后应用；`ROOM_FULL` 走 `sendToConnection`；`RELAY_TYPES` 加 `CHAT_QUICK`；GAME_START 跳转带 `host`；RoomView 监听 `host:lost` + 加入 8s 超时 + 满房提示。
  - UI/HCI：战绩 `computeSummary` 逐条 `rec.mySeat`；HistoryChart 补 `barGroupLabelX`；HudTop 删死按钮/假 25s；桌面 Esc/去假金币/聊天常显；移动端长按吞合成 click；`CHAT_QUICK` 跨端聊天；InviteDialog 复制兜底；GuideView 文案重写；三页面补返回按钮；SettingsView `aria-expanded` 动态化。
  - 测试：新增 `v0424-game-fixes`（40）/ `v0424-gameview-fixes`（45）/ `v0424-room-join-fixes`（56）并注册；`network.test.js` 3 条、`history.test.js` 2 条断言按新正确行为反转。
  - 测试基线：`npm test` 59 套件 / 2106 case 全绿；`npm run build` 成功。
  - 暂缓（`tmp/v0424-progress.md`）：Android Java 侧 ROOM_PROBE 应答、uuid 复用 seat 防冒名、BC 模式伪造防线、mDNS playerCount、Windows 热点网段 192.168.137.x。

> 更早的任务记录已精简移除，历史变更见 `git log` 与 `docs/CHANGELOG.md`。

## 项目说明

离线局域网 4 人掼蛋游戏，专为高铁 / 隧道 / 野外无公网场景设计。一人开热点（无需流量），4 人连热点后秒开对局，全程无网、无流量、不卡顿、规则正版。

**核心约束（必读）**：
- 零公网依赖：无后端 / 域名 / 登录 / 房卡 / 数据库
- 纯局域网 P2P：所有对局数据仅在 4 台设备间传输
- 纯净绿色：无广告 / 充值 / 内购 / 分享 / 排行榜 / 用户注册
- 双模式：4 人局域网联机 + 本地单机 AI 人机

详细功能见 `README.md` / `BUILD.md` / `TROUBLESHOOTING.md`。

## Setup commands

```bash
npm install          # 装依赖
npm run dev          # 开发服务器（http://localhost:8848）
npm test             # 全部测试（61 套件 / 2724 case，v0.4.25 基线）
npm run test:engine  # 单套：规则引擎（另有 test:ai / test:game / test:anim / test:ws / test:rotation / test:kick / test:room）
npm run bench        # 性能基准
npm run build        # 生产构建（产物在 dist/）
npm run e2e          # Playwright E2E
```

## Project layout

```
guandan-p2p-vue3/
├── AGENTS.md / README.md / BUILD.md / TROUBLESHOOTING.md
├── package.json / vite.config.js / capacitor.config.json / index.html
├── src/
│   ├── main.js / App.vue / benchmark.js
│   ├── common/                 # 核心模块（纯 JS, 无 Vue 依赖）+ 全部 Node assert 单测
│   │   ├── guandan-engine.js        # 规则引擎（牌型识别 / 比较 / 升级 / 进贡）
│   │   ├── guandan-ai.js            # AI 出牌（规则 + 贪心；运行时动态导入,独立分包）
│   │   ├── guandan-game.js          # 对局状态机（deal/play/结算/host 迁移/snapshot）
│   │   ├── network.js               # P2P 网络抽象（事件总线 / 路由 / 迁移 / 发现）
│   │   ├── network-transport-bc.js  # BC transport（仅本机多标签 / dev）
│   │   ├── network-transport-ws.js  # WebSocket transport（跨设备 + 浏览器）
│   │   ├── network-transport-android-ws.js  # AndroidWsTransport（真机）
│   │   └── ws-server.js / qr-fallback.js / seat-rotation.js / deal-animation.js
│   │       / audio.js / storage.js / effects.js / history.js / dialog-bus.js / haptics.js
│   ├── components/             # Vue SFC（CardPlay / HudTop / PlayerSeat / TableCenter
│   │                           #   / MainActions / ChatQuickPanel / icons/ 等）
│   └── views/                  # 8 个路由页：index / room / join / game / ai / guide / history / settings
└── .harness/                   # Mavis 多 agent 团队配置（不影响运行）
```

## Code style

- **模块系统**：ESM（`import` / `export`），**不要用 `require` / `module.exports`**（`"type": "module"`）。
- **路径别名**：`@/` → `src/`。`import X from '@/common/storage.js'`。
- **命名**：文件 `kebab-case.js` / `PascalCase.vue`；函数 `camelCase`；常量 `UPPER_SNAKE`；类 `PascalCase`。
- **注释**：公共函数 1 行说明 + 参数 / 返回值标注。
- **行宽** 100 软限制；**缩进** 2 空格；**Vue 3** 统一 `<script setup>`；**导入顺序**：第三方 → `@/` → 相对路径。

## Testing instructions

测试全是 **Node 原生 assert / console.log**，没用测试框架。**基线：61 套件 / 2724 case 全绿（v0.4.25）。**

**测试文件规范**：
- 文件名 `<name>.test.js`，与被测文件同目录；顶部 `import * as X from './<name>.js'`
- `eq(name, actual, expected)` 比 JSON，`assert(name, cond)` 验布尔；块间 `console.log('\n=== N. 块名 ===')` 分隔
- 末尾打印 `========== 测试结果: X 通过 / Y 失败 ==========`；fail > 0 时 `process.exit(1)`
- **新套件必须注册进 `scripts/run-all-tests.js`**，否则 `npm test` 不会跑
- 涉及 `createGame` 的套件退出前调 `destroy()`，避免 AI timer 导致 Node 挂起
- 行为可测的写行为测试，UI/视图类用源码字符串断言（读文件断言关键代码，参照 `v0424-*.test.js`）

**改算法 / 加功能时必须加测试**——没测试的代码不能合。

## 核心模块契约

> 改 `common/` 时**严格遵守**这些接口，外部 `.vue` 都依赖它们。

### `guandan-engine.js`
```js
SUIT_NAMES, RANK_NAMES, TYPE, TYPE_ORDER, LEVEL_SEQUENCE
createDeck() → Card[108]   shuffle(deck) → Card[]   sortHand(hand) → Card[]
deal(seed?) → { hands: Card[4][27], deck }
countByRank(hand) → Map
recognize(cards, ghostRank?) → { type, mainRank, length, kicker } | null
canBeat(prev, curr, ghostRank?) → bool
splitGhosts(cards, ghostRank) → { ghosts, real }
canFormWithGhosts(hand, type, mainRank, length, ghostRank) → bool
calcLevelUp(ranks, winner) → number   getLevelRank(cur, upN) → number
tributeInfo(result) → { from, to, doubleTribute }
```

**卡牌数据**：`{ suit: 0|1|2|3, rank: 3..15 }`（黑/红/梅/方）；`{ suit: -1, rank: 16|17 }`（小王/大王）。

**牌型 TYPE（数字枚举）**：SINGLE / PAIR / TRIPLE / TRIPLE_PAIR / STRAIGHT / STRAIGHT_PAIR / STRAIGHT_TRIPLE / BOMB_4 / BOMB_5 / BOMB_6+ / STRAIGHT_FLUSH / JOKER_BOMB。**注意：type 是数字不是字符串**，UI/音效层比较前先映射名字（v0.4.24 教训）。

### `guandan-ai.js`
```js
decide(hand, lastPlay, levelRank, ctx, difficulty) → { type:'play', cards } | { type:'pass' }
findMinBeat(hand, target, ghostCount, levelRank) → Card[] | null
chooseLead(hand, ghostRank) → Card[]
TYPE_VALUE
```

### `guandan-game.js`
```js
createGame({ seats, levelRank, isHost, selfSeat, aiPlayers, seed, difficulty }) → {
  on/off/emit, getState(), getSnapshot(forSeat?),   // snapshot 深拷贝,handCounts 实时重算
  deal(seed?, firstSeat?, dealData?), playerPlay(seat, cards), playerPass(seat),
  applyPlay/applyPass/applyRoundEnd/applySnapshot,   // P2P 无校验同步接口
  promoteToHost(authoritativeState) → { ok, error? },  // 缺 hands/handCounts 拒绝
  migrateHost(old, new), restartMatch({ levelRank, seed }?), nextRound(),
  setAIBroadcast(fn), destroy(),                     // destroy 清 AI timer/handlers
}
// state.phase: 'idle' | 'dealing' | 'playing' | 'finished'
```

### `network.js`
```js
on/off/emit   close(opts?)   leaveRoom()            // leaveRoom: joiner 优雅离开(LEAVE_REQUEST)
isHost() / isConnected() / getSelfInfo() / getPeers()
getRoomId() / setRoomId() / getSelfSeat() / setSelfSeat() / getHostSeat()
startAsHost(roomId)   joinRoom(hostIp, roomId)
joinRemoteRoom(hostAddress, selfInfo, roomNo?)      // 跨设备 WS client
parseHostAddress(hostAddress) → { hostIp, hostPort }  // ★ 不是 {host,port},解构错即 TypeError
send(seat, msg) / broadcast(msg) / sendTo(seat, msg)
scanLanRooms() → Promise<Room[]>                    // HTTP /room-info + WS ROOM_PROBE
requestHostMigration(newHostSeat, snapshot)         // 三阶段 ACK 握手
isAuthorityMessage(msg)                             // hostEpoch 权威校验
smartReconnectToPeers(opts)                         // host 掉线后按缓存 hostAddress 重连
__installFakeTimers(opts)                           // 测试 hook(生产 tree-shake)
```

**事件名**：`peer:join` / `peer:leave` / `peer:update` / `self:kicked` / `host:lost` / `ai:takeover` / `chat:msg` / `host:migrated` / `message:<TYPE>`（如 `message:SYNC` / `message:CHAT_QUICK`）。

### `storage.js`
```js
getNickname() / setNickname(name)   getAvatar() / setAvatar(dataUrl)
getSettings() / setSettings(obj)    getHistory() / addHistory(record) / clearHistory()
```

## 6 个用户已确认的产品决策

> 改产品逻辑前**先回看这 6 条**，避免推翻之前的决定。

1. **换座 = 只跟队友（对家）换**（不能随便换座位）
2. **昵称 + 头像可自设**（自己挑，不强制随机）
3. **改昵称后其他玩家实时看到**（本地存 + P2P 广播）
4. **对局中禁止改名**（防作弊）
5. **AI 难度 medium / hard**（规则 + 贪心搜索，**非**深度学习；hard = 防守优先 + 炸弹保留）
6. **纯自实现**（不借鉴任何已有掼蛋项目，版权干净）

## 修改 / 扩展约定

- 改规则引擎 / AI：必须加测试（`guandan-engine.test.js` / `guandan-ai.test.js`），对应套件全绿再 commit
- 加新页面：`src/views/<name>/<Name>View.vue` + `src/main.js` 注册路由
- 加新事件：`network.js` 加 emit + 文档化事件名；需 relay 的类型加进 `RELAY_TYPES`
- 改 `package.json` 依赖：先确认 npm 包协议（避免 GPL 污染版权）

## PR & commit conventions

- 分支名 `<type>/<short-desc>`；Commit message Conventional Commits（`feat:` / `fix:` / `docs:` / `refactor:` / `test:` / `chore:`）
- 提交前：`npm test` + `npm run build` 双绿；描述写「why」不写「what」

## Security

- 永不提交 secrets / keystore / 证书（`.gitignore` **不**默认排除 `*.keystore` / `*.jks` / `*.p12` / `.env*`——手动加）
- 不引入联网依赖（axios / 第三方 CDN / 字体 CDN）——破坏离线原则
- 不收集用户数据 / 不上报埋点；localStorage 只存本机数据

## 真没做（v4.0+ 候选）

- iOS 脚手架——只有 Android（Capacitor 配了 ios/ 但未跑过 `cap add ios`）
- 弱网 / 隧道 / 高铁真实场景压测数据——只有模拟弱网单测（`network-weaknet.test.js`）

## Agent 团队与 Owner 偏好

Mavis 多 agent 团队配置在 `.harness/`（coder / verifier / pm / mavis orchestrator）。

- **bug 自动修**：verifier 找出的 bug 直接按反馈修，不要每条都问 user
- **新功能**：用 mavis team plan 跑；producer prompt 显式写边界与保护范围（防 scope drift、防优化破坏既有 fix）
- **既有 fix 的 invariant 先 grep git log 再找**：「立即」动作常和「延迟」机制（心跳窗口等）打架，立即反应只走新事件 / UI 层 reactive state
- **多文档同步靠 board**：跨 README / CHANGELOG / AGENTS.md 的改动，task 跑完先记 board 再继续

## 出问题先看

1. `TROUBLESHOOTING.md` —— 80% 的常见问题都在
2. `npm test` 输出 —— 基础功能有没有坏
3. 浏览器 F12 控制台 —— 前端错误
4. 终端输出 —— Vite / Node 错误

**仍然卡住？** 把"做了什么 + 期望什么 + 实际得到什么 + 完整报错"打包给开发者。
