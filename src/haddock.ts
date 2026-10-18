export interface HoogleEntry {
  module: string
  name: string
  key: string
  instance: boolean
}

export function parseHoogle(input: string): HoogleEntry[] {
  let moduleName = ""
  let inClass = false
  const entries = new Map<string, HoogleEntry>()
  const add = (name: string, instance = false) => {
    const key = `${moduleName}.${name}`
    entries.set(key, { module: moduleName, name, key, instance })
  }
  for (const line of input.split(/\r?\n/)) {
    const moduleMatch = line.match(/^module\s+([A-Za-z0-9_.']+)/)
    if (moduleMatch) {
      moduleName = moduleMatch[1]
      inClass = false
      continue
    }
    if (inClass) {
      if (line.trim() === "}") inClass = false
      continue
    }
    const declaration = line.match(/^(?:\[)?([A-Za-z_][A-Za-z0-9_']*|\([^)]*\))\s+::/)
    const instance = line.match(/^instance\s+(.+)/)
    const classDeclaration = line.match(/^class\s+(.+?)\s+where\s*\{/)
    if (classDeclaration) {
      const name = classDeclaration[1].match(/(?:^|\s)([A-Z][A-Za-z0-9_']*)/)
      if (name) add(name[1])
      inClass = true
    } else if (instance) {
      add(instance[1].replace(/\s+where.*$/, "").trim(), true)
    } else if (declaration && !line.startsWith("[")) {
      add(declaration[1].replace(/^\((.*)\)$/, "$1"))
    } else {
      const typeDeclaration = line.match(
        /^(?:data|newtype|type|pattern)\s+(?:family\s+)?([A-Z][A-Za-z0-9_']*)/,
      )
      if (typeDeclaration) add(typeDeclaration[1])
    }
  }
  return [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

export function addSince(source: string, name: string, version: string): string {
  const declaration = new RegExp(
    `^(?:(?:data|type)(?:\\s+family)?\\s+|newtype\\s+|class\\s+(?:[^\\n=]*=>\\s*)?|pattern\\s+)?${escapeRegExp(name)}(?![A-Za-z0-9_'])`,
    "m",
  )
  if (new RegExp(`@since\\s+`).test(source)) {
    const match = declaration.exec(source)
    if (match) {
      const before = source.slice(0, match.index)
      const block = before.match(/(?:^--.*\n)+(?![\s\S])/m)
      if (block?.[0].includes("@since")) return source
    }
  }
  const match = declaration.exec(source)
  if (!match) throw new Error(`Cannot locate public declaration: ${name}`)
  const before = source.slice(0, match.index)
  const block = before.match(/(?:^--.*\n)+(?![\s\S])/m)
  if (block) {
    const separator = /(?:^|\n)--[ \t]*\n$/.test(block[0]) ? "" : "--\n"
    return (
      source.slice(0, match.index) +
      `${separator}-- @since ${version}\n` +
      source.slice(match.index)
    )
  }

  return source.slice(0, match.index) + `-- | @since ${version}\n` + source.slice(match.index)
}

export function isLocalDeclaration(source: string, name: string): boolean {
  return new RegExp(
    `^(?:data|newtype|type|class|pattern)\\b[^\\n]*\\b${escapeRegExp(name)}(?![A-Za-z0-9_'])|^${escapeRegExp(name)}(?![A-Za-z0-9_'])`,
    "m",
  ).test(source)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function toPvp(version: string, enabled = true): string {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) throw new Error(`Not a semantic version: ${version}`)
  return enabled ? `0.${match[1]}.${match[2]}.${match[3]}` : `${match[1]}.${match[2]}.${match[3]}`
}
