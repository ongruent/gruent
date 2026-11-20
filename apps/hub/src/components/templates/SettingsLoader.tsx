'use client'

import useSettingsStore, { applyTheme } from '@gruent/hub/stores/settingsStore'
import { FC, useEffect, useState } from 'react'

const SettingsLoader: FC = () => {
  const [loaded, setLoaded] = useState(false)

  const loadSettings = useSettingsStore((state) => state.loadSettings)
  const theme = useSettingsStore((state) => state.theme)
  const setTheme = useSettingsStore((state) => state.setTheme)
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed)
  const setShowChannelEditorGrid = useSettingsStore((state) => state.setShowChannelEditorGrid)
  const setShowFeedbackButton = useSettingsStore((state) => state.setShowFeedbackButton)

  useEffect(() => {
    const settings = loadSettings()
    // Load every saved setting, so that saving one doesn't overwrite the others with defaults
    setShowChannelEditorGrid(settings.showChannelEditorGrid)
    setShowFeedbackButton(settings.showFeedbackButton)
    setSidebarCollapsed(settings.sidebarCollapsed)
    setTheme(settings.theme)
    setLoaded(true)
  }, [loadSettings, setTheme, setSidebarCollapsed, setShowChannelEditorGrid, setShowFeedbackButton])

  // The theme is a device setting, so signed-out pages (sign in, sign up, ...) use it too
  useEffect(() => {
    if (!loaded) return
    applyTheme(theme)
  }, [loaded, theme])

  return <></>
}

export default SettingsLoader
