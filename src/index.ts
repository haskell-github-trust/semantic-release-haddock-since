import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { basename, delimiter, dirname, join } from "node:path"
import { promisify } from "node:util"
import { addSince, isLocalDeclaration, parseHoogle, toPvp } from "./haddock.js"

const execFileAsync = promisify(execFile)

export interface PluginConfig {
  versionFiles?: string[]
  baseline?: string
  srcDir?: string
  haddockCommand?: string[]
  buildCommand?: string[]
  haddockOutputDir?: string
  pvp?: boolean
}

interface ResolvedConfig {
  versionFiles: string[]
  baseline?: string
  srcDir: string
  haddockCommand: string[]
  buildCommand: string[]
  haddockOutputDir: string
  pvp: boolean
}

export interface Logger {
  log(message: string, ...args: unknown[]): void
}

export interface VerifyConditionsContext {
  cwd?: string
  logger: Logger
}

export interface PrepareContext {
  cwd?: string
  logger: Logger
  nextRelease: { version: string }
}

export class SemanticReleaseError extends Error {
  code: string
  details?: string

  constructor(message: string, code: string, details?: string) {
    super(message)
    this.name = "SemanticReleaseError"
    this.code = code
    this.details = details
  }
}

function withDefaults(pluginConfig: PluginConfig): ResolvedConfig {
  return {
    versionFiles: pluginConfig.versionFiles ?? ["package.yaml", "*.cabal"],
    baseline: pluginConfig.baseline,
    srcDir: pluginConfig.srcDir ?? "src",
    haddockCommand: pluginConfig.haddockCommand ?? ["stack", "haddock", "--no-haddock-deps"],
    buildCommand: pluginConfig.buildCommand ?? ["stack", "build"],
    haddockOutputDir: pluginConfig.haddockOutputDir ?? ".stack-work",
    pvp: pluginConfig.pvp ?? true,
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function isOnPath(bin: string): Promise<boolean> {
  if (bin.includes("/")) {
    try {
      await access(bin, constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  const dirs = (process.env.PATH ?? "").split(delimiter)
  for (const dir of dirs) {
    try {
      await access(join(dir, bin), constants.X_OK)
      return true
    } catch {
      continue
    }
  }
  return false
}

async function resolveVersionFilePaths(root: string, patterns: string[]): Promise<string[]> {
  const entries = await readdir(root)
  const results = new Set<string>()
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      if (entries.includes(pattern)) results.add(join(root, pattern))
      continue
    }
    const starIndex = pattern.indexOf("*")
    const prefix = pattern.slice(0, starIndex)
    const suffix = pattern.slice(starIndex + 1)
    for (const entry of entries) {
      if (entry.startsWith(prefix) && entry.endsWith(suffix) && entry.length >= prefix.length + suffix.length) {
        results.add(join(root, entry))
      }
    }
  }
  return [...results]
}

async function findCabalFile(root: string): Promise<string | undefined> {
  const entries = await readdir(root)
  return entries.find((entry) => entry.endsWith(".cabal"))
}

async function resolveBaselinePath(root: string, config: ResolvedConfig): Promise<string> {
  if (config.baseline) return join(root, config.baseline)
  const cabalFile = await findCabalFile(root)
  if (!cabalFile) {
    throw new SemanticReleaseError(
      "Cannot resolve baseline: no .cabal file found and no baseline configured",
      "ENOBASELINE",
    )
  }
  return join(root, "api", `${basename(cabalFile, ".cabal")}.api`)
}

async function readBaseline(path: string): Promise<Set<string>> {
  try {
    const source = await readFile(path, "utf8")
    return new Set(source.split(/\r?\n/).filter(Boolean))
  } catch {
    return new Set()
  }
}

async function updateVersion(path: string, version: string): Promise<void> {
  const source = await readFile(path, "utf8")
  await writeFile(path, source.replace(/^(version:\s+).*$/m, `$1${version}`))
}

async function findHoogleFile(root: string): Promise<string> {
  const files: string[] = []
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.name.endsWith(".txt") && path.includes("doc/html")) files.push(path)
    }
  }
  await visit(root)
  if (!files.length) throw new Error("stack haddock did not produce a Hoogle file")
  return files.sort((a, b) => b.length - a.length)[0]!
}

export async function verifyConditions(
  pluginConfig: PluginConfig,
  context: VerifyConditionsContext,
): Promise<void> {
  const root = context.cwd ?? process.cwd()
  const config = withDefaults(pluginConfig)

  const bin = config.haddockCommand[0]
  if (!bin || !(await isOnPath(bin))) {
    throw new SemanticReleaseError(`Cannot find "${bin}" on PATH`, "ENOHADDOCK")
  }

  const versionFiles = await resolveVersionFilePaths(root, config.versionFiles)
  if (versionFiles.length === 0) {
    throw new SemanticReleaseError(
      `No version file matched patterns: ${config.versionFiles.join(", ")}`,
      "ENOVERSIONFILE",
    )
  }

  await resolveBaselinePath(root, config)
}

export async function prepare(pluginConfig: PluginConfig, context: PrepareContext): Promise<void> {
  const root = context.cwd ?? process.cwd()
  const config = withDefaults(pluginConfig)
  const version = toPvp(context.nextRelease.version, config.pvp)

  const versionFiles = await resolveVersionFilePaths(root, config.versionFiles)
  for (const file of versionFiles) await updateVersion(file, version)

  const [haddockBin, ...haddockArgs] = config.haddockCommand
  const haddockResult = await execFileAsync(haddockBin!, haddockArgs, {
    cwd: root,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (haddockResult.stdout) context.logger.log(haddockResult.stdout)
  if (haddockResult.stderr) context.logger.log(haddockResult.stderr)

  const hoogleFile = await findHoogleFile(join(root, config.haddockOutputDir))
  const keys = parseHoogle(await readFile(hoogleFile, "utf8"))

  const baselinePath = await resolveBaselinePath(root, config)
  const baseline = await readBaseline(baselinePath)

  for (const key of keys.filter((key) => !baseline.has(key))) {
    const [, name] = key.match(/\.([^.]*)$/) ?? []
    if (!name) continue
    const file = join(root, config.srcDir, `${key.slice(0, key.lastIndexOf(".")).replaceAll(".", "/")}.hs`)
    if (!(await pathExists(file))) throw new Error(`Cannot locate module source for ${key}`)
    const source = await readFile(file, "utf8")
    if (isLocalDeclaration(source, name)) {
      await writeFile(file, addSince(source, name, version))
      context.logger.log(`Annotated ${key} with @since ${version}`)
    }
  }

  await mkdir(dirname(baselinePath), { recursive: true })
  await writeFile(baselinePath, `${keys.join("\n")}\n`)

  const [buildBin, ...buildArgs] = config.buildCommand
  const buildResult = await execFileAsync(buildBin!, buildArgs, { cwd: root, maxBuffer: 10 * 1024 * 1024 })
  if (buildResult.stdout) context.logger.log(buildResult.stdout)
  if (buildResult.stderr) context.logger.log(buildResult.stderr)
}
