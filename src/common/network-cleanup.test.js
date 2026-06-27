/**
 * v2.4-p2 P1 cleanup — BUG-004 测试
 *
 * BUG-004:RoomView 退出房间未关闭网络 + 监听器未清理
 *   - 进房间 → 退房间 反复 5 次,断言 net.on() 监听器完全清空
 *   - 用 disposers 数组模拟 RoomView.vue 的 cleanup pattern
 *   - 验证 listenerCount === 0 + isConnected === false
 *   - 验证精确 off(event, handler) 不影响其它订阅者
 *
 * 设计要点:
 *   - 沿用 network-multitab.test.js 的 makeFakeInstance 模式
 *   - dynamic-import cache-bust → 独立 module 实例
 *   - fake timers 注入 → 无需真实等待
 */

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}

async function makeFakeInstance(tag, fixedUuid) {
  const url = './network.js?tag=' + tag + '&t=' + Date.now() + '_' + Math.random()
  const mod = await import(url)
  const captured = { intervals: [], timeouts: [], cleared: [] }

  if (fixedUuid !== undefined) {
    globalThis.sessionStorage = {
      _store: { 'guandan_session_uuid': fixedUuid },
      getItem(k) { return this._store[k] || null },
      setItem(k, v) { this._store[k] = v },
    }
  }

  mod.__installFakeTimers({
    setInterval: (fn, ms) => { captured.intervals.push({ fn, ms, cancelled: false }); return captured.intervals.length },
    clearInterval: (id) => { captured.cleared.push({ type: 'interval', id }); if (id >= 1 && id <= captured.intervals.length) captured.intervals[id - 1].cancelled = true },
    setTimeout: (fn, ms) => { captured.timeouts.push({ fn, ms, cancelled: false }); return captured.timeouts.length },
    clearTimeout: (id) => { captured.cleared.push({ type: 'timeout', id }); if (id >= 1 && id <= captured.timeouts.length) captured.timeouts[id - 1].cancelled = true },
  })

  return { mod, captured }
}

function resetSessionStorage() {
  globalThis.sessionStorage = {
    _store: {},
    getItem(k) { return this._store[k] || null },
    setItem(k, v) { this._store[k] = v },
  }
}

async function settle(ms = 50) {
  await new Promise(r => setTimeout(r, ms))
}

// =========================================================================
// 块 1: RoomView cleanup 模式:5 次进/退房后监听器完全清空
// =========================================================================
console.log('\n=== 1. RoomView disposers cleanup pattern (5 cycles) ===')
{
  const { mod: Net } = await makeFakeInstance('cleanup-cycle', 'cleanup-uuid')

  // 模拟 RoomView.vue 的 disposers pattern(见 src/views/room/RoomView.vue L222-238)
  const disposers = []
  function onNet(event, handler) {
    Net.on(event, handler)
    disposers.push(() => {
      try { Net.off(event, handler) } catch (e) { /* swallow */ }
    })
  }
  function cleanupRoomListeners() {
    while (disposers.length) {
      try { disposers.pop()() } catch (e) { /* swallow */ }
    }
  }

  // RoomView 注册的事件列表(同步 sync-foundation 已存在的)
  const ROOM_EVENTS = [
    'connect', 'error', 'peer:leave', 'self:kicked',
    'message:NICK_UPDATE', 'message:READY', 'message:SYNC',
    'message:GAME_START', 'message:SEAT_SWAP',
  ]

  for (let cycle = 1; cycle <= 5; cycle++) {
    // 模拟进房间:每个事件注册一个 handler
    for (const evt of ROOM_EVENTS) {
      onNet(evt, () => {})
    }
    // 重复注册一个 handler(确认精确 off 不影响其它 handler)
    onNet('message:GAME_START', () => {})

    // 断言所有事件都有监听器
    let totalBefore = 0
    for (const evt of ROOM_EVENTS) {
      totalBefore += Net._listenerCount(evt)
    }
    assert(`cycle ${cycle}: 监听器数量 > 0 (${totalBefore} 个)`, totalBefore > 0)
    assert(`cycle ${cycle}: GAME_START 有 2 个监听器 (重复注册)`, Net._listenerCount('message:GAME_START') === 2)

    // 模拟 showMenu() / onUnmounted() 触发的清理 + 关闭
    cleanupRoomListeners()
    Net.close()

    // 断言所有事件监听器清空
    for (const evt of ROOM_EVENTS) {
      assert(`cycle ${cycle}: ${evt} 监听器 == 0`, Net._listenerCount(evt) === 0)
    }
    assert(`cycle ${cycle}: 残留事件数 == 0`, Net._listTrackedEvents().length === 0)
    assert(`cycle ${cycle}: net 已关闭 (isConnected === false)`, !Net.isConnected())
    assert(`cycle ${cycle}: _isClosed() === true`, Net._isClosed() === true)
  }

  Net.close()
  await settle()
}

