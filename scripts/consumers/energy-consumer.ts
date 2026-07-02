import { energyPath } from '../../config/os-paths.ts'
import type { OsEvent } from '../emit-event.ts'
import { appendJsonLineUnique, ensureDir, formatDateParts, summarize } from '../os-utils.ts'

function categorize(rawText: string): string {
  if (['里程碑', '第一条', '正式', '完成', '落地', '破壳', '跑通', '通关', '心跳', '神经反射'].some((keyword) => rawText.includes(keyword))) {
    return '里程碑事件'
  }

  if (['求职', '岗位', 'Boss', 'BOSS', 'boss', 'HR', '简历', '薪资', 'offer', 'Offer', '就业市场'].some((keyword) => rawText.includes(keyword))) {
    return '求职压力'
  }

  if (['虚', '累', '睡不好', '身体', '恢复'].some((keyword) => rawText.includes(keyword))) {
    return '身体疲劳'
  }

  if (['行动力', '兴奋', '开心', '轻松', '稳了'].some((keyword) => rawText.includes(keyword))) {
    return '行动力恢复'
  }

  return '情绪波动'
}

export async function consumeEnergyEvent(event: OsEvent): Promise<boolean> {
  const eventTime = new Date(event.time)
  const parts = formatDateParts(Number.isNaN(eventTime.getTime()) ? new Date() : eventTime)
  const outputDir = energyPath('data', 'energy-events')
  const outputFile = energyPath('data', 'energy-events', `${parts.monthKey}.jsonl`)

  await ensureDir(outputDir)

  const record = {
    date: parts.date,
    time: event.time,
    sourceEventId: event.id,
    sourcePath: `personal-os/${event.sourcePath}`,
    trigger: summarize(event.rawText),
    emotion: event.signals.emotion,
    energyImpact: event.signals.energyImpact,
    category: categorize(event.rawText),
    note: '根据 personal-os 日记事件自动生成',
  }

  return appendJsonLineUnique(outputFile, record, (item) => item.sourceEventId === event.id)
}
