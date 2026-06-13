# 排错指南（Troubleshooting）

> 遇到问题先翻这里。每条都有「症状 / 原因 / 修法」三段式。
>
> **找不到答案？** 把报错贴给 AI agent 或开发者，附上 Node 版本 + OS + 完整命令。

---

## 一、装依赖 / 跑测试

### 1.1 `npm test` 报错 `ReferenceError: require is not defined`

**症状**：
```
ReferenceError: require is not defined in ES module scope
```

**原因**：`package.json` 标了 `"type": "module"`，但测试文件用了 CommonJS 的 `require()`。

**修法**（已在本仓库修过，2026-06-06 后正常）：把测试文件改成 ESM 语法（`import` 替代 `require`）。详见 `src/common/*.test.js`。

如果你 clone 了旧版本：
```bash
# 一次性把 require 全部替换成 import
cd src/common
for f in *.js; do
  sed -i '' "s|const \(.*\) = require('\./\(.*\)\.js')|import * as \1 from './\2.js'|g" "$f"
done
```

### 1.2 `npm test` 报错 `Cannot find module './guandan-xxx.js'`

**原因**：测试文件找不到源文件。

**修法**：
1. 确认 `src/common/` 下有对应文件
2. 确认 `import` 路径正确（带 `.js` 后缀）
3. 删 `node_modules` 重装：`rm -rf node_modules && npm install`

### 1.3 测试用例 fail

**症状**：
```
✗ 期望: [...]
   实际: [...]
```

**修法**：
1. 仔细看「期望」和「实际」的差异
2. 跑单个测试定位问题：
   ```bash
   npm run test:engine   # 只跑 engine
   npm run test:ai       # 只跑 ai
   npm run test:game     # 只跑 game
   ```
3. 在 `src/common/<name>.js` 对应函数打 console.log 调试
4. 如果是新增功能的测试，自己写的：先确认测试期望是否合理

---

## 二、Vite 开发服务器

### 2.1 `npm run dev` 启动失败，端口被占

**症状**：`Error: Port 8848 is already in use`

**修法**：
- 方案 A：关掉占用 8848 的进程
  ```bash
  lsof -i :8848                  # 查 PID
  kill -9 <PID>                  # 杀进程
  ```
- 方案 B：改端口（编辑 `vite.config.js`）
  ```js
  server: { port: 8849, ... }
  ```

### 2.2 浏览器打开后页面空白 / 控制台报错

**症状**：浏览器是空白，F12 控制台有红色错误。

**修法**：
1. 看控制台第一条错误（一般是最关键的）
2. 常见原因：
   - **`Failed to fetch`** → 网络问题，看是不是 `localhost` 写成了别的
   - **`Unexpected token`** → 有语法错误，看错误指向哪个文件
   - **`Cannot read property of undefined`** → 数据未初始化，看是不是 `onMounted` 没写
3. 硬刷一下：`Cmd+Shift+R`（macOS）/ `Ctrl+Shift+R`（Windows）

### 2.3 修改代码后页面没自动刷新

**修法**：
- 确认 Vite dev server 还在跑（终端没关）
- 硬刷浏览器
- 看终端有没有 HMR 报错
- 极端情况：重启 `npm run dev`

---

## 三、联机不联动

### 3.1 同浏览器开 4 个标签页，互相看不到

**症状**：4 个标签都打开了首页，但房主/加入者之间数据不同步。

**原因**：浏览器版网络层是 `BroadcastChannel`，**要求 4 个标签是同 origin**（同 http://localhost:8848）。

**修法**：
1. 确认 4 个标签都是 `http://localhost:8848`（或同 IP:PORT）
2. 确认没混用 file:// 协议（Vite 必须是 http://）
3. 开无痕模式测试一次（排除扩展干扰）

### 3.2 BroadcastChannel 限制：跨设备完全不能联

**症状**：同浏览器 4 标签可以联，但用手机访问电脑 IP 后开房，电脑标签收不到。

**原因**：`BroadcastChannel` 是浏览器同源跨标签通信，不跨设备。

**修法**：浏览器版本来就不支持跨设备联机。要跨设备：
- 真机用 APK/IPA + 真机网络层（TCP Socket，v2.0 工作）
- 或者用同一台电脑的 4 个浏览器窗口（Chrome / Edge / Safari / Firefox 各一个 = 4 个独立 origin，**不互通**）

