'use client';
import { useState } from 'react';

type SettingTab = 'whatsapp' | 'users' | 'roles';

const MENU_ITEMS = ['Dashboard','Orders','Work Orders','Produksi','Laporan','Stok','Settings','Master Data'];

export default function SettingPage() {
  const [tab, setTab] = useState<SettingTab>('whatsapp');
  const [waEnabled, setWaEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [menuChecks, setMenuChecks] = useState<Record<string, boolean>>({});

  const tabs: { key: SettingTab; label: string; icon: React.ReactNode }[] = [
    { key: 'whatsapp', label: 'Notifikasi WhatsApp', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg> },
    { key: 'users', label: 'Kelola Users', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg> },
    { key: 'roles', label: 'Kelola Roles', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg> },
  ];

  const inputCls = 'w-full bg-[#0d1117] border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/40 transition-colors';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Pengaturan Sistem</h1>
        <p className="text-sm text-slate-400 mt-1">Kelola preferensi, akses, dan konfigurasi sistem.</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/[0.06]">
        <div className="flex gap-0">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'text-white border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: WhatsApp ── */}
      {tab === 'whatsapp' && (
        <div className="rounded-xl bg-[#111827] border border-white/[0.06] p-6 space-y-6 max-w-3xl">
          <h2 className="text-lg font-bold text-white">Pengaturan Notifikasi WhatsApp</h2>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Aktifkan Notifikasi WhatsApp</p>
              <p className="text-xs text-slate-500 mt-0.5">Kirim notifikasi otomatis ke customer melalui WhatsApp</p>
            </div>
            <button onClick={() => setWaEnabled(!waEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${waEnabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${waEnabled ? 'left-[22px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* API Token */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">API Token (Fonnte)</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} placeholder="Masukkan API token dari Fonnte" className={inputCls} />
              <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Dapatkan API token dari <span className="text-blue-400">fonnte.com</span></p>
          </div>

          {/* Nomor Pengirim */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Nomor Pengirim</label>
            <input type="text" placeholder="628xxx" className={inputCls} />
            <p className="text-xs text-slate-500 mt-1">Format: 628xxx (tanpa +, tanpa spasi)</p>
          </div>

          {/* Template */}
          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Template Pesan Order Baru</label>
            <textarea rows={8} className={`${inputCls} resize-none font-mono text-xs leading-relaxed`}
              defaultValue={`Halo {nama},\n\nOrder Anda telah diterima!\n\nDetail Order:\n• No. Order: {noOrder}\n• Paket: {paket}\n• Qty: {qty} pcs\n• Status: Sedang Diproses`} />
            <p className="text-xs text-slate-500 mt-1">
              Variabel yang tersedia: <code className="text-blue-400">{'{nama}'}</code>, <code className="text-blue-400">{'{noOrder}'}</code>, <code className="text-blue-400">{'{paket}'}</code>, <code className="text-blue-400">{'{qty}'}</code>, <code className="text-blue-400">{'{deadline}'}</code>, <code className="text-blue-400">{'{status}'}</code>
            </p>
          </div>
        </div>
      )}

      {/* ── Tab: Users ── */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setUserModal(true)}
              className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Tambah User
            </button>
          </div>

          <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden max-w-3xl">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Nama','Email','Role','Status','Aksi'].map(h => (
                    <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.04]">
                  <td className="px-5 py-4 text-sm text-white font-medium">Super Admin</td>
                  <td className="px-5 py-4 text-sm text-slate-400">admin@gmail.com</td>
                  <td className="px-5 py-4 text-sm text-slate-300">Super Admin</td>
                  <td className="px-5 py-4"><span className="text-xs font-medium text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full">Aktif</span></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button className="text-slate-500 hover:text-amber-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>
                      <button className="text-slate-500 hover:text-red-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Roles ── */}
      {tab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setRoleModal(true)}
              className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Tambah Role
            </button>
          </div>

          <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden max-w-3xl">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Nama Role','Deskripsi','Tipe Akses','Hak Akses','Aksi'].map(h => (
                    <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/[0.04]">
                  <td className="px-5 py-4 text-sm font-medium text-white">Super Admin</td>
                  <td className="px-5 py-4 text-sm text-slate-400">Full access to all features</td>
                  <td className="px-5 py-4"><span className="text-xs font-medium text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-full">Super Admin</span></td>
                  <td className="px-5 py-4 text-sm text-slate-300">Semua Akses</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5">
                      <button className="text-slate-500 hover:text-amber-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg></button>
                      <button className="text-slate-500 hover:text-red-400 transition-colors p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Tambah User ── */}
      {userModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setUserModal(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Tambah User Baru</h3>
              <button onClick={() => setUserModal(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Isi informasi user di bawah ini. Pastikan email yang digunakan valid.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Nama Lengkap</label>
                <input type="text" placeholder="Masukkan nama lengkap..." className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Email</label>
                <input type="email" placeholder="email@example.com" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Password</label>
                <div className="relative">
                  <input type="password" placeholder="Minimal 6 karakter" className={inputCls} />
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Role / Peran</label>
                <select className={`${inputCls} appearance-none cursor-pointer`}>
                  <option value="">Pilih Role</option>
                  <option value="superadmin">Super Admin</option>
                  <option value="admin">Admin</option>
                  <option value="cs">Customer Service</option>
                  <option value="produksi">Produksi</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setUserModal(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={() => setUserModal(false)}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Simpan User</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Tambah Role ── */}
      {roleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRoleModal(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">Tambah Role Baru</h3>
              <button onClick={() => setRoleModal(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Tentukan nama role dan berikan hak akses menu yang sesuai.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Nama Role</label>
                <input type="text" placeholder="Contoh: Manajer Produksi" className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Deskripsi (Opsional)</label>
                <textarea rows={3} placeholder="Deskripsi singkat role ini..." className={`${inputCls} resize-none`} />
              </div>

              {/* Super Admin toggle */}
              <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white">Akses Super Admin</p>
                  <p className="text-xs text-slate-500 mt-0.5">Memberikan akses penuh ke semua fitur aplikasi.</p>
                </div>
                <button className="relative w-11 h-6 rounded-full bg-slate-700 transition-colors">
                  <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" />
                </button>
              </div>

              {/* Menu Checkboxes */}
              <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <p className="text-sm font-medium text-white mb-3">Hak Akses Menu</p>
                <div className="grid grid-cols-2 gap-3">
                  {MENU_ITEMS.map(m => (
                    <label key={m} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox" checked={menuChecks[m] || false}
                        onChange={e => setMenuChecks(prev => ({ ...prev, [m]: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0" />
                      <span className="text-sm text-slate-300">{m}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setRoleModal(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={() => setRoleModal(false)}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors">Simpan Role</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
