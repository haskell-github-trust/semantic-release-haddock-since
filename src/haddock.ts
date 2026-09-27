export function parseHoogle(input: string): string[] {
  let moduleName = ""
  let inClass = false
  const names = new Set<string>()
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
      if (name) names.add(`${moduleName}.${name[1]}`)
      inClass = true
    } else if (instance) {
      names.add(`${moduleName}.${instance[1].replace(/\s+where.*$/, "").trim()}`)
    } else if (declaration && !line.startsWith("[")) {
      names.add(`${moduleName}.${declaration[1].replace(/^\((.*)\)$/, "$1")}`)
    } else {
      const typeDeclaration = line.match(
        /^(?:data|newtype|type|pattern)\s+(?:family\s+)?([A-Z][A-Za-z0-9_']*)/,
      )
      if (typeDeclaration) names.add(`${moduleName}.${typeDeclaration[1]}`)
    }
  }
  return [...names].sort()
}

export function addSince(source: string, name: string, version: string): string {
  const declaration = name.includes(" ")
    ? new RegExp(`^instance\\s+${escapeRegExp(name)}(?:\\s|$)`, "m")
    : new RegExp(`^${escapeRegExp(name)}\\b`, "m")
  if (new RegExp(`@since\\s+`).test(source)) {
    const match = declaration.exec(source)
    if (match) {
      const before = source.slice(0, match.index)
      const block = before.match(/(?:^--.*\n)+$/)
      if (block?.[0].includes("@since")) return source
    }
  }
  const match = declaration.exec(source)
  if (!match) throw new Error(`Cannot locate public declaration: ${name}`)
  const before = source.slice(0, match.index)
  const block = before.match(/(?:^--.*\n)+$/)
  if (block) {
    return source.slice(0, match.index) + `-- @since ${version}\n` + source.slice(match.index)
  }

  return source.slice(0, match.index) + `-- | @since ${version}\n` + source.slice(match.index)
}

export function isLocalDeclaration(source: string, name: string): boolean {
  if (name.includes(" "))
    return new RegExp(`^instance\\s+${escapeRegExp(name)}(?:\\s|$)`, "m").test(source)
  return new RegExp(
    `^(?:data|newtype|type|class|pattern)\\b[^\\n]*\\b${escapeRegExp(name)}\\b|^${escapeRegExp(name)}\\b`,
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
