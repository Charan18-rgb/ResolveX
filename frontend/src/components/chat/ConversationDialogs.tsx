import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";

function Shell(props: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const { title, children, onClose } = props;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function RenameConversationDialog(props: {
  open: boolean;
  initialTitle: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const { open, initialTitle, busy, error, onCancel, onSubmit } = props;
  const [value, setValue] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialTitle);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [open, initialTitle]);

  if (!open) return null;
  const trimmed = value.trim();
  const valid = trimmed.length > 0 && trimmed !== initialTitle.trim();

  return (
    <Shell title="Rename conversation" onClose={busy ? () => {} : onCancel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSubmit(trimmed);
        }}
      >
        <label htmlFor="rename-conv" className="mb-1 block text-xs font-medium text-slate-600">
          Conversation title
        </label>
        <input
          id="rename-conv"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={120}
          disabled={busy}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-cyan-500 disabled:opacity-60"
        />
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-40"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Shell>
  );
}

export function DeleteConversationDialog(props: {
  open: boolean;
  title: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { open, title, busy, error, onCancel, onConfirm } = props;
  if (!open) return null;
  return (
    <Shell title="Delete conversation" onClose={busy ? () => {} : onCancel}>
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
          <Trash2 size={16} />
        </div>
        <p className="text-sm text-slate-600">
          Delete <span className="font-medium text-slate-900">“{title}”</span>? This permanently
          removes the conversation and its messages. This cannot be undone.
        </p>
      </div>
      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </Shell>
  );
}
