import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { HiOutlineSearch, HiOutlineBriefcase, HiOutlineChartBar } from 'react-icons/hi'

const navItems = [
  { path: '/', Icon: HiOutlineSearch, label: 'Search & Add' },
  { path: '/portfolio', Icon: HiOutlineBriefcase, label: 'Portfolio' },
  { path: '/optimization', Icon: HiOutlineChartBar, label: 'Portfolio Optimization' },
]

export function Sidebar() {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="fixed left-0 top-0 h-full z-40 flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="w-14 h-full bg-neutral-900 border-r border-neutral-800 flex flex-col items-center py-6 gap-4">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }: { isActive: boolean }) =>
              `w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                isActive ? 'bg-white text-black' : 'hover:bg-neutral-800 text-neutral-400'
              }`
            }
          >
            <item.Icon className="w-5 h-5" />
          </NavLink>
        ))}
      </div>
      {hovered && (
        <div className="w-48 bg-neutral-900 border-r border-neutral-800 py-6 flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }: { isActive: boolean }) =>
                `px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'text-white bg-neutral-800' : 'text-neutral-400 hover:bg-neutral-800/50'
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