### 3.3 真机联机连不上（v2.0+ 排查清单）

**症状**：4 台手机装好 APK，开房后其他 3 台填房间号加入无反应。

**修法**（按可能性从高到低排查）：
1. **不在同一局域网**：确认 4 台都连了同一个热点/WiFi
2. **房主 IP 填错**：填的是房主的局域网 IP（192.168.x.x），不是手机号
3. **防火墙拦截**：房主关电脑防火墙临时测一下
4. **路由器隔离**：部分路由器开启「AP 隔离」会禁止设备互访，进路由器后台关掉
5. **移动数据没关**：手机连 WiFi 但移动数据开着，部分手机会让流量走移动数据而不是 WiFi
6. **Vite dev server 只监听 localhost**（真机最常见）：电脑开服后用手机访问电脑 IP 连不上，看 `vite.config.js` 是不是有 `server: { host: '0.0.0.0' }`。本仓库 v2.2 起已默认加好（见 4.7）

> v1.0 时期 `network.js` 只有浏览器版实现，APK 内置的是 BroadcastChannel 模拟，真机跨设备**确实**联不通。
> v2.0 起已修复：真机走 WebSocket transport（`network-transport-ws.js` + Android `WsServerPlugin`），`sendToClient seatMap routing` 修过 P0 bug（commit `465f7a9`），2 真机 + 2 浏览器混合联机在 v2.2 收官（commit `c30dde8`）。详细场景见第四节。

### 3.4 出牌不同步（房主出完，其他人没看到）

**修法**：
1. 确认每人都连上了（F12 控制台看 `network.isConnected()`）
2. 看控制台有没有 `WS error` / `WS closed`
3. 重连一次：所有人退出房间 → 房主重新开房 → 其他人重新加入

---

## 四、v2.x 真机跨设备联机（2 真机 + 2 浏览器）

> 本节是 v2.0 起的真机联机排查专章。**测试拓扑**默认是「2 台 Android APK（开房 + 加入）+ 1~2 个浏览器 tab」，所有设备同一局域网。v2.0 之前只有浏览器版 BroadcastChannel，真机跨设备联不通；v2.0 起接 WebSocket transport，v2.2 收官混合联机。
>
> 6 个常见坑按「症状 / 原因 / 修法」三段式铺开，回归测试请对照 `src/common/network.test.js` / `network-kick-player.test.js` / `network-cross-device.test.js` 的相关 block。

### 4.1 真机 host 起 WS server 失败

**症状**：开房后 APK 端没拿到 host IP，或 `hostIp` 一直为 `null`，其他设备填入后无反应。

**原因**：
- `WifiManager` 没拿到当前 WiFi 的 IPv4（飞行模式 / 刚切 WiFi / 模拟器无 WiFi）
- Android 位置权限被拒（Android 9+ 拿 WiFi SSID/IP 强依赖位置权限）
- Android 7+ cleartext HTTP 被网络安全配置拦截，WS upgrade 直接被拒
- WsServerPlugin 启动后被系统回收（后台进程 / 省电策略）

**修法**：
1. **开权限**：App 设置里给「位置」+「附近设备」权限全开
2. **允许 cleartext**：`AndroidManifest.xml` 里 `android:usesCleartextTraffic="true"`（本仓库 v2.0 起已加，见 commit `32a1c4e`）
3. **确认 WiFi 状态**：系统设置 → WiFi → 当前连接的 IP 是不是 192.168.x.x
4. **查启动日志**：
   ```bash
   adb logcat -s WsServerPlugin:V Capacitor:V
   ```
   看 `WS server started on 0.0.0.0:8848` + `host IP = 192.168.x.x` 两行有没有
5. **关省电策略**：把 App 从「电池优化白名单」里排除

### 4.2 浏览器 joiner 走 WS 路径连不上真机 host

**症状**：浏览器 tab 填 `?host=192.168.x.x:8848` 后，`joinRemoteRoom()` 一直不返回，UI 网络状态卡在 `connecting`；控制台报 `WebSocket connection to 'ws://192.168.x.x:8848/' failed`。

