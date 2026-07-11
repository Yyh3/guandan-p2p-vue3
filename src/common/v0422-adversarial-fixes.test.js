/**
 * v0.4.22 对抗性复查修复测试 — V0421 报告 P0-06 / P0-07
 *
 * - P0-06: _applySnapshot 必须整体验证、原子提交,不能留下"应用一半"的状态。
 * - P0-07: applyRoundEndFromPayload 必须先完整校验 payload,再写去重 ID / 改状态,
 *          畸形 ROUND_END 不能占用 lastAppliedRoundId 导致后续正确消息被跳过。
 */
import * as fs from 'fs'
import * as path from 'path'
import * as url from 'url'
import { createGame } from './guandan-game.js'

const repoRoot = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..')
const gamePath = path.join(repoRoot, 'src/common/guandan-game.js')
const gameSrc = fs.readFileSync(gamePath, 'utf-8')

let pass = 0, fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}

// ============== P0-07 源码检查:applyRoundEndFromPayload 校验后再写去重 ID ==============
console.log('\n=== P0-07 源码检查:ROUND_END 先校验后写去重 ID ===')
{
  const fnMatch = gameSrc.match(/applyRoundEndFromPayload\(p\)\s*\{[\s\S]*?^    \}/m)
  check('applyRoundEndFromPayload 函数存在', !!fnMatch)
  if (fnMatch) {
    const body = fnMatch[0]
    // 1) 有完整校验段(至少 ranks / levelUp / newLevelRank 校验)
    check('校验 payload.ranks(长度 4 + 合法 seat)',
      /p\.ranks\.length !== 4/.test(body) && /ranksSet/.test(body))
    check('校验 levelUp / newLevelRank 是 number',
      /typeof p\.levelUp !== 'number'/.test(body) &&
      /typeof p\.newLevelRank !== 'number'/.test(body))
    // 2) 写 state.lastAppliedRoundId 只能出现在所有校验 + 状态写入之后
    const stateAssignIdx = body.search(/state\.lastAppliedRoundId\s*=\s*rid/)
    const invalidRanksReturnIdx = body.search(/return\s*\{\s*ok:\s*false,\s*error:\s*['"]invalid_ranks['"]/)
    const invalidLevelUpIdx = body.search(/return\s*\{\s*ok:\s*false,\s*error:\s*['"]invalid_levelUp['"]/)
    check('state.lastAppliedRoundId 赋值在 invalid_ranks return 之后',
      stateAssignIdx > invalidRanksReturnIdx && invalidRanksReturnIdx !== -1)
    check('state.lastAppliedRoundId 赋值在 invalid_levelUp return 之后',
      stateAssignIdx > invalidLevelUpIdx && invalidLevelUpIdx !== -1)
  }
}

// ============== P0-07 行为:畸形 ROUND_END 不占用去重 ID ==============
console.log('\n=== P0-07 行为:畸形 ROUND_END 不污染去重 ID ===')
{
  const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
  game.deal()
  const malformed = {
    ranks: [0, 0, 1, 2], // 非法:重复 seat
    levelUp: 1,
    newLevelRank: 5,
    roundId: 'R-P0-07',
  }
  const r1 = game.applyRoundEndFromPayload(malformed)
  check('畸形 payload 被拒绝', !r1.ok && r1.error === 'invalid_ranks')
  check('去重 ID 未被占用', game._state.lastAppliedRoundId !== 'R-P0-07')

  const valid = {
    ranks: [0, 1, 2, 3],
    levelUp: 1,
    newLevelRank: 5,
    roundId: 'R-P0-07',
  }
  const r2 = game.applyRoundEndFromPayload(valid)
  check('同 roundId 的正确 payload 仍能应用', r2.ok && !r2.duplicate)
  check('phase 已转 finished', game._state.phase === 'finished')
  check('finishedOrder 正确写入', JSON.stringify(game._state.finishedOrder) === JSON.stringify([0, 1, 2, 3]))
}

// ============== P0-06 源码检查:_applySnapshot 原子提交 ==============
console.log('\n=== P0-06 源码检查:_applySnapshot 整体验证 + 原子提交 ===')
{
  const fnMatch = gameSrc.match(/_applySnapshot\(snap\)\s*\{[\s\S]*?^    \}/m)
  check('_applySnapshot 函数存在', !!fnMatch)
  if (fnMatch) {
    const body = fnMatch[0]
    check('存在临时 next 对象', /const\s+next\s*=\s*\{\}/.test(body))
    check('存在原子提交 Object.assign(state, next)',
      /Object\.assign\(state,\s*next\)/.test(body))
    // 统计 next 赋值与直接 state 赋值:应只有最后 Object.assign(state, next) 直接改 state
    const directStateAssignMatches = body.match(/state\.\w+\s*=[^=]/g) || []
    check('函数内不出现 state.xxx = 的逐字段直接赋值(除 Object.assign)',
      directStateAssignMatches.length === 0)
  }
}

// ============== P0-06 行为:非法 snapshot 不留下半成状态 ==============
console.log('\n=== P0-06 行为:_applySnapshot 原子性拒绝 ===')
{
  const game = createGame({ seats: 4, levelRank: 5, aiPlayers: [] })
  game.deal()
  const baseCurrentPlayer = game._state.currentPlayer
  const basePhase = game._state.phase

  // 合法字段 + 非法 phase → 整单拒绝
  const badPhaseSnap = {
    currentPlayer: (baseCurrentPlayer + 1) % 4,
    phase: 'not-a-phase',
    passCount: 1,
  }
  game._applySnapshot(badPhaseSnap)
  check('非法 phase snapshot 不改变 currentPlayer',
    game._state.currentPlayer === baseCurrentPlayer)
  check('非法 phase snapshot 不改变 phase',
    game._state.phase === basePhase)

  // finishedOrder 与 abandonedSeats 重叠 → 拒绝
  const overlapSnap = {
    currentPlayer: (baseCurrentPlayer + 1) % 4,
    finishedOrder: [0, 1],
    abandonedSeats: [1, 2],
    passCount: 2,
  }
  game._applySnapshot(overlapSnap)
  check('finished/abandoned 重叠时 currentPlayer 不变',
    game._state.currentPlayer === baseCurrentPlayer)
  check('finished/abandoned 重叠时 passCount 不变',
    game._state.passCount !== 2)

  // currentPlayer 出现在 finishedOrder 中 → 拒绝
  const finishedCurrentSnap = {
    currentPlayer: 0,
    finishedOrder: [0, 1, 2, 3],
  }
  game._applySnapshot(finishedCurrentSnap)
  check('currentPlayer 在 finishedOrder 中时拒绝写入',
    game._state.currentPlayer === baseCurrentPlayer)
}

console.log('\n========== v0.4.22 对抗性修复测试:', pass, '通过 /', fail, '失败 ==========')
if (fail > 0) process.exit(1)
