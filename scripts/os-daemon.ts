import chokidar from 'chokidar'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { personalPath } from '../config/os-paths.ts'
import { addDiaryFromText } from './add-diary.ts'
import { dispatchUnconsumedEvents } from './dispatch-event.ts'
import { importJdScreenshot } from './import-jd-screenshot.ts'
import {
  ensureDir,
  logDaemon,
  moveToDirectory,
  pathExists,
  readTextIfExists,
  waitForStableFile,
  writeFailureReason,
} from './os-utils.ts'

const diaryExtensions = new Set(['.txt', '.md'])
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const jdExtensions = new Set([...imageExtensions, '.txt'])

function isInsideDir(filePath: string, dirPath: string): boolean {
  const relative = path.relative(dirPath, filePath)
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative))
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

async function acquireLock(): Promise<void> {
  const lockDir = personalPath('state', 'daemon')
  const lockPath = personalPath('state', 'daemon', 'lock.json')
  await ensureDir(lockDir)

  if (await pathExists(lockPath)) {
    try {
      const lock = JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number; startedAt?: string }
      if (lock.pid && processIsAlive(lock.pid)) {
        throw new Error(`Personal OS daemon is already running with pid ${lock.pid}.`)
      }
      await logDaemon(`Clearing stale daemon lock from pid ${lock.pid ?? 'unknown'}.`)
    } catch (error) {
      if (error instanceof Error && error.message.includes('already running')) {
        throw error
      }
      await logDaemon('Clearing unreadable daemon lock.', error)
    }
  }

  await fs.writeFile(
    lockPath,
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

async function releaseLock(): Promise<void> {
  const lockPath = personalPath('state', 'daemon', 'lock.json')
  if (!(await pathExists(lockPath))) {
    return
  }

  try {
    const lock = JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number }
    if (lock.pid === process.pid) {
      await fs.rm(lockPath, { force: true })
    }
  } catch {
    await fs.rm(lockPath, { force: true })
  }
}

async function moveDiaryToFailed(filePath: string, error: unknown): Promise<void> {
  const failedDir = personalPath('inbox', 'diary', 'failed')
  await ensureDir(failedDir)
  await writeFailureReason(failedDir, path.basename(filePath), error)
  if (await pathExists(filePath)) {
    await moveToDirectory(filePath, failedDir)
  }
}

export async function processDiaryInput(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase()
  if (!diaryExtensions.has(ext) || !(await pathExists(filePath))) {
    return
  }

  try {
    await waitForStableFile(filePath)
    const rawText = (await readTextIfExists(filePath)).trim()
    if (!rawText) {
      throw new Error('Diary inbox file is empty.')
    }

    const result = await addDiaryFromText(rawText)
    const processedDir = personalPath('inbox', 'diary', 'processed')
    await moveToDirectory(filePath, processedDir)
    await logDaemon(
      result.appended
        ? `Processed diary inbox file ${path.basename(filePath)} -> ${result.sourcePath}`
        : `Skipped duplicate diary inbox file ${path.basename(filePath)}.`,
    )
  } catch (error) {
    await logDaemon(`Failed to process diary inbox file ${filePath}`, error)
    await moveDiaryToFailed(filePath, error)
  }
}

async function moveJdToFailed(filePath: string, error: unknown): Promise<void> {
  const failedDir = personalPath('inbox', 'job-screenshots', 'failed')
  await ensureDir(failedDir)
  await writeFailureReason(failedDir, path.basename(filePath), error)

  if (await pathExists(filePath)) {
    await moveToDirectory(filePath, failedDir)
  }

  const ext = path.extname(filePath).toLowerCase()
  if (imageExtensions.has(ext)) {
    const parsed = path.parse(filePath)
    const sidecar = path.join(parsed.dir, `${parsed.name}.txt`)
    if (await pathExists(sidecar)) {
      await moveToDirectory(sidecar, failedDir)
    }
  }
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

export async function processJdInput(filePath: string): Promise<void> {
  const ext = path.extname(filePath).toLowerCase()
  if (!jdExtensions.has(ext) || !(await pathExists(filePath))) {
    return
  }

  if (ext === '.txt' && (await hasSiblingImage(filePath))) {
    return
  }

  try {
    await waitForStableFile(filePath)
    const result = await importJdScreenshot(filePath)
    await logDaemon(`Processed JD inbox file ${path.basename(filePath)} -> ${result.draft.offerflow.recommendedCategory}`)
  } catch (error) {
    await logDaemon(`Failed to process JD inbox file ${filePath}`, error)
    await moveJdToFailed(filePath, error)
  }
}

async function listFiles(dirPath: string): Promise<string[]> {
  if (!(await pathExists(dirPath))) {
    return []
  }

  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  return entries.filter((entry) => entry.isFile()).map((entry) => path.join(dirPath, entry.name))
}

export async function scanDiaryInbox(): Promise<void> {
  const rawDir = personalPath('inbox', 'diary', 'raw')
  const files = await listFiles(rawDir)
  for (const file of files.sort()) {
    await processDiaryInput(file)
  }
}

export async function scanJdInbox(): Promise<void> {
  const pendingDir = personalPath('inbox', 'job-screenshots', 'pending')
  const files = await listFiles(pendingDir)
  const images = files.filter((file) => imageExtensions.has(path.extname(file).toLowerCase())).sort()
  const textFiles = files.filter((file) => path.extname(file).toLowerCase() === '.txt').sort()

  for (const file of images) {
    await processJdInput(file)
  }

  for (const file of textFiles) {
    await processJdInput(file)
  }
}

export async function runOnce(): Promise<void> {
  await dispatchUnconsumedEvents()
  await scanDiaryInbox()
  await scanJdInbox()
  await dispatchUnconsumedEvents()
}

export async function watchDaemon(): Promise<void> {
  await acquireLock()
  await logDaemon('Personal OS daemon started.')

  const diaryRawDir = personalPath('inbox', 'diary', 'raw')
  const jdPendingDir = personalPath('inbox', 'job-screenshots', 'pending')
  const eventsDir = personalPath('content', 'events')
  const timers = new Map<string, NodeJS.Timeout>()

  const schedule = (filePath: string) => {
    const existing = timers.get(filePath)
    if (existing) {
      clearTimeout(existing)
    }

    timers.set(
      filePath,
      setTimeout(async () => {
        timers.delete(filePath)
        try {
          if (isInsideDir(filePath, diaryRawDir)) {
            await processDiaryInput(filePath)
          } else if (isInsideDir(filePath, jdPendingDir)) {
            await processJdInput(filePath)
          } else if (isInsideDir(filePath, eventsDir)) {
            await dispatchUnconsumedEvents()
          }
        } catch (error) {
          await logDaemon(`Daemon scheduled task failed for ${filePath}`, error)
        }
      }, 700),
    )
  }

  const watcher = chokidar.watch([diaryRawDir, jdPendingDir, eventsDir], {
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 700,
      pollInterval: 100,
    },
  })

  watcher
    .on('add', schedule)
    .on('change', schedule)
    .on('error', async (error) => {
      await logDaemon('Personal OS daemon watcher error.', error)
    })

  const shutdown = async () => {
    await logDaemon('Personal OS daemon stopping.')
    await watcher.close()
    await releaseLock()
    process.exit(0)
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  await new Promise(() => undefined)
}

async function main() {
  if (process.argv.includes('--watch')) {
    await watchDaemon()
    return
  }

  await runOnce()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (error) => {
    await logDaemon('Personal OS daemon command failed.', error)
    process.exitCode = 1
  })
}
