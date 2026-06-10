# 测试规范

> 全工程**零测试框架依赖**,用 Node 原生 `assert` + `console.log`。改算法 / 加功能前先看这个。

---

## 一、测试结构

```
src/common/
├── guandan-engine.js        # 业务逻辑 1
├── guandan-engine.test.js   # 紧跟业务逻辑 1(同目录)
├── guandan-ai.js            # 业务逻辑 2
├── guandan-ai.test.js       # 紧跟业务逻辑 2
├── guandan-game.js          # 业务逻辑 3
├── guandan-game.test.js     # 紧跟业务逻辑 3
├── deal-animation.js
├── deal-animation.test.js
├── audio.js
├── audio.test.js
├── card-api.js
└── card-api.test.js
```

**规则**:
- 测试文件**和被测文件同目录**
- 文件名:`<name>.test.js`
- **改了 `xxx.js` 必须改 `xxx.test.js`**

---

## 二、运行测试

```bash
npm test              # 跑全部(engine + ai + game + anim + audio + card-api)
npm run test:engine   # 只跑 engine
npm run test:ai       # 只跑 ai
npm run test:game     # 只跑 game
npm run test:anim     # 跑 anim + audio
```

当前测试数(2026-06-08 实测):
- engine 85
- ai 44
- game 3
- deal-animation 11
- audio 117
- card-api 19
- **总计 279 用例 / 0 失败**

**必须全过**:`npm test` + `npm run build` 双绿才能提交。

---

## 三、测试文件模板

```js
/**
 * <name> 单元测试
 *
 * 测试覆盖:
 *   - 场景 A
 *   - 场景 B
 */

import * as Engine from './<name>.js'
const { TYPE } = Engine

let pass = 0
let fail = 0

function eq(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`  ✓ ${name}`)
    pass++
  } else {
    console.log(`  ✗ ${name}`)
    console.log(`    期望: ${e}`)
    console.log(`    实际: ${a}`)
    fail++
  }
}

function assert(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`)
    pass++
  } else {
    console.log(`  ✗ ${name}`)
    fail++
  }
}

// ============== 测试块 ==============

console.log('\n=== 1. 牌组 ===')
eq('createDeck 返回 108 张', Engine.createDeck().length, 108)
eq('洗牌不修改原数组', Engine.shuffle([1, 2, 3]).length, 3)

// ... 更多块

// ============== 汇总 ==============
console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
```

**关键约束**:
- 顶部 `import * as X from './<name>.js'`
- `eq(name, actual, expected)` 比 JSON
- `assert(name, cond)` 验布尔
- 块用 `console.log('\n=== N. 块名 ===')` 分隔
- 末尾打印 `========== 测试结果: X 通过 / Y 失败 ==========`
- **失败不能掩盖**:`fail > 0` 时 `process.exit(1)`

---

## 四、断言模式

### 4.1 `eq` —— 深比较

```js
eq('单张识别', Engine.recognize([{ suit: 0, rank: 5 }]),
   { type: TYPE.SINGLE, mainRank: 5, length: 1 })
```

**为什么用 JSON.stringify**:
- 简单粗暴,深比较不需要写 expect()
- 数组 / 对象 / null 自动展开
- 看错误时直接看到 JSON diff

**不适用场景**:
- 函数引用 / Symbol / undefined 丢失 → 用 `assert`
- 大对象性能问题 → 手动比关键字段

### 4.2 `assert` —— 布尔

```js
assert('王炸压单张', Engine.canBeat(
  { type: TYPE.KINGS_BOMB, mainRank: 17, length: 4 },
  { type: TYPE.SINGLE, mainRank: 5, length: 1 }
))
```

### 4.3 自定义复杂断言

```js
function assertHasType(name, cards, expectedType) {
  const r = Engine.recognize(cards)
  if (r.type !== expectedType) {
    console.log(`  ✗ ${name}: 期望 type=${expectedType} 实际=${r.type}`)
    fail++
  } else {
    console.log(`  ✓ ${name}`)
    pass++
  }
}

