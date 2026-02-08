import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "ai.opencode.remote.web",
  appName: "OpenCode Remote",
  webDir: "dist",
  server: {
    androidScheme: "http",
    cleartext: true
  }
}

export default config