**原因**：
- 同一 WiFi 但**AP 隔离**开启（酒店 / 公共 WiFi 常见，设备间互相不可见）
- 电脑防火墙挡 8848（macOS 默认开启、Linux ufw 默认开启、Windows Defender 默认开启）
- IP 错填成公网 IP 或手机号
- Vite dev server 默认只监听 `localhost`，Android 真机填电脑 IP 过来 127.0.0.1 是**自己**不是电脑（见 4.7）

**修法**：
1. **确认 IP 段**：电脑和手机都 `ipconfig` / `ifconfig` 看，是不是都在 `192.168.x.x` 段
2. **关电脑防火墙**：
   - macOS：系统设置 → 网络 → 防火墙 → 关闭
   - Windows：Defender → 高级 → 入站规则 → 放行 8848
   - Linux：`sudo ufw allow 8848/tcp`
3. **关路由器 AP 隔离**：进路由器后台 → 无线设置 → 关「AP 隔离 / 客户端隔离」
4. **改 Vite 监听**：`vite.config.js` 加 `server: { host: '0.0.0.0', port: 8848 }`（本仓库已配，见 4.7）
5. **真机加白名单**：部分 OEM（小米 / 华为）防火墙要手动给 App 加「允许后台联网」

### 4.3 心跳超时误判掉线

**症状**：弱网（4G 切 WiFi / 电梯 / 信号差）下偶发「对方已掉线」误判，但对方其实还在玩；或者反过来，对方真掉了 10s 后才看到提示。

**原因**：v2.1 之前用的是 `HEARTBEAT_INTERVAL_MS=3000` / `CHECK=5000` / `TIMEOUT=10000`，10s 才判掉线，弱网下既慢又容易误杀。

**修法**：
v2.1 起已调成 `2s / 2s / 6s`（commit `ebe57d3`），目标 6-8s 释放窗口：
- joiner 每 2s 发一次心跳
- host 每 2s 扫一次超时表
- 6s 没收到心跳 → 走 `_handleDisconnect` 路径，触发 `peer:leave`

回归测试在 `src/common/network.test.js` block 23，断言：
- `5.5s ≤ TIMEOUT` 仍认为在线（不误杀）
- `6.5s > TIMEOUT` 判掉线（及时释放）

如果心跳行为回归（5.5s 释放 / 7s 还不释放），`grep HEARTBEAT_ src/common/network.js` 看三个常量有没有被改。

### 4.4 房主踢人没生效

**症状**：host 在房间页点某个座位右上角的 `✕` 按钮，被踢玩家没掉线，UI 没反应；或者旁观 joiner 看到 `peer:leave` 但被踢者还卡在 /room。

**原因**：
- `network.js` 没接 `forceDisconnectSeat`（v2.1 P1 之前的状态）
- transport 实现了踢人但 `self:kicked` 事件没监听，被踢者不知道怎么跳页
- transport 三条路径只接了一条（WS / AndroidWs / BroadcastChannel 任意一条缺失都会失效）

**修法**：
1. **看 network.js 导出**：确认 `forceDisconnectSeat` 在 `network.js` export 列表里（v2.1 P1 commit `fd94ff4` 起）
2. **看三个 transport 都接了**：
   - `src/common/network-transport-ws.js` → `forceDisconnectSeat(seat)` 调 `ws.close()` + `broadcast(PEER_LEAVE)`
   - `src/common/network-transport-android-ws.js` → 调 `WsServer.closeClient({ seat })` + `WsServer.broadcast(...)`
   - `src/common/network-transport-bc.js` → 调 `channel.postMessage(PEER_LEAVE { kick: true })`
3. **看 UI 监听 `self:kicked`**：`RoomView.vue` 里 `net.on('self:kicked', ...)` 要在 `onMounted` 注册，`onUnmounted` 解绑
4. **回归测试**：`npm run test` 跑 `network-kick-player.test.js` 8 个 block，断言 host 踢人后被踢者 `self:kicked` 触发 + 旁观 joiner `peer:leave` 触发

### 4.5 host 退场后房间没接管

**症状**：host 退（关 app / 锁屏 / 网络断），其他 3 人卡在 /room 页面，准备状态不刷新，新 host 选不出来，对局无法继续。

