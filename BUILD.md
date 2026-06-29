# 打包 / 部署教程

> 掼蛋 P2P 局域网版 —— Vue 3 + Vite 工程化版本
>
> 目标产物三种：浏览器 H5 / Android APK / iOS IPA

---

## 〇、前置环境

| 工具 | 最低版本 | 用途 |
|---|---|---|
| Node.js | 18+ | Vite 构建 |
| npm | 9+ | 包管理（随 Node 自带） |
| JDK | **21** | Android 打包（仅打 APK 需要,Capacitor 8 / AGP 8.13 强制要求） |
| Android Studio | 任意新版本 | APK 构建 + 签名（仅打 APK 需要） |
| Xcode | 15+ | iOS 打包（仅打 IPA，且必须 macOS） |
| CocoaPods | 最新 | iOS 依赖（仅打 IPA 需要） |

检查环境：
```bash
node -v       # 应 >= v18
npm -v        # 应 >= 9
java -version # 应 = 21（仅打 APK）
```

**JDK 21 安装（macOS Apple Silicon,2026-06-27 加）**：

Capacitor 8 / Android Gradle Plugin 8.13 要求 JDK 21。JDK 17/18 不够，会报
`Unsupported class file major version` 或 `requires Java 21+`。

```bash
# 装 openjdk@21(已装可跳)
brew install openjdk@21

# 写入 ~/.zshrc 让 JAVA_HOME 永久生效
cat >> ~/.zshrc <<'EOF'

# JDK 21 — Capacitor 8 / Android Gradle Plugin 8.13 需要(2026-06-27 加)
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"
EOF
source ~/.zshrc

# 验证
java -version   # 应输出 openjdk version "21.x.x"
echo $JAVA_HOME # 应输出 /opt/homebrew/opt/openjdk@21

# 跑一次 gradle wrapper 确认能找到 Java
cd android && ./gradlew --version   # 输出应包含 "JVM: 21.x.x"
```

Intel Mac 把 `/opt/homebrew/opt/openjdk@21` 换成 `/usr/local/opt/openjdk@21`。

---

## 一、浏览器 H5 版（最快，30 秒）

> 适用场景：开发调试、内部演示、H5 链接分发

### 1.1 开发模式

```bash
npm install      # 装依赖
npm run dev      # 启动 Vite dev server
```

启动后自动打开 `http://localhost:8848`。

要局域网真机访问：手机和电脑同 WiFi → 用电脑 IP 访问（不是 localhost）。
查电脑 IP：
```bash
# macOS
ipconfig getifaddr en0
# Windows
ipconfig
```

### 1.2 生产构建

> ⚠️ **新 clone 必须先 `npm install`,否则 `npm run build` 会报:**
> ```
> [vite]: Rollup failed to resolve import "html5-qrcode" from "src/views/join/JoinView.vue"
> ```
> `html5-qrcode ^2.3.8` 已在 `package.json` 声明,但需要 `npm install` 生成 `node_modules` 实体。

```bash
npm install        # 第一次必跑
npm run build      # 产物在 dist/
npm run preview    # 本地预览 dist/（可选）
```

`dist/` 目录就是纯静态文件（H5 + JS + CSS + 静态资源），可以丢到：
- 任何静态服务器（Nginx、Apache）
- GitHub Pages / Vercel / Netlify
- 对象存储 + CDN（阿里云 OSS / 腾讯云 COS）

### 1.3 真机联机调试（同一 WiFi）

1. 电脑开 `npm run dev`
2. 手机连同一 WiFi
3. 手机浏览器访问 `http://<电脑 IP>:8848`
4. 4 台手机都打开这个地址 → 进入首页 → 一人开房 + 三人加入 → 开始游戏

> ⚠️ **浏览器版的网络层用 `BroadcastChannel` 模拟，仅在同浏览器（同 origin）的多个标签页有效。** 真机跨设备联机请走 APK/IPA（见下文二、三）。

---

## 二、Android APK 打包

> 用 **Capacitor** 把 `dist/` 包装成原生 APK。Capacitor 跨平台、配置少、社区活跃。

### 2.1 安装 Capacitor（一次性）

```bash
npm install --save-dev @capacitor/cli
npm install @capacitor/core @capacitor/android
npx cap init "掼蛋 P2P" com.guandan.p2p --web-dir=dist
```

`cap init` 会生成 `capacitor.config.json`，里面有 appId 和 appName。

### 2.2 构建并同步

```bash
npm run build           # 生成 dist/
npx cap add android     # 首次：生成 android/ 目录
npx cap sync android    # 把 dist/ 同步到 android/ 的 assets
```

### 2.3 编译 APK

#### 方式 A：Android Studio（推荐新手）

```bash
npx cap open android    # 自动打开 Android Studio
```
在 Android Studio 里：
1. 顶部菜单 **Build → Generate Signed Bundle / APK**
2. 选 **APK** → 下一步
3. 选 / 创建 keystore（首次要新建，记下密码！）
4. 选 **release** → 勾选 **V1 + V2** 签名
5. 等待编译完成 → APK 在 `android/app/release/app-release.apk`

#### 方式 B：命令行（CI 用）

```bash
cd android
./gradlew assembleRelease
# APK 在 app/build/outputs/apk/release/
```

