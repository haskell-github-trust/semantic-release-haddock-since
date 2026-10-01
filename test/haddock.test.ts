import assert from "node:assert/strict"
import test from "node:test"
import { parseHoogle, addSince, isLocalDeclaration, toPvp } from "../src/haddock.js"

test("toPvp maps a semantic version to four PVP components", () => {
  assert.equal(toPvp("1.2.3"), "0.1.2.3")
  assert.equal(toPvp("1.2.3-beta.1"), "0.1.2.3")
  assert.throws(() => toPvp("1.2"))
})

test("toPvp can be disabled to return the plain semantic version", () => {
  assert.equal(toPvp("1.2.3", false), "1.2.3")
})

test("parseHoogle finds declarations and instances, excluding indirect exports", () => {
  const hoogle = `@package effectful-monad-logger 0.1.1
module Effectful.Logger
type LoggerIO = Loc -> IO ()
runLoggerWith :: IOE :> es => LoggerIO -> Eff (Logger : es) a -> Eff es a
instance MonadLogger (Eff es)
[LoggerLog] :: Loc -> LogSource -> LogLevel -> LogStr -> Logger m ()
class MonadLogger m where {
  monadLoggerLog :: m ()
}
`
  assert.deepEqual(parseHoogle(hoogle), ["Effectful.Logger.LoggerIO", "Effectful.Logger.MonadLogger", "Effectful.Logger.MonadLogger (Eff es)", "Effectful.Logger.runLoggerWith"])
})

test("addSince adds an annotation to an existing Haddock block", () => {
  const source = "-- | Runs the logger.\nrunLoggerWith :: LoggerIO -> a\n"
  assert.equal(addSince(source, "runLoggerWith", "0.1.1"), "-- | Runs the logger.\n--\n-- @since 0.1.1\nrunLoggerWith :: LoggerIO -> a\n")
})

test("addSince reuses a trailing blank comment line as paragraph separator", () => {
  const source = "-- | Runs the logger.\n--\nrunLoggerWith :: LoggerIO -> a\n"
  assert.equal(addSince(source, "runLoggerWith", "0.1.1"), "-- | Runs the logger.\n--\n-- @since 0.1.1\nrunLoggerWith :: LoggerIO -> a\n")
})

test("addSince creates a Haddock block when absent", () => {
  assert.equal(addSince("runLoggerWith :: LoggerIO -> a\n", "runLoggerWith", "0.1.1"), "-- | @since 0.1.1\nrunLoggerWith :: LoggerIO -> a\n")
})

test("addSince locates instances", () => {
  assert.equal(addSince("instance MonadLogger (Eff es)\n", "MonadLogger (Eff es)", "0.1.1"), "-- | @since 0.1.1\ninstance MonadLogger (Eff es)\n")
})

test("addSince locates GADT data declarations", () => {
  const source = "data Cache k v :: Effect where\n  Insert :: k -> v -> Cache k v m ()\n"
  assert.equal(addSince(source, "Cache", "0.1.1"), `-- | @since 0.1.1\n${source}`)
})

test("addSince locates newtype declarations", () => {
  assert.equal(addSince("newtype Key = Key Int\n", "Key", "0.1.1"), "-- | @since 0.1.1\nnewtype Key = Key Int\n")
})

test("addSince locates type synonyms", () => {
  assert.equal(addSince("type LoggerIO = IO ()\n", "LoggerIO", "0.1.1"), "-- | @since 0.1.1\ntype LoggerIO = IO ()\n")
})

test("addSince locates classes with a context", () => {
  const source = "class (Monad m) => MonadCache m where\n"
  assert.equal(addSince(source, "MonadCache", "0.1.1"), `-- | @since 0.1.1\n${source}`)
})

test("addSince distinguishes primed names", () => {
  const source = "insert' :: a\ninsert' = x\n\ninsert :: a\ninsert = x\n"
  const primed = addSince(source, "insert'", "0.1.1")
  assert.equal(primed, "-- | @since 0.1.1\ninsert' :: a\ninsert' = x\n\ninsert :: a\ninsert = x\n")
  assert.equal(
    addSince(primed, "insert", "0.1.1"),
    "-- | @since 0.1.1\ninsert' :: a\ninsert' = x\n\n-- | @since 0.1.1\ninsert :: a\ninsert = x\n",
  )
})

test("addSince ignores type instances", () => {
  const source = "type instance DispatchOf (Cache k v) = Dynamic\n\ndata Cache k v :: Effect where\n"
  assert.equal(
    addSince(source, "Cache", "0.1.1"),
    "type instance DispatchOf (Cache k v) = Dynamic\n\n-- | @since 0.1.1\ndata Cache k v :: Effect where\n",
  )
})

test("addSince is idempotent", () => {
  const once = addSince("module M where\n\ndata Cache k v :: Effect where\n", "Cache", "0.1.1")
  assert.equal(addSince(once, "Cache", "0.1.2"), once)
})

test("addSince appends to an existing Haddock block below other code", () => {
  assert.equal(
    addSince("module M where\n\n-- | A cache.\ndata Cache k v :: Effect where\n", "Cache", "0.1.1"),
    "module M where\n\n-- | A cache.\n--\n-- @since 0.1.1\ndata Cache k v :: Effect where\n",
  )
})

test("addSince ignores Haddock blocks separated by a blank line", () => {
  assert.equal(
    addSince("-- | @since 0.1.0\nfoo = x\n-- note\n\nbar = y\n", "bar", "0.1.1"),
    "-- | @since 0.1.0\nfoo = x\n-- note\n\n-- | @since 0.1.1\nbar = y\n",
  )
})

test("re-exported declarations are not local since candidates", () => {
  const source = "module M (module Control.Monad.Logger, runLoggerWith) where\n\nrunLoggerWith :: LoggerIO -> a\n"
  assert.equal(isLocalDeclaration(source, "logInfoN"), false)
  assert.equal(isLocalDeclaration(source, "runLoggerWith"), true)
})