assertHasType('5 张单张连续是顺子', [
  { suit: 0, rank: 5 }, { suit: 1, rank: 6 }, { suit: 2, rank: 7 },
  { suit: 3, rank: 8 }, { suit: 0, rank: 9 },
], TYPE.STRAIGHT)
```

---

## 五、测试组织模式

### 5.1 块状组织

按「功能块 / 场景 / 边界」分块,每块 5-15 用例:

```
=== 1. 牌组 ===
=== 2. 牌型识别: 单张 / 对子 / 三张 ===
=== 3. 牌型识别: 顺子 / 连对 / 钢板 ===
=== 4. 牌型识别: 炸弹 / 同花顺 / 王炸 ===
=== 5. 大小比较 ===
=== 6. 边界 case ===
```

### 5.2 边界 case 必须有

每个新函数至少包含:
- ✅ **正常输入**:标准场景
- ✅ **空 / 零 / null**:边界
- ✅ **非法输入**:错误处理
- ✅ **极端值**:大 / 小 / 临界
- ✅ **同型跨界**:跟其他类似函数的区分

### 5.3 参数化测试

**不要写 50 个重复的 `assert`**。**用循环**:

```js
console.log('\n=== 1. rank 单值识别 ===')
for (let rank = 3; rank <= 15; rank++) {
  const card = { suit: 0, rank }
  const r = Engine.recognize([card])
  eq(`rank=${rank} 单张`, r, { type: TYPE.SINGLE, mainRank: rank, length: 1 })
}
```

**好处**:
- 改一个常量就覆盖 13 个 case
- 不会漏边界
- 加新 rank 不用手动加 case

### 5.4 跨用例共享 setup

测试文件**不需要 beforeEach**,但可以用变量共享:

```js
const hand = [
  { suit: 0, rank: 5 }, { suit: 1, rank: 5 },  // 5♠ 5♥
  { suit: 2, rank: 7 },                         // 7♣
]

console.log('\n=== 1. 对子识别 ===')
const r = Engine.recognize([hand[0], hand[1]])
eq('5 对子', r, { type: TYPE.PAIR, mainRank: 5, length: 2 })
```

---

## 六、引擎测试样板

引擎测试最常见,这里给个完整模板:

```js
import * as Engine from './guandan-engine.js'
const { TYPE } = Engine

let pass = 0, fail = 0
function eq(name, actual, expected) { /* ... */ }
function assert(name, cond) { /* ... */ }

// ============== 1. 牌组基础 ==============
console.log('\n=== 1. 牌组基础 ===')
eq('createDeck 108 张', Engine.createDeck().length, 108)
eq('sortHand 从大到小', Engine.sortHand([
  { suit: 0, rank: 3 }, { suit: 0, rank: 14 }
]), [
  { suit: 0, rank: 14 }, { suit: 0, rank: 3 }
])

// ============== 2. 牌型识别: 基础 ==============
console.log('\n=== 2. 基础牌型 ===')
eq('5♠ 单张', Engine.recognize([{ suit: 0, rank: 5 }]),
   { type: TYPE.SINGLE, mainRank: 5, length: 1 })
eq('5♠ 5♥ 对子', Engine.recognize([
  { suit: 0, rank: 5 }, { suit: 1, rank: 5 }
]), { type: TYPE.PAIR, mainRank: 5, length: 2 })

// ============== 3. 牌型识别: 复杂 ==============
console.log('\n=== 3. 复杂牌型 ===')
eq('5 张顺子 3-4-5-6-7', Engine.recognize([
  { suit: 0, rank: 3 }, { suit: 0, rank: 4 }, { suit: 0, rank: 5 },
  { suit: 0, rank: 6 }, { suit: 0, rank: 7 },
]), { type: TYPE.STRAIGHT, mainRank: 7, length: 5 })

// ============== 4. 边界 ==============
console.log('\n=== 4. 边界 case ===')
eq('空数组 → INVALID', Engine.recognize([]), { type: TYPE.INVALID })
eq('4 王 → 王炸', Engine.recognize([
  { suit: -1, rank: 16 }, { suit: -1, rank: 16 },
  { suit: -1, rank: 17 }, { suit: -1, rank: 17 },
]), { type: TYPE.KINGS_BOMB, mainRank: 17, length: 4 })

