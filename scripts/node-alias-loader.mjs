/**
 * Node ESM alias loader:把 @/ 映射到项目 src/ 目录
 * 用于在 Node 环境直接跑引用 @/ 别名的测试(如 useGameLogic.test.js)。
 *
 * 用法:
 *   node --loader ./scripts/node-alias-loader.mjs src/views/game/useGameLogic.test.js
 */
import { pathToFileURL } from 'node:url'

const base = pathToFileURL(process.cwd() + '/').href
const aliasRoot = base + 'src/'

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    return nextResolve(aliasRoot + specifier.slice(2), context)
  }
  return nextResolve(specifier, context)
}
