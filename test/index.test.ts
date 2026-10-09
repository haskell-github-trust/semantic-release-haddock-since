import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { prepare } from "../src/index.js"

test("prepare creates the missing api directory for the baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "haddock-since-"))
  await writeFile(join(root, "foo.cabal"), "name: foo\nversion: 0.0.0\n")
  await mkdir(join(root, ".stack-work/doc/html/foo"), { recursive: true })
  await writeFile(join(root, ".stack-work/doc/html/foo/foo.txt"), "@package foo 0.0.0\nmodule Foo\n")

  await prepare(
    { haddockCommand: ["true"], buildCommand: ["true"] },
    { cwd: root, logger: { log() {} }, nextRelease: { version: "1.0.0" } },
  )

  assert.equal(await readFile(join(root, "api/foo.api"), "utf8"), "\n")
})

test("prepare updates version files in subdirectories and at the root", async () => {
  const root = await mkdtemp(join(tmpdir(), "haddock-since-"))
  await writeFile(join(root, "foo.cabal"), "name: foo\nversion: 0.0.0\n")
  await mkdir(join(root, "sub"))
  await writeFile(join(root, "sub/package.yaml"), "name: x\nversion: 0.0.0\n")
  await writeFile(join(root, "sub/x.cabal"), "name: x\nversion: 0.0.0\n")
  await mkdir(join(root, ".stack-work/doc/html/foo"), { recursive: true })
  await writeFile(join(root, ".stack-work/doc/html/foo/foo.txt"), "@package foo 0.0.0\nmodule Foo\n")

  await prepare(
    {
      versionFiles: ["sub/package.yaml", "sub/*.cabal", "*.cabal", "missing/*.cabal"],
      haddockCommand: ["true"],
      buildCommand: ["true"],
    },
    { cwd: root, logger: { log() {} }, nextRelease: { version: "1.0.0" } },
  )

  for (const file of ["foo.cabal", "sub/package.yaml", "sub/x.cabal"]) {
    assert.match(await readFile(join(root, file), "utf8"), /^version: 0\.1\.0\.0$/m)
  }
})
