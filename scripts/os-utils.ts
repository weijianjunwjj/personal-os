import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { personalPath } from '../config/os-paths.ts'

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDateParts(date = new Date()) {
  const year = String(date.getFullYear())
  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  const hour = pad2(date.getHours())
  const minute = pad2(date.getMinutes())
  const second = pad2(date.getSeconds())

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    timestamp: `${year}${month}${day}_${hour}${minute}${second}`,
    monthKey: `${year}-${month}`,
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readTextIfExists(filePath: string): Promise<string> {
  if (!(await pathExists(filePath))) {
    return ''
  }

  return fs.readFile(filePath, 'utf8')
}

export async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  if (await pathExists(filePath)) {
    return
  }

  await ensureDir(path.dirname(filePath))
  await fs.writeFile(filePath, content, 'utf8')
}

export async function appendText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath))
  await fs.appendFile(filePath, content, 'utf8')
}

export async function appendTextUnique(filePath: string, content: string, marker: string): Promise<boolean> {
  const existing = await readTextIfExists(filePath)
  if (existing.includes(marker)) {
    return false
  }

  await appendText(filePath, content)
  return true
}

export async function appendJsonLineUnique(
  filePath: string,
  record: Record<string, unknown>,
  duplicatePredicate: (item: Record<string, unknown>) => boolean,
): Promise<boolean> {
  const existing = await readJsonLines(filePath)
  if (existing.some(duplicatePredicate)) {
    return false
  }

  await appendText(filePath, `${JSON.stringify(record)}\n`)
  return true
}

export async function readJsonLines(filePath: string): Promise<Record<string, unknown>[]> {
  const text = await readTextIfExists(filePath)
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
}

export function shortHash(input: string, length = 8): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, length)
}

export function summarize(text: string, maxLength = 80): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

export async function logDaemon(message: string, error?: unknown): Promise<void> {
  const details = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : error ? String(error) : ''
  const line = `[${new Date().toISOString()}] ${message}${details ? `\n${details}` : ''}\n`
  await appendText(personalPath('logs', 'daemon.log'), line)
  console.log(message)
}

export async function moveToDirectory(sourcePath: string, targetDir: string): Promise<string> {
  await ensureDir(targetDir)
  const parsed = path.parse(sourcePath)
  let targetPath = path.join(targetDir, parsed.base)
  let counter = 1

  while (await pathExists(targetPath)) {
    targetPath = path.join(targetDir, `${parsed.name}-${Date.now()}-${counter}${parsed.ext}`)
    counter += 1
  }

  await fs.rename(sourcePath, targetPath)
  return targetPath
}

export async function writeFailureReason(targetDir: string, sourceName: string, error: unknown): Promise<void> {
  const details = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error)
  const safeName = sourceName.replace(/[\\/:*?"<>|]/g, '_')
  await appendText(path.join(targetDir, `${safeName}.error.log`), `[${new Date().toISOString()}]\n${details}\n\n`)
}

export async function waitForStableFile(filePath: string, delayMs = 500): Promise<void> {
  const before = await fs.stat(filePath).catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  const after = await fs.stat(filePath).catch(() => undefined)

  if (before && after && before.size !== after.size) {
    await waitForStableFile(filePath, delayMs)
  }
}
