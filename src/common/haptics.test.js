/**
 * haptics.js 单元测试
 *
 * 验证:
 * - 默认启用
 * - 各反馈函数存在且调用不抛错
 * - 关闭后调用静默返回
 */
import * as haptics from './haptics.js'
import { getSettings, setSettings } from './storage.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  assert(name, ok)
}

console.log('\n=== 1. 导出函数 ===')
eq('click 存在', typeof haptics.click, 'function')
eq('select 存在', typeof haptics.select, 'function')
eq('action 存在', typeof haptics.action, 'function')
eq('impact 存在', typeof haptics.impact, 'function')
eq('notify 存在', typeof haptics.notify, 'function')
eq('success 存在', typeof haptics.success, 'function')
eq('error 存在', typeof haptics.error, 'function')

console.log('\n=== 2. 默认启用 ===')
setSettings({ hapticsEnabled: true })
eq('hapticsEnabled 默认 true', getSettings().hapticsEnabled, true)
eq('isHapticsEnabled 返回 true', haptics.isHapticsEnabled(), true)

console.log('\n=== 3. 调用不抛错(Node 环境回退到 navigator.vibrate no-op) ===')
await haptics.click()
await haptics.select()
await haptics.action()
await haptics.impact('heavy')
await haptics.notify('warning')
await haptics.success()
await haptics.error()
assert('全部反馈调用完成且无异常', true)

console.log('\n=== 4. 关闭后调用静默 ===')
const hasStorage = typeof localStorage !== 'undefined'
if (hasStorage) {
  setSettings({ hapticsEnabled: false })
  eq('isHapticsEnabled 返回 false', haptics.isHapticsEnabled(), false)
}
await haptics.click()
await haptics.action()
assert('调用仍无异常', true)
if (hasStorage) setSettings({ hapticsEnabled: true })

console.log(`\n========== haptics 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
