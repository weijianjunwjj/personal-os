import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pathExists } from './os-utils.ts'

export interface JdImportDraft {
  source: {
    type: 'boss_screenshot'
    imagePath: string
    capturedAt: string
    rawOcrText?: string
  }
  company: {
    name?: string
    location?: string
    industry?: string
    size?: string
  }
  position: {
    title?: string
    salaryRange?: string
    experienceRequired?: string
    educationRequired?: string
    city?: string
    district?: string
  }
  jd: {
    responsibilities: string[]
    requirements: string[]
    techStack: string[]
    keywords: string[]
  }
  matchHints: {
    vueRelated: boolean
    reactRisk: boolean
    nodeFullstackRisk: boolean
    aiBonus: boolean
    dataPlatformRelated: boolean
    visualizationRelated: boolean
    backendHeavyRisk: boolean
  }
  offerflow: {
    recommendedCategory: 'main_attack' | 'low_cost_probe' | 'give_up' | 'wait_review'
    reason: string
    confidence: number
  }
  review: {
    needHumanReview: boolean
    missingFields: string[]
    warnings: string[]
  }
}

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const techKeywords = [
  'Vue',
  'Vue2',
  'Vue3',
  'Vue Router',
  'Vuex',
  'Pinia',
  'TypeScript',
  'JavaScript',
  'HTML5',
  'CSS3',
  'Element',
  'Element Plus',
  'ECharts',
  'React',
  'Redux',
  'Next.js',
  'Node.js',
  'NestJS',
  'Java',
  'Go',
  'Python',
  'uni-app',
  'Taro',
  '小程序',
  'Shopify',
  'Webpack',
  'vite',
  'Babel',
  'NPM',
  'Yarn',
  'Pnpm',
  'SPA',
  'AJAX',
  'JSON',
  'ESLint',
  'uView',
  'MQTT',
  'Cursor',
  'Copilot',
  'Codex',
  'LLM',
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function labelValue(rawText: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = rawText.match(new RegExp(`${escapeRegExp(label)}\\s*[:：]\\s*([^\\r\\n]+)`, 'i'))
    if (match?.[1]?.trim()) {
      return match[1].trim()
    }
  }

  return undefined
}

