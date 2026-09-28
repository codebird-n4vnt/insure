import { AlertCircle } from 'lucide-react';

/** Inline error next to the control that failed (success feedback goes through toasts). */
export function ErrorBanner({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-start gap-3 mt-3 p-3 rounded-[10px] bg-error-container text-on-error-container text-[13px]" role="alert">
      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{msg}</span>
    </div>
  );
}
