'use client';
import { useState, useEffect, useCallback } from 'react';
import { dbGet, dbCreate, dbUpdate, dbDelete } from '@/lib/api-db';
import { useToast } from '@/lib/toast';

type SettingTab = 'whatsapp' | 'users' | 'roles';

interface Role {
  id: number;
  nama: string;
  deskripsi: string | null;
  is_super_admin: number;
  menus: string[];
  stage_ids: number[];
}

interface Stage {
  id: number;
  urutan: number;
  nama: string;
}

interface UserRow {
  id: number;
  nama: string;
  email: string;
  role_id: number;
  status: 'aktif' | 'non-aktif';
  role_nama: string;
}

const MENU_ITEMS = ['Dashboard','Orders','Work Orders','Produksi','Laporan','Stok','Settings','Master Data'];

export default function SettingPage() {
  const toast = useToast();
  const [tab, setTab] = useState<SettingTab>('whatsapp');
  const [waEnabled, setWaEnabled] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showUserPassword, setShowUserPassword] = useState(false);

  // ── Users state ──
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModal, setUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState<UserRow | null>(null);
  const [userSaving, setUserSaving] = useState(false);

  // User form state
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRoleId, setUserRoleId] = useState('');
  const [userStatus, setUserStatus] = useState<'aktif' | 'non-aktif'>('aktif');

  // ── Roles state ──
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roleModal, setRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Role | null>(null);
  const [roleSaving, setRoleSaving] = useState(false);

  // Role form state
  const [roleName, setRoleName] = useState('');
  const [roleDesc, setRoleDesc] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [menuChecks, setMenuChecks] = useState<Record<string, boolean>>({});
  const [stageChecks, setStageChecks] = useState<Record<number, boolean>>({});

  // Production stages from DB
  const [prodStages, setProdStages] = useState<Stage[]>([]);

  // ── Fetch users from DB ──
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await dbGet<UserRow>('users');
      setUsers(data);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // ── Fetch roles from DB ──
  const fetchRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await fetch('/api/roles');
      const json = await res.json();
      if (json.success) setRoles(json.data);
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    } finally {
      setRolesLoading(false);
    }
  }, []);

  // ── Fetch production stages ──
  const fetchStages = useCallback(async () => {
    try {
      const data = await dbGet<Stage>('production_stages');
      setProdStages(data.sort((a, b) => a.urutan - b.urutan));
    } catch (err) {
      console.error('Failed to fetch stages:', err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchStages();
  }, [fetchUsers, fetchRoles, fetchStages]);

  // ── User CRUD ──
  const openAddUser = () => {
    setEditingUser(null);
    setUserName('');
    setUserEmail('');
    setUserPassword('');
    setUserRoleId('');
    setUserStatus('aktif');
    setShowUserPassword(false);
    setUserModal(true);
  };

  const openEditUser = (u: UserRow) => {
    setEditingUser(u);
    setUserName(u.nama);
    setUserEmail(u.email);
    setUserPassword('');
    setUserRoleId(String(u.role_id));
    setUserStatus(u.status);
    setShowUserPassword(false);
    setUserModal(true);
  };

  const saveUser = async () => {
    if (!userName.trim() || !userEmail.trim() || !userRoleId) return;
    if (!editingUser && !userPassword) return;
    setUserSaving(true);

    try {
      if (editingUser) {
        const data: Record<string, unknown> = {
          nama: userName.trim(),
          email: userEmail.trim(),
          role_id: Number(userRoleId),
          status: userStatus,
        };
        if (userPassword) data.password = userPassword;
        await dbUpdate('users', editingUser.id, data);
      } else {
        await dbCreate('users', {
          nama: userName.trim(),
          email: userEmail.trim(),
          password: userPassword,
          role_id: Number(userRoleId),
          status: userStatus,
        });
      }
      setUserModal(false);
      fetchUsers();
    } catch (err) {
      console.error('Failed to save user:', err);
    } finally {
      setUserSaving(false);
    }
  };

  const deleteUser = async (u: UserRow) => {
    try {
      await dbDelete('users', u.id);
      setDeleteUserConfirm(null);
      fetchUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
    }
  };

  // ── Open modal for add ──
  const openAddRole = () => {
    setEditingRole(null);
    setRoleName('');
    setRoleDesc('');
    setIsSuperAdmin(false);
    setMenuChecks({});
    setStageChecks({});
    setRoleModal(true);
  };

  // ── Open modal for edit ──
  const openEditRole = (role: Role) => {
    setEditingRole(role);
    setRoleName(role.nama);
    setRoleDesc(role.deskripsi || '');
    setIsSuperAdmin(role.is_super_admin === 1);
    const mc: Record<string, boolean> = {};
    role.menus.forEach(m => { mc[m] = true; });
    setMenuChecks(mc);
    const sc: Record<number, boolean> = {};
    role.stage_ids.forEach(id => { sc[id] = true; });
    setStageChecks(sc);
    setRoleModal(true);
  };

  // ── Save role (create or update) ──
  const saveRole = async () => {
    if (!roleName.trim()) return;
    setRoleSaving(true);

    const selectedMenus = isSuperAdmin
      ? MENU_ITEMS
      : MENU_ITEMS.filter(m => menuChecks[m]);

    const selectedStageIds = isSuperAdmin
      ? []
      : prodStages.filter(s => stageChecks[s.id]).map(s => s.id);

    const body = {
      ...(editingRole ? { id: editingRole.id } : {}),
      nama: roleName.trim(),
      deskripsi: roleDesc.trim() || null,
      is_super_admin: isSuperAdmin,
      menus: selectedMenus,
      stage_ids: selectedStageIds,
    };

    try {
      const res = await fetch('/api/roles', {
        method: editingRole ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setRoleModal(false);
        fetchRoles();
      }
    } catch (err) {
      console.error('Failed to save role:', err);
    } finally {
      setRoleSaving(false);
    }
  };

  // ── Delete role ──
  const deleteRole = async (role: Role) => {
    try {
      const res = await fetch(`/api/roles?id=${role.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        setDeleteConfirm(null);
        fetchRoles();
        toast.deleted('Role Dihapus', `Role "${role.nama}" berhasil dihapus.`);
      } else {
        toast.error('Gagal Hapus Role', json.error || 'Terjadi kesalahan.');
      }
    } catch (err) {
      console.error('Failed to delete role:', err);
      toast.error('Gagal Hapus Role', String(err));
    }
  };

  // Helper: get stage names for a role
  const getStageName = (stageId: number) => prodStages.find(s => s.id === stageId)?.nama || '';

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

          <div>
            <label className="block text-sm font-medium text-white mb-1.5">Nomor Pengirim</label>
            <input type="text" placeholder="628xxx" className={inputCls} />
            <p className="text-xs text-slate-500 mt-1">Format: 628xxx (tanpa +, tanpa spasi)</p>
          </div>

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
            <button onClick={openAddUser}
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
                {usersLoading ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">Memuat data...</td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-slate-500">Belum ada user.</td></tr>
                ) : users.map(u => (
                  <tr key={u.id} className="border-b border-white/[0.04]">
                    <td className="px-5 py-4 text-sm text-white font-medium">{u.nama}</td>
                    <td className="px-5 py-4 text-sm text-slate-400">{u.email}</td>
                    <td className="px-5 py-4 text-sm text-slate-300">{u.role_nama}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        u.status === 'aktif' ? 'text-emerald-400 bg-emerald-500/15' : 'text-red-400 bg-red-500/15'
                      }`}>
                        {u.status === 'aktif' ? 'Aktif' : 'Non-aktif'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditUser(u)} className="text-slate-500 hover:text-amber-400 transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        <button onClick={() => setDeleteUserConfirm(u)} className="text-slate-500 hover:text-red-400 transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab: Roles ── */}
      {tab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={openAddRole}
              className="flex items-center gap-2 border border-white/10 hover:bg-white/[0.04] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Tambah Role
            </button>
          </div>

          <div className="rounded-xl bg-[#111827] border border-white/[0.06] overflow-hidden">
            <table className="w-full table-fixed">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[22%]" />
                <col className="w-[28%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {['Nama Role','Deskripsi','Tipe Akses','Hak Akses Menu','Hak Akses Produksi','Aksi'].map(h => (
                    <th key={h} className="text-[11px] text-slate-500 font-medium text-left px-5 py-3.5 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rolesLoading ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">Memuat data...</td></tr>
                ) : roles.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-500">Belum ada role.</td></tr>
                ) : roles.map(r => (
                  <tr key={r.id} className="border-b border-white/[0.04]">
                    <td className="px-5 py-4 text-sm font-medium text-white">{r.nama}</td>
                    <td className="px-5 py-4 text-sm text-slate-400 truncate">{r.deskripsi || '-'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
                        r.is_super_admin ? 'text-emerald-400 bg-emerald-500/15' : 'text-blue-400 bg-blue-500/15'
                      }`}>
                        {r.is_super_admin ? 'Super Admin' : 'Staff'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300">
                      {r.is_super_admin ? 'Semua Akses' : (r.menus.length > 0 ? r.menus.join(', ') : '-')}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-300">
                      {r.is_super_admin
                        ? 'Semua Tahap'
                        : r.stage_ids.length > 0
                          ? r.stage_ids.map(id => getStageName(id)).filter(Boolean).join(', ')
                          : '-'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEditRole(r)} className="text-slate-500 hover:text-amber-400 transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                        </button>
                        <button onClick={() => setDeleteConfirm(r)} className="text-slate-500 hover:text-red-400 transition-colors p-1">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal: Tambah / Edit User ── */}
      {userModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setUserModal(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">{editingUser ? 'Edit User' : 'Tambah User Baru'}</h3>
              <button onClick={() => setUserModal(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Isi informasi user di bawah ini. Pastikan email yang digunakan valid.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Nama Lengkap</label>
                <input type="text" placeholder="Masukkan nama lengkap..." className={inputCls}
                  value={userName} onChange={e => setUserName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Email</label>
                <input type="email" placeholder="email@example.com" className={inputCls}
                  value={userEmail} onChange={e => setUserEmail(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">
                  Password {editingUser && <span className="text-slate-500 font-normal">(kosongkan jika tidak diubah)</span>}
                </label>
                <div className="relative">
                  <input type={showUserPassword ? 'text' : 'password'}
                    placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 6 karakter'}
                    className={inputCls}
                    value={userPassword} onChange={e => setUserPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowUserPassword(!showUserPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Role / Peran</label>
                <select className={`${inputCls} appearance-none cursor-pointer`}
                  value={userRoleId} onChange={e => setUserRoleId(e.target.value)}>
                  <option value="">Pilih Role</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.nama}</option>
                  ))}
                </select>
              </div>
              {editingUser && (
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Status</label>
                  <select className={`${inputCls} appearance-none cursor-pointer`}
                    value={userStatus} onChange={e => setUserStatus(e.target.value as 'aktif' | 'non-aktif')}>
                    <option value="aktif">Aktif</option>
                    <option value="non-aktif">Non-aktif</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setUserModal(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={saveUser}
                disabled={userSaving || !userName.trim() || !userEmail.trim() || !userRoleId || (!editingUser && !userPassword)}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {userSaving ? 'Menyimpan...' : (editingUser ? 'Simpan Perubahan' : 'Simpan User')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Tambah / Edit Role ── */}
      {roleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setRoleModal(false)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-lg font-bold text-white">{editingRole ? 'Edit Role' : 'Tambah Role Baru'}</h3>
              <button onClick={() => setRoleModal(false)} className="text-slate-500 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-slate-400 mb-6">Tentukan nama role dan berikan hak akses menu yang sesuai.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Nama Role</label>
                <input type="text" placeholder="Contoh: Manajer Produksi" className={inputCls}
                  value={roleName} onChange={e => setRoleName(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Deskripsi (Opsional)</label>
                <textarea rows={3} placeholder="Deskripsi singkat role ini..." className={`${inputCls} resize-none`}
                  value={roleDesc} onChange={e => setRoleDesc(e.target.value)} />
              </div>

              {/* Super Admin toggle */}
              <div className="flex items-center justify-between p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div>
                  <p className="text-sm font-medium text-white">Akses Super Admin</p>
                  <p className="text-xs text-slate-500 mt-0.5">Memberikan akses penuh ke semua fitur aplikasi.</p>
                </div>
                <button type="button" onClick={() => setIsSuperAdmin(!isSuperAdmin)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isSuperAdmin ? 'bg-blue-600' : 'bg-slate-700'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${isSuperAdmin ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Menu Checkboxes + Production Stage sub-checkboxes */}
              {!isSuperAdmin && (
                <div className="p-4 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                  <p className="text-sm font-medium text-white mb-3">Hak Akses Menu</p>
                  <div className="grid grid-cols-2 gap-3">
                    {MENU_ITEMS.map(m => (
                      <div key={m} className={m === 'Produksi' && menuChecks['Produksi'] ? 'col-span-2' : ''}>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input type="checkbox" checked={menuChecks[m] || false}
                            onChange={e => {
                              setMenuChecks(prev => ({ ...prev, [m]: e.target.checked }));
                              if (m === 'Produksi' && !e.target.checked) {
                                setStageChecks({});
                              }
                            }}
                            className="w-4 h-4 rounded border-slate-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0" />
                          <span className="text-sm text-slate-300">{m}</span>
                        </label>

                        {/* Sub-checkboxes: Production Stages — shown under Produksi when checked */}
                        {m === 'Produksi' && menuChecks['Produksi'] && prodStages.length > 0 && (
                          <div className="ml-6 mt-2 pl-3 border-l border-white/[0.06]">
                            <p className="text-xs text-slate-500 mb-2">Tahap produksi yang bisa dikelola (yang tidak dipilih bersifat read-only)</p>
                            <div className="grid grid-cols-2 gap-2">
                              {prodStages.map(s => (
                                <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={stageChecks[s.id] || false}
                                    onChange={e => setStageChecks(prev => ({ ...prev, [s.id]: e.target.checked }))}
                                    className="w-3.5 h-3.5 rounded border-slate-600 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0" />
                                  <span className="text-xs text-slate-400">{s.nama}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button onClick={() => setRoleModal(false)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={saveRole} disabled={roleSaving || !roleName.trim()}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors">
                {roleSaving ? 'Menyimpan...' : (editingRole ? 'Simpan Perubahan' : 'Simpan Role')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Konfirmasi Hapus User ── */}
      {deleteUserConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteUserConfirm(null)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Hapus User</h3>
            <p className="text-sm text-slate-400 mb-6">
              Apakah Anda yakin ingin menghapus user <span className="text-white font-medium">&quot;{deleteUserConfirm.nama}&quot;</span>?
              Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteUserConfirm(null)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={() => deleteUser(deleteUserConfirm)}
                className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors">Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Konfirmasi Hapus Role ── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-[#141a2e] border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-white mb-2">Hapus Role</h3>
            <p className="text-sm text-slate-400 mb-6">
              Apakah Anda yakin ingin menghapus role <span className="text-white font-medium">&quot;{deleteConfirm.nama}&quot;</span>?
              Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)}
                className="px-5 py-2.5 rounded-lg border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors">Batal</button>
              <button onClick={() => deleteRole(deleteConfirm)}
                className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
