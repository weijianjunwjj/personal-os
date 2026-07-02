import { personalPath } from '../../config/os-paths.ts'
import type { OsEvent } from '../emit-event.ts'
import { appendTextUnique, ensureDir, formatDateParts, summarize } from '../os-utils.ts'

function firstMatch(rawText: string, keywords: string[]): string {
  return keywords.find((keyword) => rawText.includes(keyword)) ?? '未明确'
}

function nextStep(rawText: string): string {
  const shouldIndex = rawText.indexOf('应该')
  if (shouldIndex >= 0) {
    return summarize(rawText.slice(shouldIndex), 48)
  }

  const needIndex = rawText.indexOf('需要')
  if (needIndex >= 0) {
    return summarize(rawText.slice(needIndex), 48)
  }

  return '未明确'
}

export async function consumeCareerEvent(event: OsEvent): Promise<boolean> {
  const eventTime = new Date(event.time)
  const parts = formatDateParts(Number.isNaN(eventTime.getTime()) ? new Date() : eventTime)
  const outputFile = personalPath('content', 'career', 'job-search-log.md')

  await ensureDir(personalPath('content', 'career'))

  const marker = `来源事件：${event.id}`
  const content = [
    `## ${parts.date} ${parts.time}`,
    '',
    `来源事件：${event.id}  `,
    `来源路径：${event.sourcePath}`,
    '',
    '### 原始记录摘要',
    '',
    summarize(event.rawText, 120),
    '',
    '### 求职相关信号',
    '',
    `- 城市：${firstMatch(event.rawText, ['苏州', '杭州', '上海'])}`,
    `- 平台：${firstMatch(event.rawText, ['Boss', 'BOSS', 'boss', '猎聘', 'O-HR', '圆才网'])}`,
    `- 岗位池：${event.rawText.includes('岗位') || event.rawText.includes('就业市场') ? '出现岗位池或就业市场反馈' : '未明确'}`,
    `- 情绪：${event.signals.emotion.length > 0 ? event.signals.emotion.join('、') : '未明确'}`,
    `- 下一步：${nextStep(event.rawText)}`,
    '',
    '',
  ].join('\n')

  return appendTextUnique(outputFile, content, marker)
}
