import { useEffect, useMemo, useState } from "react"
import { api } from "./api"
import type { MessageEnvelope, ServerConfig, SessionView, TodoItem } from "./types"

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

  const [sessions, setSessions] = useState<SessionView[]>([])
  const [selectedID, setSelectedID] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageEnvelope[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [query, setQuery] = useState("")
  const [composer, setComposer] = useState("")
  const [isCommand, setIsCommand] = useState(false)
  const [loading, setLoading] = useState(false)
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

  function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    setStatusMessage("Configuration saved")
  }

  async function testConnection() {
    setLoading(true)
    setError(null)
    try {
      const health = await api.health(config)
      setStatusMessage(`Connected to OpenCode ${health.version}`)
    } catch (err) {
      setError((err as Error).message)
      setStatusMessage("Connection failed")
    } finally {
      setLoading(false)
    }
  }

  async function refreshSessions() {
    if (!config.host || !config.password) return
    setLoading(true)
    setError(null)
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
    } finally {
      setLoading(false)
    }
  }

  async function loadSelected(sessionID: string, directory: string) {
    setLoading(true)
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
    } finally {
      setLoading(false)
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
      if (isCommand) {
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
    refreshSessions().catch(() => undefined)
    const timer = setInterval(() => {
      refreshSessions().catch(() => undefined)
      if (selectedSession) {
        loadSelected(selectedSession.id, selectedSession.directory).catch(() => undefined)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [config.host, config.password, selectedSession?.id])

  return (
    <div className="app-shell">
      <aside className="panel settings">
        <h1>OpenCode Remote</h1>
        <p className="subtle">Web-first remote control for your LAN server</p>
        <label>
          Host
          <input value={config.host} onChange={(event) => setConfig({ ...config, host: event.target.value })} />
        </label>
        <label>
          Port
          <input
            value={config.port}
            onChange={(event) => setConfig({ ...config, port: Number(event.target.value || 0) })}
          />
        </label>
        <label>
          Username
          <input
            value={config.username}
            onChange={(event) => setConfig({ ...config, username: event.target.value })}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={config.password}
            onChange={(event) => setConfig({ ...config, password: event.target.value })}
          />
        </label>
        <div className="actions">
          <button onClick={saveConfig}>Save</button>
          <button onClick={testConnection} className="secondary">
            Test
          </button>
        </div>
        <p className="status">{statusMessage}</p>
        {error && <p className="error">{error}</p>}
      </aside>

      <section className="panel sessions">
        <div className="header-row">
          <h2>Sessions</h2>
          <button onClick={createSession}>New</button>
        </div>
        <input
          placeholder="Search sessions"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="search"
        />
        {loading && <p className="subtle">Loading...</p>}
        <div className="session-list">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              className={`session-card ${selectedID === session.id ? "active" : ""}`}
              onClick={() => {
                setSelectedID(session.id)
                loadSelected(session.id, session.directory).catch(() => undefined)
              }}
            >
              <div className="header-row">
                <strong>{session.title}</strong>
                <span className={`pill ${session.status}`}>{session.status}</span>
              </div>
              <p>{session.directory}</p>
              <small>
                +{session.additions} / -{session.deletions} | files {session.files}
              </small>
            </button>
          ))}
        </div>
      </section>

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
            .map((message) => (
              <article key={message.info.id} className={`message ${message.info.role}`}>
                <header>
                  <strong>{message.info.role === "user" ? "You" : "OpenCode"}</strong>
                  <small>{formatTime(message.info.time.created)}</small>
                </header>
                <p>{message.text}</p>
              </article>
            ))}
        </div>

        <div className="composer-mode">
          <button className={!isCommand ? "active" : ""} onClick={() => setIsCommand(false)}>
            Prompt
          </button>
          <button className={isCommand ? "active" : ""} onClick={() => setIsCommand(true)}>
            Slash command
          </button>
        </div>

        <div className="composer">
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder={isCommand ? "example: summarize --fast" : "Send a prompt to the selected session"}
          />
          <button onClick={send} disabled={!selectedSession || busySending}>
            {busySending ? "Sending..." : "Send"}
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
