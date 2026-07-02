import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { personalOsRoot, personalPath, safeJoin, toPersonalRelative } from '../config/os-paths.ts'
import { emitJdImportEvent } from './emit-event.ts'
import {
  appendJsonLineUnique,
  ensureDir,
  formatDateParts,
  moveToDirectory,
  pathExists,
} from './os-utils.ts'
import { parseJdImage, type JdImportDraft } from './parse-jd-image.ts'
import { pushToOfferFlow } from './push-to-offerflow.ts'

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export interface ImportJdResult {
  draft: JdImportDraft
  intakePath: string
  movedTo?: string
}

function resolveInputPath(inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath
  }

  return safeJoin(personalOsRoot, inputPath)
}

function isInsideDir(filePath: string, dirPath: string): boolean {
  const relative = path.relative(dirPath, filePath)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

async function moveSourceArtifacts(inputPath: string): Promise<string | undefined> {
  const pendingDir = personalPath('inbox', 'job-screenshots', 'pending')
  if (!isInsideDir(inputPath, pendingDir)) {
    return undefined
  }

  const processedDir = personalPath('inbox', 'job-screenshots', 'processed')
  const movedTo = await moveToDirectory(inputPath, processedDir)
  const ext = path.extname(inputPath).toLowerCase()

  if (imageExtensions.has(ext)) {
    const parsed = path.parse(inputPath)
    const sidecar = path.join(parsed.dir, `${parsed.name}.txt`)
    if (await pathExists(sidecar)) {
      await moveToDirectory(sidecar, processedDir)
    }
  }

  return movedTo
}

export async function importJdScreenshot(inputPath: string): Promise<ImportJdResult> {
  const absoluteInputPath = resolveInputPath(inputPath)
  const displayPath = isInsideDir(absoluteInputPath, personalOsRoot)
    ? toPersonalRelative(absoluteInputPath)
    : absoluteInputPath
  const draft = await parseJdImage(absoluteInputPath, displayPath)
  const parts = formatDateParts(new Date(draft.source.capturedAt))
  const intakeDir = personalPath('content', 'job-intake', parts.year, parts.month)
  const intakePath = personalPath('content', 'job-intake', parts.year, parts.month, `${parts.date}-jd-imports.jsonl`)

  await ensureDir(intakeDir)
  await appendJsonLineUnique(
    intakePath,
    draft as unknown as Record<string, unknown>,
    (item) => {
      const source = item.source as Record<string, unknown> | undefined
      return source?.imagePath === draft.source.imagePath && source?.rawOcrText === draft.source.rawOcrText
    },
  )

  await pushToOfferFlow(draft)
  await emitJdImportEvent(draft.source.rawOcrText ?? '', path.posix.join('content', 'job-intake', parts.year, parts.month, `${parts.date}-jd-imports.jsonl`))
  const movedTo = await moveSourceArtifacts(absoluteInputPath)

  return { draft, intakePath, movedTo }
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    throw new Error('Usage: pnpm jd:import "inbox/job-screenshots/pending/example.txt"')
  }

  await fs.access(resolveInputPath(inputPath))
  const result = await importJdScreenshot(inputPath)
  console.log(
    [
      `JD draft imported: ${result.draft.offerflow.recommendedCategory}`,
      `intake: ${toPersonalRelative(result.intakePath)}`,
      result.movedTo ? `moved: ${toPersonalRelative(result.movedTo)}` : undefined,
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
