import { contextBridge, ipcRenderer } from "electron"
import { Channels, type ScopeBotBridge } from "./bridge.ts"

const bridge: ScopeBotBridge = {
  getServerStatus: () => ipcRenderer.invoke(Channels.serverStatus),
  setTheme: (theme) => ipcRenderer.invoke(Channels.theme, theme),
  getBusiness: () => ipcRenderer.invoke(Channels.getBusiness),
  saveBusiness: (business) => ipcRenderer.invoke(Channels.saveBusiness, business),
  listAgents: () => ipcRenderer.invoke(Channels.listAgents),
  listLastMessages: () => ipcRenderer.invoke(Channels.listLastMessages),
  createAgent: (input) => ipcRenderer.invoke(Channels.createAgent, input),
  updateAgent: (id, settings) => ipcRenderer.invoke(Channels.updateAgent, id, settings),
  removeAgent: (id) => ipcRenderer.invoke(Channels.removeAgent, id),
  pinAgent: (id, pinned) => ipcRenderer.invoke(Channels.pinAgent, id, pinned),
  search: (query) => ipcRenderer.invoke(Channels.search, query),
  listConversations: (id) => ipcRenderer.invoke(Channels.listConversations, id),
  createConversation: (id) => ipcRenderer.invoke(Channels.createConversation, id),
  renameConversation: (id, conversationId, title) =>
    ipcRenderer.invoke(Channels.renameConversation, id, conversationId, title),
  removeConversation: (id, conversationId) => ipcRenderer.invoke(Channels.removeConversation, id, conversationId),
  listMessages: (id, conversationId) => ipcRenderer.invoke(Channels.listMessages, id, conversationId),
  sendMessage: (id, conversationId, text, images) =>
    ipcRenderer.invoke(Channels.sendMessage, id, conversationId, text, images),
  askAgent: (id, conversationId, text) => ipcRenderer.invoke(Channels.askAgent, id, conversationId, text),
  listActions: (id) => ipcRenderer.invoke(Channels.listActions, id),
  getChatState: (id, conversationId) => ipcRenderer.invoke(Channels.getChatState, id, conversationId),
  resumeAgent: (id, conversationId) => ipcRenderer.invoke(Channels.resumeAgent, id, conversationId),
  listModels: () => ipcRenderer.invoke(Channels.listModels),
  getPreferences: () => ipcRenderer.invoke(Channels.getPreferences),
  savePreferences: (preferences) => ipcRenderer.invoke(Channels.savePreferences, preferences),
  saveProviderKey: (id, input) => ipcRenderer.invoke(Channels.saveProviderKey, id, input),
  removeProviderKey: (id) => ipcRenderer.invoke(Channels.removeProviderKey, id),
  loginProvider: (id) => ipcRenderer.invoke(Channels.loginProvider, id)
}

contextBridge.exposeInMainWorld("scopeBot", bridge)
