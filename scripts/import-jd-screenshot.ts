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
  waitForStableFile,
  writeFailureReason,
} from './os-utils.ts'
import { parseJdImage, type JdImportDraft } from './parse-jd-image.ts'
import { pushToOfferFlow } from './push-to-offerflow.ts'

const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const jdExtensions = new Set([...imageExtensions, '.txt'])

export interface ImportJdResult {
  draft: JdImportDraft
  intakePath: string
  movedTo?: string
}

export interface BatchImportResult {
  inputPath: string
  result?: ImportJdResult
  error?: string
  failedTo?: string
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

async function moveJdToFailed(inputPath: string, error: unknown): Promise<string | undefined> {
  const pendingDir = personalPath('inbox', 'job-screenshots', 'pending')
  if (!isInsideDir(inputPath, pendingDir)) {
    return undefined
  }

  const failedDir = personalPath('inbox', 'job-screenshots', 'failed')
  await ensureDir(failedDir)
  await writeFailureReason(failedDir, path.basename(inputPath), error)
  const failedTo = await moveToDirectory(inputPath, failedDir)
  const ext = path.extname(inputPath).toLowerCase()

  if (imageExtensions.has(ext)) {
    const parsed = path.parse(inputPath)
    const sidecar = path.join(parsed.dir, `${parsed.name}.txt`)
    if (await pathExists(sidecar)) {
      await moveToDirectory(sidecar, failedDir)
    }
  }

  return failedTo
}

async function hasSiblingImage(txtPath: string): Promise<boolean> {
  const parsed = path.parse(txtPath)
  for (const ext of imageExtensions) {
    if (await pathExists(path.join(parsed.dir, `${parsed.name}${ext}`))) {
      return true
    }
  }

  return false
}

async function listJdFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => jdExtensions.has(path.extname(filePath).toLowerCase()))
    .sort()
  const result: string[] = []

  for (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase()
    if (ext === '.txt' && (await hasSiblingImage(filePath))) {
      continue
    }

    result.push(filePath)
  }

  return result
}

export async function importJdScreenshot(inputPath: string): Promise<ImportJdResult> {
  const absoluteInputPath = resolveInputPath(inputPath)
  await waitForStableFile(absoluteInputPath)
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

export async function importJdBatch(inputPath?: string): Promise<BatchImportResult[]> {
  const absoluteInputPath = inputPath ? resolveInputPath(inputPath) : personalPath('inbox', 'job-screenshots', 'pending')
  const stats = await fs.stat(absoluteInputPath)
  const files = stats.isDirectory() ? await listJdFiles(absoluteInputPath) : [absoluteInputPath]
  const results: BatchImportResult[] = []

  for (const filePath of files) {
    try {
      const result = await importJdScreenshot(filePath)
      results.push({ inputPath: filePath, result })
    } catch (error) {
      const failedTo = await moveJdToFailed(filePath, error)
      results.push({
        inputPath: filePath,
        failedTo,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

async function main() {
  const inputPath = process.argv[2]
  if (!inputPath) {
    throw new Error('Usage: npm run jd:import -- "inbox/job-screenshots/pending/example.png" | --all | "inbox/job-screenshots/pending"')
  }

  if (inputPath === '--all') {
    const results = await importJdBatch()
    console.log(
      results
        .map((item) => {
          if (item.result) {
            return `JD draft imported: ${item.result.draft.offerflow.recommendedCategory}\ninput: ${toPersonalRelative(item.inputPath)}\nintake: ${toPersonalRelative(item.result.intakePath)}${item.result.movedTo ? `\nmoved: ${toPersonalRelative(item.result.movedTo)}` : ''}`
          }

          return `JD draft failed: ${toPersonalRelative(item.inputPath)}\nerror: ${item.error}${item.failedTo ? `\nfailed: ${toPersonalRelative(item.failedTo)}` : ''}`
        })
        .join('\n---\n'),
    )
    if (results.some((item) => item.error)) {
      process.exitCode = 1
    }
    return
  }

  const absoluteInputPath = resolveInputPath(inputPath)
  const stats = await fs.stat(absoluteInputPath)
  if (stats.isDirectory()) {
    const results = await importJdBatch(inputPath)
    console.log(
      results
        .map((item) => {
          if (item.result) {
            return `JD draft imported: ${item.result.draft.offerflow.recommendedCategory}\ninput: ${toPersonalRelative(item.inputPath)}\nintake: ${toPersonalRelative(item.result.intakePath)}${item.result.movedTo ? `\nmoved: ${toPersonalRelative(item.result.movedTo)}` : ''}`
          }

          return `JD draft failed: ${toPersonalRelative(item.inputPath)}\nerror: ${item.error}${item.failedTo ? `\nfailed: ${toPersonalRelative(item.failedTo)}` : ''}`
        })
        .join('\n---\n'),
    )
    if (results.some((item) => item.error)) {
      process.exitCode = 1
    }
    return
  }

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
