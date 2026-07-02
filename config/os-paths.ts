import fs from 'node:fs'
import path from 'node:path'

export const personalOsRoot = process.env.PERSONAL_OS_ROOT ?? 'D:\\VSCode\\personal-os'
export const aiOsRoot = process.env.AI_OS_ROOT ?? 'D:\\VSCode\\ai-os'
export const energyOsRoot = process.env.ENERGY_OS_ROOT ?? 'D:\\VSCode\\energy-os'

export const offerFlowCandidates = [
  process.env.OFFERFLOW_ROOT,
  'D:\\VSCode\\offer-pilot',
  'D:\\VSCode\\OfferFlow',
  'D:\\VSCode\\offerflow',
].filter(Boolean) as string[]

export function findOfferFlowRoot(): string | undefined {
  return offerFlowCandidates.find((candidate) => fs.existsSync(candidate))
}

function normalizeForCompare(value: string): string {
  return path.resolve(value).toLowerCase()
}

export function safeJoin(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root)
  const resolvedPath = path.resolve(resolvedRoot, ...segments)
  const comparableRoot = normalizeForCompare(resolvedRoot)
  const comparablePath = normalizeForCompare(resolvedPath)

  if (comparablePath !== comparableRoot && !comparablePath.startsWith(`${comparableRoot}${path.sep}`)) {
    throw new Error(`Refused to access path outside ${resolvedRoot}: ${resolvedPath}`)
  }

  return resolvedPath
}

export function personalPath(...segments: string[]): string {
  return safeJoin(personalOsRoot, ...segments)
}

export function aiPath(...segments: string[]): string {
  return safeJoin(aiOsRoot, ...segments)
}

export function energyPath(...segments: string[]): string {
  return safeJoin(energyOsRoot, ...segments)
}

export function offerFlowPath(...segments: string[]): string {
  const root = findOfferFlowRoot()
  if (!root) {
    throw new Error(`No OfferFlow project found in candidates: ${offerFlowCandidates.join(', ')}`)
  }

  return safeJoin(root, ...segments)
}

export function toPersonalRelative(absolutePath: string): string {
  return path.relative(personalOsRoot, absolutePath).replaceAll(path.sep, '/')
}

export function getResolvedOsPaths() {
  return {
    personalOsRoot,
    aiOsRoot,
    energyOsRoot,
    offerFlowRoot: findOfferFlowRoot(),
    offerFlowCandidates,
  }
}
