# 代码风格与工程规范

> 全工程统一的代码规范,新代码必须遵守,review 时按这个驳回。

---

## 一、模块系统:ESM(强制)

`package.json` 标了 `"type": "module"`,全工程**只用 ESM**。

```js
// ✅ 正确
import * as Engine from './guandan-engine.js'
import storage from '@/common/storage.js'
export { foo, bar }
export default obj

// ❌ 错(项目里跑不动)
const Engine = require('./guandan-engine.js')
module.exports = { foo, bar }
```

**为什么不用 CJS**:
- Vite 编译期 esbuild interop 能跑,但 `node src/xxx.test.js` 直接执行会爆
- 项目已经踩过这个坑,2026-06-06 一次性改完

---

## 二、路径别名:`@/` → `src/`

`vite.config.js` 配了 alias,**优先用 `@/`**:

```js
// ✅ 推荐
import storage from '@/common/storage.js'
import CardPlay from '@/components/CardPlay.vue'

// ⚠️ 可以(同目录时)
import { foo } from './bar.js'

// ❌ 避免(深路径)
import storage from '../../../common/storage.js'
```

**导入顺序**(lint 不强制,人工 review):
1. 第三方(无路径)
2. `@/` 项目内
3. `./` 相对路径

```js
import { ref, computed } from 'vue'                  // 1. 第三方
import { createRouter } from 'vue-router'

import storage from '@/common/storage.js'             // 2. @/
import CardPlay from '@/components/CardPlay.vue'

import { foo } from './bar.js'                        // 3. 相对
```

---

## 三、命名约定

| 类型 | 规则 | 例子 |
|------|------|------|
| 文件(JS) | `kebab-case.js` | `guandan-engine.js` |
| 文件(Vue) | `PascalCase.vue` | `CardPlay.vue` |
| 函数 | `camelCase` | `createDeck` `playerPlay` `findMinBeat` |
| 变量 | `camelCase` | `myHand` `tableCards` |
| 常量 | `UPPER_SNAKE` | `SUIT_NAMES` `TYPE_ORDER` |
| 类 / 构造器 | `PascalCase` | (本项目几乎没用类) |
| 组件名(Vue) | `PascalCase` | `<CardPlay>` `<PlayerSeat>` |
| 路由路径 | `kebab-case` | `/settings` `/history` |
| CSS 类 | `kebab-case` | `.hand-card` `.is-self` |
| 测试函数 | 描述性 | `eq('单张识别', ...)` `assert('王炸压单张')` |

**具体例子**:

```js
// 变量
const myHand = ref([])
const selectedColKeys = ref({})
const isDealing = ref(false)

// 函数
function onPlay() { ... }
function toggleCol(col) { ... }
function createGame(opts) { ... }

// 常量
const TYPE = { SINGLE: 1, PAIR: 2, ... }
const SUIT_NAMES = ['♠', '♥', '♣', '♦']
const URGENT_BEEP_COOLDOWN_MS = 1000
```

---

## 四、注释规范

**所有公共函数必须有 1 行说明 + 参数 / 返回值标注**。私有函数可选。

### 4.1 JSDoc 风格

```js
/**
 * 把一组牌识别成牌型
 * @param {Card[]} cards - 一组牌
 * @param {number} [ghostRank] - 可选,鬼牌 rank
 * @returns {{ type: number, mainRank: number, length: number } | { type: TYPE.INVALID }}
 */
function recognize(cards, ghostRank) { ... }
```

### 4.2 简短注释(函数体上方)

```js
// 把鬼牌从手牌中分离
function splitGhosts(hand, levelRank) {
  const concrete = []
  const ghosts = []
  for (const c of hand) {
    if (c.suit === 1 && c.rank === levelRank) ghosts.push(c)
    else concrete.push(c)
  }
  return { concrete, ghosts }
}
```

### 4.3 标记性注释

```js
// TODO: v2.0 实现同花顺多牌凑牌
// FIXME: 这里有边界 case 没处理
// v3.7 P1: 紧急蜂鸣 + 手牌区闪红
// v3.6: 列顶 rank 数字标签
```

---

## 五、缩进与行宽

- **缩进**:2 空格
- **行宽**:100 字符软限制(不强制)
- **引号**:JS 用单引号 `'`;字符串含单引号时用反引号 `` ` ``
- **分号**:不用
- **尾逗号**:多行用,单行不用

```js
// ✅
const hand = [
  { suit: 0, rank: 5 },
  { suit: 1, rank: 5 },
  { suit: 2, rank: 7 },
]

