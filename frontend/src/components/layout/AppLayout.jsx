import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

// The Back Office shell. Pages render inside it via `children`, so every
// page automatically gets the sidebar, topbar and consistent padding.
export default function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="layout-wrapper">
      <Sidebar isOpen={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />

      <div
        className={`sidebar-overlay${sidebarOpen ? ' is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Topbar
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
        refreshKey={location.pathname}
      />

      <main className="app-main">{children}</main>
    </div>
  )
}