function hasToken(rawText: string, token: string): boolean {
  const escaped = escapeRegExp(token)
  if (/^[A-Za-z0-9.+#-]+$/.test(token)) {
    return new RegExp(`(^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').test(rawText)
  }

  return rawText.toLowerCase().includes(token.toLowerCase())
}

function keywordHits(rawText: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => hasToken(rawText, keyword))
}

function hasAny(rawText: string, keywords: string[]): boolean {
  return keywordHits(rawText, keywords).length > 0
}

function splitList(value?: string): string[] {
  if (!value) {
    return []
  }

  return value
    .split(/[、,，;；]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

async function readSidecarText(inputPath: string): Promise<string | undefined> {
  const parsed = path.parse(inputPath)
  const sidecar = path.join(parsed.dir, `${parsed.name}.txt`)
  if (await pathExists(sidecar)) {
    return fs.readFile(sidecar, 'utf8')
  }

  return undefined
}

async function readRawText(inputPath: string): Promise<string | undefined> {
  const ext = path.extname(inputPath).toLowerCase()
  if (ext === '.txt' || ext === '.md') {
    return fs.readFile(inputPath, 'utf8')
  }

  if (imageExtensions.has(ext)) {
    return readSidecarText(inputPath)
  }

  return undefined
}

function isLikelyMojibake(value: string): boolean {
  return /[锟�]|[绌垝诧湪]|[�]/.test(value)
}

function hasJavaBackendRisk(rawText: string): boolean {
  const javaScriptSafe = rawText.replace(/JavaScript|Javascript|\bJS\b/gi, ' ')
  return /(^|[^A-Za-z0-9])Java(?=$|[^A-Za-z0-9])/.test(javaScriptSafe) ||
    /(Java\s*(后端|服务端|接口|Spring|Spring\s*Boot|SpringCloud))|((后端|服务端|接口)\s*Java)/i.test(javaScriptSafe)
}

function hasBackendHeavyRisk(rawText: string): boolean {
  return hasJavaBackendRisk(rawText) ||
    hasAny(rawText, ['Go', 'Python', '后端主力', '全栈主力', '服务端主力'])
}

function hasNodeFullstackRisk(rawText: string): boolean {
  return hasAny(rawText, ['Node.js', 'NestJS']) || /(^|[^A-Za-z0-9])Node(?=$|[^A-Za-z0-9])/.test(rawText)
}

function hasLightReactMention(rawText: string): boolean {
  return /(了解|理解|熟悉)?\s*React\s*(设计原理|原理|优先|加分|有经验者优先)/i.test(rawText) ||
    /(了解|理解|熟悉)\s*React/i.test(rawText)
}

function hasReactRisk(rawText: string, vueRelated: boolean): boolean {
  const reactRelated = hasAny(rawText, ['React', 'Redux', 'Next.js'])
  if (!reactRelated) {
    return false
  }

  const strongReact =
    hasAny(rawText, ['Redux', 'Next.js']) ||
    /React\s*(项目经验|开发经验|技术栈|为主|主导|框架)/i.test(rawText) ||
    /(负责|基于|使用|熟练掌握|精通)\s*React/i.test(rawText)

  if (vueRelated && hasLightReactMention(rawText) && !strongReact) {
    return false
  }

  return strongReact || !vueRelated
}

function buildRecommendation(
  hints: JdImportDraft['matchHints'],
  needHumanReview: boolean,
): JdImportDraft['offerflow'] {
  if (hints.reactRisk || hints.backendHeavyRisk || (hints.nodeFullstackRisk && !hints.vueRelated)) {
    return {
      recommendedCategory: 'give_up',
      reason: '出现 React 主力、Node 全栈或后端主力风险，不建议作为主攻机会。',
      confidence: 0.72,
    }
  }

  if (hints.vueRelated && (hints.dataPlatformRelated || hints.visualizationRelated)) {
    return {
      recommendedCategory: needHumanReview ? 'wait_review' : 'main_attack',
      reason: needHumanReview
        ? 'Vue 是明确主线，包含 PC 管理后台、数据平台或可视化、Vuex/Pinia、TypeScript、工程化体系；React 仅轻量提及或需确认占比，后端只是协作，不是主力要求。'
        : 'Vue 是明确主线，包含中后台/数据平台/可视化、TypeScript 或工程化体系，且未发现硬风险。',
      confidence: needHumanReview ? 0.78 : 0.86,
    }
  }

  if (hints.vueRelated) {
    return {
      recommendedCategory: needHumanReview ? 'wait_review' : 'low_cost_probe',
      reason: needHumanReview
        ? 'Vue 匹配存在，但信息不完整或存在需要人工确认的方向。'
        : 'Vue 匹配存在，但中后台/数据平台/可视化信号不强，适合低成本确认。',
      confidence: needHumanReview ? 0.68 : 0.62,
    }
  }

  return {
    recommendedCategory: needHumanReview ? 'wait_review' : 'low_cost_probe',
    reason: '未发现明确主攻匹配或硬风险，适合低成本确认。',
    confidence: needHumanReview ? 0.48 : 0.52,
  }
}

export async function parseJdImage(inputPath: string, displayPath = inputPath): Promise<JdImportDraft> {
  const rawText = (await readRawText(inputPath))?.trim() ?? ''
  const techStack = keywordHits(rawText, techKeywords)
  const requirementText = labelValue(rawText, ['要求', '任职要求', '职位要求'])
  const responsibilityText = labelValue(rawText, ['职责', '岗位职责', '工作内容'])
  const companyName = labelValue(rawText, ['公司', '公司名称'])
  const positionTitle = labelValue(rawText, ['岗位', '职位', '职位名称'])
  const city = labelValue(rawText, ['城市', '工作城市'])
  const salaryRange = labelValue(rawText, ['薪资', '薪水', '薪酬'])
  const district = labelValue(rawText, ['区域', '区', '地点'])
  const companyIndustry = labelValue(rawText, ['行业'])
  const companySize = labelValue(rawText, ['规模', '公司规模'])
  const experienceRequired = labelValue(rawText, ['经验', '工作经验'])
  const educationRequired = labelValue(rawText, ['学历', '教育'])
  const vueRelated = hasAny(rawText, ['Vue', 'Vue2', 'Vue3', 'Vue Router', 'Vuex', 'Pinia'])
  const reactRelated = hasAny(rawText, ['React', 'Redux', 'Next.js'])
  const nodeFullstackRisk = hasNodeFullstackRisk(rawText)
  const mqttRelated = hasAny(rawText, ['MQTT'])
  const backendHeavyRisk = hasBackendHeavyRisk(rawText)
  const dataPlatformRelated = hasAny(rawText, ['数据平台', '中后台', '后台管理', '管理后台', 'PC管理后台'])
  const visualizationRelated = hasAny(rawText, ['ECharts', '可视化', '图表', '大屏'])
  const aiBonus = hasAny(rawText, ['AI', 'Cursor', 'Copilot', 'Codex', 'LLM', 'AI 辅助'])
  const reactRisk = hasReactRisk(rawText, vueRelated)

  const requiredFields: Array<[string, string | undefined]> = [
    ['company.name', companyName],
    ['position.title', positionTitle],
    ['position.salaryRange', salaryRange],
    ['position.city', city],
  ]
  const missingFields = requiredFields.filter(([, value]) => !value).map(([field]) => field)

  const warnings: string[] = []
  if (!rawText) warnings.push('没有可解析 OCR 文本，需要人工查看截图。')
  if (rawText && isLikelyMojibake(rawText)) warnings.push('OCR/sidecar 文本疑似 mojibake，请重新提供 UTF-8 文本。')
  if (reactRisk) warnings.push('出现 React / Redux / Next.js 主力风险信号。')
  if (reactRelated && !reactRisk && vueRelated) warnings.push('React 仅轻量提及，需面试确认占比。')
  if (nodeFullstackRisk) warnings.push('出现 Node.js / NestJS 全栈或后端相关风险信号。')
  if (mqttRelated) warnings.push('检测到 MQTT / 物联网通信协议风险，需确认是否涉及前端之外的通信协议能力。')
  if (backendHeavyRisk) warnings.push('出现 Java / Go / Python / 后端主力风险信号。')
  if (hasAny(rawText, ['uni-app', 'Taro', 'Shopify', '小程序'])) {
    warnings.push('包含 uni-app / Taro / Shopify / 小程序 / 独立站方向，需确认实际占比。')
  }
  if (missingFields.length > 0) warnings.push(`缺失字段：${missingFields.join(', ')}`)

  const matchHints = {
    vueRelated,
    reactRisk,
    nodeFullstackRisk,
    aiBonus,
    dataPlatformRelated,
    visualizationRelated,
    backendHeavyRisk,
  }
  const needHumanReview = missingFields.length > 0 || warnings.length > 0

  return {
    source: {
      type: 'boss_screenshot',
      imagePath: displayPath,
      capturedAt: new Date().toISOString(),
      rawOcrText: rawText || undefined,
    },
    company: {
      name: companyName,
      industry: companyIndustry,
      size: companySize,
    },
    position: {
      title: positionTitle,
      salaryRange,
      experienceRequired,
      educationRequired,
      city,
      district,
    },
    jd: {
      responsibilities: splitList(responsibilityText),
      requirements: splitList(requirementText),
      techStack,
      keywords: unique([
        ...techStack,
        ...keywordHits(rawText, ['数据平台', '中后台', '后台管理', '管理后台', '可视化', '大屏', 'AI 辅助', '天使轮', '不需要融资']),
      ]),
    },
    matchHints,
    offerflow: buildRecommendation(matchHints, needHumanReview),
    review: {
      needHumanReview,
      missingFields,
      warnings,
    },
  }
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    throw new Error('Usage: tsx scripts/parse-jd-image.ts <image-or-txt-path>')
  }

  const draft = await parseJdImage(path.resolve(process.cwd(), inputPath), inputPath)
  console.log(JSON.stringify(draft, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
