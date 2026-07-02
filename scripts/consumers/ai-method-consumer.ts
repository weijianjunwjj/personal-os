import { aiPath } from '../../config/os-paths.ts'
import type { OsEvent } from '../emit-event.ts'
import { appendTextUnique, ensureDir, formatDateParts, readTextIfExists, summarize, writeFileIfMissing } from '../os-utils.ts'

type CandidateLevel = 'auto_log' | 'auto_draft' | 'needs_review' | 'auto_promote_candidate'
type PromotionTarget = 'Agent' | 'Playbook' | 'Template' | 'Workflow' | 'Tooling' | 'Unknown'
type RiskLevel = 'low' | 'medium' | 'high'

interface CandidateClassification {
  candidateLevel: CandidateLevel
  promotionTarget: PromotionTarget
  confidence: number
  riskLevel: RiskLevel
  suggestedAction: string
  reason: string
}

function directionsFor(event: OsEvent): string[] {
  const directions = new Set<string>()
  if (event.signals.promptCandidate) directions.add('Template')
  if (event.signals.workflowCandidate) directions.add('Workflow')
  if (event.signals.toolIdea) directions.add('Tooling')
  if (event.signals.methodCandidate) directions.add('Playbook')
  directions.add('Agent')
  return [...directions]
}

function hasAny(rawText: string, keywords: string[]): boolean {
  return keywords.some((keyword) => rawText.includes(keyword))
}

function promotionTargetFor(event: OsEvent): PromotionTarget {
  if (hasAny(event.rawText, ['自动分级', '自动归档', 'review queue', 'Review Queue', '分级', '队列'])) return 'Workflow'
  if (event.signals.toolIdea || hasAny(event.rawText, ['工具', '自动化', '联动', '系统'])) return 'Tooling'
  if (event.signals.workflowCandidate || hasAny(event.rawText, ['流程', '机制'])) return 'Workflow'
  if (event.signals.promptCandidate || hasAny(event.rawText, ['模板', '提示词'])) return 'Template'
  if (event.signals.methodCandidate) return 'Playbook'
  return 'Unknown'
}

function riskLevelFor(event: OsEvent): RiskLevel {
  if (
    hasAny(event.rawText, [
      '放弃',
      '立刻',
      '全面打开',
      '重新全面',
      '城市选择',
      '薪资策略',
      '开启',
      '关闭',
      '长期人生',
      '人生判断',
    ]) ||
    (event.signals.careerRelated && hasAny(event.rawText, ['苏州', '杭州', '上海', '薪资', '求职线']))
  ) {
    return 'high'
  }

  if (event.signals.careerRelated || event.signals.reviewNeeded) {
    return 'medium'
  }

  return 'low'
}

function confidenceFor(event: OsEvent, riskLevel: RiskLevel): number {
  let confidence = 0.3
  if (event.signals.methodCandidate) confidence += 0.18
  if (event.signals.toolIdea) confidence += 0.16
  if (event.signals.workflowCandidate) confidence += 0.12
  if (event.signals.promptCandidate) confidence += 0.1
  if (hasAny(event.rawText, ['我发现', '我意识到', '以后应该', '应该'])) confidence += 0.1
  if (hasAny(event.rawText, ['自动分级', '自动归档', '生成 draft', 'review queue', 'Review Queue'])) confidence += 0.08
  if (riskLevel === 'high') confidence += 0.05
  return Math.min(0.92, Number(confidence.toFixed(2)))
}

function classifyCandidate(event: OsEvent): CandidateClassification {
  const riskLevel = riskLevelFor(event)
  const confidence = confidenceFor(event, riskLevel)
  const promotionTarget = promotionTargetFor(event)
  const strongMethodSignal =
    hasAny(event.rawText, ['我发现', '我意识到', '以后应该', '应该', '机制', '自动化', '工具', '流程', '自动分级']) ||
    event.signals.toolIdea ||
    event.signals.workflowCandidate

  if (riskLevel === 'high') {
    return {
      candidateLevel: 'needs_review',
      promotionTarget,
      confidence,
      riskLevel,
      suggestedAction: '进入 review queue，需要用户确认后再进入正式 playbook。',
      reason: '文本涉及求职策略、城市选择、薪资策略、求职线开关或长期判断，属于高风险候选。',
    }
  }

  if (strongMethodSignal && confidence >= 0.45) {
    return {
      candidateLevel: 'auto_draft',
      promotionTarget,
      confidence,
      riskLevel,
      suggestedAction: '已自动生成 draft 方法文档，暂不写入正式 docs/playbooks。后续可批量 review 或自动晋升。',
      reason: '文本中出现明确的方法、自动化、流程或工具化信号，适合沉淀为方法草稿。',
    }
  }

  return {
    candidateLevel: 'auto_log',
    promotionTarget,
    confidence,
    riskLevel,
    suggestedAction: '自动归档为普通候选，不进入正式规则。后续若重复出现再升级。',
    reason: '文本更像普通感悟，当前不具备进入草稿或 review queue 的强信号。',
  }
}

