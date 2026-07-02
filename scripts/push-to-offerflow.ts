import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { offerFlowPath } from '../config/os-paths.ts'
import type { JdImportDraft } from './parse-jd-image.ts'
import { appendJsonLineUnique, ensureDir } from './os-utils.ts'

export interface OfferFlowImportDraft {
  sourceType: 'boss_screenshot'
  sourceImagePath: string
  companyName?: string
  positionTitle?: string
  city?: string
  district?: string
  salaryRange?: string
  techStack: string[]
  responsibilities: string[]
  requirements: string[]
  riskFlags: string[]
  recommendedCategory: 'main_attack' | 'low_cost_probe' | 'give_up' | 'wait_review'
  reason: string
  confidence: number
  rawText: string
  importStatus: 'draft'
  needHumanReview: boolean
  missingFields: string[]
  warnings: string[]
  createdAt: string
}

function riskFlagsFromDraft(draft: JdImportDraft): string[] {
  const flags: string[] = []
  if (draft.matchHints.reactRisk) flags.push('reactRisk')
  if (draft.matchHints.nodeFullstackRisk) flags.push('nodeFullstackRisk')
  if (draft.matchHints.backendHeavyRisk) flags.push('backendHeavyRisk')
  return flags
}

export function toOfferFlowDraft(draft: JdImportDraft): OfferFlowImportDraft {
  return {
    sourceType: 'boss_screenshot',
    sourceImagePath: draft.source.imagePath,
    companyName: draft.company.name,
    positionTitle: draft.position.title,
    city: draft.position.city,
    district: draft.position.district,
    salaryRange: draft.position.salaryRange,
    techStack: draft.jd.techStack,
    responsibilities: draft.jd.responsibilities,
    requirements: draft.jd.requirements,
    riskFlags: riskFlagsFromDraft(draft),
    recommendedCategory: draft.offerflow.recommendedCategory,
    reason: draft.offerflow.reason,
    confidence: draft.offerflow.confidence,
    rawText: draft.source.rawOcrText ?? '',
    importStatus: 'draft',
    needHumanReview: draft.review.needHumanReview,
    missingFields: draft.review.missingFields,
    warnings: draft.review.warnings,
    createdAt: draft.source.capturedAt,
  }
}

export async function pushToOfferFlow(draft: JdImportDraft): Promise<boolean> {
  const outputDir = offerFlowPath('import', 'inbox')
  const outputFile = offerFlowPath('import', 'inbox', 'jd-import-drafts.jsonl')
  const record = toOfferFlowDraft(draft)

  await ensureDir(outputDir)

  return appendJsonLineUnique(
    outputFile,
    record as unknown as Record<string, unknown>,
    (item) =>
      item.sourceImagePath === record.sourceImagePath &&
      item.rawText === record.rawText &&
      item.importStatus === 'draft',
  )
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    throw new Error('Usage: tsx scripts/push-to-offerflow.ts <draft-json-path>')
  }

  const raw = await fs.readFile(inputPath, 'utf8')
  const draft = JSON.parse(raw) as JdImportDraft
  const appended = await pushToOfferFlow(draft)
  console.log(appended ? 'OfferFlow draft appended.' : 'OfferFlow draft already exists; skipped.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
