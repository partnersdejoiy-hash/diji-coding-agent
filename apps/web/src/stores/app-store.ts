import { create } from "zustand";
import { api, User, Workspace, EditorTab, ChatMessage, ChatMode, TerminalOutput, FileNode } from "@/lib/api";

interface AppState {
  user: User | null;
  token: string | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  fileTree: FileNode[];
  tabs: EditorTab[];
  activeTab: string | null;
  chatMessages: ChatMessage[];
  chatMode: ChatMode;
  terminalHistory: TerminalOutput[];
  terminalInput: string;
  isAgentRunning: boolean;
  sidebarWidth: number;
  chatWidth: number;
  terminalHeight: number;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  setFileTree: (tree: FileNode[]) => void;
  openFile: (path: string, content: string, language: string) => void;
  closeTab: (path: string) => void;
  setActiveTab: (path: string | null) => void;
  updateTabContent: (path: string, content: string) => void;
  markTabSaved: (path: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  setChatMode: (mode: ChatMode) => void;
  addTerminalOutput: (output: TerminalOutput) => void;
  setTerminalInput: (input: string) => void;
  setAgentRunning: (running: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  loadWorkspaces: () => Promise<void>;
  loadFileTree: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  token: null,
  workspaces: [],
  currentWorkspace: null,
  fileTree: [],
  tabs: [],
  activeTab: null,
  chatMessages: [],
  chatMode: "CHAT",
  terminalHistory: [],
  terminalInput: "",
  isAgentRunning: false,
  sidebarWidth: 260,
  chatWidth: 380,
  terminalHeight: 200,

  setUser: (user) => set({ user }),
  setToken: (token) => {
    api.setToken(token);
    set({ token });
  },
  setWorkspaces: (workspaces) => set({ workspaces }),
  setCurrentWorkspace: (workspace) => set({ currentWorkspace: workspace }),
  setFileTree: (tree) => set({ fileTree: tree }),

  openFile: (path, content, language) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.path === path);
    if (existing) {
      set({ activeTab: path });
      return;
    }
    set({
      tabs: [...tabs, { path, content, language, isDirty: false }],
      activeTab: path,
    });
  },

  closeTab: (path) => {
    const { tabs, activeTab } = get();
    const newTabs = tabs.filter((t) => t.path !== path);
    set({
      tabs: newTabs,
      activeTab: activeTab === path ? (newTabs[0]?.path ?? null) : activeTab,
    });
  },

  setActiveTab: (path) => set({ activeTab: path }),

  updateTabContent: (path, content) => {
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, content, isDirty: true } : t
      ),
    });
  },

  markTabSaved: (path) => {
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, isDirty: false } : t
      ),
    });
  },

  addChatMessage: (message) =>
    set({ chatMessages: [...get().chatMessages, message] }),

  setChatMessages: (messages) => set({ chatMessages: messages }),
  setChatMode: (mode) => set({ chatMode: mode }),
  addTerminalOutput: (output) =>
    set({ terminalHistory: [...get().terminalHistory, output] }),
  setTerminalInput: (input) => set({ terminalInput: input }),
  setAgentRunning: (running) => set({ isAgentRunning: running }),

  login: async (email, password) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/login", {
      email,
      password,
    });
    api.setToken(res.token);
    set({ token: res.token, user: res.user });
  },

  register: async (email, password, name) => {
    const res = await api.post<{ token: string; user: User }>("/api/auth/register", {
      email,
      password,
      name,
    });
    api.setToken(res.token);
    set({ token: res.token, user: res.user });
  },

  logout: () => {
    api.setToken(null);
    set({
      token: null,
      user: null,
      workspaces: [],
      currentWorkspace: null,
      tabs: [],
      chatMessages: [],
    });
  },

  loadWorkspaces: async () => {
    const res = await api.get<{ workspaces: Workspace[] }>("/api/workspaces");
    set({ workspaces: res.workspaces });
  },

  loadFileTree: async () => {
    const ws = get().currentWorkspace;
    if (!ws) return;
    const res = await api.get<{ tree: FileNode[] }>(
      `/api/workspaces/${ws.id}/files/tree`
    );
    set({ fileTree: res.tree });
  },
}));
