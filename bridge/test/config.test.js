import assert from "node:assert/strict"
import test from "node:test"
import { parseConfig } from "../src/config.js"

test("defaults to a loopback-only unauthenticated listener", () => {
  assert.deepEqual(parseConfig([], {}), {
    host: "127.0.0.1",
    port: 4097,
    username: "",
    password: "",
    ompBin: "omp",
    roots: [],
    logRequests: false
  })
})

test("requires credentials outside loopback", () => {
  assert.throws(() => parseConfig(["--host", "0.0.0.0"], {}), /required when binding beyond loopback/)
})

test("accepts authenticated LAN configuration and repeated roots", () => {
  const config = parseConfig([
    "--host", "0.0.0.0",
    "--port", "4900",
    "--username", "omp",
    "--password", "secret",
    "--root", "/work/a",
    "--root", "/work/b"
  ], {})
  assert.equal(config.port, 4900)
  assert.deepEqual(config.roots, ["/work/a", "/work/b"])
})

test("enables safe request diagnostics explicitly", () => {
  assert.equal(parseConfig(["--log-requests"], {}).logRequests, true)
  assert.equal(parseConfig([], { OMP_BRIDGE_LOG_REQUESTS: "1" }).logRequests, true)
})
