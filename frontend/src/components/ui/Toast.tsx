'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, ExternalLink, Info, Loader2, X } from 'lucide-react';
import { explorerTx } from '@/lib/anchor';

export type ToastKind = 'pending' | 'success' | 'error' | 'info';
export interface ToastInput {
  kind: ToastKind;
  title: string;
  body?: string;
  sig?: string;
  href?: { label: string; url: string };
}
interface Toast extends ToastInput {
  id: number;
}

interface ToastApi {
  show: (t: ToastInput) => number;
  update: (id: number, t: ToastInput) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}

const ICONS = {
  pending: <Loader2 className="w-5 h-5 animate-spin text-primary" />,
  success: <CheckCircle className="w-5 h-5 text-green-700" />,
  error: <AlertCircle className="w-5 h-5 text-error" />,
  info: <Info className="w-5 h-5 text-primary" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      if (kind !== 'pending') timers.current.set(id, setTimeout(() => dismiss(id), kind === 'error' ? 10_000 : 7_000));
    },
    [dismiss]
  );

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-3), { ...t, id }]);
      schedule(id, t.kind);
      return id;
    },
    [schedule]
  );

  const update = useCallback(
    (id: number, t: ToastInput) => {
      setToasts((ts) => (ts.some((x) => x.id === id) ? ts.map((x) => (x.id === id ? { ...t, id } : x)) : [...ts, { ...t, id }]));
      schedule(id, t.kind);
    },
    [schedule]
  );

  const api = useMemo(() => ({ show, update, dismiss }), [show, update, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-[100] bottom-4 right-4 left-4 sm:left-auto sm:w-[380px] flex flex-col gap-3 pointer-events-none"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            data-testid={`toast-${t.kind}`}
            className="pointer-events-auto bg-surface-container-lowest border border-outline-variant rounded-[14px] shadow-xl p-4 flex gap-3 items-start"
          >
            <div className="mt-0.5">{ICONS[t.kind]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-on-background">{t.title}</p>
              {t.body && <p className="text-[13px] text-on-surface-variant mt-1 break-words">{t.body}</p>}
              {t.sig && (
                <a href={explorerTx(t.sig)} target="_blank" rel="noopener noreferrer" className="text-[13px] text-primary font-semibold inline-flex items-center gap-1 mt-1 hover:underline">
                  View transaction <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {t.href && (
                <a href={t.href.url} className="text-[13px] text-primary font-semibold inline-flex items-center gap-1 mt-1 hover:underline">
                  {t.href.label}
                </a>
              )}
            </div>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="text-outline hover:text-on-background">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
