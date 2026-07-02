import { personalPath } from '../config/os-paths.ts'
import { pathToFileURL } from 'node:url'
import {
  appendJsonLineUnique,
  ensureDir,
  formatDateParts,
  shortHash,
} from './os-utils.ts'

export interface EventSignals {
  emotion: string[]
  energyImpact: number
  careerRelated: boolean
  startupRelated: boolean
  methodCandidate: boolean
  toolIdea: boolean
  promptCandidate: boolean
  workflowCandidate: boolean
  reviewNeeded: boolean
}

export interface OsEvent {
  id: string
  time: string
  type: 'diary.entry.created' | 'jd.import.created'
  sourceSystem: 'personal-os'
  sourcePath: string
  rawText: string
  topics: string[]
  signals: EventSignals
}

const negativeEnergyKeywords = ['焦虑', '烦', '虚', '累', '崩', '睡不好', '压抑', '垃圾', '难受']
const positiveEnergyKeywords = ['兴奋', '行动力', '恢复', '开心', '轻松', '舒服']
const careerKeywords = ['求职', '岗位', 'Boss', 'BOSS', 'boss', 'HR', '面试', '简历', '薪资', '苏州', '杭州', '上海', 'offer', 'Offer', '就业市场', 'JD', '投递', '已读不回']
const methodKeywords = ['我发现', '我意识到', '以后应该', '可以做成', '规则', '流程', '模板', '提示词', '工具', '自动化', '联动', '监听', '系统', '机制']
const toolKeywords = ['工具', '自动化', '联动', '监听', '机制', '可以做成']
const promptKeywords = ['提示词', '模板', '规则']
const workflowKeywords = ['流程', '工作流', '机制']
const startupKeywords = ['创业', '产品', '合作', '客户', '体验单', '9.9', '市场反馈', '转化', '成交']

function findHits(text: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => text.includes(keyword))
}

export function buildSignals(rawText: string): EventSignals {
  const negativeHits = findHits(rawText, negativeEnergyKeywords)
  const positiveHits = findHits(rawText, positiveEnergyKeywords)
  const emotion = [...new Set([...negativeHits, ...positiveHits])]
  const careerHits = findHits(rawText, careerKeywords)
  const startupHits = findHits(rawText, startupKeywords)

  let energyImpact = 0
  if (negativeHits.length > 0) {
    energyImpact = -1
  } else if (positiveHits.length > 0) {
    energyImpact = 1
  }

  return {
    emotion,
    energyImpact,
    careerRelated: careerHits.length > 0,
    startupRelated: startupHits.length > 0,
    methodCandidate: findHits(rawText, methodKeywords).length > 0,
    toolIdea: findHits(rawText, toolKeywords).length > 0,
    promptCandidate: findHits(rawText, promptKeywords).length > 0,
    workflowCandidate: findHits(rawText, workflowKeywords).length > 0,
    reviewNeeded: emotion.length > 0 || careerHits.length > 0,
  }
}

function buildTopics(rawText: string, signals: EventSignals): string[] {
  const topics: string[] = []
  if (signals.energyImpact !== 0 || signals.emotion.length > 0) topics.push('energy')
  if (signals.careerRelated) topics.push('career')
  if (signals.methodCandidate) topics.push('method')
  if (signals.startupRelated) topics.push('startup')
  return topics
}

export async function writeEvent(event: OsEvent): Promise<OsEvent> {
  const eventTime = new Date(event.time)
  const parts = formatDateParts(Number.isNaN(eventTime.getTime()) ? new Date() : eventTime)
  const eventFile = personalPath('content', 'events', parts.year, parts.month, `${parts.date}.jsonl`)
  await ensureDir(personalPath('content', 'events', parts.year, parts.month))
  await appendJsonLineUnique(eventFile, event as unknown as Record<string, unknown>, (item) => item.id === event.id)
  return event
}

export async function emitDiaryEvent(rawText: string, sourcePath: string, now = new Date()): Promise<OsEvent> {
  const parts = formatDateParts(now)
  const signals = buildSignals(rawText)
  const id = `evt_${parts.timestamp}_${shortHash(`${now.getTime()}_${rawText}_${Math.random()}`)}`
  const event: OsEvent = {
    id,
    time: now.toISOString(),
    type: 'diary.entry.created',
    sourceSystem: 'personal-os',
    sourcePath,
    rawText,
    topics: buildTopics(rawText, signals),
    signals,
  }

  return writeEvent(event)
}

export async function emitJdImportEvent(rawText: string, sourcePath: string, now = new Date()): Promise<OsEvent> {
  const parts = formatDateParts(now)
  const signals: EventSignals = {
    emotion: [],
    energyImpact: 0,
    careerRelated: false,
    startupRelated: false,
    methodCandidate: false,
    toolIdea: false,
    promptCandidate: false,
    workflowCandidate: false,
    reviewNeeded: true,
  }
  const event: OsEvent = {
    id: `evt_${parts.timestamp}_${shortHash(`${now.getTime()}_jd_${rawText}_${Math.random()}`)}`,
    time: now.toISOString(),
    type: 'jd.import.created',
    sourceSystem: 'personal-os',
    sourcePath,
    rawText,
    topics: ['career', 'jd-import'],
    signals,
  }

  return writeEvent(event)
}

async function main() {
  const rawText = process.argv.slice(2).join(' ').trim()
  if (!rawText) {
    throw new Error('Usage: tsx scripts/emit-event.ts "raw text"')
  }

  const event = await emitDiaryEvent(rawText, 'manual')
  console.log(JSON.stringify(event, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
