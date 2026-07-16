/**
 * npm test 包装脚本：顺序执行所有测试套件，整体 10 分钟超时。
 *
 * 超时机制替代 shell 的 `timeout 10m`，避免 Windows / git-bash 等环境
 * 没有 coreutils timeout 时 npm test 挂起。
 */
import { spawn } from 'node:child_process'

const TOTAL_TIMEOUT_MS = 600_000

const commands = [
  'node src/common/guandan-engine.test.js',
  'node src/common/guandan-ai.test.js',
  'node src/common/guandan-game.test.js',
  'node src/common/deal-animation.test.js',
  'node src/common/audio.test.js',
  'node src/common/haptics.test.js',
  'node src/common/network-mdns.test.js',
  'node src/common/card-api.test.js',
  'node src/common/network.test.js',
  'node src/common/network-multitab.test.js',
  'node src/common/network-kick-player.test.js',
  'node src/common/network-cross-device.test.js',
  'node src/common/network-discovery.test.js',
  'node src/common/network-ws-http.test.js',
  'node src/common/ws-server.test.js',
  'node src/common/qr-fallback.test.js',
  'node src/common/network-relay.test.js',
  'node src/common/network-phase2.test.js',
  'node src/views/game/GameView.test.js',
  'node src/views/game/finish-deal-seat.test.js',
  'node src/views/game/commit-play-broadcast.test.js',
  'node --loader ./scripts/node-alias-loader.mjs src/views/game/useGameLogic.test.js',
  'node src/common/network-cleanup.test.js',
  'node src/common/network-roomid.test.js',
  'node src/common/room-ui.test.js',
  'node src/common/seat-swap-kick-protocol.test.js',
  'node src/views/room/RoomView.test.js',
  'node src/views/settings/SettingsView.test.js',
  'node src/views/index/HomeView.test.js',
  'node src/common/v3x-p2-23-28-fixes.test.js',
  'node src/common/network-host-promote.test.js',
  'node src/common/network-host-migration-consecutive.test.js',
  'node src/common/promote-to-host.test.js',
  'node src/common/static-bug-fixes.test.js',
  'node src/common/v045-bug-fixes.test.js',
  'node src/common/v046-gd-rc-fixes.test.js',
  'node src/common/v047-rc2-regression.test.js',
  'node src/common/v048-host-rebuild.test.js',
  'node src/common/v048-ai-fill.test.js',
  'node src/common/v048-mp3-bgm.test.js',
  'node src/common/history.test.js',
  'node src/common/v049-bug-fixes.test.js',
  'node src/common/v0410-bug-fixes.test.js',
  'node src/common/v0410-p2p-regression.test.js',
  'node src/common/v0412-adversarial-fixes.test.js',
  'node src/common/v0414-adversarial-review.test.js',
  'node src/common/v0416-adversarial-fixes.test.js',
  'node src/common/v0417-adversarial-fixes.test.js',
  'node src/common/v0418-adversarial-fixes.test.js',
  'node src/common/v0419-adversarial-fixes.test.js',
  'node src/common/v0420-adversarial-fixes.test.js',
  'node src/common/v0421-adversarial-fixes.test.js',
  'node src/common/v0422-adversarial-fixes.test.js',
  'node src/common/v0423-adversarial-fixes.test.js',
]

function run(cmd) {
  return new Promise((resolve, reject) => {
    const [program, ...args] = cmd.split(/\s+/)
    const child = spawn(program, args, {
      stdio: 'inherit',
      shell: false,
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(0)
      else reject(new Error(`命令退出码 ${code}: ${cmd}`))
    })
  })
}

async function main() {
  const start = Date.now()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    console.error(`\n========== 测试整体超时 (${TOTAL_TIMEOUT_MS}ms),强制终止 ==========`)
    process.exit(124)
  }, TOTAL_TIMEOUT_MS)

  try {
    for (let i = 0; i < commands.length; i++) {
      if (timedOut) break
      const cmd = commands[i]
      console.log(`\n[${i + 1}/${commands.length}] ${cmd}`)
      await run(cmd)
    }
    const elapsed = Date.now() - start
    console.log(`\n========== 全部测试通过 (${elapsed}ms) ==========`)
  } finally {
    clearTimeout(timer)
  }
}

main().catch((err) => {
  console.error('\n========== 测试失败 ==========')
  console.error(err.message)
  process.exit(1)
})