// ❌
const hand = [{suit: 0, rank: 5}, {suit: 1, rank: 5}, {suit: 2, rank: 7}]
```

---

## 六、Vue 3 风格

### 6.1 统一 `<script setup>`

**全项目用 `<script setup>` 组合式 API**。**不混 Options API**。

```vue
<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import CardPlay from '@/components/CardPlay.vue'

const props = defineProps({
  card: { type: Object, required: true },
  isLevel: { type: Boolean, default: false },
})

const emit = defineEmits(['play', 'pass'])

const isSelected = ref(false)
const showHint = ref(false)

function onClick() {
  emit('play', props.card)
}

onMounted(() => { /* ... */ })
onUnmounted(() => { /* ... */ })
</script>
```

### 6.2 SFC 顺序

```vue
<template>
  <!-- 必填 -->
</template>

<script setup>
  <!-- 必填 -->
</script>

<style scoped>
  /* 可选,但建议 */
</style>
```

### 6.3 模板

- 组件用 PascalCase:`<CardPlay>` `<PlayerSeat>`
- 模板表达式保持简单,复杂逻辑放 `computed`
- v-for 必带 `:key`
- 事件 `@click` `@play`(`on*` → `@*`)
- v-bind 简写 `:` `v-on` 简写 `@`

```vue
<template>
  <div v-for="col in handColumns" :key="columnKey(col)" class="hand-column">
    <CardPlay :card="c" :is-level="isLevel(c)" />
  </div>
  <button @click="onPlay">出牌</button>
</template>
```

### 6.4 scoped CSS

**所有组件样式都加 `scoped`**。**不污染全局**。

```vue
<style scoped>
.hand-card { ... }
.is-self { ... }
</style>
```

### 6.5 不引第三方 UI 库

❌ Element Plus / Vant / Naive UI / PrimeVue 全 NO
✅ 自己用 tokens.css + scoped CSS 写

---

## 七、错误处理

### 7.1 公共 API 返回 `{ ok, error? }`

```js
function playerPlay(seat, cards) {
  if (state.phase !== 'playing') {
    return { ok: false, error: '对局未开始' }
  }
  if (seat !== state.currentPlayer) {
    return { ok: false, error: '不是你的回合' }
  }
  // ...
  return { ok: true }
}
```

**调用方**:
```js
const r = game.playerPlay(seat, cards)
if (!r.ok) {
  // 显示 r.error 给用户
  toast(r.error)
}
```

### 7.2 内部 try-catch

事件 handler / async 函数要 try-catch,**不让异常逃逸**:

```js
function emit(event, ...args) {
  const list = handlers[event] || []
  for (const h of list) {
    try { h(...args) } catch (e) { console.error(e) }
  }
}
```

### 7.3 console.error vs throw

- **公共 API**:返回值,不要 throw
- **内部开发错误**:throw 或 console.error
- **用户错误**:toast / alert

---

## 八、ES Module 导出规范

### 8.1 优先 named export

```js
// ✅ 推荐
export { foo, bar, baz }

// ⚠️ 默认(便利用)
const obj = { foo, bar, baz }
export default obj
```

### 8.2 双重导出(named + default)

**当 .vue 文件用 `import X from '@/common/xxx.js'`(default import)时,源文件必须同时有 default**:

```js
// src/common/storage.js
export {
  getNickname, setNickname, getSettings, setSettings,
}
const storage = { getNickname, setNickname, ... }
export default storage
```

**为什么**:
- `import storage from '@/common/storage.js'` → 走 default
- `import * as Storage from '@/common/storage.js'` → 走 named
- 测试文件 / 内部调用想用啥就用啥

### 8.3 改 default 导出的影响

- ✅ 不破坏外部(import 写法不变)
- ❌ 内部结构变动要让 review 看
- 删字段是 breaking change

---

## 九、性能与内存

### 9.1 避免不必要计算

```js
// ❌ 重复计算
const r1 = Engine.recognize(cards)
const r2 = Engine.recognize(cards)  // 又算一遍

// ✅ 缓存
const r = Engine.recognize(cards)
```

### 9.2 避免内存泄漏

```js
// ❌ 永远不清
let timer = setInterval(() => { ... }, 1000)
const handler = (e) => { ... }
window.addEventListener('resize', handler)

// ✅ onUnmounted 清理
onUnmounted(() => {
  clearInterval(timer)
  window.removeEventListener('resize', handler)
})
```

### 9.3 不滥用响应式

```js
// ❌ 大数组 ref 影响性能
const huge = ref([...10000 items])