function reasonFor(event: OsEvent, classification: CandidateClassification): string {
  const reasons: string[] = []
  if (event.signals.methodCandidate) reasons.push('文本中出现方法、规则或自我判断信号')
  if (event.signals.toolIdea) reasons.push('文本中出现工具化、自动化或联动信号')
  if (event.signals.promptCandidate) reasons.push('文本中出现提示词、模板或规则信号')
  if (event.signals.workflowCandidate) reasons.push('文本中出现流程或机制信号')
  reasons.push(classification.reason)

  return reasons.length > 0 ? reasons.join('；') : classification.reason
}

function draftTitle(event: OsEvent): string {
  return summarize(event.rawText, 32) || '自动生成方法草稿'
}

async function writeMethodDraft(event: OsEvent, parts: ReturnType<typeof formatDateParts>, classification: CandidateClassification): Promise<void> {
  const draftsDir = aiPath('inbox', 'method-drafts')
  const draftFile = aiPath('inbox', 'method-drafts', `${parts.date}-${event.id.slice(-8)}.md`)
  await ensureDir(draftsDir)

  const content = [
    `# 方法草稿：${draftTitle(event)}`,
    '',
    `来源事件：${event.id}  `,
    `来源路径：personal-os/${event.sourcePath}`,
    '',
    '## 原始表达',
    '',
    event.rawText,
    '',
    '## 方法描述',
    '',
    `基于原始表达整理成可复用方法，当前建议沉淀方向为 ${classification.promotionTarget}。`,
    '',
    '## 适用场景',
    '',
    '- 需要把重复出现的个人判断沉淀为可执行方法。',
    '- 需要在不改写正式 playbook 的前提下先形成草稿。',
    '',
    '## 操作步骤',
    '',
    '1. 保留来源事件和原始表达。',
    '2. 提炼可复用的方法描述和适用边界。',
    '3. 后续批量 review 后再决定是否进入正式 docs/playbooks。',
    '',
    '## 边界',
    '',
    '- 不自动写入正式 docs/playbooks。',
    '- 不适用于高风险求职策略或长期人生判断。',
    '- 需要人工判断是否与已有规则冲突。',
    '',
    '## 状态',
    '',
    'draft',
    '',
  ].join('\n')

  await writeFileIfMissing(draftFile, content)
}

async function writeReviewQueue(event: OsEvent, parts: ReturnType<typeof formatDateParts>, classification: CandidateClassification): Promise<void> {
  const reviewDir = aiPath('inbox', 'review-queue')
  const reviewFile = aiPath('inbox', 'review-queue', `${parts.date}.md`)
  await ensureDir(reviewDir)

  if (!(await readTextIfExists(reviewFile))) {
    await writeFileIfMissing(reviewFile, `# ${parts.date} Review Queue\n\n`)
  }

  const marker = `来源事件：${event.id}`
  const content = [
    `## 需要确认：${draftTitle(event)}`,
    '',
    `来源事件：${event.id}  `,
    `原因：${classification.reason}`,
    '',
    '### 原始表达',
    '',
    event.rawText,
    '',
    '### 建议确认项',
    '',
    '- 是否进入正式 playbook？',
    '- 是否只是阶段性判断？',
    '- 是否需要和已有规则合并？',
    '- 是否存在反例？',
    '',
    '',
  ].join('\n')

  await appendTextUnique(reviewFile, content, marker)
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

  const classification = classifyCandidate(event)
  const marker = `来源事件：${event.id}`
  const content = [
    `## 候选：${draftTitle(event)}`,
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
    '### 自动分级',
    '',
    `- candidateLevel: ${classification.candidateLevel}`,
    `- confidence: ${classification.confidence}`,
    `- riskLevel: ${classification.riskLevel}`,
    `- promotionTarget: ${classification.promotionTarget}`,
    '',
    '### 初步判断',
    '',
    reasonFor(event, classification),
    '',
    '### 建议动作',
    '',
    classification.suggestedAction,
    '',
    '',
  ].join('\n')

  const appended = await appendTextUnique(outputFile, content, marker)

  if (classification.candidateLevel === 'auto_draft' || classification.candidateLevel === 'auto_promote_candidate') {
    await writeMethodDraft(event, parts, classification)
  }

  if (classification.candidateLevel === 'needs_review') {
    await writeReviewQueue(event, parts, classification)
  }

  return appended
}
