# 规则引擎 (`guandan-engine.js`)

> 这是项目最核心的纯逻辑模块。改它之前,先想清楚:这个函数会被多少地方调用?改签名会爆多少测试?

---

## 一、模块定位

**职责**:把一组牌(从 1 张到 N 张)识别成「牌型」并判断「谁大」,处理逢人配,计算升级和进贡。

**不负责**:
- 不发事件(用 `game.on('play', ...)` 在状态机层订阅)
- 不存状态(所有函数都是纯函数,输入确定 → 输出确定)
- 不依赖 Vue / DOM / 任何 UI 库

**调用方**:
- `guandan-ai.js` 调 `recognize / canBeat / splitGhosts / canFormWithGhosts / countByRank`
- `guandan-game.js` 调 `recognize / canBeat / deal / isLevelCard / calcLevelUp / getLevelRank / tributeInfo / groupHandByRank`
- `views/*` 偶尔调 `groupHandByRank` 做手牌展示(列分组)
- 测试文件: `guandan-engine.test.js` 60+ 用例

---

## 二、数据结构约定(全工程统一)

### 卡牌对象

```js
{ suit: 0|1|2|3, rank: 3..15 }   // 普通牌
{ suit: -1, rank: 16|17 }        // 小王 16, 大王 17
```

**花色**:
- 0 = ♠ 黑桃
- 1 = ♥ 红桃
- 2 = ♣ 梅花
- 3 = ♦ 方块

**点数**:
- 3..10 = 数字本身
- 11 = J, 12 = Q, 13 = K, 14 = A
- 15 = 2(最大普通牌)
- 16 = 小王, 17 = 大王

**排序约定**:
- rank 越大牌越大
- 同 rank 时 suit 越小牌越大(♠>♥>♣>♦)
- 王(suit=-1)比所有普通牌大

### 牌型识别结果

```js
{ type: TYPE.X, mainRank: number, length: number, suit?: number }
```

- `mainRank`: 牌型比较用的大小基准(王炸除外,王炸看 length=4)
- `length`: 牌型张数(影响同类型比较,例:6张炸 > 5张炸)
- `suit`: 同花顺需要,标同花色

---

## 三、牌型枚举 (`TYPE`)

```js
const TYPE = {
  INVALID: 0,
  SINGLE: 1,        // 单张
  PAIR: 2,          // 对子
  THREE: 3,         // 三张
  THREE_PAIR: 4,    // 三带二
  STRAIGHT: 5,      // 顺子(5+ 张)
  PAIR_STRAIGHT: 6, // 三连对(3+ 对)
  THREE_STRAIGHT: 7,// 钢板(2+ 组三张)
  BOMB_4: 8,        // 4 张炸
  BOMB_5: 9,        // 5 张炸
  BOMB_6: 10,
  BOMB_7: 11,
  BOMB_8: 12,
  STRAIGHT_FLUSH: 13, // 同花顺(5+ 张同花连续)
  KINGS_BOMB: 14,     // 王炸(4 王)
}
```

**类型优先级表**(`TYPE_ORDER`,`canBeat` 用):

| 牌型 | TYPE_ORDER | 备注 |
|------|-----------|------|
| 普通牌(SINGLE/PAIR/THREE_PAIR/STRAIGHT/PAIR_STRAIGHT/THREE_STRAIGHT) | 0 | 同类型按 mainRank 比 |
| BOMB_4 ~ BOMB_8 | 1-5 | 4→5→6→7→8,数字越大越强 |
| STRAIGHT_FLUSH(同花顺) | 8 | 任何非炸弹都压不过 |
| KINGS_BOMB(王炸) | 9 | 最高,王炸之间大小相同(无同花顺比) |

**严格规则**(v1.0 简化,竞技通用):
- 2 / 王 不可入顺
- A23 顺子不实现(最简化:严格不允许 2 入顺)
- 顺子内不能含 2 / 王
- 同花顺必须 5 张同花色连续
- 炸弹 4-8 张
- 王炸 = 4 王(2 大王 + 2 小王)

---

## 四、API 参考

### 4.1 牌组操作

#### `createDeck() → Card[]`
生成 108 张牌(2 副 52 + 4 王)。

#### `shuffle(deck) → Card[]`
Fisher-Yates 洗牌。**不修改原数组**(`arr.slice()` 起手)。

#### `sortHand(hand) → Card[]`
按 rank 降序,同 rank 按 suit 升序。

