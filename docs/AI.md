# AI 出牌引擎 (`guandan-ai.js`)

> 中等难度的规则 + 贪心 AI。不做搜索/蒙特卡洛/深度学习——就是「看一眼桌面牌,找最便宜的能压的」。

---

## 一、模块定位

**职责**:给定「我的手牌 + 当前桌面牌 + 队友状态」,决定出哪几张牌(或者 pass)。

**不负责**:
- 不修改手牌(只读)
- 不调用 `game.playerPlay`(状态机自己调 AI)
- 不做长期规划(不记忆多轮历史)

**调用方**:
- `guandan-game.js` 的 `scheduleAI()`:轮到 AI 座位时,等 500-1000ms 后调 `decide()`
- `GameView.vue` 的「一键理」按钮:调 `autoPlayGrouped()` 给玩家智能凑出牌型

**难度等级**:**Medium**。比随机强、比职业玩家弱,符合「中等难度」产品决策(见 AGENTS.md 第 5 条)。

---

## 二、对外 API

### 2.1 `decide(hand, currentPlay, levelRank, ctx) → { type: 'play', cards } | { type: 'pass' }`

**核心决策函数**。状态机每轮到 AI 时调它。

| 参数 | 类型 | 说明 |
|------|------|------|
| `hand` | `Card[]` | AI 当前手牌(含鬼牌) |
| `currentPlay` | `{ type, mainRank, length, who } \| null` | 当前桌面牌,首家为 null |
| `levelRank` | `number` | 当前级牌 rank(影响鬼牌拆分) |
| `ctx` | `{ isTeammateLast, mySeatIndex, teammateSeatIndex }` | 上下文 |

**ctx 字段**:
- `isTeammateLast`: 上一个出牌的人是不是我队友
- `mySeatIndex`, `teammateSeatIndex`: 座位号(影响 isTeammateLast 计算)

**返回**:
- `{ type: 'play', cards: [...] }` — 出哪些牌
- `{ type: 'pass' }` — 不出

### 2.2 `autoPlayGrouped(hand, lastPlay, levelRank, ctx) → { type: 'play', cards } | { type: 'pass' }`

**「一键理」智能凑牌型**。玩家点「智能理牌」时调它,主动找最值得出的牌型。

**优先级**:
1. 王炸(4 王)
2. 同花顺(5+ 张同花连续)
3. 6+ 张炸 > 5 张炸 > 4 张炸
4. 钢板(2+ 组连续三张)
5. 顺子(5+ 张连续)
6. 连对(3+ 对连续)
7. 三带二
8. 三张
9. 对子
10. 单张

每级内部有鬼牌凑牌分支,见源码。

### 2.3 `TYPE_VALUE` 常量

牌型强度映射(从大到小):
```js
KINGS_BOMB: 100, STRAIGHT_FLUSH: 90,
BOMB_8: 80, BOMB_7: 70, BOMB_6: 60, BOMB_5: 50, BOMB_4: 40,
STRAIGHT/PAIR_STRAIGHT/THREE_STRAIGHT: 30,
THREE_PAIR: 25, THREE: 20, PAIR: 15, SINGLE: 10
```

### 2.4 内部辅助函数(供阅读源码,不要直接调)

- `findMinBeat(hand, target, ghostCount, levelRank)` — 找最小能压的牌
- `findMinSameType(concrete, ghosts, target, levelRank)` — 找最小同类型压制
- `findMinBomb(concrete, targetLen, targetRank, mustBeat)` — 找最小炸弹
- `tryBombWithGhosts(concrete, ghosts, targetLen, targetRank)` — 鬼牌凑炸弹
- `findMinStraightFlush(concrete, targetMainRank)` — 找最小同花顺
- `findBestStraightFlush(cards)` — 一键理:找最大同花顺
- `findBestBomb(cards, ghostAvail, ghosts)` — 一键理:找最大炸弹
- `findBestSteelPlate(cards, ghostAvail, ghosts)` — 一键理:找最大钢板
- `findBestStraight(cards, ghostAvail, ghosts)` — 一键理:找最大顺子
- `findBestPairStraight(cards, ghostAvail, ghosts)` — 一键理:找最大连对

---

## 三、决策流程

### 3.1 跟牌(非首家,有人出了牌)

```
findMinBeat(hand, currentPlay, ghostCount, levelRank):
  1. 王炸检测(4 王全出)
  2. 目标 = 同花顺/王炸 → 必须同花顺才能压(王炸无解)
  3. 目标 = 炸弹 → 找张数更大或同张数 rank 更大的炸弹
  4. 目标 = 普通牌:
     a. 先尝试同类型压制(findMinSameType)
     b. 再考虑鬼牌凑 4 炸(便宜)
     c. 最后找任意炸弹(贵)
  5. 都压不起 → null → decide() 返回 pass
```

**核心原则**:
- **能压就压最小的**(贪心)
- **非必要不炸弹**(炸弹是保命牌)
- **鬼牌优先凑炸弹**(鬼牌当万能,凑 4 炸最划算)
- **接风自由出**(队友最后出牌 → 当首家处理)

### 3.2 首家 / 队友接风

调用 `chooseLead(hand, levelRank)`:
1. 找最大炸弹
2. 找最大同花顺
3. 找最大钢板/顺子/连对
4. 找最大三带二
5. 找最大对子
6. 找最大单张

> 注意:这里**找最大**(主动出)而不是最小(压制),因为是进攻方,大牌先出。

### 3.3 队友接风(队友最后出)

