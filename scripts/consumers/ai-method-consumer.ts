import { aiPath } from '../../config/os-paths.ts'
import type { OsEvent } from '../emit-event.ts'
import { appendTextUnique, ensureDir, formatDateParts, readTextIfExists, summarize, writeFileIfMissing } from '../os-utils.ts'

function directionsFor(event: OsEvent): string[] {
  const directions = new Set<string>()
  if (event.signals.promptCandidate) directions.add('Template')
  if (event.signals.workflowCandidate) directions.add('Workflow')
  if (event.signals.toolIdea) directions.add('Tooling')
  if (event.signals.methodCandidate) directions.add('Playbook')
  directions.add('Agent')
  return [...directions]
}

function reasonFor(event: OsEvent): string {
  const reasons: string[] = []
  if (event.signals.methodCandidate) reasons.push('文本中出现方法、规则或自我判断信号')
  if (event.signals.toolIdea) reasons.push('文本中出现工具化、自动化或联动信号')
  if (event.signals.promptCandidate) reasons.push('文本中出现提示词、模板或规则信号')
  if (event.signals.workflowCandidate) reasons.push('文本中出现流程或机制信号')

  return reasons.length > 0 ? reasons.join('；') : '文本可作为方法候选，等待人工判断。'
}

export async function consumeAiMethodEvent(event: OsEvent): Promise<boolean> {
  const eventTime = new Date(event.time)
  const parts = formatDateParts(Number.isNaN(eventTime.getTime()) ? new Date() : eventTime)
  const outputDir = aiPath('inbox', 'method-candidates')
  const outputFile = aiPath('inbox', 'method-candidates', `${parts.date}.md`)

  await ensureDir(outputDir)

  if (!(await readTextIfExists(outputFile))) {
    await writeFileIfMissing(outputFile, `# ${parts.date} 方法候选\n\n`)
  }

  const marker = `来源事件：${event.id}`
  const content = [
    `## 候选：${summarize(event.rawText, 28) || '自动生成标题'}`,
    '',
    `来源事件：${event.id}  `,
    `来源路径：personal-os/${event.sourcePath}`,
    '',
    '### 原始表达',
    '',
    event.rawText,
    '',
    '### 可沉淀方向',
    '',
    ...directionsFor(event).map((direction) => `- ${direction}`),
    '',
    '### 初步判断',
    '',
    reasonFor(event),
    '',
    '### 建议动作',
    '',
    '暂存为候选，等待人工确认。不要直接写入正式 docs/playbooks。',
    '',
    '',
  ].join('\n')

  return appendTextUnique(outputFile, content, marker)
}