**原因**：
- v2.1 P3 之前没有 host 迁移机制，host 掉线 = 房间死掉
- 心跳 6s 释放后 `_handleHostMigration` 没接，`newHost` 选不出来
- `guandan-game.js` 的 `migrateHost(oldSeat, newSeat)` 没被 GameView 调用，state machine 没切换

**修法**：
v2.1 P3（commit `c65e9be`）起已实现完整迁移链路：

1. **选新 host 的优先级**：`src/common/network.js` 的 `_pickHostCandidate()`
   ```js
   // 优先级:seat 2 (队友) > seat 1 (左手) > seat 3 (右手)
   for (const seat of [2, 1, 3]) { ... }
   ```
2. **网络层通知**：`migrateHost(newHostSeat)` → 给所有 joiner 发 `HOST_MIGRATE` 消息
3. **GameView 调 game.migrateHost**：保证 `currentPlayer` / `lastPlay.who` / `trickHistory` 全部重映射
4. **UI 跳页**：新 host 跳 /room 继续等剩下的人加入；joiner 跳 /game 继续玩

回归验证：
- `npm run test:game` → block 11-19 测 `migrateHost` 各种边界（`migrateHost(0,0)` 返 false / `migrateHost(0,2)` 重映射 / 清理 `aiPlayers`）
- `grep migrateHost src/common/network.js src/common/guandan-game.js src/views/game/GameView.vue` 三处都要有
- 如果回归（host 退了 joiner 仍卡），先看 network.js 的 `_handleHostMigration` 有没有被注释掉

### 4.6 QR 库没装，fallback 卡片没显示

**症状**：host 房页 QR 区域只显示一行小字「未装 qrcode 库」，要加好友时 IP 数字看不清、容易抄错。

**原因**：v2.2 之前没有 fallback 卡片 UI，QR 库缺失时只能 show 错误信息。玩家在高铁、隧道弱光下抄一长串 IP 极易出错。

**修法**：
v2.2（commit `f87c6fb`）起已加 `QrFallbackCard` 兜底：

1. **主路径**：QR 库装好 → 显示真实 QR 码图片（扫码自动填 host + room）
2. **降级路径**：QR 库缺失 / 生成失败 → 显示 ⚠️ dashed border 兜底卡片，内含：
   - 房主 IP 和端口（192.168.x.x:8848）
   - 一键「复制」按钮（写到 `navigator.clipboard`）
   - 备选 join URL（`http://192.168.x.x:8848/?host=192.168.x.x:8848&room=xxx`）

回归测试：`src/common/qr-fallback.test.js` 36 个 case 全过。如果 fallback 卡片没显示：
- 看 `src/components/QrFallbackCard.vue` 有没有被 import
- 看 `RoomView.vue` 里 `qrCardVisible` reactive state 切换逻辑
- `console.log` 看 `formatHostAddress` / `buildJoinUrl` 纯函数返回

### 4.7 跨设备时 Vite dev server 监不到外部 IP

**症状**：电脑跑 `npm run dev` 起了服务，手机填电脑的 `192.168.x.x:8848` 连不上；电脑浏览器自己访问 `localhost:8848` 正常。

**原因**：Vite dev server **默认只监听 `localhost`**（`127.0.0.1`），Android 真机填电脑 IP 过来的是电脑的局域网 IP，dev server 根本不接这个连接。电脑浏览器自己访问 `127.0.0.1` 才通。

**修法**：
编辑 `vite.config.js`：

```js
export default defineConfig({
  // ...
  server: {
    host: '0.0.0.0',   // ← 关键:监听所有网卡
    port: 8848,
    open: true,
  }
})
```

`0.0.0.0` 表示监听所有可用网络接口，本仓库 v2.0 起已默认配好（commit `465f7a9` 同批改动）。验证：
```bash
lsof -iTCP:8848 -sTCP:LISTEN
# 看 LISTEN 0 6 *:8848 *:*  ← 这一行说明 0.0.0.0 在听
# 如果是 LISTEN 0 6 127.0.0.1:8848 ← 还是只听 localhost,需要重配
```

回归常见原因：
- 升级 Vite 大版本后默认值变了（v6 之前默认 `localhost`，之后默认 `0.0.0.0`）
- 多 `vite.config.js` 覆盖（monorepo 嵌套）
- 系统 hosts 文件把 `0.0.0.0` 重定向到 `127.0.0.1`

