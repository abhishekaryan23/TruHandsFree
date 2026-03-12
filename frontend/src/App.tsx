import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'

import { FloatingWidget } from './FloatingWidget'
import { SetupIcon, SkillsIcon, WindowCloseIcon, WindowMinimizeIcon, BrandMark } from './components/BrandIcons'
import { SettingsView } from './SettingsView'
import { SkillsManager } from './SkillsManager'

function AppShell() {
  const handleMinimize = () => window.windowControls?.minimize()
  const handleClose = () => window.windowControls?.close()

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(6,15,24,0.98),rgba(3,9,15,0.96))] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
      <div className="titlebar-drag relative flex h-12 items-center justify-between border-b border-white/6 bg-[linear-gradient(180deg,rgba(10,24,35,0.88),rgba(5,14,22,0.72))] px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-accent-primary/20 bg-accent-primary/10 text-accent-primary shadow-[0_0_20px_rgba(18,222,230,0.2)]">
            <BrandMark size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-text-primary">TruHandsFree</div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-text-muted">Voice Workspace</div>
          </div>
        </div>

        <div className="titlebar-nodrag flex items-center gap-1.5">
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
      </div>

      <div className="border-b border-white/6 px-4 py-3">
        <div className="titlebar-nodrag flex items-center gap-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'border-accent-primary/25 bg-accent-primary/12 text-accent-primary shadow-[0_0_20px_rgba(18,222,230,0.12)]'
                  : 'border-white/6 bg-white/[0.02] text-text-secondary hover:border-white/10 hover:bg-white/[0.04] hover:text-text-primary'
              }`
            }
          >
            <SetupIcon size={16} />
            Setup
          </NavLink>

          <NavLink
            to="/skills"
            className={({ isActive }) =>
              `inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition-all ${
                isActive
                  ? 'border-accent-primary/25 bg-accent-primary/12 text-accent-primary shadow-[0_0_20px_rgba(18,222,230,0.12)]'
                  : 'border-white/6 bg-white/[0.02] text-text-secondary hover:border-white/10 hover:bg-white/[0.04] hover:text-text-primary'
              }`
            }
          >
            <SkillsIcon size={16} />
            Skills
          </NavLink>
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
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </HashRouter>
  )
}

export default App
