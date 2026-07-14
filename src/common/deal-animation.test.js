/**
 * deal-animation 模块自测脚本
 * 用法: node common/deal-animation.test.js
 *
 * 浏览器相关 API(DOM, requestAnimationFrame)用 node-only 的
 * minimal shim 验证 API 表面 + guard 逻辑,不做实际动画。
 */
import { dealAnim, DealAnimation } from './deal-animation.js'

let pass = 0, fail = 0
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, '\n    期望:', b, '\n    实际:', a) }
}
function assert(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name) }
}

console.log('\n=== 1. 模块导出 ===')
assert('导出 default 实例', typeof dealAnim === 'object' && dealAnim !== null)
assert('导出 DealAnimation 类', typeof DealAnimation === 'function')
assert('实例有 start 方法', typeof dealAnim.start === 'function')
assert('实例有 cancel 方法', typeof dealAnim.cancel === 'function')
assert('实例有 isRunning 方法', typeof dealAnim.isRunning === 'function')

console.log('\n=== 2. isRunning 初始状态 ===')
assert('默认未运行', dealAnim.isRunning() === false)

console.log('\n=== 3. start 缺参保护 ===')
// 缺参时只 console.warn,不应抛错
let threw = false
try { dealAnim.start({}) } catch (e) { threw = true }
assert('缺参不抛错', threw === false)

threw = false
try { dealAnim.start() } catch (e) { threw = true }
assert('无参不抛错', threw === false)

console.log('\n=== 4. DealAnimation 构造 ===')
const inst = new DealAnimation()
assert('新实例未运行', inst.isRunning() === false)
assert('新实例有 start', typeof inst.start === 'function')

console.log('\n=== 5. cancel 不抛错 ===')
try { inst.cancel() } catch (e) { threw = true; console.log(e) }
assert('cancel() 不抛错', threw === false)

console.log('\n=== 6. __gd_skipDealAnim hook (v2.4 t3 加,v2.4-p1 回归) ===')
// 模拟生产 headless/真机 WebView 跳过动画场景:onComplete 必须下个 microtask 触发
globalThis.window = { __gd_skipDealAnim: true, __gd_e2e: true }
const skipped = new Promise((resolve) => {
  const inst2 = new DealAnimation()
  inst2.start({
    container: { style: {}, appendChild: () => {} },
    center: { x: 100, y: 100 },
    targets: { 0: { x: 0, y: 0 }, 1: { x: 0, y: 0 }, 2: { x: 0, y: 0 }, 3: { x: 0, y: 0 } },
    onComplete: () => resolve('done'),
  })
  // onComplete 应当在 Promise.resolve() 后同步触发(测试环境下 microtask 立即 flush)
})
skipped.then(tag => {
  assert('skipDealAnim 时 onComplete 被调用', tag === 'done')
  delete globalThis.window

  console.log('\n=== 7. onComplete 缺参时不抛错 ===')
  let threw2 = false
  try { dealAnim.start({ container: null }) } catch (e) { threw2 = true }
  assert('container null 不抛错', threw2 === false)

  console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
  if (fail > 0) process.exit(1)
})

