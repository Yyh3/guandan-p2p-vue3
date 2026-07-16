# 掼蛋 P2P · 真机 4 设备联机部署 & 验收手册

> v0.4.22 真机交付 — 4 部 Android 手机开热点 + 局域网联机全流程
>
> 适用版本:`com.guandan.p2p` v0.4.22 debug APK
>
> 预计耗时:首装 ~15min (含装 APK + 配权限),后续开局 < 1min

---

## 0. APK 资产

| 项 | 值 |
|---|---|
| **APK 路径** | `android/app/build/outputs/apk/debug/app-debug.apk` |
| **包名** | `com.guandan.p2p` |
| **应用名** | Guandan P2P |
| **targetSdk** | 36 (Android 16) |
| **minSdk** | 24 (Android 7.0) |
| **声明权限** | INTERNET / ACCESS_WIFI_STATE / ACCESS_NETWORK_STATE / CHANGE_WIFI_MULTICAST_STATE / CAMERA |

> ⚠️ **debug 签名 APK,非 release。** 不能上 Google Play 商店分发给普通用户;内部测试 / 熟人 4 人组局够用。
> 内部 WebSocket server 默认监听端口 **8848**;host 端可在 `android/app/src/main/java/com/guandan/p2p/WsServerPlugin.java` 配置,也可通过 mDNS 自动发现,无需手输 IP。

---

## 1. 安装 APK (4 部手机都要装)

### 1.1 推荐方式:USB + adb install (最快,稳定)