#### `sortHandGrouped(hand) → Card[]`
同 rank 排在一起(理牌常用),王排在同 rank 末位。

#### `isLevelCard(c, levelRank) → bool`
判断 `c` 是不是当前级牌。**只有红桃(♥, suit=1)和方块(♦, suit=3)是级牌**(掼蛋规则,黑桃梅花不是)。

#### `deal(seed?) → { hands: Card[4][27], bottom: [] }`
108 张均分给 4 人(每人 27),**不留底牌**(简化版 2v2)。每人手牌已排序。

### 4.2 牌型识别

#### `countByRank(cards) → { rank: count }`
按点数统计。**所有牌型识别都先调这个**。

#### `recognize(cards, ghostRank?) → { type, mainRank, length, suit? } | { type: TYPE.INVALID }`
**核心函数**。一组牌是什么牌型。

**判断顺序**(源码中按以下顺序 return,命中就停):
1. 4 王 → KINGS_BOMB
2. 4-8 张同 rank 无王 → BOMB_4 ~ BOMB_8
3. 5 张同花连续(无王无 2)→ STRAIGHT_FLUSH
4. 1 张 → SINGLE
5. 2 张同 rank(无王)→ PAIR
6. 3 张同 rank(无王)→ THREE
7. 5 张 = 3+2 → THREE_PAIR
8. 6+ 张 = n×3 连续 rank(钢板)→ THREE_STRAIGHT
9. 6+ 张 = n×2 连续 rank(连对)→ PAIR_STRAIGHT
10. 5+ 张单张连续(无王无 2)→ STRAIGHT
11. 都不是 → INVALID

#### `canBeat(playA, playB) → bool`
**比较函数**。`A` 能不能压 `B`。

**判定规则**:
- 王炸 > 一切(王炸之间大小相同,无王炸可压王炸)
- 同花顺 > 一切非炸弹(同花顺之间比 mainRank)
- 炸弹 > 非炸弹(同长度炸弹比 mainRank,长度不同长度大的赢)
- 普通牌:同类型且等长度才能比 mainRank

**首次出牌**(playB 为 null)永远返回 true。

### 4.3 逢人配

掼蛋特殊规则:**红桃级牌(♥levelRank)做万能牌**,可补成任何牌。

#### `splitGhosts(hand, levelRank) → { concrete: Card[], ghosts: Card[] }`
把手牌里的「鬼牌」分离出来。`ghosts` 是 ♥ 级牌,`concrete` 是其他所有。

#### `canFormWithGhosts(targetType, targetLength, targetMainRank, concreteCards, ghostCount, levelRank) → bool`
给鬼牌凑牌型。**当前实现仅支持 0-2 张鬼**:
- 0 张鬼:纯实牌
- 1-2 张鬼:枚举鬼牌可补的 rank 候选,生成虚拟牌再调 `recognize`

### 4.4 升级与进贡

#### `calcLevelUp(ranks, teams) → 0|1|2|3`
- `ranks`: `[头游, 二游, 三游, 末游]`(0/1/2/3 玩家下标)
- `teams`: `[[0,2],[1,3]]` 对家关系

返回升几级:
- 头+二同队 → 3 (双上)
- 头+三同队 → 2
- 头+末同队 → 1
- 其他(交叉)→ 0 (双下)

#### `getLevelRank(currentLevelRank, levelUp) → number`
线性升级:`2(15) → A(14) → K(13) → ... → 3(3) → 2(15)`。
**v1.0 不实现「过 A」特殊逻辑**,仅线性。

#### `tributeInfo(ranks, teams) → { needTribute, from, to, doubleTribute }`
进贡判定:
- 双上 → 输家两人各贡一张给赢家两人(`doubleTribute: true`)
- 其他(升 1 或 2)→ 末游单贡给头游

### 4.5 展示层

#### `groupHandByRank(hand) → RankGroup[]`
把手牌按 rank 分组,返回 `[{ rank, cards, isJoker }]`。

**用途**:UI 把手牌渲染成「每列一个 rank」的竖叠(同 rank 的牌叠在一起,点一列就能出对子/三张/炸弹)。

**排序规则**:
- JOKER(rank 16/17)成一列,放最左
- 普通牌按 `[A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2]` 顺序
- 同 rank 内按 ♠(0) > ♥(1) > ♣(2) > ♦(3)
- 大王(17)在前小王(16)在后

---

## 五、关键算法:牌型识别

源码 `recognize()` 走的是「**早返回 + 按张数分桶**」的策略。理解这个最直接:

