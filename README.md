# semantic-release-haddock-since

A [semantic-release](https://semantic-release.gitbook.io/) plugin for Haskell packages. On each
release it bumps the package version, rebuilds the Haddock docs, diffs the exported API against a
checked-in baseline, and inserts `-- @since` annotations on declarations that are new in this
release.

| Step | Description |
|---|---|
| `verifyConditions` | Checks the build tool is on `PATH` and that the version file and API baseline resolve. |
| `prepare` | Writes the version, runs Haddock, annotates new declarations, updates the baseline, rebuilds. |

## Install

```bash
npm install --save-dev semantic-release-haddock-since
```

## Usage

```json
{
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "semantic-release-haddock-since",
    ["@semantic-release/git", { "assets": ["*.cabal", "package.yaml", "api/*.api", "src/**/*.hs"] }]
  ]
}
```

Place it before `@semantic-release/git` so the version bump, the refreshed baseline and the new
`@since` comments are all committed as part of the release.

## Options

| Option | Default | Description |
|---|---|---|
| `versionFiles` | `["package.yaml", "*.cabal"]` | Files whose `version:` line is rewritten. A single `*` wildcard is supported. |
| `baseline` | `api/<package>.api` | Sorted list of exported names from the previous release. Derived from the `.cabal` filename. |
| `srcDir` | `"src"` | Root the module hierarchy is resolved against, so `My.Module` maps to `src/My/Module.hs`. |
| `haddockCommand` | `["stack", "haddock", "--no-haddock-deps"]` | Command producing the Hoogle `.txt` file. |
| `buildCommand` | `["stack", "build"]` | Command run after annotating, to prove the package still compiles. |
| `haddockOutputDir` | `".stack-work"` | Directory searched for the generated Hoogle file. |
| `pvp` | `true` | Map the semantic version to a PVP one, so `1.2.3` becomes `0.1.2.3`. Set to `false` to write `1.2.3` unchanged. |

For a Cabal-only project:

```json
["semantic-release-haddock-since", {
  "versionFiles": ["*.cabal"],
  "haddockCommand": ["cabal", "haddock", "--haddock-hoogle"],
  "buildCommand": ["cabal", "build"],
  "haddockOutputDir": "dist-newstyle"
}]
```

## How the baseline works

The baseline file is the API surface of the *previous* release. Anything in the newly generated
Hoogle output that is absent from it is new, and gets a `@since` comment. Declarations that are
re-exported from another module are skipped, since they are not defined locally.

The first release has no baseline, so every export is treated as new. If that is not what you want,
generate a baseline by hand before the first run.

Existing `@since` annotations are never duplicated or overwritten. A declaration with a Haddock
comment block gets the annotation appended to that block; one without gets a new `-- | @since`
block.

## Development

```bash
npm test    # type-check and run the unit tests
npm run build
```

## Licence

BSD-3-Clause. See [LICENSE](LICENSE).