**前提**:电脑已装 Android `platform-tools` (`brew install --cask android-platform-tools` 或 [官方下载](https://developer.android.com/tools/releases/platform-tools))。

```bash
# 1. 用 USB 数据线连手机(打开"开发者选项" → "USB 调试")
# 2. 验证 adb 看到设备
adb devices
# 应该看到 4 行 "device" 状态

# 3. 4 部手机各跑一次(或者用 -s <serial> 指定)
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# -r 允许覆盖安装,debug 包常用
# 输出 "Success" 即成功
```

**批量装 4 部**(用 `xargs` 串行,避免 adb 同时跑多设备的奇怪问题):

```bash
adb devices | grep "device$" | awk '{print $1}' | xargs -I {} adb -s {} install -r \
  android/app/build/outputs/apk/debug/app-debug.apk
```

### 1.2 兜底方式:拷到手机本地点击安装

如果某部手机 USB 不方便 / adb 装不上:

1. 用 U 盘 / 微信文件传输助手 / 邮件附件 / 蓝牙,把 `app-debug.apk` 拷到手机的 `Download/` 目录
2. 用文件管理器找到该 APK,点击安装
3. **首次会弹"是否允许此来源安装应用"** — 选"允许" (每部手机只弹一次,来源是"文件管理器"或"微信"等)

### 1.3 安装失败的常见原因

| 错误 | 原因 | 解决 |
|---|---|---|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | 之前装过别的签名的同包名 app | `adb uninstall com.guandan.p2p` 再装 |
| `INSTALL_FAILED_OLDER_SDK` | 手机系统 < Android 7.0 | minSdk=24,不支持老机器,换新机 |
| `INSTALL_PARSE_FAILED_BAD_PACKAGE_NAME` | APK 文件损坏 | 重新 `npm run build` + `gradlew assembleDebug` |
| 应用未出现在桌面 | 安装成功但 launcher 缓存 | 重启手机 / 在"应用列表"里找 |

---

## 2. 权限配置 (每部手机都要做一次)

### 2.1 "安装未知应用" 权限 (只在 1.2 文件管理器安装方式下需要;USB adb 装的不用)

Android 8.0+ 限制从 APK 文件直接安装,需要给"文件管理器"开权限:

```
设置 → 应用 → (右上角 ⋮) 特殊应用权限 → 安装未知应用 → 找到"文件管理" / "微信" / 你拷 APK 用的那个 App → 打开"允许安装未知应用"
```

> USB `adb install` 不走这个流程,无需配置。

### 2.2 应用运行时权限 (Android 13+ 必须,否则可能连不上网)

Guandan P2P 不申请任何运行时权限 (没有相机/麦克风/位置/存储),但需要确保 **Wi-Fi 能正常用**。如果手机装了某些"省电 / 防火墙" App (如绿色守护、净空大师) 限制后台 Wi-Fi,需要把 `Guandan P2P` 加入白名单。

### 2.3 后台运行 / 自启动 (小米 / 华为 / OPPO 等定制 ROM 常见)

部分国产 ROM 会"杀掉"长时间不活跃的应用,导致 host 端 WS server 被清理、其他 joiner 找不到 host。

**关键:host 那部手机必须做这个**,否则热点开着 App 也会被后台杀:

| 厂商 | 路径 |
|---|---|
| **小米 MIUI/HyperOS** | 设置 → 应用 → 应用管理 → Guandan P2P → 自启动 → 开启;省电策略 → 无限制 |
| **华为 EMUI/HarmonyOS** | 设置 → 应用 → 应用启动管理 → Guandan P2P → 改为"手动管理",三个开关全开 |
| **OPPO ColorOS** | 设置 → 电池 → 更多设置 → 关闭"睡眠待机优化";应用 → Guandan P2P → 耗电保护 → 允许后台运行 |
| **vivo OriginOS** | i管家 → 应用管理 → Guandan P2P → 自启动 / 后台高耗电 → 开启 |
| **三星 OneUI** | 一般无需设置,后台限制较松 |

---

## 3. 房主开热点 (1 部手机)

挑 1 部当 host(建议:Wi-Fi 信号最强的 / 电量最足的 / 不用切 SIM 卡的)。

### 3.1 Android 原生热点设置

```
设置 → 网络和互联网 → 个人热点 → 打开
  热点名称:Guandan-P2P  (或任意英文,joiner 找得到)
  密码:88888888          (8 位数字,joiner 输这个连)
  AP 频段:2.4 GHz         (兼容性最好,4 部手机都支持;5 GHz 部分老机会连不上)
  最大连接数:4
```

> **Android 10+ 个人热点** 默认是 5 GHz,如果 joiner 找不到热点,手动切到 2.4 GHz。
> **Android 7-9** 路径可能略有不同,在"更多网络"或"便携式热点"里。

### 3.2 验证热点已开

在 host 手机上:

```bash
adb shell ip addr show wlan0   # 或者 ip addr | grep 192.168
# 期望看到 inet 192.168.x.1/24   (x 常见 43 / 49 / 191,跟厂商 ROM 有关)
```

或者更简单:打开 Guandan P2P App → 首页点"开热点建房" → 进入房间页后,看房间页右下方"本机 IP"是否变成 `192.168.x.1:8848` 这种格式。如果显示"加载中…",说明热点还没起来,等 5 秒刷新。

### 3.3 防止 host 锁屏断网

- host 手机在测试期间**不要锁屏**(可以拉低亮度)
- 或者在"开发者选项"里开"USB 调试(安全设置) → 保持唤醒"
- 或者干脆 host 不用手机,用平板/旧手机专门当 host

---

## 4. 其他 3 部手机连热点

### 4.1 连接

```
设置 → Wi-Fi → 找到 "Guandan-P2P" → 输入密码 88888888 → 连接
```

验证连上了:

```
设置 → Wi-Fi → 已连接 → 看到 "Guandan-P2P" 状态,IP 类似 192.168.x.137
```

### 4.2 关闭移动数据 (重要!)

部分手机(尤其双卡)会优先用 4G/5G 流量,连上 Wi-Fi 也不走 Wi-Fi。

```
设置 → 双卡与移动网络 → 移动数据 → 关闭
(或者:下拉通知栏 → 长按"移动数据"图标 → 关闭)
```

### 4.3 测连通性 (可选,但推荐第一次跑做一次)

在 joiner 手机上装个 terminal 模拟器(比如 [Termux](https://termux.com/)),或者用 adb 进去:

```bash
adb shell ping 192.168.43.1     # 替换成 host 实际 IP
# 期望:64 bytes from 192.168.43.1: icmp_seq=1 ttl=64 time=2.5 ms
```

如果 ping 不通,八成是:
- joiner 没真的连上热点 (看 Wi-Fi 状态)
- 防火墙 App 拦了
- host 手机上的"个人热点"对端做了 AP 隔离 (大部分 ROM 默认关,但部分定制机会开,需要进热点高级设置关)

---

## 5. Host 进入房间

1. host 手机打开 Guandan P2P App
2. 首页 → "**开热点建房**"
3. 第一次会让你设昵称 + 选头像(必填,30s 内 OK)
4. 进入房间页,显示:

```
┌─────────────────────────────────────┐
│  房间号:642891                       │
│  本机 IP:192.168.43.1:8848         │   ← 关键,joiner 要这个
│  [二维码]                              │   ← 扫码加入
│  扫码 / 输 IP:端口 加入                │
│                                       │
│  人数:1/4    [复制 IP:端口] [准备]    │
└─────────────────────────────────────┘
```

- **本机 IP 没显示?**: 等 3-5s,WS server 启动有延迟。如果 10s 还没出,杀掉 App 重开。
- **二维码是空白?**: 网络问题,扫不了码就走手动输入 IP 路径。
- **复制按钮**: 一键把 `192.168.43.1:8848` 复制到剪贴板,微信发给 joiner。

---

## 6. Joiner 加入 (3 部手机各自做)

### 6.1 方式 A:扫码 (推荐,最稳)

要求:joiner 手机装了能扫二维码的相机(几乎所有 Android 自带相机都行)。

1. 微信扫 host 房间页的二维码 → 弹出 `ws://192.168.43.1:8848` 链接
2. 复制这个链接
3. 打开 Guandan P2P App
4. 首页 → "**连热点加入**"
5. 在"IP:端口"输入框,长按粘贴 → 确认是 `192.168.43.1:8848` 这种格式
6. 点"加入房间"

### 6.2 方式 B:手动输入 IP

1. host 点"复制 IP:端口",把 `192.168.43.1:8848` 微信发给 joiner
2. joiner 打开 Guandan P2P App → 首页 → "连热点加入"
3. 输入框手输 `192.168.43.1:8848`
4. 点"加入房间"

> ⚠️ 浏览器版用 6 位房间号 (BroadcastChannel),Android 真机用 IP:端口 (WebSocket)。两套**不互通** — 真机 4 部都装 APK,才能联机。

### 6.3 验证 4 座位都齐了

回到 host 房间页,等待 joiner 一个个出现:

```
┌─────────────────────────────────────┐
│  对手(左)      队友(上)    对手(右) │
│   🐱 张三        🐶 李四      🐰 王五  │
│                                       │
│           [房主(我)]                  │
│             🀄 房主名                  │
│                                       │
│  人数:4/4    [复制 IP:端口] [开局]    │
└─────────────────────────────────────┘
```

- 4 人都齐了 host 才能点"开局"
- 每人头像/昵称旁有"✓" 标记 = 点了"准备"
- host 可以不点准备,只要 4 人都齐就直接"开局"

### 6.4 4 座位定义 (与官方掼蛋一致)

| 座位 | 关系 | host 视角布局 |
|---|---|---|
| 0 (host) | 房主自己 | 屏幕底部 |
| 1 (left) | 对手 | 屏幕左侧 |
| 2 (top) | 队友 | 屏幕顶部 |
| 3 (right) | 对手 | 屏幕右侧 |

> **换座**: 房主/玩家点"换队友" 按钮可以跟 2 号(top)互换成队友,1/3 号依然是对手。这是 v1 的硬约束(不能随便换座位)。

---

## 7. 跑一局:发牌 / 出牌 / 跟牌 / 接风 / 进贡 / 升级

### 7.1 开局

4 人齐 + 房主点"开局" → 等待 1-3s 发牌动画 → 每人 27 张。

### 7.2 房主先出

掼蛋规则:第 1 局房主先出,后续局由上局下游(最后出完牌的)先出。

- 房主手牌区,选牌 → 点"出牌"
- 倒计时 30s,没出就强制 pass
- 牌型识别(单张/对子/三张/顺子/炸弹/王炸/同花顺)由引擎自动判

### 7.3 跟牌 / Pass

按逆时针出牌顺序,每人 30s:

- 选跟牌(必须**大于**上家,或同牌型大一点)
- 或者点"过牌"(Pass)
- 不出则 Pass,**连续 2 人都 Pass** → 这一轮结束,出最后那家牌的再领出

### 7.4 接风

**规则**: 出完一手牌后,如果队友是下游(下家),**且**队友是本轮最后出完牌的人(本轮最大),**且** 队友自己手牌都出了,下游玩家**自动接管**领出下一轮,无需进贡。

- 引擎会在合适的时机触发,玩家在出完牌后会看到"接风"提示
- 常见场景:A 出完牌 → 队友 B 也出完牌 → C/D 都 Pass → B 接管领出

### 7.5 进贡 / 升级

**进贡触发**: 抗贡(双方都没人打满级) / 头游(打满级) — 详情见 `docs/ENGINE.md`。

- 进贡:头游给末游发最大张,末游回贡 10 以下任意张
- 末游收完贡 → 下一局末游先出
- 双贡:两个队友都是下游且都是最后出完的 → 大王贡(打满级升级双倍)

### 7.6 升级

- 头游方按抓的"升级牌"(如过 2 / 过 A)计算升级数
- 进 2 阶 / 3 阶后,当局级牌 rank 跟着变
- 升到 A 后再"过 A" → 下一局回到 2

### 7.7 异常处理

| 现象 | 可能原因 | 解决 |
|---|---|---|
| 出牌按钮灰 | 当前不是自己回合 | 等 30s 倒计时,或看轮转指示器 |
| 出牌后提示"非法牌型" | 选中的牌不构成合法牌型(如 2 张牌不是对子) | 重新选,或加张/换张 |
| Pass 后还是轮到自己出 | 上一轮还在继续,你的 Pass 被记但还没结束 | 等别人继续操作 |
| 倒计时结束被强制 Pass | 自己忘了出 | 30s 没操作 = 视为 pass,合理行为 |
| 牌局卡住不动 | 某 joiner 断网了 | 10s 心跳超时后 host 自动 AI 接管,等他重连或继续打 |
| 自己手牌看起来不对(少/多) | 引擎 bug (概率极低) | 截图反馈给开发,记录手牌快照 |

### 7.8 局后

- 房间页"准备" 按钮可以重开下一局
- 房主可以"踢人"(v1 no-op,见已知问题 P1)
- 单局记录存在 `localStorage`,可在首页"本地战绩"查看

---

## 8. 异常情况 (掉线 / 重连 / 非法牌型 / 非法房间号)

### 8.1 掉线 (joiner 关闭 App / 切后台被杀 / Wi-Fi 断)

- 10s 心跳超时后,host 自动**释放 seat** + 触发 **AI 接管**
- joiner 端会收到"网络异常,正在重连…"提示,3s 重试
- 重连成功 → host 看到 seat 重新填充,头像短暂闪动

### 8.2 重连 (joiner 重新打开 App)

- 同一 uuid(从 localStorage 读)→ host 复用 seat
- 房间状态通过 SYNC 消息全量同步,手牌/出牌历史/当前轮转都恢复
- 玩家可在 room 看到"已重新连接"提示

### 8.3 非法牌型

- 引擎 `guandan-engine.js:recognize` 在每次 `play()` 之前校验
- 非法牌型 → `{ ok: false, error: 'INVALID_TYPE' }` → UI 弹 toast"非法牌型"
- 玩家重新选牌
- 引擎层面不可能出现非法牌型(被 cast 走通),只可能 UI 选错

### 8.4 非法房间号 / 端口不可达

- joiner 输入 `192.168.43.1:9999` (端口错)→ JS 端会一直 retry 3s 一次
- joiner 输入 `192.168.99.99:8848` (IP 错)→ TCP 三次握手失败 → 同样 retry
- 10s 后 joiner 端弹"无法连接房主,请检查热点/IP/防火墙"
- 不会卡死,重试是后台异步

### 8.5 房主中途退出

- host 退出 App → WS server 关闭 → 所有 joiner 收到"host 离线"
- joiner 端会留在房间页,但无法继续游戏
- **没有** host 迁移机制(不能选一人接手当房主) — v1 限制
- 重新开局:host 重开 App,4 人重新 join

---

## 9. 已知问题清单 (2026-06-11 11:00 当前状态)

> 来源:`outputs/t3-e2e-4tab-verification/test-report.md` + 各 cycle 修复 commit
>
> **总览**: P0 (sendToClient 路由) ✅ 已修 in `465f7a9`;P1 (踢人 + plugin no-op,后者已与 P0 同步修) ❌ 未修;P2 (并发 / QR) ❌ 未优化
> **真机联机影响**: P0 修后,4 设备开局 → 出牌 → 跟牌 → 接风 → 进贡 → 升级 主流程可跑;P1/P2 是边缘场景,不阻塞主验收。

### 9.1 ✅ P0 — sendToClient seatMap 路由 (已在 `465f7a9` 修复)

> **状态 (2026-06-11 10:50 验):** P0 sendToClient seatMap 路由 bug **已修复** in commit `465f7a9 fix(android): repair sendToClient seatMap routing per P0 finding`。当前 `master` HEAD 包含修复,本 APK 是修复**之后**构建的,4 设备定向 sendTo 应正常工作。

- **历史症状** (修复前): host 想给"特定"某 joiner 发牌(比如 host 出完牌,只让 seat=2 接风) → 那个 joiner 收不到,牌局卡死 / 所有人卡在某玩家回合 30s 超时 → AI 接管
- **根因** (t3 报告定位):
  1. `AndroidWsTransport.bindLastSenderSeat(seat)` 旧版只更新 JS 端 `_lastSenderSeat` 变量,**不调** `WsServer.bindSeat` plugin
  2. `WsServerPlugin.bindSeat` 是 no-op(注释写"v1 no-op 简化")
  3. 后果: Java `WsServer.seatMap` **永远是 `(-1, conn)`**,`sendToClient(seat, msg)` 永远返回 false,定向消息丢失
- **修复** (commit `465f7a9`):
  1. `WsServer.java`: 新增 `connIdMap / idOfConn` 双向映射(`AtomicInteger` 单调递增 connId),`onOpen / onClose / onMessage` 维护,`EventListener` 接口加 `connId` 参数,新增 `bindSeatById(int connId, int seat)` 方法
  2. `WsServerPlugin.java`: `bindSeat` 从 no-op 改为实际调 `server.bindSeatById(connId, seat)`,`notifyListeners` 把 `connId` 透传给 JS
  3. `AndroidWsTransport.bindLastSenderSeat(seat)` 改为真正调 `WsServer.bindSeat({connId, seat})` plugin
  4. JS 加 `_lastSenderConnId` 稳定 conn 标识(原 `_lastSenderSeat` 是 write-only 死字段)
- **验证状态**: npm test 399/399 通过(含 `ws-server.test.js` 29 个新增用例覆盖 P0 修复)
- **本 APK 状态**: 当前 debug APK (10:50 build, MD5 `441fb827d83bd65e58d137fc42f001cc`) 是修复**之后**构建,**4 设备定向 sendTo 应正常工作**
- **部署前再确认**:
  - ✅ `git log --oneline -3` 应看到 `465f7a9 fix(android): repair sendToClient seatMap routing per P0 finding`
  - ✅ 看到 465f7a9 后用本 APK 即可
  - ⚠️ 如果**未来**有人 reset 到 73ef170 之前 + 重 build APK,新 APK 会回退到 buggy 版本,**回到 §9.1 历史症状**
- **真机验证后必看**: 4 人都能正常出牌 / 跟牌 / 接风,**无**"卡在某玩家回合不动 30s 后 AI 接管"现象
  - 如果出现上述症状,先 `adb logcat -d | grep -iE "wsserver|seatmap"` 抓 host log,看有没有 `seatMap.get(seat) returned null`

### 9.2 P1 — host 不能主动踢人

- **症状**: 房主想踢作弊玩家 → 无按钮 / 调 `forceDisconnectSeat` 是 no-op
- **当前状态**: ✅ 已修复(v2.1+ 在 RoomView 提供踢人按钮,`network.js` 统一 `kickPlayer` 协议 + transport `forceDisconnectSeat`)
- **影响**: 正常局不影响,作弊处理可用

### 9.3 P1 — WsServerPlugin.bindSeat 旧 no-op

- **症状**: 与 P0 同根,plugin 的 bindSeat 之前是 no-op
- **当前状态**: ✅ 已修复(plugin.bindSeat 实际调 server.bindSeatById)
- **影响**: 与 P0 同步修,无独立影响

### 9.4 P2 — broadcastToAll ConcurrentModification 风险

- **症状**: 极少数情况下,某 joiner 在 host 广播时刚好断开 → Java 端可能抛 `ConcurrentModificationException`
- **当前状态**: ✅ 已规避(Java 层已加同步/CopyOnWrite 式遍历;JS 层 broadcast 走 transport 自己的 peers Map,删除操作在循环外完成)
- **影响**: 不再出现脏日志

### 9.5 P2 — QR 库 import 失败视觉提示

- **症状**: Capacitor WebView 里 `qrcode` 包 import 失败时,降级只显示 IP 文本 + 一行小字提示
- **当前状态**: ✅ 已修复(`QrFallbackCard.vue` + `qr-fallback.js`:生成 QR 失败时显示 IP/端口文本卡片,并支持一键复制)
- **影响**: 扫码失败不再空白,可手输或复制 IP 加入

### 9.6 浏览器版与真机版不互通

- **症状**: 桌面浏览器开 4 tab 用 6 位房间号联机(BroadcastChannel);Android 真机装 APK 用 IP:端口 联机(WebSocket)— 两套**不能跨设备联机**
- **当前状态**: ✅ 已支持(浏览器通过 `?host=IP:PORT` 以 WS client 加入真机 host;JoinView 扫描/输入 host 地址后自动跳转)
- **影响**: 浏览器可作为第 4 个玩家加入真机房间,调试更灵活

### 9.7 host 没有迁移机制

- **症状**: host 中途退出 → 全员散场,需要 host 重开 + 全员重连
- **当前状态**: ✅ 已实现(v2.1+ host 迁移:原 host 退出时自动选举新 host,对局状态 + transport 重建,joiner 自动 reconnect)
- **影响**: host 切后台/死机后牌局可继续,无需全员重启

### 9.9 v0.4.22 新增 — mDNS 自动发现(待真机验证)

- **状态**: 代码已接入 `capacitor-zeroconf`,原生 host 自动发布 `_guandan._tcp` 服务,JoinView 扫描时并行 mDNS 发现
- **待验证**: 真机同一热点下,joiner 能否在“扫描局域网房间”列表直接看到 host,无需手输 IP

### 9.10 v0.4.22 新增 — 触控反馈(haptics,待真机验证)

- **状态**: 代码已接入 `@capacitor/haptics`,设置页可开关
- **待验证**: 真机点击按钮/出牌/炸弹时是否有自然振动,部分浏览器是否静默无感

### 9.11 v0.4.22 新增 — 首页/对局横屏适配(待真机验证)

- **状态**: HomeView 与 GameViewMobile 已加横屏布局,Playwright E2E 覆盖 844×390
- **待验证**: 800×360 / 1000×400 等真机分辨率下 UI 是否仍可用,手牌与操作栏是否不重叠

### 9.8 4 座位固定布局 (host 永远在底部)

- **症状**: 不管 `selfSeat` 是 0/1/2/3,RoomView 都是 4 座位固定 left/top/right/bottom
- **当前状态**: 设计如此(简化渲染,host 视角固定)
- **影响**: 不影响联机,但 joiner 视角下"我"永远在底部,看队友/对手需要转身

---

## 10. 验收 Checklist (打 ✓ 才算真机 OK)

```
□ 1. 4 部手机全部装上 APK (adb install Success)
□ 2. 每部手机权限都配好 (后台运行白名单 + 省电无限制)
□ 3. 房主开热点,其他 3 部连上,能互相 ping 通
□ 4. 4 人都在 RoomView 看到其他 3 个头像 + 昵称,人数 4/4
□ 5. 房主点"开局",4 人都收到 27 张牌
□ 6. 房主出第一手牌 (任何合法牌型),其他人能看到
□ 7. 跟牌测试: 选一张更大的同牌型 → 成功;选更小的 → 提示"必须大于上家"
□ 8. Pass 测试: 3 人都 Pass → 房主再次领出
□ 9. 炸弹/王炸测试: 4 张炸炸掉一轮,后续领出
□ 10. 接风测试: 队友出完牌且下游也出完 → 队友接风
□ 11. 进贡测试: 触发进贡流程 (头游发最大,末游回贡 10 以下)
□ 12. 升级测试: 头游方"过几" 加,当局级牌 rank 变化
□ 13. 异常掉线: 某 joiner 关闭 App → 10s 后 host 显示 AI 接管
□ 14. 异常重连: 掉线 joiner 重新打开 App → 复用 seat
□ 15. 非法牌型: 选 2 张不同花色不同 rank → 提示"非法牌型",不出
□ 16. host 迁移: host 切后台/杀进程 → 新 host 上任,牌局继续
□ 17. mDNS 发现: joiner 点“扫描局域网房间”能直接看到 host 房间,无需手输 IP
□ 18. 触控反馈: 点击按钮/出牌/炸弹时有轻微振动(设置页可关闭)
□ 19. 横屏适配: 手机横屏下首页/对局页布局正常,手牌与操作栏不重叠
□ 20. 弱网压测: 模拟 10%-30% 丢包/100-500ms 延迟,牌局仍能推进或正常触发 host 迁移
```

任意一项打 ✗ → 截图 + 复现步骤反馈给开发。

---

## 11. 反馈模板 (出问题时用)

复制这个填好发给开发:

```
【设备信息】
- APK MD5: <adb shell md5sum /data/app/...base.apk>
- Android 版本: <设置 → 关于手机 → Android 版本>
- 厂商/ROM: <小米/MIUI 14 / 华为/HarmonyOS 4>
- 设备型号: <小米 13 / 华为 P60>

【复现步骤】
1. (host) 打开 App,点"开热点建房"
2. (joiner 1) 连热点,扫描 QR,加入
3. ...
4. (出错现象: 牌局卡在第 X 轮,seat=2 没收到 host 的出牌)

【期望】
seat=2 收到出牌,游戏继续

【实际】
seat=2 一直显示"等待 host",20s 后 host 端弹出 AI 接管

【日志 / 截图】
(粘 host 和 joiner 的 F12 / Logcat 输出)
host: `adb logcat -d | grep -E "WsServer|Guandan" | tail -50`
joiner: 同上

【已知问题对应】
(看 §9,是否 P0 / P1 / P2)
```

---

## 12. 一键脚本 (高级用户)

### 12.1 批量装 4 部手机的 adb 脚本

```bash
#!/bin/bash
APK=/Users/yangyuanhao/Downloads/guandan-p2p-vue3/android/app/build/outputs/apk/debug/app-debug.apk
for serial in $(adb devices | grep "device$" | awk '{print $1}'); do
  echo "=== Installing on $serial ==="
  adb -s "$serial" install -r "$APK" || echo "  ✗ Failed on $serial"
done
```

### 12.2 一键抓 host + joiner 日志

```bash
# host
adb -s <host_serial> logcat -c
adb -s <host_serial> logcat | grep -iE "wsserver|guandan|network" > /tmp/host.log &

# joiner
for s in <joiner1_serial> <joiner2_serial> <joiner3_serial>; do
  adb -s "$s" logcat -c
  adb -s "$s" logcat | grep -iE "wsserver|guandan|network" > /tmp/joiner-$s.log &
done
```

### 12.3 抓网络包 (调试 seatMap 路由时用)

```bash
# 抓 host 上的 ws 流量 (8848 端口)
adb -s <host_serial> shell "tcpdump -i any -nn -A port 8848" 2>&1 | head -200
# tcpdump 在 Android 上要 root,部分 ROM 没装;也可以用 adb shell 直接 curl 测试
adb -s <host_serial> shell "curl -v http://192.168.43.1:8848" 2>&1 | head -10
# ws server 不会响应 HTTP (只响应 upgrade),但能验证端口 reachable
```

---

## 附录 A:常见网络拓扑示意

```
        [joiner 1]      [joiner 2]      [joiner 3]
        192.168.43.x    192.168.43.y    192.168.43.z
              \              |              /
               \             |             /
                \____________|____________/
                             |
                       Wi-Fi / 热点
                             |
                       [host phone]
                    192.168.43.1:8848
                  (WebSocket server)
```

- 4 设备都在 `192.168.43.0/24` 网段(Android 热点默认)
- host 端口 8848 固定,joiner 通过 IP 直连
- 不需要路由器,host 自带 NAT/DHCP
- 流量不走 4G/5G,**完全本地**

## 附录 B:WS server 协议速查

| 消息 | 方向 | 触发 |
|---|---|---|
| `JOIN` | joiner → host | 加入房间 |
| `SYNC` | host → joiner | 房间状态全量同步 |
| `HEARTBEAT` | 双向 | 每 3s 一次,10s 超时 |
| `GAME_START` | host → all | 开局发牌 |
| `GAME_PLAY` | 玩家 → host → all | 出牌 |
| `GAME_PASS` | 玩家 → host → all | 过牌 |
| `GAME_TRICK_END` | host → all | 一轮结束 |
| `GAME_TRIBUTE` | host → all | 进贡开始 |
| `GAME_LEVEL_UP` | host → all | 升级 |
| `PEER_LEAVE` | host → all | 某 joiner 掉线 |
| `AI_TAKEOVER` | host → all | AI 接管某 seat |
| `ROOM_FULL` | host → joiner | 4 人已满,拒绝加入 |

详细协议见 `src/common/network.js:onMessage` 的 switch-case。

---

> **任何 P0 / P1 修完后,必须同步更新 §9 状态**(从"未修"改为"已修 @commit xxx")。
> 任何 §7 / §8 流程变化,更新对应章节 + 加 entry 到 `CHANGELOG.md`。
>
> **真机部署前最后一道闸**: 在 4 部手机装 APK 之前,`git log --oneline -3` 确认 HEAD ≥ `465f7a9`(关键词 `fix(android): repair sendToClient seatMap`)。如果 HEAD 还在 `73ef170` 之前,**必须先 merge 465f7a9 之前的所有 P0 修复 commit,然后重 build APK**,再部署。**直接装落后 HEAD 的旧 APK 跑 4 设备联机会卡死**(4 设备定向 sendTo 全失败)。
