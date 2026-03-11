import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import { VscSettingsGear, VscCode, VscChromeMinimize, VscChromeClose } from 'react-icons/vsc'

import { SettingsView } from './SettingsView'
import { SkillsManager } from './SkillsManager'
import { FloatingWidget } from './FloatingWidget'

// --- Navigation & Layout ---
const Sidebar = () => {
  const location = useLocation()

  const NavItem = ({ to, icon: Icon, label }: { to: string, icon: any, label: string }) => {
    const isActive = location.pathname === to

    return (
      <Link
        to={to}
        title={label}
        className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-200 mb-2
          ${isActive
            ? 'bg-accent-primary/20 text-accent-primary shadow-[0_0_15px_rgba(120,80,255,0.2)]'
            : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
          }`}
      >
        <Icon size={24} />
      </Link>
    )
  }

  return (
    <div className="w-[80px] h-full flex flex-col items-center py-6 border-r border-white/5 glass-panel z-10">
      <div className="mb-8 font-bold text-accent-primary tracking-tighter cursor-default">THF</div>
      <NavItem to="/" icon={VscSettingsGear} label="Settings" />
      <NavItem to="/skills" icon={VscCode} label="Skills" />
    </div>
  )
}

// --- Main Application Shell ---
function MainShell() {
  const handleMinimize = () => window.windowControls?.minimize()
  const handleClose = () => window.windowControls?.close()

  return (
    <div className="flex w-full h-full relative overflow-hidden bg-[rgba(10,15,25,0.95)] backdrop-blur-md rounded-xl border border-white/10 shadow-2xl">
      {/* Titlebar (Draggable) */}
      <div className="absolute top-0 left-0 right-0 h-10 titlebar-drag flex justify-between items-center z-50">
        <div className="ml-4 text-xs font-semibold text-text-muted">TruHandsFree</div>

        {/* Custom Window Controls (Non-Draggable) */}
        <div className="titlebar-nodrag flex h-full">
          <button onClick={handleMinimize} className="w-12 h-full flex items-center justify-center text-text-muted hover:bg-white/10 hover:text-white transition-colors">
            <VscChromeMinimize size={16} />
          </button>
          <button onClick={handleClose} className="w-12 h-full flex items-center justify-center text-text-muted hover:bg-semantic-error hover:text-white transition-colors">
            <VscChromeClose size={16} />
          </button>
        </div>
      </div>

      {/* Content Layout */}
      <div className="flex w-full h-full pt-10">
        <Sidebar />
        <div className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<SettingsView />} />
            <Route path="/skills" element={<SkillsManager />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}

// --- Router Root ---
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/widget" element={<FloatingWidget />} />
        <Route path="/*" element={<MainShell />} />
      </Routes>
    </HashRouter>
  )
}

export default App
