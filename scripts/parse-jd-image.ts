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
  'TypeScript',
  'JavaScript',
  'Element',
  'Element Plus',
  'Pinia',
  'Vuex',
  'ECharts',
  'React',
  'Redux',
  'Next.js',
  'Node.js',
  'NestJS',
  'Java',
  'Go',
  'Python',
  'MQTT',
  'Cursor',
  'Copilot',
  'Codex',
  'LLM',
]

function labelValue(rawText: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const match = rawText.match(new RegExp(`${label}\\s*[:：]\\s*([^\\r\\n]+)`, 'i'))
    if (match?.[1]?.trim()) {
      return match[1].trim()
    }
  }

  return undefined
}

function keywordHits(rawText: string, keywords: string[]): string[] {
  const lowerText = rawText.toLowerCase()
  return keywords.filter((keyword) => lowerText.includes(keyword.toLowerCase()))
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

function buildRecommendation(
  hints: JdImportDraft['matchHints'],
  needHumanReview: boolean,
): JdImportDraft['offerflow'] {
  if (hints.reactRisk || hints.backendHeavyRisk || (hints.nodeFullstackRisk && !hints.vueRelated)) {
    return {
      recommendedCategory: 'give_up',
      reason: '出现 React / Node / 后端主力风险，不建议作为主攻机会。',
      confidence: 0.72,
    }
  }

  if (hints.vueRelated && (hints.dataPlatformRelated || hints.visualizationRelated) && !needHumanReview) {
    return {
      recommendedCategory: 'main_attack',
      reason: 'Vue 与中后台/数据平台/可视化信号明显，且核心字段完整。',
      confidence: 0.86,
    }
  }

  if (hints.vueRelated) {
    return {
      recommendedCategory: 'wait_review',
      reason: 'Vue 匹配存在，但信息不完整或需要人工确认。',
      confidence: 0.64,
    }
  }

  return {
    recommendedCategory: 'low_cost_probe',
    reason: '未发现明显主攻匹配或高风险信号，适合低成本确认。',
    confidence: 0.52,
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
  const vueRelated = keywordHits(rawText, ['Vue', 'Vue2', 'Vue3']).length > 0
  const reactRelated = keywordHits(rawText, ['React', 'Redux', 'Next.js']).length > 0
  const nodeRelated = keywordHits(rawText, ['Node.js', 'Node', 'NestJS']).length > 0
  const mqttRelated = keywordHits(rawText, ['MQTT']).length > 0
  const backendHeavyRisk = keywordHits(rawText, ['Java', 'Go', 'Python', '后端主力', '全栈', '服务端']).length > 0
  const dataPlatformRelated = keywordHits(rawText, ['数据平台', '中后台', '后台管理']).length > 0
  const visualizationRelated = keywordHits(rawText, ['ECharts', '可视化', '图表']).length > 0
  const aiBonus = keywordHits(rawText, ['AI', 'Cursor', 'Copilot', 'Codex', 'LLM', 'AI 辅助']).length > 0

  const requiredFields: Array<[string, string | undefined]> = [
    ['company.name', companyName],
    ['position.title', positionTitle],
    ['position.salaryRange', salaryRange],
    ['position.city', city],
  ]
  const missingFields = requiredFields.filter(([, value]) => !value).map(([field]) => field)

  const warnings: string[] = []
  if (!rawText) warnings.push('没有可解析 OCR 文本；需要人工查看截图。')
  if (reactRelated && !vueRelated) warnings.push('出现 React / Redux / Next.js 风险信号。')
  if (nodeRelated) warnings.push('出现 Node.js / NestJS 全栈或后端相关风险信号。')
  if (mqttRelated) warnings.push('检测到 MQTT 风险，需确认是否涉及前端之外的物联网通信协议能力。')
  if (backendHeavyRisk) warnings.push('出现 Java / Go / Python / 后端主力风险信号。')
  if (missingFields.length > 0) warnings.push(`缺失字段：${missingFields.join(', ')}`)

  const matchHints = {
    vueRelated,
    reactRisk: reactRelated && !vueRelated,
    nodeFullstackRisk: nodeRelated,
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
    },
    position: {
      title: positionTitle,
      salaryRange,
      city,
      district,
    },
    jd: {
      responsibilities: splitList(responsibilityText),
      requirements: splitList(requirementText),
      techStack,
      keywords: [...new Set([...techStack, ...keywordHits(rawText, ['数据平台', '中后台', '可视化', 'AI 辅助开发'])])],
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
