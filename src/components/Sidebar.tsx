import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const navItems = [
  { path: '/', icon: '📊', label: 'Search & Add' },
  { path: '/portfolio', icon: '💼', label: 'Portfolio' },
]

export function Sidebar() {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="fixed left-0 top-0 h-full z-40 flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="w-14 h-full bg-slate-800/90 border-r border-slate-700 flex flex-col items-center py-6 gap-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center rounded-lg text-xl transition-colors ${
                isActive ? 'bg-emerald-600 text-white' : 'hover:bg-slate-700 text-slate-300'
              }`
            }
          >
            {item.icon}
          </NavLink>
        ))}
      </div>
      {hovered && (
        <div className="w-48 bg-slate-800/95 border-r border-slate-700 py-6 flex flex-col gap-1 animate-in fade-in duration-150">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-300 hover:bg-slate-700/50'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}
