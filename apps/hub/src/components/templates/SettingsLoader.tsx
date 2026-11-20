'use client'

import useAuth from '@gruent/hub/hooks/useAuth'
import useSettingsStore, { applyTheme, Theme } from '@gruent/hub/stores/settingsStore'
import { FC, useEffect, useState } from 'react'

const SettingsLoader: FC = () => {
  const { accessToken } = useAuth()
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

  // Signed-out pages (sign in, sign up, ...) always use the light theme
  useEffect(() => {
    if (!loaded) return
    applyTheme(accessToken ? theme : Theme.light)
  }, [loaded, theme, accessToken])

  return <></>
}

export default SettingsLoader
