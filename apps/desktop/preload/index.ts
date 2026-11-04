import { contextBridge, ipcRenderer } from "electron"
import { Channels, type ScopeBotBridge } from "./bridge.ts"

const bridge: ScopeBotBridge = {
  getServerStatus: () => ipcRenderer.invoke(Channels.serverStatus),
  setTheme: (theme) => ipcRenderer.invoke(Channels.theme, theme),
  getBusiness: () => ipcRenderer.invoke(Channels.getBusiness),
  saveBusiness: (business) => ipcRenderer.invoke(Channels.saveBusiness, business),
  listAgents: () => ipcRenderer.invoke(Channels.listAgents),
  createAgent: (input) => ipcRenderer.invoke(Channels.createAgent, input),
  updateAgent: (id, settings) => ipcRenderer.invoke(Channels.updateAgent, id, settings),
  removeAgent: (id) => ipcRenderer.invoke(Channels.removeAgent, id),
  listMessages: (id) => ipcRenderer.invoke(Channels.listMessages, id),
  sendMessage: (id, text) => ipcRenderer.invoke(Channels.sendMessage, id, text),
  listActions: (id) => ipcRenderer.invoke(Channels.listActions, id),
  getChatState: (id) => ipcRenderer.invoke(Channels.getChatState, id),
  resumeAgent: (id) => ipcRenderer.invoke(Channels.resumeAgent, id)
}

contextBridge.exposeInMainWorld("scopeBot", bridge)
