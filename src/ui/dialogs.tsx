// In-app dialogs replacing window.prompt/confirm/alert: promise-shaped, so
// call sites read like the natives (`if (await confirmDialog(...))`), but
// they render inside the page, focus-trap, and close on Esc.

import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';

interface DialogRequest {
  kind: 'confirm' | 'text' | 'notice';
  title?: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  placeholder?: string;
  initial?: string;
  /** For text dialogs the string (null = cancelled); for confirm a boolean. */
  resolve: (value: string | boolean | null) => void;
}

const current = signal<DialogRequest | null>(null);

export function confirmDialog(message: string, opts?: { title?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    current.value = {
      kind: 'confirm',
      message,
      title: opts?.title,
      confirmLabel: opts?.confirmLabel ?? 'OK',
      danger: opts?.danger,
      resolve: (v) => resolve(v === true),
    };
  });
}

export function textDialog(message: string, opts?: { title?: string; confirmLabel?: string; placeholder?: string; initial?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    current.value = {
      kind: 'text',
      message,
      title: opts?.title,
      confirmLabel: opts?.confirmLabel ?? 'OK',
      placeholder: opts?.placeholder,
      initial: opts?.initial,
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    };
  });
}

/** An error or FYI the reader must see; replaces alert(). */
export function notice(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    current.value = { kind: 'notice', message, title, confirmLabel: 'Close', resolve: () => resolve() };
  });
}

/** Surface a rejected store call — the server's refusal, message intact. */
export const oops = (e: unknown): void => {
  void notice(e instanceof Error ? e.message : String(e));
};

export function Dialogs() {
  const req = current.value;
  const inputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!req) return;
    (req.kind === 'text' ? inputRef.current : primaryRef.current)?.focus();
    inputRef.current?.select();
  }, [req]);

  if (!req) return null;

  const close = (value: string | boolean | null): void => {
    current.value = null;
    req.resolve(value);
  };
  const submit = (): void => {
    if (req.kind === 'text') close(inputRef.current?.value ?? '');
    else close(true);
  };
  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') close(req.kind === 'confirm' ? false : null);
    if (ev.key === 'Enter' && req.kind !== 'notice') {
      ev.preventDefault();
      submit();
    }
    // a minimal trap: Tab cycles within the card
    if (ev.key === 'Tab' && cardRef.current) {
      const focusables = cardRef.current.querySelectorAll<HTMLElement>('button, input');
      const list = [...focusables];
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = ev.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i + 1) % list.length;
      list[next]?.focus();
      ev.preventDefault();
    }
  };

  return (
    <div class="dialog-veil" onKeyDown={onKey} onClick={(ev) => ev.target === ev.currentTarget && close(req.kind === 'confirm' ? false : null)}>
      <div class="dialog-card" role="dialog" aria-modal="true" ref={cardRef}>
        {req.title && <h3>{req.title}</h3>}
        <p class="dialog-message">{req.message}</p>
        {req.kind === 'text' && <input ref={inputRef} placeholder={req.placeholder} defaultValue={req.initial} maxLength={200} />}
        <div class="dialog-acts">
          {req.kind !== 'notice' && (
            <button class="quiet" onClick={() => close(req.kind === 'confirm' ? false : null)}>
              Cancel
            </button>
          )}
          <button ref={primaryRef} class={req.danger ? 'danger' : 'primary'} onClick={submit}>
            {req.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
