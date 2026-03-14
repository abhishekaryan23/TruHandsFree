import { useEffect, useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'

import CaptureHost from './CaptureHost'
import { FloatingWidget } from './FloatingWidget'
import { SetupIcon, SkillsIcon, WindowCloseIcon, WindowMinimizeIcon, BrandMark } from './components/BrandIcons'
import { SettingsView } from './SettingsView'
import { SkillsManager } from './SkillsManager'

function AppShell() {
  const [platform, setPlatform] = useState('darwin')
  const handleMinimize = () => window.windowControls?.minimize()
  const handleClose = () => window.windowControls?.close()
  const isMac = platform === 'darwin'

  useEffect(() => {
    let mounted = true

    window.windowControls?.getPlatform?.().then((nextPlatform) => {
      if (mounted && nextPlatform) {
        setPlatform(nextPlatform)
      }
    })

    return () => {
      mounted = false
    }
  }, [])

  return (
    <div className="workspace-shell flex h-full w-full flex-col overflow-hidden">
      <div className="workspace-titlebar soft-divider border-b">
        <div className={`titlebar-drag flex h-[74px] items-center justify-between gap-4 pr-4 ${isMac ? 'pl-[88px]' : 'px-4'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className="workspace-brand-chip flex h-10 w-10 items-center justify-center rounded-[14px]">
              <BrandMark size={24} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold tracking-[-0.02em] text-text-primary">TruHandsFree</div>
              <div className="truncate text-[11px] text-text-secondary">Voice workspace for Dictation and Smart Mode</div>
            </div>
          </div>

          <div className="titlebar-nodrag flex items-center gap-3">
            <div className="workspace-segmented flex items-center gap-1 rounded-full p-1">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'workspace-tab-active text-text-primary'
                      : 'workspace-tab text-text-secondary hover:text-text-primary'
                  }`
                }
              >
                <SetupIcon size={16} />
                Setup
              </NavLink>

              <NavLink
                to="/skills"
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'workspace-tab-active text-text-primary'
                      : 'workspace-tab text-text-secondary hover:text-text-primary'
                  }`
                }
              >
                <SkillsIcon size={16} />
                Skills
              </NavLink>
            </div>

            {!isMac ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleMinimize}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-white/8 hover:text-text-primary"
                  title="Minimize"
                >
                  <WindowMinimizeIcon size={14} />
                </button>
                <button
                  onClick={handleClose}
                  className="flex h-8 w-8 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-semantic-error/20 hover:text-white"
                  title="Close"
                >
                  <WindowCloseIcon size={14} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<SettingsView />} />
          <Route path="/skills" element={<SkillsManager />} />
        </Routes>
      </div>
    </div>
  )
}

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/widget" element={<FloatingWidget />} />
        <Route path="/capture" element={<CaptureHost />} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </HashRouter>
  )
}

export default App