---

## 五、性能问题

### 5.1 出牌有卡顿

**症状**：出牌动画卡，CPU 占用高。

**修法**：
1. 跑 `npm run bench` 看性能基线是否回退
2. 浏览器开 F12 → Performance 录制一次出牌过程
3. 看是否有 `recognize`（牌型识别）在大数据上慢：
   ```bash
   node src/benchmark.js
   ```
4. 优化点：
   - 避免在 `computed` 里做重计算
   - 大列表用 `v-for` + `key`
   - 动画用 CSS `transform`（硬件加速），不要改 `width/height`

### 5.2 `npm run build` 产物很大

**症状**：`dist/assets/index-*.js` 超过 1 MB。

**修法**：
- Vite 默认会 tree-shake，无需手动
- 路由懒加载（如未做）：
  ```js
  const GameView = () => import('./views/game/GameView.vue')
  ```
- 移除未用的 `import`

---

## 六、Capacitor 打包

### 6.1 `npx cap sync` 报错

**修法**：
1. 先 `npm run build` 生成 `dist/`
2. 删除 `android/app/src/main/assets/public/` 旧文件
3. 再 `npx cap sync android`

### 6.2 Android Studio 编译失败：`SDK location not found`

**修法**：建 `android/local.properties`：
```
sdk.dir=/Users/<你>/Library/Android/sdk
```
Windows 改成 `C:\\Users\\<你>\\AppData\\Local\\Android\\Sdk`

### 6.3 iOS CocoaPods 报错

**修法**：
```bash
cd ios/App
pod install --repo-update
```

如果还报错，删 `ios/Pods/` 和 `ios/Podfile.lock` 后重试。

---

## 七、Vue 编译错误

### 7.1 `[plugin:vite:vue] ... is missing`

**症状**：`.vue` 文件编译报错，缺 `<template>` 或 `<script>`。

**修法**：每个 `.vue` 文件必须三段齐全：
```vue
<template>
  <!-- 必填 -->
</template>

<script setup>
// 必填（最少有 <script>）
</script>

<style scoped>
/* 可选 */
</style>
```

### 7.2 `Failed to resolve import ... from ...`

**原因**：路径错或文件不存在。

**修法**：
1. 检查文件路径（区分大小写）
2. 确认 `@/` 别名生效（`vite.config.js` 里有 `resolve.alias`）
3. 重新 `npm install`

---

## 八、数据 / 存储

### 8.1 战绩看不到 / 消失了

**原因**：`localStorage` 容量满（5-10MB）或被清。

**修法**：
1. F12 → Application → Local Storage → 看 `guandan_history` 等 key
2. 清空 `localStorage`（会丢战绩）
3. 检查 `src/common/storage.js` 的写入逻辑

### 8.2 昵称 / 头像改完没保存

**修法**：
1. 看 `src/common/storage.js` 的 `setNickname` / `setAvatar` 是否被调用
2. 看 `setNickname` 是不是有 try/catch 吃掉错误
3. 浏览器隐私模式 → 关闭浏览器数据就丢（改用正常模式）

---

## 九、调试技巧

### 9.1 想看当前状态

```js
// 在浏览器控制台
localStorage.getItem('guandan_settings')   // 查设置
localStorage.getItem('guandan_history')    // 查战绩
__VUE_DEVTOOLS_GLOBAL_HOOK__               // Vue DevTools
```

### 9.2 想测某一局 AI

```bash
node -e "
import('./src/common/guandan-game.js').then(m => {
  const g = m.createGame({})
  // ... 玩
})
"
```

### 9.3 找 bug 时加日志

```js
console.log('[DEBUG]', { hand, table, history })
```

或用更结构化的：
```js
console.table(hand.map(c => ({ suit: c.suit, rank: c.rank })))
```

---

## 十、还有问题？

1. 搜索 README.md / BUILD.md / 本文件关键词
2. 跑 `npm test` 看是不是基础功能就有问题
3. 把以下信息整理好给 AI / 开发者：
   - 操作系统 + 版本
   - Node 版本 (`node -v`)
   - 完整命令 + 完整报错（**第一行** + 最后 5 行）
   - 复现步骤（最小化）

---

**最后更新**：2026-06-13