直接调 `chooseLead()` 当首家处理。这是掼蛋的常见策略:队友帮我清了,我也清。

### 3.4 对手出牌(我是跟牌方)

跟牌流程,见 3.1。

---

## 四、关键设计选择

### 4.1 为什么不搜索

**搜索**(博弈树 / 蒙特卡洛)会让 AI 强很多,但:
- 增加 ~10x 代码量
- 增加 ~5-100x CPU 开销(每步 100ms+)
- 中等难度产品定位不需要

**v1.0 决策**:规则 + 贪心够用。

**v2.0 方向**:
- Easy 模式:随机出(基本就是当前 decide + 一点噪声)
- Medium 模式:当前实现
- Hard 模式:1 层搜索(枚举对手可能的牌,选期望最优)

### 4.2 为什么不记忆历史

**记忆**(记录每张已出牌,推断对手剩余)能提升 AI 强度,但:
- 27 张手牌状态空间爆炸
- 实施成本高
- 当前玩家体验已经够用(对战不会输太惨)

**v2.0 候选**:可加「**剩余牌推断**」模块,降低 AI 出牌策略的下限。

### 4.3 鬼牌的处理

- 出牌时:调 `splitGhosts` 把鬼牌拆出来
- 凑牌:1-2 张鬼 + 同 rank 实牌 → 炸弹/对子/三张
- 限制:2 张鬼以上 `canFormWithGhosts` 直接 false(简化)

**当前 bug 风险**:3+ 张鬼牌不能凑复杂牌型(只支持 0-2 张),真实玩起来基本不会出问题(最多 2 张红桃级牌)。

### 4.4 队友优先 / 对手压制

**当前实现**:只看 `isTeammateLast`,队友接风时主动出,对手出牌时跟压。

**没有实现**:
- 不区分对手中谁是上游/下游
- 不做「给对家喂牌」
- 不做「卡对手牌型」

**v2.0 增强**:可加「**2 层前瞻**」,枚举对手可能的反压,选最稳的出法。

---

## 五、测试覆盖

`guandan-ai.test.js` 17 个用例覆盖:
- 领出(各家出) → 单张 / 对子 / 顺子 / 炸弹
- 跟牌 → 同类型压制 / 鬼牌凑 / 炸弹压
- 鬼牌凑牌 → 1 鬼 + 3 同 rank = 4 炸
- 队友接风 → 自动当首家
- 接风 → 出完手牌

**测试 pattern**:
```js
// 构造手牌
const hand = [
  { suit: 0, rank: 5 },  // 5♠
  { suit: 1, rank: 14 }, // A♥ (鬼牌,如果 level=2)
  // ...
]
// 桌面牌
const table = { type: TYPE.PAIR, mainRank: 10, length: 2 }
// 决策
const r = decide(hand, table, levelRank, { isTeammateLast: false })
// 验证
assert(r.type === 'pass')  // 或 r.cards
```

**改 AI 必加测试**:任何决策分支变动,先在 `guandan-ai.test.js` 加对应 case,跑全过后再合。

---

## 六、修改 checklist

改 `ai.js` 前:

1. **看测试**:`guandan-ai.test.js` 哪些 case 覆盖了你改的分支?
2. **加测试**:新策略必须有对应测试,不能「我跑了几局觉得 AI 强了」就合
3. **不要引入 random**:`decide()` 必须是确定性函数(给定相同输入 → 相同输出)
4. **保持纯函数**:`autoPlayGrouped` 和 `decide` 不修改手牌,只读不写
5. **不调 `setTimeout`**:AI 出牌节奏由状态机控制,不在 AI 模块里设 timer
6. **不调 `engine.recognize` 后改手牌**:recognize 是纯函数,不改全局

---

## 七、常见改动示例

### 例 1:让 AI 更激进(用更多炸弹)

修改 `findMinBeat()` 中的优先级:把「找同类型压制」放到「找炸弹」后面,改成「优先用炸弹」。

**风险**:会更快打完炸弹,但 4 炸之后没牌可救。

### 例 2:加 Easy 模式(随机出)

在 `decide` 入口加噪声:

```js
function decide(hand, currentPlay, levelRank, ctx, options = {}) {
  const difficulty = options.difficulty || 'medium'

  if (difficulty === 'easy' && Math.random() < 0.4) {
    // 40% 概率随机 pass / 乱出
    return { type: 'pass' }
  }
  // ... 原逻辑
}
```

`GameView` 通过 storage.getSettings() 取 difficulty 传进来。

### 例 3:加「卡牌」策略

对手只剩 1 张牌时,我方单张 rank > 对手最大单张 → 主动出大牌压死。

实现:在 `ctx` 加 `opponentHandSize` 字段,`chooseLead` 里加分支:

```js
if (ctx.opponentHandSize === 1) {
  // 找最小能压的(主动出)
  return findMinBeat(hand, currentPlay, ...).reverse()  // 简化示意
}
```

---

## 八、性能数据

`node src/benchmark.js` 输出 AI 决策耗时。当前基准:
- 单次 `decide()` 调用:1-5 ms(手牌 27 张时)
- 单次 `autoPlayGrouped()`:5-20 ms(有 5 层找牌 + 鬼牌分支)
- 单局 4 个 AI ~100 次决策:总 < 1 秒

**优化空间**:不大,先不动。优先功能完整。

---

**下一步**:
- 改规则 → `docs/ENGINE.md`
- 加 UI 触发 AI → `docs/UI.md`
- 测试规范 → `docs/TESTING.md`
