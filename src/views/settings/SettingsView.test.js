/**
 * SettingsView.vue 静态契约测试 — Phase 3 UI polish
 *
 * 目的:锁定设置页折叠区 + 紧凑音乐列表 + 无障碍属性,
 *   不渲染 Vue、不引入 jsdom,只读源文件 + 字符串断言。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const ROOT = resolve(dirname(__filename), '..', '..', '..')
const VUE = resolve(ROOT, 'src/views/settings/SettingsView.vue')

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✓', name) }
  else { fail++; console.log('  ✗', name, extra ? '\n    ' + extra : '') }
}
function section(s) { console.log('\n=== ' + s + ' ===') }

let template = '', style = '', full = ''
try {
  full = readFileSync(VUE, 'utf8')
  const scriptStart = full.indexOf('<script setup>')
  const firstTemplateStart = full.indexOf('<template>')
  const lastTemplateEnd = full.lastIndexOf('</template>', scriptStart >= 0 ? scriptStart : undefined)
  if (firstTemplateStart < 0 || lastTemplateEnd <= firstTemplateStart) {
    throw new Error('找不到根 <template> 块')
  }
  template = full.slice(firstTemplateStart + '<template>'.length, lastTemplateEnd)
  const s = full.match(/<style scoped>([\s\S]*?)<\/style>/)
  if (!s) throw new Error('找不到 <style scoped> 块')
  style = s[1]
} catch (e) {
  console.error('读 SettingsView.vue 失败:', e.message)
  process.exit(1)
}

section('1. 折叠区结构')
const sectionTitles = (template.match(/class="section-title section-title-btn"/g) || []).length
check('template 包含 5 个折叠区标题按钮', sectionTitles >= 5, '实际 ' + sectionTitles + ' 个')
check('script 中定义 collapsedSections', /const collapsedSections = ref\(/.test(full))
check('script 中定义 toggleSection', /function toggleSection\(key\)/.test(full))
check('折叠按钮使用 aria-expanded 属性', /aria-expanded="!collapsedSections\.\w+"/.test(template))
check('内容区使用 v-show="!collapsedSections.*"控制显隐', /v-show="!collapsedSections\.\w+"/.test(template))

section('2. 紧凑音乐风格列表')
check('音乐风格容器使用 .style-list 而非 grid', /class="style-list"/.test(template))
check('音乐风格项使用 .style-row 紧凑行', /class="style-row"/.test(template))
check('CSS 中 .style-list 存在', /\.style-list\s*\{/.test(style))
check('CSS 中 .style-row 存在', /\.style-row\s*\{/.test(style))
check('音乐风格项包含 3 首 BGM 提示文案', /当前内置 3 首 BGM/.test(template))

section('3. SVG 图标替换 emoji')
check('script 引入 IconBack', /import IconBack from ['"]@\/components\/icons\/IconBack\.vue['"]/.test(full))
check('script 引入 IconChevronDown', /import IconChevronDown from ['"]@\/components\/icons\/IconChevronDown\.vue['"]/.test(full))
check('折叠按钮不再使用 ▼ emoji', !/▼/.test(template))

section('4. 无障碍与交互')
check('返回按钮带 aria-label', /aria-label="返回首页"/.test(template))
check('试听按钮带 aria-label', /aria-label="试听/.test(template))
check('设置项分组使用 <section class="settings-section">', (template.match(/<section class="settings-section">/g) || []).length >= 5)

section('5. 不引入旧版大面积 grid')
check('不出现 .style-grid 类', !/class="style-grid"/.test(template))

console.log('\n========== 测试结果: ' + pass + ' 通过 / ' + fail + ' 失败 ==========')
if (fail > 0) process.exit(1)
