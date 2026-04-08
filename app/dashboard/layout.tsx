import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from '@/components/LogoutButton'
import { NavLink } from '@/components/NavLink'
import type { RoleType } from '@/types'

function getNavLinks(role: RoleType, pendingCount: number) {
  const links = [
    { href: '/dashboard', label: '📊 Overview', exact: true },
    { href: '/dashboard/words', label: '📚 Words' },
    { href: '/dashboard/sources', label: '📄 Sources' },
    { href: '/dashboard/contributions', label: pendingCount > 0 ? `📤 Contributions (${pendingCount})` : '📤 Contributions' },
    { href: '/dashboard/subsets', label: '🏷️ Subsets' },
    { href: '/dashboard/duplicates', label: '🔍 Find Duplicates' },
    { href: '/dashboard/merges', label: '🔗 Merge History' },
  ]

  if (role === 'admin') {
    links.push({ href: '/dashboard/users', label: '👥 Users' })
  }

  links.push({ href: '/dashboard/settings', label: '⚙️ Settings' })

  return links
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  // Get teacher profile
  const { data: teacher } = await supabase
    .from('teachers')
    .select('name, role')
    .eq('id', user.id)
    .single()

  const role = (teacher?.role || 'contributor') as RoleType

  // Get pending contribution count for editors/admins
  let pendingCount = 0
  if (role === 'admin' || role === 'editor') {
    const { count } = await supabase
      .from('contributions')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingCount = count || 0
  }

  const navLinks = getNavLinks(role, pendingCount)

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
        {/* Logo */}
        <div className="p-5 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">🐙</span>
            <div>
              <div className="text-sm font-bold text-gray-900">OctoPrep</div>
              <div className="text-xs text-gray-400">Vocab Database</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navLinks.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} exact={link.exact} />
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-900 truncate">
            {teacher?.name || user.email}
          </div>
          <div className="text-xs text-gray-400 capitalize mb-3">
            {role}
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
