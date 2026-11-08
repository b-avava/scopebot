import { join } from "node:path"
import { Effect, Layer } from "effect"
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron"
import { Channels, type Theme } from "../preload/bridge.ts"
import { ServerConnection } from "./ServerConnection.ts"
import { StoredSessionToken } from "./StoredSessionToken.ts"

const TITLE_BAR_HEIGHT = 26

// `color` matches `--title-strip` in the renderer styles.
const titleBarColors: Record<Theme, { color: string; symbolColor: string }> = {
  light: { color: "#ECECEE", symbolColor: "#0A0A0A" },
  dark: { color: "#1C2025", symbolColor: "#FFFFFF" }
}

const createWindow = () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: titleBarColors.light.color,
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
  ipcMain.handle(Channels.getAccount, () => Effect.runPromise(server.getAccount))
  ipcMain.handle(Channels.register, (_, input: unknown) => Effect.runPromise(server.register(input)))
  ipcMain.handle(Channels.login, (_, input: unknown) => Effect.runPromise(server.login(input)))
  ipcMain.handle(Channels.joinTeam, (_, input: unknown) => Effect.runPromise(server.joinTeam(input)))
  ipcMain.handle(Channels.logout, () => Effect.runPromise(server.logout))
  ipcMain.handle(Channels.changePassword, (_, input: unknown) => Effect.runPromise(server.changePassword(input)))
  ipcMain.handle(Channels.listTeam, () => Effect.runPromise(server.listTeam))
  ipcMain.handle(Channels.createInvite, (_, input: unknown) => Effect.runPromise(server.createInvite(input)))
  ipcMain.handle(Channels.removeMember, (_, id: unknown) => Effect.runPromise(server.removeMember(id)))
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
  ipcMain.handle(Channels.listAgentStatuses, () => Effect.runPromise(server.listAgentStatuses))
  ipcMain.handle(Channels.createAgent, (_, input: unknown) => Effect.runPromise(server.createAgent(input)))
  ipcMain.handle(Channels.updateAgent, (_, id: unknown, settings: unknown) =>
    Effect.runPromise(server.updateAgent(id, settings))
  )
  ipcMain.handle(Channels.removeAgent, (_, id: unknown) => Effect.runPromise(server.removeAgent(id)))
  ipcMain.handle(Channels.pinAgent, (_, id: unknown, pinned: unknown) => Effect.runPromise(server.pinAgent(id, pinned)))
  ipcMain.handle(Channels.listContacts, () => Effect.runPromise(server.listContacts))
  ipcMain.handle(Channels.createContact, (_, details: unknown) => Effect.runPromise(server.createContact(details)))
  ipcMain.handle(Channels.updateContact, (_, id: unknown, details: unknown) =>
    Effect.runPromise(server.updateContact(id, details))
  )
  ipcMain.handle(Channels.removeContact, (_, id: unknown) => Effect.runPromise(server.removeContact(id)))
  ipcMain.handle(Channels.listDepartments, () => Effect.runPromise(server.listDepartments))
  ipcMain.handle(Channels.createDepartment, (_, details: unknown) =>
    Effect.runPromise(server.createDepartment(details))
  )
  ipcMain.handle(Channels.updateDepartment, (_, id: unknown, details: unknown) =>
    Effect.runPromise(server.updateDepartment(id, details))
  )
  ipcMain.handle(Channels.removeDepartment, (_, id: unknown) => Effect.runPromise(server.removeDepartment(id)))
  ipcMain.handle(Channels.listPipelines, () => Effect.runPromise(server.listPipelines))
  ipcMain.handle(Channels.updatePipeline, (_, id: unknown, details: unknown) =>
    Effect.runPromise(server.updatePipeline(id, details))
  )
  ipcMain.handle(Channels.listServices, () => Effect.runPromise(server.listServices))
  ipcMain.handle(Channels.createService, (_, details: unknown) => Effect.runPromise(server.createService(details)))
  ipcMain.handle(Channels.updateService, (_, id: unknown, details: unknown) =>
    Effect.runPromise(server.updateService(id, details))
  )
  ipcMain.handle(Channels.removeService, (_, id: unknown) => Effect.runPromise(server.removeService(id)))
  ipcMain.handle(Channels.listActivities, () => Effect.runPromise(server.listActivities))
  ipcMain.handle(Channels.createActivity, (_, input: unknown) => Effect.runPromise(server.createActivity(input)))
  ipcMain.handle(Channels.updateActivity, (_, id: unknown, patch: unknown) =>
    Effect.runPromise(server.updateActivity(id, patch))
  )
  ipcMain.handle(Channels.removeActivity, (_, id: unknown) => Effect.runPromise(server.removeActivity(id)))
  ipcMain.handle(Channels.listApprovals, () => Effect.runPromise(server.listApprovals))
  ipcMain.handle(Channels.decideApproval, (_, id: unknown, decision: unknown) =>
    Effect.runPromise(server.decideApproval(id, decision))
  )
  ipcMain.handle(Channels.previewService, (_, input: unknown) => Effect.runPromise(server.previewService(input)))
  ipcMain.handle(Channels.summarizeContact, (_, id: unknown) => Effect.runPromise(server.summarizeContact(id)))
  ipcMain.handle(Channels.listDeals, () => Effect.runPromise(server.listDeals))
  ipcMain.handle(Channels.createDeal, (_, details: unknown) => Effect.runPromise(server.createDeal(details)))
  ipcMain.handle(Channels.updateDeal, (_, id: unknown, details: unknown) =>
    Effect.runPromise(server.updateDeal(id, details))
  )
  ipcMain.handle(Channels.removeDeal, (_, id: unknown) => Effect.runPromise(server.removeDeal(id)))
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
  ipcMain.handle(Channels.getWhatsApp, () => Effect.runPromise(server.getWhatsApp))
  ipcMain.handle(Channels.saveWhatsAppSettings, (_, settings: unknown) =>
    Effect.runPromise(server.saveWhatsAppSettings(settings))
  )
  ipcMain.handle(Channels.linkWhatsApp, (_, phone: unknown) => Effect.runPromise(server.linkWhatsApp(phone)))
  ipcMain.handle(Channels.cancelWhatsAppLink, () => Effect.runPromise(server.cancelWhatsAppLink))
  ipcMain.handle(Channels.unlinkWhatsApp, () => Effect.runPromise(server.unlinkWhatsApp))
  ipcMain.handle(Channels.listWhatsAppChats, () => Effect.runPromise(server.listWhatsAppChats))
  ipcMain.handle(Channels.listWhatsAppMessages, (_, chatId: unknown) =>
    Effect.runPromise(server.listWhatsAppMessages(chatId))
  )
  ipcMain.handle(Channels.sendWhatsApp, (_, chatId: unknown, text: unknown) =>
    Effect.runPromise(server.sendWhatsApp(chatId, text))
  )
  ipcMain.handle(Channels.sendWhatsAppDraft, (_, id: unknown, text: unknown) =>
    Effect.runPromise(server.sendWhatsAppDraft(id, text))
  )
  ipcMain.handle(Channels.discardWhatsAppDraft, (_, id: unknown) => Effect.runPromise(server.discardWhatsAppDraft(id)))
  ipcMain.handle(Channels.getTelegram, () => Effect.runPromise(server.getTelegram))
  ipcMain.handle(Channels.saveTelegramSettings, (_, settings: unknown) =>
    Effect.runPromise(server.saveTelegramSettings(settings))
  )
  ipcMain.handle(Channels.connectTelegram, (_, token: unknown) => Effect.runPromise(server.connectTelegram(token)))
  ipcMain.handle(Channels.disconnectTelegram, () => Effect.runPromise(server.disconnectTelegram))
  ipcMain.handle(Channels.listTelegramChats, () => Effect.runPromise(server.listTelegramChats))
  ipcMain.handle(Channels.listTelegramMessages, (_, chatId: unknown) =>
    Effect.runPromise(server.listTelegramMessages(chatId))
  )
  ipcMain.handle(Channels.sendTelegram, (_, chatId: unknown, text: unknown) =>
    Effect.runPromise(server.sendTelegram(chatId, text))
  )
  ipcMain.handle(Channels.sendTelegramDraft, (_, id: unknown, text: unknown) =>
    Effect.runPromise(server.sendTelegramDraft(id, text))
  )
  ipcMain.handle(Channels.discardTelegramDraft, (_, id: unknown) => Effect.runPromise(server.discardTelegramDraft(id)))

  ipcMain.handle(Channels.theme, (event, theme: unknown) => {
    if (theme !== "light" && theme !== "dark") return
    // Native parts, such as the list of a select, follow this and not the page.
    nativeTheme.themeSource = theme
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
    Effect.provide(ServerConnection.layer.pipe(Layer.provide(StoredSessionToken))),
    Effect.tapCause((cause) => Effect.logError("Desktop app failed to start", cause)),
    Effect.ensuring(Effect.sync(() => app.quit()))
  )
)
