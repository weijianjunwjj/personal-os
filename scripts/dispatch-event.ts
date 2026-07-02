import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { personalPath } from '../config/os-paths.ts'
import type { OsEvent } from './emit-event.ts'
import { consumeAiMethodEvent } from './consumers/ai-method-consumer.ts'
import { consumeCareerEvent } from './consumers/career-consumer.ts'
import { consumeEnergyEvent } from './consumers/energy-consumer.ts'
import { ensureDir, logDaemon, pathExists, readJsonLines } from './os-utils.ts'

type ConsumerName = 'energy-consumer' | 'ai-method-consumer' | 'career-consumer'

interface Checkpoint {
  consumer: ConsumerName
  processedEventIds: string[]
  updatedAt: string
}

interface Consumer {
  name: ConsumerName
  shouldRun: (event: OsEvent) => boolean
  run: (event: OsEvent) => Promise<boolean>
}

const consumers: Consumer[] = [
  {
    name: 'energy-consumer',
    shouldRun: (event) => event.signals.energyImpact !== 0 || event.signals.emotion.length > 0,
    run: consumeEnergyEvent,
  },
  {
    name: 'ai-method-consumer',
    shouldRun: (event) =>
      event.signals.methodCandidate ||
      event.signals.toolIdea ||
      event.signals.promptCandidate ||
      event.signals.workflowCandidate,
    run: consumeAiMethodEvent,
  },
  {
    name: 'career-consumer',
    shouldRun: (event) => event.signals.careerRelated,
    run: consumeCareerEvent,
  },
]

async function checkpointPath(consumer: ConsumerName): Promise<string> {
  const dir = personalPath('state', 'checkpoints')
  await ensureDir(dir)
  return personalPath('state', 'checkpoints', `${consumer}.json`)
}

async function readCheckpoint(consumer: ConsumerName): Promise<Checkpoint> {
  const filePath = await checkpointPath(consumer)
  if (!(await pathExists(filePath))) {
    return { consumer, processedEventIds: [], updatedAt: new Date(0).toISOString() }
  }

  const raw = await fs.readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as Checkpoint
  return {
    consumer,
    processedEventIds: Array.isArray(parsed.processedEventIds) ? parsed.processedEventIds : [],
    updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
  }
}

async function markProcessed(consumer: ConsumerName, eventId: string): Promise<void> {
  const checkpoint = await readCheckpoint(consumer)
  if (!checkpoint.processedEventIds.includes(eventId)) {
    checkpoint.processedEventIds.push(eventId)
  }
  checkpoint.updatedAt = new Date().toISOString()

  const filePath = await checkpointPath(consumer)
  await fs.writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8')
}

async function isProcessed(consumer: ConsumerName, eventId: string): Promise<boolean> {
  const checkpoint = await readCheckpoint(consumer)
  return checkpoint.processedEventIds.includes(eventId)
}

export async function dispatchEvent(event: OsEvent): Promise<void> {
  for (const consumer of consumers) {
    if (!consumer.shouldRun(event)) {
      continue
    }

    if (await isProcessed(consumer.name, event.id)) {
      continue
    }

    try {
      await consumer.run(event)
      await markProcessed(consumer.name, event.id)
      await logDaemon(`Dispatched ${event.id} to ${consumer.name}`)
    } catch (error) {
      await logDaemon(`Failed to dispatch ${event.id} to ${consumer.name}`, error)
    }
  }
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) {
    return []
  }

  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        return listJsonlFiles(entryPath)
      }

      return entry.name.endsWith('.jsonl') ? [entryPath] : []
    }),
  )

  return files.flat()
}

export async function readAllEvents(): Promise<OsEvent[]> {
  const eventRoot = personalPath('content', 'events')
  const files = await listJsonlFiles(eventRoot)
  const events: OsEvent[] = []

  for (const file of files.sort()) {
    const records = await readJsonLines(file)
    for (const record of records) {
      if (typeof record.id === 'string' && typeof record.type === 'string' && typeof record.rawText === 'string') {
        events.push(record as unknown as OsEvent)
      }
    }
  }

  return events
}

export async function dispatchUnconsumedEvents(): Promise<void> {
  const events = await readAllEvents()
  for (const event of events) {
    await dispatchEvent(event)
  }
}

async function main() {
  const eventArgIndex = process.argv.indexOf('--event')
  if (eventArgIndex >= 0 && process.argv[eventArgIndex + 1]) {
    await dispatchEvent(JSON.parse(process.argv[eventArgIndex + 1]) as OsEvent)
    return
  }

  await dispatchUnconsumedEvents()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
