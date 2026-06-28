# 路线图 (Roadmap)

> 项目演进时间线 + 未来计划。

---

## 一、版本总览

| 版本 | 状态 | 主题 | 关键变化 |
|------|------|------|----------|
| **v1.0** | ✅ 已完成 | 基础可用 | 规则引擎 + AI + 浏览器版联机 + 单机 AI |
| **v2.0** | ✅ 已完成 | 真机联机 | WebSocket 网络层 + Capacitor Android APK 打包 + 真机跨设备实测可联 |
| **v2.1** | ✅ 已完成 | 健壮性 | 心跳调参(6-8s 释放窗口)+ 房主踢人 + host 迁移 + AI 接管 |
| **v2.2** | ✅ 已完成 | 跨设备 | WebSocketTransport 客户端 + QR 失败兜底(2 真机 + 2 浏览器实测) |
| **v3.0-3.6** | ✅ 已完成 | UI 重做 | tokens.css + 4 屏重做 + 设计 token 系统 |
| **v3.7** | ✅ 已完成 | 体验优化 | 报数/禁改名/BGM/快捷键/设置面板 |
| **v3.8** | ✅ 已完成 | P0+P1+P2 | 4-tab 局域网联机 + P2P 同步 + 修复 8 BUG |
| **v0.4.0** | ✅ 已完成 | UI 收官基线 | v3.x UI 重做收官,16 套件 / 862/0 单测,JDK 21 |
| **v0.4.8** | ✅ 已完成 | P2P 修复 | host 迁移 game/UI 闭环 + BUG-RC3-001~005 + 真实 BGM(7 首 MP3),21 套件 / 972/0 单测 |
| **v0.4.9** | ✅ 完成 | 6 大功能增量 | AI 难度分档 + 二维码真扫码 + 战绩趋势图 + 真实 SFX + 过 A 重开 + UI 主题刷新,32 套件 / 1609/0 单测 |
| **v0.4.10** | ✅ 当前 | 移动端响应式文档化 + v0.4.9 静态审查 9 bug 修复 | onHintToggle / isRestartAfterA / MATCH_RESTART seed / relay 白名单 / 真实音效 fallback / setSettings 合并 / IP 端口校验,33 套件 / 1675/0 单测 |
| **v4.0** | 💭 构思中 | iOS + 录像回放 | iOS 脚手架 + 录像回放 + 弱网压测数据 |

---

## 二、v1.0 基础可用(2026-06-08 完工)

**目标**:跑通核心游戏循环,4 标签可联机。

**完成项**:
- 牌组生成 / 洗牌 / 发牌(108 张 / 4 人 × 27 张)
- 牌型识别(14 种:单/对/三/三带二/顺/连对/钢板/4-8 炸/同花顺/王炸)
- 大小比较(`canBeat`)
- 逢人配(红桃级牌做万能)
- AI 出牌(规则 + 贪心)
- 对局状态机(发牌 / 出牌 / 过牌 / 一轮结束 / 一局结束)
- 升级 + 进贡计算
- 浏览器版网络层(BroadcastChannel)
- localStorage 存储(昵称/头像/设置/战绩)
- Vue 3 + Vite 工程化
- 80+ 单元测试

---

## 三、v2.0-v2.2 真机联机(2026-06 中旬完工)

**目标**:4 手机移动热点对局,真机原生打包,跨设备可联。

**v2.0 完成项**:
- WebSocket 网络层(`WebSocketTransport` 浏览器 + `AndroidWsTransport` 真机)
- `ws-server.js` 真机 WS server 桥接封装(配合 Android plugin)
- Capacitor 8.4 + AGP 8.13 + Gradle 8.14 + compileSdk 36 + JDK 21
- 真机调试 APK 4MB / 生产 6-8MB
- 4 权限(INTERNET / WIFI_STATE / NETWORK_STATE / WIFI_MULTICAST_STATE)

**v2.1 完成项**:
- 心跳 6-8s 精确释放(HEARTBEAT 2s / CHECK 2s / TIMEOUT 6s,精确性测试断言 6.5s 触发)
- 房主踢人(`KICKED` 消息 + 立即 peer 删除 + close 清 `_kickedSeats`)
- host 迁移(BUG-007 修复 + onHostMigrated 顺序)
- AI 接管空座位兜底
- `__installFakeTimers` 测试 hook

**v2.2 完成项**:
- WebSocketTransport 客户端(浏览器开 BC 模式可作 joiner)
- `parseHostAddress` / `joinRemoteRoom` 纯函数(IPv4/IPv6/默认端口)
- QrFallbackCard 兜底(扫码失败降级 IP 文本)
- 2 真机 + 2 浏览器实测可联

---

## 四、v3.x UI/UX 优化(2026-06 已完成)

**目标**:把 v1.0 的「能玩」打磨成「想玩」。

**v3.0-3.4**:核心 UI 重设计
- 顶部 HUD 重组(房间号/级牌/倒计时/座位)
- 中央牌桌 / 桌面牌 / 首家提示
- 手牌竖叠排版(每列一个 rank)
- 身份三色(自己绿/队友蓝/对手红)
- 设计 token 系统(tokens.css)