### 2.4 真机安装

```bash
adb install app-release.apk
# 覆盖安装
adb install -r app-release.apk
# 卸载
adb uninstall com.guandan.p2p
```

### 2.5 真机联机测试（最简流程）

1. 4 台手机都装好 APK
2. **其中一台开移动热点**（不必有流量，热点本身是局域网）
3. 其他 3 台连这个热点
4. 4 台都打开 APP → 1 人"开房" + 3 人"加入"（填 4 位房间号）
5. 满 4 人自动开局

> 真机版的网络层会用 Socket TCP（需后续接入 `network.js` 的真机实现）。
> 当前网络层是浏览器版（BroadcastChannel），所以 APK 内联同样只能模拟。**真机局域网 P2P 是 v2.0 的工作。**

---

## 三、iOS IPA 打包

> ⚠️ **必须 macOS + Xcode**，且需要 Apple 开发者账号（$99/年）才能上架；个人测试可以免费用个人证书（7 天有效）。

### 3.1 安装 iOS 工具链（一次性）

```bash
npm install @capacitor/ios
npm install -g cocoapods   # 一次即可
npx cap add ios
npx cap sync ios
```

### 3.2 Xcode 打开并签名

```bash
npx cap open ios
```

在 Xcode 里：
1. 左侧 **App** target → **Signing & Capabilities**
2. 勾选 **Automatically manage signing**
3. **Team** 选你的 Apple ID（个人开发者也行）
4. **Bundle Identifier** 改成你独有的（如 `com.yourname.guandan`）
5. 真机测试：插上 iPhone → 顶部选你的设备 → **▶ Run**
6. 发布：顶部菜单 **Product → Archive** → 走导出流程

### 3.3 免开发者账号本地安装

适用于自测，不需要 Apple ID：
1. Xcode → Preferences → Accounts → 添加 Apple ID
2. 真机连上 → Window → Devices and Simulators → 选你的 iPhone
3. 顶部 ▶ Run 直接装到手机（签名是临时的，7 天有效）

---

## 四、局域网真机联机的网络层

当前 `src/common/network.js` 是**浏览器版实现**（BroadcastChannel，仅同浏览器标签页有效）。要支持真机跨设备联机，需要实现：

| 方案 | 难度 | 兼容性 |
|---|---|---|
| **TCP Socket（手机热点）** | 中 | 全平台（iOS/Android 都支持原生 Socket） |
| **WiFi Direct（Android）** | 中 | 仅 Android 7+，iOS 不支持 |
| **Multipeer Connectivity（iOS）** | 中 | 仅 iOS 7+ |
| **蓝牙 BLE** | 高 | 全平台，吞吐低，仅做兜底 |

### 4.1 推荐方案：TCP Socket + 手机热点

接口规范见 `src/common/network.js` 已导出的方法：
```js
startAsHost(roomId)  // 房主：监听端口
joinRoom(hostIp, roomId)  // 加入者：连 host
broadcast(msg)       // 群发
sendTo(seat, msg)    // 定向发送
```

实现替换点：`src/common/network.js` 内部把 BroadcastChannel 换成 TCP Socket（可用 Capacitor 的 `@capacitor/network` 或原生插件）。

> 这一步需要针对每个平台（iOS / Android）写原生插件，**属于 v2.0 范围，不在本教程内**。

---

## 五、发布检查清单

- [ ] `npm run build` 成功，`dist/` 里有 `index.html` 和 `assets/`
- [ ] `npm test` 全过（38 套件 / 1889 用例 / 0 失败,v0.4.16）
- [ ] `npm run bench` 性能基线无明显回退
- [ ] 浏览器版手测一遍：开房 → 4 标签加入 → 完整打 1 局 → 查看战绩
- [ ] APK/IPA 真机手测一遍（如果已实现真机网络层）
- [ ] 视觉回归对比 v3.x baseline(`docs/screenshots/v3-baseline/`)vs v3.x final(`docs/screenshots/v3-ui-redesign-final/`)
- [ ] README.md / BUILD.md / TROUBLESHOOTING.md / docs/CHANGELOG.md 同步更新
- [ ] keystore / 证书安全备份

---

## 六、常见构建错误速查

| 错误 | 原因 | 修法 |
|---|---|---|
| `Cannot find module 'vue'` | 依赖没装 | `npm install` |
| `EACCES: permission denied` | 全局安装被拒 | 用 nvm 装 Node，避免 sudo npm |
| Vite dev 起不来，端口占用 | 8848 被占 | 改 `vite.config.js` 的 `server.port` |
| `Module not found: @capacitor/...` | Capacitor 没装 | 装对应 `@capacitor/<platform>` |
| Xcode "No signing identity" | 没设 Apple ID | Xcode → Preferences → Accounts |
| Android "SDK location not found" | 缺 `ANDROID_HOME` | 设环境变量或写 `local.properties` |
| APK 安装后闪退 | 签名错 / minSdk 不够 | 检查 `android/app/build.gradle` 的 minSdkVersion |

---

## 七、下一步

- 真机网络层 v2.0（TCP Socket / WiFi Direct / Multipeer）
- AI 难度分级（Easy / Medium / Hard）
- 录像回放
- 跨局连续打（接风升级）
