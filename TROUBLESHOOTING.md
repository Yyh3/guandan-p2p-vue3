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

### 3.3 真机联机连不上

**症状**：4 台手机装好 APK，开房后其他 3 台填房间号加入无反应。

**修法**（按可能性从高到低排查）：
1. **不在同一局域网**：确认 4 台都连了同一个热点/WiFi
2. **房主 IP 填错**：填的是房主的局域网 IP（192.168.x.x），不是手机号
3. **防火墙拦截**：房主关电脑防火墙临时测一下
4. **路由器隔离**：部分路由器开启「AP 隔离」会禁止设备互访，进路由器后台关掉
5. **移动数据没关**：手机连 WiFi 但移动数据开着，部分手机会让流量走移动数据而不是 WiFi
6. **真机网络层未实现**：当前 `network.js` 只有浏览器版实现，APK 内置的是 BroadcastChannel 模拟，所以**真机跨设备目前无法联**——这是已知 v1.0 限制

### 3.4 出牌不同步（房主出完，其他人没看到）

**修法**：
1. 确认每人都连上了（F12 控制台看 `network.isConnected()`）
2. 看控制台有没有 `WS error` / `WS closed`
3. 重连一次：所有人退出房间 → 房主重新开房 → 其他人重新加入

---

## 四、性能问题

### 4.1 出牌有卡顿

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

### 4.2 `npm run build` 产物很大

**症状**：`dist/assets/index-*.js` 超过 1 MB。

**修法**：
- Vite 默认会 tree-shake，无需手动
- 路由懒加载（如未做）：
  ```js
  const GameView = () => import('./views/game/GameView.vue')
  ```
- 移除未用的 `import`

---

## 五、Capacitor 打包

### 5.1 `npx cap sync` 报错

**修法**：
1. 先 `npm run build` 生成 `dist/`
2. 删除 `android/app/src/main/assets/public/` 旧文件
3. 再 `npx cap sync android`

### 5.2 Android Studio 编译失败：`SDK location not found`

**修法**：建 `android/local.properties`：
```
sdk.dir=/Users/<你>/Library/Android/sdk
```
Windows 改成 `C:\\Users\\<你>\\AppData\\Local\\Android\\Sdk`

### 5.3 iOS CocoaPods 报错

**修法**：
```bash
cd ios/App
pod install --repo-update
```

如果还报错，删 `ios/Pods/` 和 `ios/Podfile.lock` 后重试。

---

## 六、Vue 编译错误

### 6.1 `[plugin:vite:vue] ... is missing`

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

### 6.2 `Failed to resolve import ... from ...`

**原因**：路径错或文件不存在。

**修法**：
1. 检查文件路径（区分大小写）
2. 确认 `@/` 别名生效（`vite.config.js` 里有 `resolve.alias`）
3. 重新 `npm install`

---

## 七、数据 / 存储

### 7.1 战绩看不到 / 消失了

**原因**：`localStorage` 容量满（5-10MB）或被清。

**修法**：
1. F12 → Application → Local Storage → 看 `guandan_history` 等 key
2. 清空 `localStorage`（会丢战绩）
3. 检查 `src/common/storage.js` 的写入逻辑

### 7.2 昵称 / 头像改完没保存

**修法**：
1. 看 `src/common/storage.js` 的 `setNickname` / `setAvatar` 是否被调用
2. 看 `setNickname` 是不是有 try/catch 吃掉错误
3. 浏览器隐私模式 → 关闭浏览器数据就丢（改用正常模式）

---

## 八、调试技巧

### 8.1 想看当前状态

```js
// 在浏览器控制台
localStorage.getItem('guandan_settings')   // 查设置
localStorage.getItem('guandan_history')    // 查战绩
__VUE_DEVTOOLS_GLOBAL_HOOK__               // Vue DevTools
```

### 8.2 想测某一局 AI

```bash
node -e "
import('./src/common/guandan-game.js').then(m => {
  const g = m.createGame({})
  // ... 玩
})
"
```

### 8.3 找 bug 时加日志

```js
console.log('[DEBUG]', { hand, table, history })
```

或用更结构化的：
```js
console.table(hand.map(c => ({ suit: c.suit, rank: c.rank })))
```

---

## 九、还有问题？

1. 搜索 README.md / BUILD.md / 本文件关键词
2. 跑 `npm test` 看是不是基础功能就有问题
3. 把以下信息整理好给 AI / 开发者：
   - 操作系统 + 版本
   - Node 版本 (`node -v`)
   - 完整命令 + 完整报错（**第一行** + 最后 5 行）
   - 复现步骤（最小化）

---

**最后更新**：2026-06-06
