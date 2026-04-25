import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import Accounts from './pages/Accounts'
import Income from './pages/Income'
import Expenses from './pages/Expenses'
import SocialSecurity from './pages/SocialSecurity'
import RentalProperties from './pages/RentalProperties'
import Scenarios from './pages/Scenarios'
import Simulator from './pages/Simulator'
import Comparison from './pages/Comparison'
import TaxPlanning from './pages/TaxPlanning'
import './App.css'

const NAV_ITEMS = [
  { path: '/dashboard',       label: 'Overview',    glyph: '∑'  },
  { path: '/profile',         label: 'Profile',     glyph: 'ID' },
  { path: '/accounts',        label: 'Accounts',    glyph: '$'  },
  { path: '/income',          label: 'Income',      glyph: '↑'  },
  { path: '/expenses',        label: 'Expenses',    glyph: '↓'  },
  { path: '/social-security', label: 'Soc / Sec',  glyph: 'SS' },
  { path: '/rental',          label: 'Property',    glyph: '⌂'  },
  { path: '/scenarios',       label: 'Scenarios',   glyph: 'Δ'  },
  { path: '/simulator',       label: 'Simulate',    glyph: '∿'  },
  { path: '/compare',         label: 'Compare',     glyph: '≈'  },
  { path: '/tax-planning',    label: 'Tax Opt.',    glyph: '%'  },
]

function AppShell() {
  const location = useLocation()
  const fullBleed = location.pathname === '/dashboard' || location.pathname === '/'
  return (
      <div className="app-container">
        <nav className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-wordmark">/ <span>RET</span>_PLANNER</div>
            <div className="sidebar-model">v2.0</div>
          </div>
          <ul className="nav-list">
            {NAV_ITEMS.map((item, i) => (
              <li key={item.path}>
                {i === 1 && <div className="nav-divider" />}
                {i === 7 && <div className="nav-divider" />}
                <NavLink
                  to={item.path}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                >
                  <span className="nav-glyph">{item.glyph}</span>
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className={`main-content${fullBleed ? ' no-pad' : ''}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"       element={<Dashboard />} />
            <Route path="/profile"         element={<Profile />} />
            <Route path="/accounts"        element={<Accounts />} />
            <Route path="/income"          element={<Income />} />
            <Route path="/expenses"        element={<Expenses />} />
            <Route path="/social-security" element={<SocialSecurity />} />
            <Route path="/rental"          element={<RentalProperties />} />
            <Route path="/scenarios"       element={<Scenarios />} />
            <Route path="/simulator"       element={<Simulator />} />
            <Route path="/compare"         element={<Comparison />} />
            <Route path="/tax-planning"    element={<TaxPlanning />} />
          </Routes>
        </main>
      </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}

export default App
