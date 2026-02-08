## OpenCode Remote v1.0.0

First stable release of **OpenCode Remote**.

### Highlights
- Web-first architecture (React + TypeScript + Vite) packaged as Android APK via Capacitor
- Session management from mobile:
  - view sessions and status (`idle`, `busy`, `retry`)
  - open session details and monitor progress
  - delete sessions
- Prompt and slash-command workflow:
  - single input box
  - automatic slash-command detection when input starts with `/`
  - send with **Enter** (`Shift+Enter` for newline)
- Improved session UX:
  - clearer status and change summaries
  - auto-scroll in message view
  - better waiting/processing indicators
  - context-aware `Stop` action (shown only when relevant)
- Better settings experience:
  - draft config editing
  - explicit `Test` behavior with progress and structured notices
  - config is applied only on `Save`
- In-app Help expanded with multi-section guidance:
  - setup
  - server launch (Windows/macOS/Linux)
  - networking and firewall/NAT notes
  - troubleshooting
  - command reference
- Notification sound on completion:
  - plays **Staplebops 01** when a running session finishes
- App icon integrated in Android build pipeline
- Project now includes **Apache License 2.0** (free for commercial and non-commercial use)

### Build / Distribution
- APK is built through GitHub Actions workflow: **Build Android APK**
- Download artifact: `opencode-remote-debug-apk`

### Notes
- Browser mode may require CORS configuration on the OpenCode server.
- Android APK uses native HTTP and is more robust against browser CORS limitations.
