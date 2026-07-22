import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import path from "node:path"
import test from "node:test"
import { createBridgeServer } from "../src/server.js"

class FakeAcp extends EventEmitter {
  agentInfo = { version: "17.0.7" }
  starts = 0

  async start() {
    this.starts += 1
  }

  async listSessions() {
    return [{ sessionId: "session-1", title: "Test", cwd: process.cwd(), updatedAt: "2026-07-22T00:00:00.000Z" }]
  }

  async request() {
    return {}
  }

  notify() {}
}

async function startServer(options = {}) {
  const acp = new FakeAcp()
  const server = createBridgeServer({
    acp,
    config: {
      host: "127.0.0.1",
      port: 0,
      username: "omp",
      password: "secret",
      roots: [process.cwd()],
      ...options
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  return {
    acp,
    baseURL: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function authHeaders() {
  return { authorization: `Basic ${Buffer.from("omp:secret").toString("base64")}` }
}

test("requires Basic Auth before exposing bridge endpoints", async () => {
  const bridge = await startServer()
  try {
    const response = await fetch(`${bridge.baseURL}/global/health`)
    assert.equal(response.status, 401)
    assert.equal(response.headers.get("www-authenticate"), 'Basic realm="OMP Bridge"')
  } finally {
    await bridge.close()
  }
})

test("serves health and OpenCode-compatible sessions with authentication", async () => {
  const bridge = await startServer()
  try {
    const health = await fetch(`${bridge.baseURL}/global/health`, { headers: authHeaders() })
    assert.deepEqual(await health.json(), { healthy: true, backend: "omp", version: "17.0.7" })
    const sessions = await fetch(`${bridge.baseURL}/session`, { headers: authHeaders() })
    const body = await sessions.json()
    assert.equal(body.length, 1)
    assert.equal(body[0].id, "session-1")
    assert.equal(body[0].status, "idle")
  } finally {
    await bridge.close()
  }
})

test("confines file browsing to configured roots", async () => {
  const bridge = await startServer()
  try {
    const allowed = await fetch(`${bridge.baseURL}/file?path=${encodeURIComponent(process.cwd())}`, { headers: authHeaders() })
    assert.equal(allowed.status, 200)
    const outside = await fetch(`${bridge.baseURL}/file?path=${encodeURIComponent(path.dirname(process.cwd()))}`, { headers: authHeaders() })
    assert.equal(outside.status, 400)
    assert.match((await outside.json()).error, /configured --root boundary/)
  } finally {
    await bridge.close()
  }
})