```js
function recognize(cards) {
  if (!cards || cards.length === 0) return { type: TYPE.INVALID }

  const cnt = countByRank(cards)            // { rank: count }
  const counts = Object.values(cnt)         // [count, count, ...]
  const len = cards.length
  const jokerCnt = (cnt[16] || 0) + (cnt[17] || 0)

  // 王炸:必 4 王
  if (jokerCnt === 4 && len === 4) return { type: TYPE.KINGS_BOMB, ... }

  // 炸弹:4-8 张,所有牌 rank 相同
  if (jokerCnt === 0 && len >= 4 && len <= 8) {
    const ranks = Object.keys(cnt).map(Number)
    if (ranks.length === 1) { /* 命中 BOMB_N */ }
  }

  // 同花顺:5 张同花色连续(无王无 2)
  if (len === 5 && jokerCnt === 0) { /* ... */ }

  // 普通牌:1/2/3 张 → SINGLE/PAIR/THREE
  // 5 张 → 可能是 三带二(2+3)
  // 6+ 张 → 可能是 连对 / 钢板 / 顺子
  // ...
}
```

**为什么这么写**:
- 牌型张数 < 6 时,识别路径短
- 6+ 张时,按 `[counts 是否都=2]` / `[counts 是否都=3]` 区分连对和钢板
- 顺子要求「每个 rank 只出现 1 次」,可以与连对/钢板互斥

**鬼牌逻辑**:本函数接收的是「已具象化」的牌,鬼牌由调用方在出牌时补成具体 rank 再调 `recognize`。这样引擎逻辑更简单,AI/比较共用同一套。

---

## 六、关键算法:逢人配凑牌

`canFormWithGhosts()` 用的是「**枚举候选 rank + 调 recognize**」的暴力法:

```js
if (ghostCount === 0) {
  // 纯实牌
  return recognize(concreteCards) === target ? true : false
}

if (ghostCount > 2) return false  // 限制

// 1-2 张鬼:枚举鬼牌可补的 rank 组合
for (const assignment of candidates) {
  const virtual = concreteCards.concat(assignment.map(rank => ({ suit: 9, rank })))
  if (recognize(virtual) === target) return true
}
return false
```

**简化的代价**:
- 2 张鬼 = 4 种组合枚举,够用
- 3+ 张鬼直接 false(实际玩起来 2 张鬼已是极限,因为只有 2 张红桃级牌)
- 真实掼蛋里「鬼牌+鬼牌+鬼」凑顺子这种花式需要更复杂的 DP,**v2.0 再做**

---

## 七、修改前 checklist

改 `engine.js` 前一定做这些事:

1. **看测试覆盖**:`guandan-engine.test.js` 60+ 用例覆盖了哪些场景
2. **加测试**:任何改识别/比较/升级的提交,必须先在测试里加 case,跑全过后再合
3. **看调用方**:`engine.js` 被 `ai.js` / `game.js` / 视图广泛调用,改函数签名必爆
4. **保持纯函数**:不引入随机数(除了 `shuffle` 和 `deal`),不依赖时间
5. **保持 ESM 命名导出**:`export { ... }` + 必要时 `export default`,**不要混 CJS**

---

## 八、常见改动示例

### 例 1:加「飞机带翅膀」(三顺+附件)

需要:
1. `TYPE` 加 `AIRPLANE: 15`
2. `TYPE_ORDER` 加映射
3. `recognize` 识别逻辑:连续 2+ 组三张 + 相同数量的单/对
4. `canBeat` 处理同长度飞机比 mainRank
5. `guandan-engine.test.js` 加 5+ 测试 case

### 例 2:加「过 A」特殊规则

当前 `getLevelRank` 线性升级,`打 A` 时不区分。要加:
1. 在 `guandan-game.js` 的 `finishRound()` 里,升级前先判断 `state.levelRank === 14` (A) 且本队头游 → 升 2 级(过 A)
2. **不要改 `engine.js`**,业务规则属于状态机层

### 例 3:加 4+ 张连炸(9-10 张炸)

1. `TYPE` 加 `BOMB_9, BOMB_10`
2. `TYPE_ORDER` 加映射
3. `recognize` 炸弹分支条件 `len >= 4 && len <= 10`
4. 测试加 case

---

**下一步**:
- 改 AI 决策:看 `docs/AI.md`
- 加新牌型:看 `docs/HOWTO-EXTEND.md`