// ============== 5. 跨产品 ==============
console.log('\n=== 5. 跨产品比较 ===')
assert('5 单 > 3 单', Engine.canBeat(
  { type: TYPE.SINGLE, mainRank: 5, length: 1 },
  { type: TYPE.SINGLE, mainRank: 3, length: 1 }
))
assert('4 炸 > 5 单', Engine.canBeat(
  { type: TYPE.BOMB_4, mainRank: 7, length: 4 },
  { type: TYPE.SINGLE, mainRank: 5, length: 1 }
))

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
```

---

## 七、AI 测试样板

```js
import * as Engine from './guandan-engine.js'
import * as AI from './guandan-ai.js'
const { TYPE } = Engine

let pass = 0, fail = 0
function eq(name, actual, expected) { /* ... */ }
function assert(name, cond) { /* ... */ }

console.log('\n=== 1. 领出 ===')
const hand1 = [
  { suit: 0, rank: 5 }, { suit: 0, rank: 5 },  // 5 对子
  { suit: 1, rank: 7 }, { suit: 1, rank: 7 },
]
const r1 = AI.decide(hand1, null, 15, {})
assert('领出时 AI 出牌', r1.type === 'play')
assert('出的牌都来自手牌',
  r1.cards.every(c => hand1.some(h => h.rank === c.rank && h.suit === c.suit))
)

console.log('\n=== 2. 跟牌: 能压就压 ===')
const hand2 = [
  { suit: 0, rank: 3 }, { suit: 1, rank: 3 },
  { suit: 2, rank: 8 },  // 大
]
const r2 = AI.decide(hand2,
  { type: TYPE.PAIR, mainRank: 5, length: 2, who: 0 },
  15, {})
eq('跟牌找最小能压的', r2.cards, [{ suit: 2, rank: 8 }])

console.log(`\n========== AI 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
```

---

## 八、状态机测试样板

```js
import * as Engine from './guandan-engine.js'
import { createGame } from './guandan-game.js'

let pass = 0, fail = 0
function eq(name, actual, expected) { /* ... */ }
function assert(name, cond) { /* ... */ }

console.log('\n=== 1. 发牌 ===')
const g = createGame({})
g.deal()
const s = g.getState()
assert('4 个玩家', s.hands.length === 4)
assert('每人 27 张', s.hands.every(h => h.length === 27))

console.log('\n=== 2. 出牌 ===')
const g2 = createGame({ seats: 4, levelRank: 15, isHost: true, aiPlayers: [1, 2, 3] })
g2.deal()
const s2 = g2.getState()
const current = s2.currentPlayer
const myHand = s2.hands[current]
const r = g2.playerPlay(current, [myHand[0]])
assert('出第一张成功', r.ok)

console.log(`\n========== 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
```

---

## 九、性能基准测试

`src/benchmark.js` 测算法性能:

```bash
npm run bench
```

输出:
- `recognize`: N 次识别耗时
- `canBeat`: N 次比较耗时
- `decide`: AI 决策耗时
- `deal`: 发牌耗时

**改算法后跑一遍**,性能不应回退 > 20%。

---

## 十、UI 视觉测试(Playwright)

UI 改动需要肉眼对比:

1. 起 dev server:`npm run dev`
2. 用 Playwright MCP / 浏览器开 4 个标签
3. 截 4 个核心页面:Home / Room / Game / History / Settings
4. 改 UI 前后对比
5. 特别看:`CardPlay` 渲染(所有 view 都有)

**v3.7 P2 验证规范**:9 张 Playwright 截图覆盖 8 个 view。

---

## 十一、测试规范 checklist

加测试时:

- [ ] **同目录**:`<name>.test.js` 跟 `<name>.js` 同目录
- [ ] **同 import 风格**:`import * as X from './X.js'`
- [ ] **有 eq 和 assert helper**
- [ ] **块用 `=== N. 块名 ===` 分隔**
- [ ] **末尾打印 `========== 测试结果: X 通过 / Y 失败 ==========`**
- [ ] **fail > 0 时 `process.exit(1)`**
- [ ] **覆盖正常 / 边界 / 非法输入**
- [ ] **加新功能时同步加 case**

---

## 十二、CI / 持续集成

**项目没配 CI**(纯本地)。贡献者必须本地跑:

```bash
npm test       # 必须 0 失败
npm run build  # 必须 0 错误
```

v2.0 候选:加 GitHub Actions,在 PR 时跑 `npm test` + `npm run build`。

---

**下一步**:
- 改代码前看:对应模块的 `*.test.js`
- 加新模块:同时加 `<name>.test.js`
- 测试失败:看 `期望:` vs `实际:` 的 diff
