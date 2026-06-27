/**
 * v0.4.8 N-3:真实 BGM 集成测试
 *
 * 覆盖:
 *   1. BGM_TRACKS map 完整性(7 首 MP3 都有对应文件)
 *   2. setBgmStyle 接受 7 个 key,reject 未知 key
 *   3. isBgmMp3() API 存在
 *   4. startBgm / stopBgm 在 Node 环境(无 window.Audio)走 Web Audio fallback,不抛错
 *   5. setBgmVolume 在无 audio el 时不抛错
 *   6. unlock() 不抛错
 *
 * 限制:Node 环境没有 window.Audio,所以 MP3 路径不会被测到。
 *   真实 MP3 加载需在浏览器 / 真机中实测(配合 cap sync + Audio 元素)。
 */

let pass = 0, fail = 0
function assert(name, cond) {
  if (cond) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}`); fail++ }
}
function eq(name, a, b) {
  const ok = JSON.stringify(a) === JSON.stringify(b)
  if (ok) { console.log(`  ✓ ${name}`); pass++ }
  else { console.log(`  ✗ ${name}\n    期望: ${JSON.stringify(b)}\n    实际: ${JSON.stringify(a)}`); fail++ }
}

const audioUrl = './audio.js?t=' + Date.now() + '_' + Math.random()
const audio = await import(audioUrl)

console.log('\n=== 1. BGM_TRACKS 7 首 MP3 文件存在 ===')
{
  const fs = await import('fs')
  const path = await import('path')
  const audioDir = path.resolve('./src/assets/audio')
  const tracks = {
    energetic: 'bgm-chinese.mp3',
    calm: 'bgm-carefree.mp3',
    bossa: 'bgm-bossa.mp3',
    ripples: 'bgm-ripples.mp3',
    intense: 'bgm-asian-drums.mp3',
    warm: 'bgm-firesong.mp3',
    casual: 'bgm-galway.mp3',
  }
  let totalSize = 0
  for (const [style, fname] of Object.entries(tracks)) {
    const fp = path.join(audioDir, fname)
    assert(`BGM ${style} 文件 ${fname} 存在`, fs.existsSync(fp))
    if (fs.existsSync(fp)) {
      const sz = fs.statSync(fp).size
      totalSize += sz
      assert(`BGM ${style} ${fname} 大小 > 100KB (实际 ${(sz / 1024).toFixed(0)}KB)`, sz > 100 * 1024)
    }
  }
  assert(`7 首总大小 < 40MB (实际 ${(totalSize / 1024 / 1024).toFixed(1)}MB)`, totalSize < 40 * 1024 * 1024)
}

console.log('\n=== 2. setBgmStyle 接受 7 个 key ===')
{
  const styles = ['energetic', 'normal', 'main', 'calm', 'idle', 'lobby', 'bossa', 'ripples', 'intense', 'drums', 'warm', 'casual']
  for (const s of styles) {
    audio.setBgmStyle(s)
    assert(`setBgmStyle('${s}') 接受 → getBgmStyle='${s}'`, audio.getBgmStyle() === s)
  }
}

console.log('\n=== 3. setBgmStyle 拒绝未知 key ===')
{
  const prev = audio.getBgmStyle()
  audio.setBgmStyle('unknown-style')
  assert(`setBgmStyle('unknown-style') 不改当前 style`, audio.getBgmStyle() === prev)
  audio.setBgmStyle('')
  assert(`setBgmStyle('') 也不改`, audio.getBgmStyle() === prev)
  audio.setBgmStyle(null)
  assert(`setBgmStyle(null) 也不改`, audio.getBgmStyle() === prev)
}

console.log('\n=== 4. isBgmMp3() API 存在 + 状态正确 ===')
{
  assert('isBgmMp3 是函数', typeof audio.isBgmMp3 === 'function')
  // Node 环境 startBgm 走 fallback 合成,不会切到 MP3
  audio.stopBgm()
  audio.startBgm()
  assert('Node startBgm 后 isBgmMp3=false (走合成)', audio.isBgmMp3() === false)
  audio.stopBgm()
}

console.log('\n=== 5. startBgm / stopBgm / unlock 不抛错 ===')
{
  audio.stopBgm()
  let err = null
  try { audio.startBgm() } catch (e) { err = e }
  assert('startBgm 不抛错', err === null)
  assert('startBgm 后 isBgmStarted=true', audio.isBgmStarted() === true)
  try { audio.unlock() } catch (e) { err = e }
  assert('unlock 不抛错', err === null)
  try { audio.stopBgm() } catch (e) { err = e }
  assert('stopBgm 不抛错', err === null)
  assert('stopBgm 后 isBgmStarted=false', audio.isBgmStarted() === false)
}

console.log('\n=== 6. setBgmVolume 不抛错(无 audio el 时) ===')
{
  let err = null
  try { audio.setBgmVolume(0.5) } catch (e) { err = e }
  assert('setBgmVolume(0.5) 不抛错', err === null)
  try { audio.setBgmVolume(1.5) } catch (e) { err = e }  // clamp 1
  assert('setBgmVolume(1.5) clamp 后不抛错', err === null)
  try { audio.setBgmVolume(-1) } catch (e) { err = e }   // clamp 0
  assert('setBgmVolume(-1) clamp 后不抛错', err === null)
}

console.log('\n=== 7. setBgmStyle 切换时不抛错(Node 走合成) ===')
{
  audio.stopBgm()
  audio.startBgm()  // 默认 energetic
  let err = null
  try { audio.setBgmStyle('calm') } catch (e) { err = e }
  assert('startBgm 后 setBgmStyle(calm) 不抛错', err === null)
  assert('切换后 getBgmStyle=calm', audio.getBgmStyle() === 'calm')
  try { audio.setBgmStyle('intense') } catch (e) { err = e }
  assert('切 intense 也不抛错', err === null)
  audio.stopBgm()
}

console.log('\n=== 8. 7 首 MP3 都是合法 MPEG audio ===')
{
  const fs = await import('fs')
  const path = await import('path')
  const audioDir = path.resolve('./src/assets/audio')
  const files = ['bgm-chinese.mp3', 'bgm-carefree.mp3', 'bgm-bossa.mp3', 'bgm-ripples.mp3',
    'bgm-asian-drums.mp3', 'bgm-firesong.mp3', 'bgm-galway.mp3']
  for (const f of files) {
    const fp = path.join(audioDir, f)
    if (!fs.existsSync(fp)) continue
    const buf = fs.readFileSync(fp, { encoding: null })
    // MPEG frame sync: 0xFF 0xFB/0xF3/0xF2/0xE3 (MPEG audio)
    const hasFrameSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0
    // 或者 ID3 tag 开头(ID3v2: 'ID3' = 0x49 0x44 0x33)
    const hasId3 = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33
    assert(`${f} 是合法 MP3 (MPEG sync 或 ID3 头)`, hasFrameSync || hasId3)
  }
}

console.log(`\n========== v0.4.8 N-3 测试结果: ${pass} 通过 / ${fail} 失败 ==========`)
process.exit(fail > 0 ? 1 : 0)