**v3.5**:Bug 修复 + 体验小改
- 智能理牌按钮
- 一键理(调 AI)
- 提示模式

**v3.6**:更多视觉打磨
- 4 角单字(左上玩家名/右上倍数/左下级牌/右下轮数)
- 智能理牌渐变按钮
- 列底 ×N 数量提示
- 大小王 SVG 化(headless 渲染兼容)

**v3.7**(2026-06-08 完工):**体验优化三个等级**

P0(必做):报数提示 / 对局中禁止改名 / 炸弹 + 王炸 + 超炸音效 / BGM 折中(Web Audio)/ 自座位位置 C

P1(增值):出牌音效分级 / 倒计时 ≤5s 蜂鸣 / 桌面端快捷键 / 快捷聊天 10 颗 pill

P2(完善):战绩图表(零依赖 SVG)/ 集中设置面板 / `/settings` 路由

---

## 五、v0.4.x P2P 同步修复(2026-06-27/28 完工)

**目标**:把 v3.8 联机层做一次"二次审计 + 回归测试加固"。

**v0.4.0-v0.4.6**:5 轮复查修 17 个 bug(2 P0 + 3 P1 + 2 P2 + 3 P3)
**v0.4.7-v0.4.8**:BUG-RC3-001~005 修复 + 真实 BGM 集成
- BUG-RC3-001 `requestPromoteToHost` 存在性
- BUG-RC3-002 `onHostMigrated` 顺序改为「先 applySnapshot 再 migrateHost」
- BUG-RC3-003 `migrateHost` 用 `abandonedSeats` 区分弃赛
- BUG-RC3-004 host 迁移回归测试补 19 case
- BUG-RC3-005 README / package.json / 测试数同步

**v0.4.9**:6 大功能增量
1. AI 难度分档(Easy / Medium / Hard)
2. 二维码真扫码加入(html5-qrcode)
3. 战绩趋势图 + 玩家统计
4. 真实 SFX(audio pool 4 实例 + autoplay unlock)
5. 过 A 后「重开一局」P2P 联机(MATCH_RESTART 协议)
6. UI 主题刷新(refresh guandan ui theme)

**测试增长**:
```
v0.3.0: 701 / 0
v0.4.0: 862 / 0  (+161)
v0.4.8: 972 / 0  (+110,BUG-001~008 + BUG-RC3 修复)
v0.4.9: 1609 / 0 (+637,6 大功能新增/升级)
```

---

## 六、v0.4.10 已完成 — 移动端响应式(2026-06-28 文档化)

**目标**:把 GameView 从桌面 1280×800 扩展到手机横屏(800×360 / 1000×400)。

**实际完成**(代码 v2.5 已落地,本轮文档化):
- `GameView.vue` 95 行薄壳路由(matchMedia 三段检测)
- `GameViewMobile.vue` 1333 行双布局(竖屏 + 横屏 .is-landscape 兜底)
- `GameViewDesktop.vue` 桌面 1280×800(不受响应式影响)
- `GameView.test.js` §6 共 7 case 覆盖 7 种 viewport 组合

**已知边界**(留给 v4.0):
- 横屏兜底用的是 scale + 绝对定位挤压,不完美但可用
- 真机测试只在 844×390 (iPhone 13 横屏) 模拟过,未在真机 800×360 / 1000×400 跑过
- 弱网 / 隧道 / 高铁场景未实测

---

## 七、v4.0 AI + 跨平台(构思中)

**目标**:iOS 脚手架 + 录像回放 + 弱网压测数据。

**实现方向**:
- **iOS 脚手架**:Capacitor 配了 `ios/` 但没跑过 `cap add ios`,Mac + Xcode 走一遍
- **录像回放**:每局存手牌快照 + 出牌历史,可回看 + AI 复盘
- **弱网压测**:隧道 / 高铁 / 飞机场景,模拟丢包 + 延迟

---

## 八、非目标(明确不做)

> 这些是**故意**不做的,别在新功能里加。

- ❌ **联网对局** — 破坏离线原则
- ❌ **账号系统 / 登录** — 破坏纯净绿色
- ❌ **充值 / 内购 / 广告** — 同上
- ❌ **聊天系统** — 只做快捷短语(本地 toast),v2.0 接 P2P(v0.4.9 还没接)
- ❌ **社交分享** — 破坏纯净
- ❌ **排行榜** — 破坏单机
- ❌ **用户注册 / 实名** — 破坏纯净
- ❌ **依赖第三方 UI 库** — 保持极简 / 版权干净
- ❌ **AI 深度学习** — 改 AI 方向用户拍板了

---

## 九、版本号约定

```
vMAJOR.MINOR.PATCH

MAJOR: 架构级变化(网络层 / 打包)
MINOR: 新功能(v3.0-3.7 都是 MINOR)
PATCH: Bug 修复 / 小调整
```

**当前版本**:`v0.4.10`(2026-06-28,v0.4.9 6 大功能收官 + 9 bug 修复 + 移动端响应式文档化)
**首发目标**:v1.0.0(H5)

---

**下一步**:
- v0.4.10:移动端响应式(从 `codex/ui-mobile-joker-card-preview` 预览导入)
- v4.0:iOS 脚手架 + 录像回放
- 看 v0.4.10 反馈决定 iOS 优先级