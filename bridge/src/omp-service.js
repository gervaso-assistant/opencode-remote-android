import { randomUUID } from "node:crypto"

function toEpoch(value) {
  const epoch = Date.parse(value ?? "")
  return Number.isFinite(epoch) ? epoch : Date.now()
}

function sessionView(session, status = "idle") {
  return {
    id: session.sessionId,
    title: session.title || "Mobile session",
    directory: session.cwd,
    time: { created: toEpoch(session.updatedAt), updated: toEpoch(session.updatedAt) },
    summary: { additions: 0, deletions: 0, files: 0 },
    model: undefined,
    status
  }
}

export class OmpService {
  #acp
  #sessions = new Map()
  #messages = new Map()
  #todos = new Map()
  #configOptions = new Map()
  #active = new Set()
  #listeners = new Set()

  constructor(acp) {
    this.#acp = acp
    acp.on("notification", (notification) => this.#handleNotification(notification))
  }

  subscribe(listener) {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async listSessions(directory) {
    const sessions = await this.#acp.listSessions()
    for (const session of sessions) this.#sessions.set(session.sessionId, session)
    return sessions
      .filter((session) => !directory || session.cwd === directory)
      .map((session) => sessionView(session, this.#active.has(session.sessionId) ? "busy" : "idle"))
  }

  async createSession({ directory, title, model }) {
    await this.#acp.start()
    const result = await this.#acp.request("session/new", { cwd: directory, mcpServers: [] })
    this.#rememberConfigOptions(result.sessionId, result.configOptions)
    const session = {
      sessionId: result.sessionId,
      cwd: directory,
      title: title || "Mobile session",
      updatedAt: new Date().toISOString(),
      _meta: { messageCount: 0 }
    }
    this.#sessions.set(session.sessionId, session)
    this.#messages.set(session.sessionId, [])
    this.#todos.set(session.sessionId, [])
    if (model) await this.setModel(session.sessionId, model)
    this.#emit("session.created", session.sessionId)
    return sessionView(session)
  }

  async messages(sessionID) {
    await this.#load(sessionID)
    return this.#messages.get(sessionID) ?? []
  }

  async todos(sessionID) {
    await this.#load(sessionID)
    return this.#todos.get(sessionID) ?? []
  }

  async models(sessionID) {
    await this.#load(sessionID)
    const option = this.#configOptions.get(sessionID)?.find((item) => item.id === "model")
    return option?.options?.map((candidate) => ({ ...candidate, currentValue: candidate.value === option.currentValue })) ?? []
  }

  async setModel(sessionID, model) {
    await this.#load(sessionID)
    const option = this.#configOptions.get(sessionID)?.find((item) => item.id === "model")
    if (!option?.options?.some((candidate) => candidate.value === model)) {
      throw new Error(`OMP model is not available: ${model}`)
    }
    await this.#acp.request("session/set_config_option", { sessionId: sessionID, configId: "model", value: model })
    option.currentValue = model
  }

  async prompt(sessionID, text, model) {
    await this.#load(sessionID)
    if (model) await this.setModel(sessionID, model)
    if (this.#active.has(sessionID)) throw new Error("The OMP session is already running")
    this.#active.add(sessionID)
    this.#emit("session.updated", sessionID)
    void this.#acp.request("session/prompt", {
      sessionId: sessionID,
      prompt: [{ type: "text", text }]
    }, 300_000).catch((error) => {
      this.#emit("session.error", sessionID, { message: error.message })
    }).finally(() => {
      this.#active.delete(sessionID)
      this.#emit("session.updated", sessionID)
    })
  }

  abort(sessionID) {
    this.#acp.notify("session/cancel", { sessionId: sessionID })
    this.#emit("session.updated", sessionID)
  }

  status(sessionID) {
    return { type: this.#active.has(sessionID) ? "busy" : "idle" }
  }

  async #load(sessionID) {
    if (this.#messages.has(sessionID)) return
    if (!this.#sessions.has(sessionID)) await this.listSessions()
    const session = this.#sessions.get(sessionID)
    if (!session) throw new Error("OMP session not found")
    this.#messages.set(sessionID, [])
    this.#todos.set(sessionID, [])
    const result = await this.#acp.request("session/load", { sessionId: sessionID, cwd: session.cwd, mcpServers: [] }, 300_000)
    this.#rememberConfigOptions(sessionID, result.configOptions)
  }

  #rememberConfigOptions(sessionID, configOptions) {
    if (Array.isArray(configOptions)) this.#configOptions.set(sessionID, configOptions)
  }

  #handleNotification({ method, params }) {
    if (method !== "session/update" || !params?.sessionId || !params.update) return
    const { sessionId, update } = params
    const session = this.#sessions.get(sessionId)
    if (session) session.updatedAt = new Date().toISOString()
    if (update.sessionUpdate === "plan") {
      const todos = update.entries.map((entry, index) => ({
        id: `${sessionId}:${index}`,
        content: entry.content,
        status: entry.status,
        priority: entry.priority ?? "medium"
      }))
      this.#todos.set(sessionId, todos)
      this.#emit("todo.updated", sessionId)
      return
    }
    if (update.sessionUpdate !== "user_message_chunk" && update.sessionUpdate !== "agent_message_chunk") return
    if (update.content?.type !== "text" || !update.content.text) return
    const role = update.sessionUpdate === "user_message_chunk" ? "user" : "assistant"
    const messageID = update.messageId ?? randomUUID()
    const messages = this.#messages.get(sessionId) ?? []
    this.#messages.set(sessionId, messages)
    let message = messages.find((item) => item.info.id === messageID)
    if (!message) {
      message = {
        info: { id: messageID, role, sessionID: sessionId, time: { created: Date.now() } },
        parts: [{ id: `${messageID}:text`, type: "text", text: "" }]
      }
      messages.push(message)
    }
    message.parts[0].text += update.content.text
    this.#emit("message.updated", sessionId)
  }

  #emit(type, sessionId, extra = {}) {
    const event = { type, sessionId, ...extra }
    for (const listener of this.#listeners) listener(event)
  }
}
