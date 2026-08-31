import { NavLink } from 'react-router-dom'

// Nav definition lives in data, not JSX, so adding a page is a one-line change.
const NAV_SECTIONS = [
  {
    label: 'Manage',
    items: [
      { to: '/', icon: 'ri-instagram-line', label: 'Instagram Login', end: true },
      { to: '/accounts', icon: 'ri-user-3-line', label: 'Accounts' },
      { to: '/media', icon: 'ri-image-2-line', label: 'Media Library' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/jobs', icon: 'ri-list-check-2', label: 'Background Jobs' },
      { to: '/settings', icon: 'ri-settings-3-line', label: 'Settings' },
    ],
  },
]

export default function Sidebar({ isOpen, onNavigate }) {
  return (
    <div className={`app-sidebar${isOpen ? ' is-open' : ''}`}>
      <div className="app-sidebar__brand">
        <i className="ri-instagram-line" />
        <span>Media Manager</span>
      </div>

      <ul className="app-sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <li key={section.label}>
            <div className="app-sidebar__section">{section.label}</div>
            <ul className="list-unstyled mb-0">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `app-sidebar__link${isActive ? ' is-active' : ''}`
                    }
                  >
                    <i className={item.icon} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