// =========================================================================
// 块 2: disposers 精确移除:不影响其它订阅者
// =========================================================================
console.log('\n=== 2. disposers 精确 off(event, handler) 不影响其它订阅 ===')
{
  const { mod: Net } = await makeFakeInstance('cleanup-precise', 'precise-uuid')

  // 模拟"组件 A"订阅
  const handlerA1 = () => 'A1'
  const handlerA2 = () => 'A2'
  Net.on('message:READY', handlerA1)
  Net.on('message:READY', handlerA2)

  // 模拟"组件 B"订阅(后续要被 cleanup)
  const handlerB = () => 'B'
  Net.on('message:READY', handlerB)

  assert('3 个监听器注册后 READY count == 3', Net._listenerCount('message:READY') === 3)

  // 模拟组件 B 卸载:只 off B 的 handler
  Net.off('message:READY', handlerB)
  assert('off(B) 后 READY count == 2', Net._listenerCount('message:READY') === 2)

  // off 同一个 handler 第二次(应该 no-op, 不抛错)
  Net.off('message:READY', handlerB)
  assert('重复 off(B) 无副作用,count 仍 == 2', Net._listenerCount('message:READY') === 2)

  Net.close()
  await settle()
}

// =========================================================================
// 块 3: net.off(event) 无 handler 时删该事件全部(回归 v3.x P2-19)
// =========================================================================
console.log('\n=== 3. net.off(event) 无 handler 时删该事件全部 (回归 P2-19) ===')
{
  const { mod: Net } = await makeFakeInstance('cleanup-p2-19', 'p2-19-uuid')

  Net.on('peer:join', () => {})
  Net.on('peer:join', () => {})
  Net.on('peer:join', () => {})
  assert('3 个 peer:join listener', Net._listenerCount('peer:join') === 3)

  Net.off('peer:join')  // 不传 handler → 删全部
  assert('off(peer:join) 后 count == 0', Net._listenerCount('peer:join') === 0)
  assert('peer:join 事件已从 trackers 移除', !Net._listTrackedEvents().includes('peer:join'))

  // 不存在的 event off 应该 no-op
  Net.off('non-existent-event')
  assert('off 不存在的 event 不抛错', true)

  Net.close()
  await settle()
}

// =========================================================================
// 块 4: emit 不会触发已 cleanup 的 handler(回归)
// =========================================================================
console.log('\n=== 4. emit 不触发已 cleanup 的 handler (死 handler 不复活) ===')
{
  const { mod: Net } = await makeFakeInstance('cleanup-emit', 'emit-uuid')

  let fired = 0
  Net.on('test:event', () => { fired++ })
  assert('handler 注册', Net._listenerCount('test:event') === 1)

  Net.emit('test:event')
  assert('emit 触发 1 次', fired === 1)

  // cleanup
  Net.off('test:event', () => { fired++ })  // 不同 handler,不删除
  Net.off('test:event')  // 无 handler → 删全部

  Net.emit('test:event')
  assert('cleanup 后 emit 不触发 handler', fired === 1)

  Net.close()
  await settle()
}

console.log(`\n========== cleanup test result: ${pass} pass / ${fail} fail ==========`)
if (fail > 0) process.exit(1)