import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseJdImage } from './parse-jd-image.ts'

async function parseText(rawText: string) {
  const filePath = path.join(os.tmpdir(), `jd-import-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`)
  await fs.writeFile(filePath, rawText, 'utf8')
  try {
    return await parseJdImage(filePath, filePath)
  } finally {
    await fs.rm(filePath, { force: true })
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

async function main() {
  const javascriptOnly = await parseText([
    '公司: 测试公司',
    '岗位: 前端开发工程师',
    '城市: 苏州',
    '薪资: 12-15K',
    '职责: 负责 Vue 管理后台开发。',
    '要求: 熟悉 JavaScript、HTML、CSS。',
  ].join('\n'))
  assert(!javascriptOnly.matchHints.backendHeavyRisk, 'JavaScript must not trigger backendHeavyRisk.')

  const javaBackend = await parseText([
    '公司: 测试公司',
    '岗位: 前端开发工程师',
    '城市: 苏州',
    '薪资: 12-15K',
    '职责: 负责 Vue 管理后台开发。',
    '要求: 熟悉 Java 后端开发，了解 Spring Boot。',
  ].join('\n'))
  assert(javaBackend.matchHints.backendHeavyRisk, 'Standalone Java backend context should trigger backendHeavyRisk.')

  const vueWithLightReact = await parseText([
    '公司: 星空计划汽车',
    '岗位: 前端开发高级工程师',
    '城市: 苏州',
    '薪资: 18-25K·15薪',
    '行业: 新能源汽车',
    '规模: 100-499人',
    '职责: 负责公司 PC 管理后台、数据可视化大屏等产品的前端开发，基于 Vue.js 构建组件库。',
    '要求: 精通 Vue 及其生态（Vue Router、Vuex/Pinia），理解 React 设计原理，有丰富的 TypeScript 实战经验。',
  ].join('\n'))
  assert(!vueWithLightReact.matchHints.reactRisk, 'Light React mention with clear Vue mainline must not trigger reactRisk.')
  assert(!vueWithLightReact.matchHints.backendHeavyRisk, 'JavaScript-free Vue JD should not trigger backendHeavyRisk.')
  assert(vueWithLightReact.offerflow.recommendedCategory !== 'give_up', 'Vue mainline with light React must not be give_up.')

  console.log('jd-import smoke checks passed.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
