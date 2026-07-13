/**
 * HomeView.vue 静态契约测试 — Phase 3 UI polish
 *
 * 目的:锁定首页能力提示 + 按钮 aria-label + 图标替换,
 *   不渲染 Vue,只读源文件 + 字符串断言。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..', '..', '..')
const VUE = resolve(ROOT, 'src/views/index/HomeView.vue')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, extra ? '\n    ' + extra : '') }
}
function section(s) { console.log('\n=== ' + s + ' ===') }

let template = '', script = '', full = ''
try {
  full = readFileSync(VUE, 'utf8')
  const scriptStart = full.indexOf('<script setup>')
  const firstTemplateStart = full.indexOf('<template>')
  const lastTemplateEnd = full.lastIndexOf('</template>', scriptStart >= 0 ? scriptStart : undefined)
  if (firstTemplateStart < 0 || lastTemplateEnd <= firstTemplateStart) {
    throw new Error('找不到根 <template> 块')
  }
  template = full.slice(firstTemplateStart + '<template>'.length, lastTemplateEnd)
  const s = full.match(/<script setup>([\s\S]*?)<\/script>/)
  if (!s) throw new Error('找不到 <script setup> 块')
  script = s[1]
} catch (e) {
  console.error('读 HomeView.vue 失败:', e.message)
  process.exit(1)
}

section('1. 能力提示')
check('template 包含 capability-hint 元素', /class="capability-hint"/.test(template))
check('script 引入 isNativeCapacitor', /import.*isNativeCapacitor.*from ['"]@\/common\/ws-server\.js['"]/.test(script))
check('script 定义 isNative ref', /const isNative = ref\(false\)/.test(script))
check('onMounted 中设置 isNative', /isNative\.value = isNativeCapacitor\(\)/.test(script))
check('能力提示文案区分浏览器与原生环境', /isNative \? ['"].*?支持跨手机联机.*?['"] : ['"].*?浏览器.*?本机多标签/.test(template.replace(/\s+/g, ' ')))

section('2. SVG 图标替换 emoji')
check('script 引入 IconPlay', /import IconPlay from ['"]@\/components\/icons\/IconPlay\.vue['"]/.test(script))
check('script 引入 IconPhone', /import IconPhone from ['"]@\/components\/icons\/IconPhone\.vue['"]/.test(script))
check('script 引入 IconRobot', /import IconRobot from ['"]@\/components\/icons\/IconRobot\.vue['"]/.test(script))
check('script 引入 IconGear', /import IconGear from ['"]@\/components\/icons\/IconGear\.vue['"]/.test(script))
check('script 引入 IconBan', /import IconBan from ['"]@\/components\/icons\/IconBan\.vue['"]/.test(script))
check('script 引入 IconClose', /import IconClose from ['"]@\/components\/icons\/IconClose\.vue['"]/.test(script))

section('3. 按钮与无障碍')
check('主菜单带 aria-label', /aria-label="主菜单"/.test(template))
check('设置按钮带 title', /title="设置"/.test(template))
check('设置按钮带 aria-label', /aria-label="设置"/.test(template))
check('用户资料按钮带 title', /title="点击修改昵称 \/ 头像"/.test(template))
check('关闭提示按钮带 aria-label', /aria-label="关闭提示"/.test(template))

section('3. data-testid 覆盖')
const testids = ['home-start-btn', 'home-capability-hint', 'home-join-btn', 'home-ai-btn', 'home-rules-btn', 'home-settings-btn', 'home-user-pill']
const missing = testids.filter(id => !(template.includes(`data-testid="${id}"`) || template.includes(`:data-testid="'${id}'"`)))
check('首页关键元素 data-testid 齐全', missing.length === 0, missing.length ? '缺: ' + missing.join(' ') : '')

console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
