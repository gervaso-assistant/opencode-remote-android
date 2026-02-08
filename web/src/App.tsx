import { useEffect, useMemo, useState } from "react"
import { api } from "./api"
import type { CommandInfo, MessageEnvelope, ServerConfig, SessionView, TodoItem } from "./types"

const STORAGE_KEY = "opencode.remote.server"

const defaultConfig: ServerConfig = {
  host: "",
  port: 4096,
  username: "opencode",
  password: ""
}

function formatTime(epoch: number): string {
  if (!epoch) return "-"
  return new Date(epoch).toLocaleString()
}

function extractText(msg: MessageEnvelope): string {
  return msg.parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n")
    .trim()
}

function renderInline(text: string) {
  const chunks = text.split(/(`[^`]+`)/g)
  return chunks.map((chunk, index) => {
    if (chunk.startsWith("`") && chunk.endsWith("`")) {
      return <code key={index}>{chunk.slice(1, -1)}</code>
    }
    return <span key={index}>{chunk}</span>
  })
}

function toDisplayLines(text: string): string[] {
  const normalized = text.includes("\n") ? text : text.replace(/\s-\s(?=\S)/g, "\n- ")
  return normalized
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
}

function App() {
  const [config, setConfig] = useState<ServerConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return defaultConfig
    try {
      return { ...defaultConfig, ...JSON.parse(saved) }
    } catch {
      return defaultConfig
    }
  })

  const [draftConfig, setDraftConfig] = useState<ServerConfig>(config)
  const [connectedVersion, setConnectedVersion] = useState<string>("")
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [view, setView] = useState<"settings" | "sessions" | "detail" | "help">(() => {
    return config.host && config.port > 0 ? "sessions" : "settings"
  })

  const [sessions, setSessions] = useState<SessionView[]>([])
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageEnvelope[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [query, setQuery] = useState("")
  const [composer, setComposer] = useState("")
  const [busySending, setBusySending] = useState(false)
  const [statusMessage, setStatusMessage] = useState("Idle")
  const [error, setError] = useState<string | null>(null)

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedID) ?? null,
    [sessions, selectedID]
  )

  const filteredSessions = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return sessions
    return sessions.filter((session) => {
      return session.title.toLowerCase().includes(text) || session.directory.toLowerCase().includes(text)
    })
  }, [sessions, query])

  const hasConfiguredServer = Boolean(config.host && config.port > 0)

  function saveConfig() {
    setConfig(draftConfig)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draftConfig))
    setStatusMessage("Configuration saved")
    if (draftConfig.host && draftConfig.port > 0) {
      setView("sessions")
    }
  }

  async function testConnection(configToTest: ServerConfig) {
    setError(null)
    try {
      const health = await api.health(configToTest)
      setConnectedVersion(health.version)
      setStatusMessage(`Connected to OpenCode ${health.version}`)
    } catch (err) {
      setError((err as Error).message)
      setStatusMessage("Connection failed")
    }
  }

  async function refreshSessions(silent = false) {
    if (!config.host || !config.password) return
    if (!silent) setError(null)
    try {
      const [items, statuses] = await Promise.all([api.listSessions(config), api.listStatuses(config)])
      const mapped = items
        .map((session) => ({
          id: session.id,
          title: session.title,
          directory: session.directory,
          updated: session.time.updated,
          status: statuses[session.id]?.type ?? "unknown",
          files: session.summary?.files ?? 0,
          additions: session.summary?.additions ?? 0,
          deletions: session.summary?.deletions ?? 0
        }))
        .sort((a, b) => b.updated - a.updated)
      setSessions(mapped)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function loadCommands() {
    if (!config.host || !config.password) return
    try {
      const list = await api.listCommands(config)
      setCommands(list)
    } catch {
      setCommands([])
    }
  }

  async function loadSelected(sessionID: string, directory: string) {
    setError(null)
    try {
      const [msg, todo] = await Promise.all([
        api.loadMessages(config, sessionID, directory),
        api.loadTodo(config, sessionID)
      ])
      setMessages(msg)
      setTodos(todo)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function createSession() {
    try {
      const created = await api.createSession(config, "Mobile session")
      await refreshSessions()
      setSelectedID(created.id)
      await loadSelected(created.id, created.directory)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function send() {
    if (!selectedSession) return
    const text = composer.trim()
    if (!text) return

    setBusySending(true)
    setError(null)
    try {
      if (text.startsWith("/")) {
        const normalized = text.startsWith("/") ? text.slice(1) : text
        const command = normalized.split(" ")[0]?.trim()
        const args = normalized.slice(command.length).trim()
        if (!command) return
        await api.sendCommand(config, selectedSession.id, command, args, selectedSession.directory)
      } else {
        await api.sendPrompt(config, selectedSession.id, text, selectedSession.directory)
      }
      setComposer("")
      await loadSelected(selectedSession.id, selectedSession.directory)
      await refreshSessions()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusySending(false)
    }
  }

  async function deleteSession(sessionID: string) {
    try {
      await api.deleteSession(config, sessionID)
      if (selectedID === sessionID) {
        setSelectedID(null)
        setMessages([])
        setTodos([])
        setView("sessions")
      }
      await refreshSessions(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function abortSession() {
    if (!selectedSession) return
    try {
      await api.abort(config, selectedSession.id)
      await refreshSessions()
      await loadSelected(selectedSession.id, selectedSession.directory)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    if (!config.host || !config.password) return
    refreshSessions(true).catch(() => undefined)
    loadCommands().catch(() => undefined)
    const timer = setInterval(() => {
      refreshSessions(true).catch(() => undefined)
      if (selectedSession) {
        loadSelected(selectedSession.id, selectedSession.directory).catch(() => undefined)
      }
    }, 3500)
    return () => clearInterval(timer)
  }, [config.host, config.password, selectedSession?.id])

  useEffect(() => {
    if (!hasConfiguredServer) {
      setView("settings")
    }
  }, [hasConfiguredServer])

  return (
    <div className="app-shell">
      <header className="top-nav panel">
        <div>
          <h1>OpenCode Remote</h1>
          <p className="subtle">Remote control for your OpenCode server</p>
        </div>
        <div className="tab-row">
          <button className={view === "settings" ? "active" : "secondary"} onClick={() => setView("settings")}>Settings</button>
          <button
            className={view === "sessions" ? "active" : "secondary"}
            onClick={() => setView("sessions")}
            disabled={!hasConfiguredServer}
          >
            Sessions
          </button>
          <button
            className={view === "detail" ? "active" : "secondary"}
            onClick={() => setView("detail")}
            disabled={!selectedSession}
          >
            Detail
          </button>
          <button className={view === "help" ? "active" : "secondary"} onClick={() => setView("help")}>Help</button>
        </div>
      </header>

      {view === "settings" && (
        <section className="panel settings">
          <label>
            Host
            <input value={draftConfig.host} onChange={(event) => setDraftConfig({ ...draftConfig, host: event.target.value })} />
          </label>
          <label>
            Port
            <input
              value={draftConfig.port}
              onChange={(event) => setDraftConfig({ ...draftConfig, port: Number(event.target.value || 0) })}
            />
          </label>
          <label>
            Username
            <input
              value={draftConfig.username}
              onChange={(event) => setDraftConfig({ ...draftConfig, username: event.target.value })}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={draftConfig.password}
              onChange={(event) => setDraftConfig({ ...draftConfig, password: event.target.value })}
            />
          </label>
          <div className="actions">
            <button onClick={saveConfig}>Save</button>
            <button onClick={() => testConnection(draftConfig)} className="secondary">
              Test
            </button>
          </div>
          <p className="status">{statusMessage}</p>
          {connectedVersion && <p className="subtle">Connected version: {connectedVersion}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {view === "sessions" && (
        <section className="panel sessions">
          <div className="header-row">
            <h2>Sessions</h2>
            <div className="inline-actions">
              <button onClick={createSession}>New</button>
              <button className="secondary" onClick={() => refreshSessions(true)}>
                Refresh
              </button>
            </div>
          </div>
          <input
            placeholder="Search sessions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="search"
          />
          <div className="session-list">
            {filteredSessions.map((session) => (
              <article key={session.id} className={`session-card ${selectedID === session.id ? "active" : ""}`}>
                <div className="header-row">
                  <strong>{session.title}</strong>
                  <span className={`pill ${session.status}`}>{session.status}</span>
                </div>
                <p>{session.directory}</p>
                <small>
                  {session.files > 0 || session.additions > 0 || session.deletions > 0
                    ? `changes +${session.additions} / -${session.deletions} · files ${session.files}`
                    : "no tracked changes yet"}
                </small>
                <div className="inline-actions">
                  <button
                    onClick={() => {
                      setSelectedID(session.id)
                      loadSelected(session.id, session.directory).catch(() => undefined)
                      setView("detail")
                    }}
                  >
                    Open
                  </button>
                  <button className="danger" onClick={() => deleteSession(session.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
        </section>
      )}

      {view === "detail" && (
        <main className="panel detail">
          <div className="header-row">
            <h2>{selectedSession ? selectedSession.title : "Select a session"}</h2>
            <button className="danger" onClick={abortSession} disabled={!selectedSession}>
              Stop
            </button>
          </div>

          {selectedSession && (
            <p className="subtle">
              {selectedSession.directory} - updated {formatTime(selectedSession.updated)}
            </p>
          )}

          <div className="todo-box">
            <strong>Todo</strong>
            {todos.length === 0 && <p className="subtle">No todo items</p>}
            {todos.slice(0, 6).map((item) => (
              <p key={item.id}>
                [{item.status}] {item.content}
              </p>
            ))}
          </div>

          <div className="messages">
            {messages
              .map((message) => ({ ...message, text: extractText(message) }))
              .filter((message) => message.text)
              .map((message) => {
                const lines = toDisplayLines(message.text)
                const listMode = lines.filter((line) => line.startsWith("- ")).length >= 2
                return (
                  <article key={message.info.id} className={`message ${message.info.role}`}>
                    <header>
                      <strong>{message.info.role === "user" ? "You" : "OpenCode"}</strong>
                      <small>{formatTime(message.info.time.created)}</small>
                    </header>
                    {listMode ? (
                      <ul>
                        {lines.map((line, index) => (
                          <li key={index}>{renderInline(line.replace(/^-\s*/, ""))}</li>
                        ))}
                      </ul>
                    ) : (
                      lines.map((line, index) => <p key={index}>{renderInline(line)}</p>)
                    )}
                  </article>
                )
              })}
          </div>

          <div className="composer">
            <textarea
              value={composer}
              onChange={(event) => setComposer(event.target.value)}
              placeholder="Type a prompt. If it starts with / it will be sent as a slash command."
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  send().catch(() => undefined)
                }
              }}
            />
            <button onClick={send} disabled={!selectedSession || busySending}>
              {busySending ? "Sending..." : "Send"}
            </button>
          </div>
          {error && <p className="error">{error}</p>}
        </main>
      )}

      {view === "help" && (
        <section className="panel help">
          <h2>Help</h2>
          <p className="subtle">How it works</p>
          <ul>
            <li>Configure host, port and Basic Auth in Settings.</li>
            <li>Open a session from Sessions and send prompts from Detail.</li>
            <li>If input starts with <code>/</code>, the app sends a slash command automatically.</li>
            <li>Press Enter to send, Shift+Enter for new line.</li>
          </ul>

          <h3>Available Slash Commands</h3>
          {commands.length === 0 ? (
            <p className="subtle">No command list returned by server.</p>
          ) : (
            <ul>
              {commands.map((cmd) => (
                <li key={cmd.name}>
                  <strong>/{cmd.name}</strong>
                  {cmd.description ? ` - ${cmd.description}` : ""}
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error">{error}</p>}
        </section>
      )}
    </div>
  )
}

export default App
