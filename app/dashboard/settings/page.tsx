import { createClient } from '@/lib/supabase/server'
import { AdminActions } from './admin-actions'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: teacher } = await supabase
    .from('teachers')
    .select('*')
    .eq('id', user!.id)
    .single()

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1 text-sm">Account and system settings</p>
      </div>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Account Info</h2>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-gray-500 w-24">Email</span>
            <span className="text-gray-900 font-medium">{user?.email}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-500 w-24">Name</span>
            <span className="text-gray-900">{teacher?.name || '—'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-500 w-24">Role</span>
            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full capitalize">
              {teacher?.role || 'contributor'}
            </span>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      {teacher?.role === 'admin' && <AdminActions />}
    </div>
  )
}
