import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { personalPath } from '../config/os-paths.ts'
import { dispatchEvent } from './dispatch-event.ts'
import { emitDiaryEvent, type OsEvent } from './emit-event.ts'
import {
  appendTextUnique,
  ensureDir,
  formatDateParts,
  pathExists,
  shortHash,
  summarize,
  writeFileIfMissing,
} from './os-utils.ts'

interface AddDiaryResult {
  diaryPath: string
  sourcePath: string
  appended: boolean
  event?: OsEvent
}

function splitSentences(rawText: string): string[] {
  return rawText
    .split(/[。！？!?；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractJudgement(rawText: string): string {
  const sentence = splitSentences(rawText).find((item) =>
    ['我发现', '我意识到', '以后应该', '应该'].some((keyword) => item.includes(keyword)),
  )

  return sentence ? summarize(sentence, 80) : '待复盘'
}

function extractAction(rawText: string): string {
  const sentence = splitSentences(rawText).find((item) =>
    ['应该', '需要', '固定', '不要', '不能', '准备', '执行', '扫描'].some((keyword) => item.includes(keyword)),
  )

  return sentence ? summarize(sentence, 80) : '暂未形成明确行动'
}

function diaryFrontmatter(date: string): string {
  return [
    '---',
    'type: diary',
    `date: ${date}`,
    'tags: []',
    'mood:',
    'energy:',
    'related: []',
    '---',
    '',
    '',
  ].join('\n')
}

function diaryEntry(rawText: string, time: string, marker: string): string {
  return [
    marker,
    '',
    `## ${time}`,
    '',
    '### 原始输入',
    '',
    rawText,
    '',
    '### 事件',
    '',
    summarize(rawText, 120),
    '',
    '### 判断',
    '',
    extractJudgement(rawText),
    '',
    '### 行动',
    '',
    extractAction(rawText),
    '',
    '### 给未来 AI 的备注',
    '',
    '这是一条来自日记入口的原始记录，后续可用于复盘和主题沉淀。',
    '',
    '',
  ].join('\n')
}

export async function addDiaryFromText(rawText: string, now = new Date()): Promise<AddDiaryResult> {
  const text = rawText.trim()
  if (!text) {
    throw new Error('Diary text is empty.')
  }

  const parts = formatDateParts(now)
  const diaryDir = personalPath('content', 'diary', parts.year, parts.month)
  const diaryPath = personalPath('content', 'diary', parts.year, parts.month, `${parts.date}.md`)
  const sourcePath = path.posix.join('content', 'diary', parts.year, parts.month, `${parts.date}.md`)
  const marker = `<!-- diary-entry:${shortHash(`${parts.date}:${text}`)} -->`

  await ensureDir(diaryDir)
  if (!(await pathExists(diaryPath))) {
    await writeFileIfMissing(diaryPath, diaryFrontmatter(parts.date))
  }

  const appended = await appendTextUnique(diaryPath, diaryEntry(text, parts.time, marker), marker)
  if (!appended) {
    return { diaryPath, sourcePath, appended: false }
  }

  const event = await emitDiaryEvent(text, sourcePath, now)
  await dispatchEvent(event)

  return { diaryPath, sourcePath, appended: true, event }
}

async function main() {
  const rawText = process.argv.slice(2).join(' ').trim()
  if (!rawText) {
    throw new Error('Usage: pnpm add:diary "今天..."')
  }

  const result = await addDiaryFromText(rawText)
  console.log(
    result.appended
      ? `Diary appended: ${result.sourcePath}; event: ${result.event?.id}`
      : `Skipped duplicate diary entry: ${result.sourcePath}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
