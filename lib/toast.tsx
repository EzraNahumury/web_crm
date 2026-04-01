'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'delete';

interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info';
  confirmText?: string;
  cancelText?: string;
}

interface ToastCtx {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  deleted: (title: string, message?: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<ToastCtx>({
  success: () => {}, error: () => {}, warning: () => {},
  info: () => {}, deleted: () => {}, confirm: () => Promise.resolve(false),
});

export const useToast = () => useContext(Ctx);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const addToast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ctx: ToastCtx = {
    success: (t, m) => addToast('success', t, m),
    error: (t, m) => addToast('error', t, m),
    warning: (t, m) => addToast('warning', t, m),
    info: (t, m) => addToast('info', t, m),
    deleted: (t, m) => addToast('delete', t, m),
    confirm: (options) => new Promise(resolve => {
      setDialog({ ...options, resolve });
    }),
  };

  function handleConfirm(value: boolean) {
    dialog?.resolve(value);
    setDialog(null);
  }

  const icons: Record<ToastType, ReactNode> = {
    success: (
      <div className="w-10 h-10 rounded-full bg-emerald-500/20 grid place-items-center shrink-0">
        <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
      </div>
    ),
    error: (
      <div className="w-10 h-10 rounded-full bg-red-500/20 grid place-items-center shrink-0">
        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </div>
    ),
    warning: (
      <div className="w-10 h-10 rounded-full bg-amber-500/20 grid place-items-center shrink-0">
        <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
      </div>
    ),
    info: (
      <div className="w-10 h-10 rounded-full bg-blue-500/20 grid place-items-center shrink-0">
        <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
      </div>
    ),
    delete: (
      <div className="w-10 h-10 rounded-full bg-red-500/20 grid place-items-center shrink-0">
        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
      </div>
    ),
  };

  const dialogIcons: Record<string, ReactNode> = {
    danger: (
      <div className="w-14 h-14 rounded-full bg-red-500/15 grid place-items-center mx-auto mb-4">
        <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
      </div>
    ),
    warning: (
      <div className="w-14 h-14 rounded-full bg-amber-500/15 grid place-items-center mx-auto mb-4">
        <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
      </div>
    ),
    info: (
      <div className="w-14 h-14 rounded-full bg-blue-500/15 grid place-items-center mx-auto mb-4">
        <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </div>
    ),
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}

      {/* Toast notifications */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className="pointer-events-auto bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/40 px-5 py-4 flex items-start gap-3.5 min-w-[340px] max-w-[420px] animate-toast-in">
            {icons[t.type]}
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-white">{t.title}</p>
              {t.message && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 mt-0.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {dialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#1a1f35] border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-6 text-center animate-toast-in">
            {dialogIcons[dialog.type || 'danger']}
            <h3 className="text-lg font-bold text-white mb-2">{dialog.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">{dialog.message}</p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => handleConfirm(false)}
                className="px-5 py-2.5 rounded-xl border border-white/10 text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all">
                {dialog.cancelText || 'Batal'}
              </button>
              <button onClick={() => handleConfirm(true)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all ${
                  dialog.type === 'danger' ? 'bg-red-600 hover:bg-red-500' :
                  dialog.type === 'warning' ? 'bg-amber-600 hover:bg-amber-500' :
                  'bg-blue-600 hover:bg-blue-500'
                }`}>
                {dialog.confirmText || 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
