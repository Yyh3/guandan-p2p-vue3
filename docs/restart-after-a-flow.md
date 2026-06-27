# 过 A 后「重开一局」逻辑接入说明

> 面向 MiniMax：本文只描述真实功能接入方案。本次 Codex 已新增静态 UI 演示页
> `/#/ui-preview/restart-after-a`，用于确认最终视觉，不代表状态机已经接入。

## 目标行为

当一轮结算时，当前级牌已经是 `A`，且本轮胜方继续升级，则认为本轮掼蛋已经「过 A」。
此时结算层不应再展示「下一局」，而应展示主按钮「重开一局」。

点击「重开一局」后开始一轮新的完整对局，级牌回到项目默认起点 `2`。

## 判定条件

项目当前 rank 约定在 `src/common/guandan-engine.js`：

- `15` = `2`
- `14` = `A`
- `LEVEL_SEQUENCE = [15, 14, 13, ...]`

推荐由 host / 本机单机模式在 round end 时统一计算：

```js
const previousLevelRank = state.levelRank
const levelUp = calcLevelUp(ranks, winner)
const isRestartAfterA = previousLevelRank === 14 && levelUp > 0
```

注意：

- 如果 `previousLevelRank === 14` 但 `levelUp === 0`，说明本轮没有过 A，继续停留在 A。
- 如果 `previousLevelRank !== 14`，即使升级后跳到 A，也只是下一局打 A，不显示「重开一局」。
- 不建议用 `newLevelRank < 14` 之类的推断替代显式字段，避免以后级牌序列调整时误判。

## 状态字段建议

在对局状态 / round end payload 中增加显式字段：

```js
{
  previousLevelRank,
  newLevelRank,
  levelUp,
  isRestartAfterA,
}
```

UI 层可以在 `useGameLogic.js` 中保留一个响应式值：

```js
const isRestartAfterA = ref(false)
```

收到 round end 后：

```js
isRestartAfterA.value = payload.isRestartAfterA === true
```

退出结果层、开始新局或重新进入房间时都要重置为 `false`。

## UI 接入点

桌面横屏结果层在 `src/views/game/GameViewDesktop.vue`：

- 当前标题：`本局结束`
- 当前主按钮：`下一局`
- 接入后主按钮文案：
  - `isRestartAfterA === true`：`重开一局`
  - 其他情况：`下一局`

移动端如果后续补完整结果弹层，也使用同一个字段和文案规则。

建议按钮事件分流：

```js
function onPrimaryResultAction() {
  if (isRestartAfterA.value) {
    onRestartMatch()
    return
  }
  onNext()
}
```

## 重开一局动作

重开不是「继续下一局」，而是开启新的 match：

- `levelRank` 回到 `15`，即打 `2`
- 清空本轮 `finishedOrder` / `table` / `lastPlay` / `trickHistory`
- 重新洗牌发牌
- 重置结算弹层和 `isRestartAfterA`
- 保留房间成员、座位、昵称、头像、房主身份
- 本地战绩按现有规则保留上一轮记录

推荐新增一个语义清晰的方法，例如：

```js
restartMatch({ levelRank: 15 })
```

不要把「重开一局」塞进现有 `onNext()`，否则后续排查普通升级和封顶重开的差异会比较痛。

## P2P 同步建议

联机模式由 host 作为唯一权威：

1. host 结算时广播 round end payload，包含 `isRestartAfterA`。
2. joiner 只信 host payload，不自己重复推断。
3. 点击「重开一局」时 host 广播新消息，例如：

```js
{
  type: 'MATCH_RESTART',
  matchId,
  seed,
  levelRank: 15,
}
```

4. joiner 收到后用同一 `seed` 和 `levelRank` 重建对局。

建议 payload 带 `matchId` 或递增 `roundId`，防止弱网重复消息导致重复重开。

## AI / 单机模式

AI 模式不需要网络广播，直接调用同一个重开入口：

```js
restartMatch({ levelRank: 15, ai: true })
```

要确保 3 个 AI 玩家、当前玩家座位、头像昵称沿用当前配置。

## 推荐测试

最少补这些测试：

- `previousLevelRank = 14` 且 `levelUp = 1/2/3` 时，`isRestartAfterA === true`
- `previousLevelRank = 14` 且 `levelUp = 0` 时，`isRestartAfterA === false`
- `previousLevelRank = 15` 升到 `14` 时，`isRestartAfterA === false`
- `MATCH_RESTART` 后 level rank 回到 `15`
- 联机 joiner 收到 host 的 `isRestartAfterA` 后显示「重开一局」
- 普通 round end 仍显示「下一局」

## 手工验收

1. 单机 AI 模式从打 A 结束并升级，结果层显示「重开一局」。
2. 点击「重开一局」后重新发牌，顶部级牌显示 `2`。
3. 非 A 级牌结算仍显示「下一局」。
4. 打 A 但未升级时仍显示「下一局」或继续打 A，不显示「重开一局」。
5. 4 人联机时，host 和 joiner 的结果层按钮文案一致。
