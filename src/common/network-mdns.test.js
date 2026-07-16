/**
 * network-mdns.js 单元测试
 *
 * 验证:
 * - Node 环境下 isMdnsAvailable 返回 false
 * - registerMdnsService 返回 not_native
 * - watchMdnsServices 返回可安全 stop 的空实现
 * - 不抛出未捕获异常
 */
import { isMdnsAvailable, registerMdnsService, watchMdnsServices, stopMdns } from './network-mdns.js'

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}`); process.exitCode = 1 }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  assert(name, ok)
}

console.log('\n=== 1. Node 环境可用性 ===')
eq('isMdnsAvailable() 为 false', isMdnsAvailable(), false)

console.log('\n=== 2. registerMdnsService 在 Node 返回 not_native ===')
const reg = await registerMdnsService({ name: 'guandan-test', port: 8848, roomNo: 'TEST' })
eq('register ok 为 false', reg.ok, false)
assert('register error 说明非原生', typeof reg.error === 'string' && reg.error.includes('not_native'))

console.log('\n=== 3. watchMdnsServices 在 Node 返回空 stop ===')
const watcher = await watchMdnsServices(() => {})
eq('watcher.stop 是函数', typeof watcher.stop, 'function')
await watcher.stop()
assert('空 stop 调用安全', true)

console.log('\n=== 4. stopMdns 在 Node 安全 ===')
await stopMdns()
assert('stopMdns 调用安全', true)

console.log(`\n========== network-mdns 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
if (fail > 0) process.exit(1)