// ✅ 不可变数据用 shallowRef
import { shallowRef } from 'vue'
const huge = shallowRef([...10000 items])
```

### 9.4 动画用 transform

```css
/* ✅ 硬件加速 */
.card { transform: translateY(10px); }

/* ❌ 触发重排 */
.card { top: 10px; }
```

---

## 十、Git 提交规范

### 10.1 Conventional Commits

```
feat: 加一种新牌型(飞机带翅膀)
fix: 修 BGM 风格不持久化
docs: 写 v3.7 完整文档
refactor: 重构 AI 决策函数
test: 补 engine 升级规则测试
chore: 升级 vite 到 5.4
```

**类型**:
- `feat` — 新功能
- `fix` — 修 bug
- `docs` — 文档
- `refactor` — 重构(无功能变化)
- `test` — 加测试
- `chore` — 杂项(依赖 / 配置)

### 10.2 分支命名

```
feat/<short-desc>
fix/<short-desc>
docs/<short-desc>
refactor/<short-desc>
test/<short-desc>
chore/<short-desc>
```

例:`feat/ai-hard` `fix/sync-bug` `docs/v3-7-spec`

### 10.3 提交前 checklist

- [ ] `npm test` 全过
- [ ] `npm run build` 无错
- [ ] `git status` 干净
- [ ] 没有遗留的 console.log(除了 dev-only)
- [ ] 注释 / JSDoc 已加
- [ ] 测试已加 / 更新

---

## 十一、依赖管理

### 11.1 当前依赖

```json
"dependencies": {
  "vue": "^3.4.0",
  "vue-router": "^4.2.0"
},
"devDependencies": {
  "@vitejs/plugin-vue": "^5.0.0",
  "vite": "^5.0.0"
}
```

**极简**。**加新依赖前问 3 遍**:
1. 真有必要吗?(项目追求零依赖)
2. 协议是 MIT / BSD / Apache 吗?**(不接受 GPL,版权污染)**
3. 体积多大?会影响 dist 吗?

### 11.2 不引第三方 UI 库 / 动画库

- ❌ Element Plus / Vant / Naive
- ❌ GSAP / anime.js / lottie
- ✅ 全用原生 Web API + CSS 写

### 11.3 不引第三方网络库

- ❌ axios / got
- ❌ socket.io
- ✅ 用 `fetch`(H5 环境)或 Capacitor 原生插件

### 11.4 不引 CDN / 远程字体

- ❌ Google Fonts / Font Awesome CDN
- ✅ 系统字体或本地字体

---

## 十二、安全规范

### 12.1 永不提交

- ❌ `*.keystore` / `*.jks` / `*.p12`(Android 签名)
- ❌ `*.cer` / `*.mobileprovision` / `*.p12`(iOS 证书)
- ❌ `.env` / `.env.local`
- ❌ API keys / tokens
- ❌ 用户数据

**`.gitignore` 已排除**:`dist/` `node_modules/`,**但签名文件默认不排除,手动加!**

### 12.2 不收集用户数据

- ❌ Google Analytics / 友盟 / Bugly
- ❌ 上报埋点 / Crash 收集
- ✅ 全离线,localStorage 只存本机

### 12.3 localStorage 安全

```js
// ✅ 总是 try-catch
function setNickname(name) {
  try {
    localStorage.setItem(KEY_NICKNAME, name)
    return true
  } catch (e) {
    return false
  }
}
```

**为什么**:隐私模式下 localStorage 写会爆;Safari 7 天无访问会清。

---

## 十三、注释 / 文档

- `AGENTS.md` — AI agent 入口(必读)
- `README.md` — 项目入口(新工程师)
- `BUILD.md` — 打包部署
- `TROUBLESHOOTING.md` — 排错
- `docs/ARCHITECTURE.md` — 系统架构
- `docs/ENGINE.md` — 规则引擎
- `docs/AI.md` — AI 引擎
- `docs/NETWORK.md` — 网络层
- `docs/UI.md` — UI 系统
- `docs/TESTING.md` — 测试规范
- `docs/STYLE.md` — 代码风格(本文件)
- `docs/HOWTO-EXTEND.md` — 扩展指南
- `docs/ROADMAP.md` — 路线图
- `docs/CHANGELOG.md` — 版本历史

**改代码时同步改文档**(至少在 commit message 提一下)。

---

**下一步**:
- 改代码前 → 看本文件
- 改 token → `docs/UI.md` § 3
- 改网络 → `docs/NETWORK.md`
- 改测试 → `docs/TESTING.md`
