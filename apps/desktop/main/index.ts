import { join } from "node:path"
import { Effect } from "effect"
import { app, BrowserWindow, ipcMain } from "electron"
import { Channels, type Theme } from "../preload/bridge.ts"
import { ServerConnection } from "./ServerConnection.ts"

const TITLE_BAR_HEIGHT = 48

const titleBarColors: Record<Theme, { color: string; symbolColor: string }> = {
  light: { color: "#FFFFFF", symbolColor: "#0A0A0A" },
  dark: { color: "#242424", symbolColor: "#FFFFFF" }
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#FFFFFF",
    title: "Scope Bot",
    titleBarStyle: "hidden",
    titleBarOverlay: { ...titleBarColors.light, height: TITLE_BAR_HEIGHT },
    webPreferences: {
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  window.once("ready-to-show", () => window.show())

  // The renderer only ever shows our own page.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(import.meta.dirname, "../renderer/index.html"))
  }
}

const main = Effect.gen(function* () {
  const server = yield* ServerConnection
  yield* Effect.promise(() => app.whenReady())

  ipcMain.handle(Channels.serverStatus, () => Effect.runPromise(server.status))
  ipcMain.handle(Channels.getBusiness, () => Effect.runPromise(server.getBusiness))
  ipcMain.handle(Channels.saveBusiness, (_, business: unknown) => Effect.runPromise(server.saveBusiness(business)))
  ipcMain.handle(Channels.getChatState, (_, id: unknown, conversationId: unknown) =>
    Effect.runPromise(server.getChatState(id, conversationId))
  )
  ipcMain.handle(Channels.resumeAgent, (_, id: unknown, conversationId: unknown) =>
    Effect.runPromise(server.resumeAgent(id, conversationId))
  )
  ipcMain.handle(Channels.listConversations, (_, id: unknown) => Effect.runPromise(server.listConversations(id)))
  ipcMain.handle(Channels.createConversation, (_, id: unknown) => Effect.runPromise(server.createConversation(id)))
  ipcMain.handle(Channels.renameConversation, (_, id: unknown, conversationId: unknown, title: unknown) =>
    Effect.runPromise(server.renameConversation(id, conversationId, title))
  )
  ipcMain.handle(Channels.removeConversation, (_, id: unknown, conversationId: unknown) =>
    Effect.runPromise(server.removeConversation(id, conversationId))
  )
  ipcMain.handle(Channels.listAgents, () => Effect.runPromise(server.listAgents))
  ipcMain.handle(Channels.listLastMessages, () => Effect.runPromise(server.listLastMessages))
  ipcMain.handle(Channels.createAgent, (_, input: unknown) => Effect.runPromise(server.createAgent(input)))
  ipcMain.handle(Channels.updateAgent, (_, id: unknown, settings: unknown) =>
    Effect.runPromise(server.updateAgent(id, settings))
  )
  ipcMain.handle(Channels.removeAgent, (_, id: unknown) => Effect.runPromise(server.removeAgent(id)))
  ipcMain.handle(Channels.pinAgent, (_, id: unknown, pinned: unknown) => Effect.runPromise(server.pinAgent(id, pinned)))
  ipcMain.handle(Channels.search, (_, query: unknown) => Effect.runPromise(server.search(query)))
  ipcMain.handle(Channels.listMessages, (_, id: unknown, conversationId: unknown) =>
    Effect.runPromise(server.listMessages(id, conversationId))
  )
  ipcMain.handle(Channels.sendMessage, (_, id: unknown, conversationId: unknown, text: unknown, images: unknown) =>
    Effect.runPromise(server.sendMessage(id, conversationId, text, images))
  )
  ipcMain.handle(Channels.askAgent, (_, id: unknown, conversationId: unknown, text: unknown) =>
    Effect.runPromise(server.askAgent(id, conversationId, text))
  )
  ipcMain.handle(Channels.listActions, (_, id: unknown) => Effect.runPromise(server.listActions(id)))
  ipcMain.handle(Channels.listModels, () => Effect.runPromise(server.listModels))
  ipcMain.handle(Channels.getPreferences, () => Effect.runPromise(server.getPreferences))
  ipcMain.handle(Channels.savePreferences, (_, preferences: unknown) =>
    Effect.runPromise(server.savePreferences(preferences))
  )
  ipcMain.handle(Channels.saveProviderKey, (_, id: unknown, input: unknown) =>
    Effect.runPromise(server.saveProviderKey(id, input))
  )
  ipcMain.handle(Channels.removeProviderKey, (_, id: unknown) => Effect.runPromise(server.removeProviderKey(id)))
  ipcMain.handle(Channels.loginProvider, (_, id: unknown) => Effect.runPromise(server.loginProvider(id)))

  ipcMain.handle(Channels.theme, (event, theme: unknown) => {
    if (theme !== "light" && theme !== "dark") return
    const window = BrowserWindow.fromWebContents(event.sender)
    if (process.platform === "darwin" || window === null) return
    window.setBackgroundColor(titleBarColors[theme].color)
    window.setTitleBarOverlay({ ...titleBarColors[theme], height: TITLE_BAR_HEIGHT })
  })

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })

  createWindow()

  // Keeps the service layers open for the lifetime of the app.
  yield* Effect.never
})

Effect.runFork(
  main.pipe(
    Effect.provide(ServerConnection.layer),
    Effect.tapCause((cause) => Effect.logError("Desktop app failed to start", cause)),
    Effect.ensuring(Effect.sync(() => app.quit()))
  )
)
