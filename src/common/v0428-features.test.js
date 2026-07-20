/**
 * v0.4.28 UI 留存功能回归测试
 *
 * 覆盖本轮新增的两大离线留存模块(纯函数,可单测):
 * - achievements.js(P1-1 成就系统):6 个成就的判定 + 解锁持久化 + 去重
 * - career.js(P1-4 AI 生涯):2→A 爬梯升降级 + 段位/对手映射 + 持久化
 *
 * 两者都只依赖 localStorage(测试内 mock)与 history.js / guandan-engine.js 纯函数。
 */

import {
  ACHIEVEMENTS, evaluateAchievements, checkNewUnlocks,
  getUnlockedIds, isUnlocked, resetAchievements,
} from './achievements.js'
import {
  getCareer, careerLevelRank, careerLevelLabel, careerOpponent,
  careerDifficulty, careerLadder, isChampion, recordCareerResult, resetCareer,
} from './career.js'

// ===== localStorage mock( Node 无原生 localStorage)=====
const store = {}
globalThis.localStorage = {
  getItem(k) { return store[k] ?? null },
  setItem(k, v) { store[k] = String(v) },
  removeItem(k) { delete store[k] },
}

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}\n    期望: ${e}\n    实际: ${a}`); fail++ }
}

/** 造一条战绩:mySeat=0,ranks 为完赛名次,win 由 ranks[0] 与 mySeat 同队决定 */
function rec(ranks, levelUp = 1) {
  return { time: Date.now(), ranks, levelUp, levelRank: 15, mySeat: 0, myPlayerId: 'me' }
}

// ============== 1. P1-1 成就定义完整性 ==============
console.log('\n=== 1. P1-1 成就定义完整性 ===')
{
  eq('成就总数 6 个', ACHIEVEMENTS.length, 6)
  assert('每个成就都有 id/name/desc/icon/check',
    ACHIEVEMENTS.every(a => a.id && a.name && a.desc && a.icon && typeof a.check === 'function'))
  const ids = ACHIEVEMENTS.map(a => a.id)
  eq('成就 id 无重复', new Set(ids).size, ids.length)
}

// ============== 2. P1-1 成就判定 ==============
console.log('\n=== 2. P1-1 成就判定(纯函数) ===')
{
  resetAchievements()
  eq('空战绩无任何成就', evaluateAchievements([]).length, 0)

  // 旗开得胜:赢 1 局(ranks[0]=0 与 mySeat=0 同队)
  const win1 = evaluateAchievements([rec([0, 1, 2, 3])])
  assert('赢 1 局解锁「旗开得胜」', win1.some(a => a.id === 'first-win'))

  // 双上:头游二游同队(0 和 2 都是 mySeat=0 的队)
  const dup = evaluateAchievements([rec([2, 0, 1, 3])])
  assert('头游二游同队解锁「双上高手」', dup.some(a => a.id === 'double-up'))
  const noDup = evaluateAchievements([rec([0, 1, 2, 3])])
  assert('头游二游不同队不解锁「双上高手」', !noDup.some(a => a.id === 'double-up'))

  // 大获全胜:单局升 3 级
  assert('单局升 3 级解锁「大获全胜」',
    evaluateAchievements([rec([0, 1, 2, 3], 3)]).some(a => a.id === 'big-win'))
  assert('单局升 2 级不解锁「大获全胜」',
    !evaluateAchievements([rec([0, 1, 2, 3], 2)]).some(a => a.id === 'big-win'))

  // 头游达人:累计 3 次头游
  const threeHead = [rec([0, 1, 2, 3]), rec([0, 2, 1, 3]), rec([0, 3, 1, 2])]
  assert('3 次头游解锁「头游达人」', evaluateAchievements(threeHead).some(a => a.id === 'head-3'))
  assert('2 次头游不解锁「头游达人」',
    !evaluateAchievements(threeHead.slice(0, 2)).some(a => a.id === 'head-3'))

  // 常胜将军:5 连胜(records 新→旧,computeStreak 从最近数)
  const fiveWins = Array.from({ length: 5 }, () => rec([0, 2, 1, 3]))
  assert('5 连胜解锁「常胜将军」', evaluateAchievements(fiveWins).some(a => a.id === 'streak-5'))
  const broken = [rec([1, 3, 0, 2]), ...fourWins()]
  assert('连胜被中断不解锁「常胜将军」', !evaluateAchievements(broken).some(a => a.id === 'streak-5'))
  function fourWins() { return Array.from({ length: 4 }, () => rec([0, 2, 1, 3])) }

  // 百战老兵:10 局
  const ten = Array.from({ length: 10 }, (_, i) => rec(i % 2 ? [1, 3, 0, 2] : [0, 2, 1, 3]))
  assert('10 局解锁「百战老兵」', evaluateAchievements(ten).some(a => a.id === 'veteran'))
  assert('9 局不解锁「百战老兵」', !evaluateAchievements(ten.slice(0, 9)).some(a => a.id === 'veteran'))
}

// ============== 3. P1-1 解锁持久化 + 去重 ==============
console.log('\n=== 3. P1-1 解锁持久化 + 去重 ===')
{
  resetAchievements()
  eq('初始无已解锁', getUnlockedIds().length, 0)
  const fresh1 = checkNewUnlocks([rec([0, 2, 1, 3], 3)])  // 赢+双上+大胜
  assert('首次结算返回新解锁(≥3 个)', fresh1.length >= 3)
  assert('解锁后 isUnlocked(first-win) 为 true', isUnlocked('first-win'))
  const fresh2 = checkNewUnlocks([rec([0, 2, 1, 3], 3)])
  eq('同样战绩二次结算不再重复解锁', fresh2.length, 0)
  assert('getUnlockedIds 与持久化一致', getUnlockedIds().length >= 3)
  resetAchievements()
  eq('resetAchievements 清空', getUnlockedIds().length, 0)
}

// ============== 4. P1-4 生涯爬梯 ==============
console.log('\n=== 4. P1-4 生涯爬梯升降级 ===')
{
  resetCareer()
  const c0 = getCareer()
  eq('初始段位索引 0', c0.levelIndex, 0)
  eq('初始级牌 rank 15(打 2)', careerLevelRank(c0), 15)
  eq('初始级牌名「2」', careerLevelLabel(c0), '2')

  const r1 = recordCareerResult(true)
  assert('赢一局升级(promoted)', r1.promoted === true)
  eq('升到索引 1(打 3)', r1.career.levelIndex, 1)
  eq('胜场 +1', r1.career.wins, 1)

  const r2 = recordCareerResult(false)
  assert('输一局降级(demoted)', r2.demoted === true)
  eq('降回索引 0', r2.career.levelIndex, 0)
  eq('负场 +1', r2.career.losses, 1)

  // 底部不再降
  const r3 = recordCareerResult(false)
  assert('已在底部不再降', r3.demoted === false && r3.career.levelIndex === 0)
}

// ============== 5. P1-4 登顶 + 爬梯边界 ==============
console.log('\n=== 5. P1-4 登顶 + 爬梯边界 ===')
{
  resetCareer()
  const ladder = careerLadder()
  eq('爬梯共 13 级', ladder.length, 13)
  eq('起点「2」', ladder[0], '2')
  eq('终点「A」', ladder[12], 'A')

  // 连赢 12 局爬到 A
  let last
  for (let i = 0; i < 12; i++) last = recordCareerResult(true)
  eq('12 胜后到达 A(索引 12)', last.career.levelIndex, 12)
  assert('到达 A 后 isChampion 为 true', isChampion(last.career))
  const champ = recordCareerResult(true)
  assert('已是 A 再赢标记 champion 而非 promoted', champ.champion === true && champ.promoted === false)
  eq('胜场累计 13', champ.career.wins, 13)
  eq('best 记录最高段位', champ.career.best, 12)
}

// ============== 6. P1-4 段位对手映射 ==============
console.log('\n=== 6. P1-4 段位对手映射 ===')
{
  resetCareer()
  const low = getCareer()
  eq('低段位难度 medium', careerDifficulty(low), 'medium')
  assert('低段位对手有名字和性格', !!careerOpponent(low).name && !!careerOpponent(low).trait)

  // 爬到高位(索引 8)→ hard
  for (let i = 0; i < 8; i++) recordCareerResult(true)
  const high = getCareer()
  eq('高段位难度 hard', careerDifficulty(high), 'hard')
  assert('段位越高对手越强(名字不同)', careerOpponent(high).name !== careerOpponent(low).name)
  resetCareer()
}

console.log(`\n========== v0.4.28 UI 留存功能测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
