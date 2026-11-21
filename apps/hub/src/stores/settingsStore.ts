import { create } from 'zustand'

export enum Theme {
  light = 'light',
  dark = 'dark',
}

type State = {
  theme: Theme
  showChannelEditorGrid: boolean
  showFeedbackButton: boolean
  sidebarCollapsed: boolean
}

type Action = {
  loadSettings: () => Settings
  setTheme: (theme: Theme) => void
  setShowChannelEditorGrid: (showChannelEditorGrid: boolean) => void
  setShowFeedbackButton: (showFeedbackButton: boolean) => void
  setSidebarCollapsed: (sidebarCollapsed: boolean) => void
}

type Settings = State

const DefaultSettings: Settings = {
  theme: Theme.light,
  showChannelEditorGrid: true,
  showFeedbackButton: true,
  sidebarCollapsed: false,
}

const updateSettingsLocalStorage = (settings: Settings) => {
  const settingsLocalStorage = {
    theme: settings.theme,
    showChannelEditorGrid: settings.showChannelEditorGrid,
    showFeedbackButton: settings.showFeedbackButton,
    sidebarCollapsed: settings.sidebarCollapsed,
  }

  localStorage.setItem('settings', JSON.stringify(settingsLocalStorage))
}

const loadSettingsLocalStorage = () => {
  const settingsLocalStorage = localStorage.getItem('settings')

  // Initialize local storage settings if none are found
  if (!settingsLocalStorage) {
    updateSettingsLocalStorage(DefaultSettings)
    return DefaultSettings
  }

  // Fill in settings added after the user's settings were first saved
  const settings = {
    ...DefaultSettings,
    ...(JSON.parse(settingsLocalStorage) as Partial<Settings>),
  }
  return settings
}

/** Applies the theme to the document. Dark mode styles key off the `data-theme` attribute. */
export const applyTheme = (theme: Theme) => {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

const useSettingsStore = create<State & Action>((set, get) => ({
  ...DefaultSettings,
  loadSettings: loadSettingsLocalStorage,
  setTheme: (theme) => {
    set({ theme })
    if (typeof document !== 'undefined') applyTheme(theme)
    const currentState = get()
    updateSettingsLocalStorage(currentState)
  },
  setShowChannelEditorGrid: (showChannelEditorGrid) => {
    set({ showChannelEditorGrid })
    const currentState = get()
    updateSettingsLocalStorage(currentState)
  },
  setShowFeedbackButton: (showFeedbackButton) => {
    set({ showFeedbackButton })
    const currentState = get()
    updateSettingsLocalStorage(currentState)
  },
  setSidebarCollapsed: (sidebarCollapsed) => {
    set({ sidebarCollapsed })
    const currentState = get()
    updateSettingsLocalStorage(currentState)
  },
}))

export default useSettingsStore
