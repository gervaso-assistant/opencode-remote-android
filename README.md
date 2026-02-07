# OpenCode Remote (Android)

Android app to control an OpenCode server running on your local network (LAN).

## Features

- monitor active sessions and their status (`idle`, `busy`, `retry`)
- track progress with messages, todos, and diff summary
- send prompts and slash commands to a selected session
- abort a running session from mobile

## Server Requirements

Start OpenCode on your computer with Basic Auth enabled:

```bash
OPENCODE_SERVER_USERNAME=opencode OPENCODE_SERVER_PASSWORD=your-password opencode serve --hostname 0.0.0.0 --port 4096
```

Make sure your phone and computer are connected to the same Wi-Fi network.

## APK Build via GitHub Actions

1. Open the repository on GitHub.
2. Go to **Actions** and run **Build Android APK** (or push to `main`).
3. Download the `opencode-remote-debug-apk` artifact.
4. Install `app-debug.apk` on your Android phone.

No Android SDK installation is required on your local machine.

## App Configuration

In the **Server** tab, set:

- Host: your computer LAN IP (for example `192.168.1.20`)
- Port: `4096` (or your custom OpenCode port)
- Basic Auth username/password used by the OpenCode server

Then tap **Save** and **Test connection**.

## API Endpoints Used

- `/global/health`
- `/event` (SSE)
- `/session`, `/session/status`, `/session/:id`
- `/session/:id/message`, `/session/:id/command`, `/session/:id/abort`
- `/session/:id/todo`, `/session/:id/diff`
