'use client';

import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  lightDismiss?: boolean;
  showCloseButton?: boolean;
}

/**
 * Accessible modal dialog built on the native HTML <dialog> element (showModal()).
 * Provides top-layer rendering, inert background, Esc dismissal, focus restoration,
 * and overscroll-behavior containment without manual focus-trap hacks.
 */
export function ModalDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidthClass = 'max-w-lg',
  lightDismiss = true,
  showCloseButton = true,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedOutsideRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    const handleClose = () => {
      dialog.returnValue = '';
      if (open) onClose();
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
    };
  }, [onClose, open]);

  // Fallback for browsers without <dialog closedby="any"> (e.g. Safari)
  const isPointerOutside = (e: React.PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: lightDismiss ? 'any' : 'closerequest' } as Record<string, string>)}
      onPointerDown={(e) => {
        if (!lightDismiss || !dialogRef.current) return;
        pressedOutsideRef.current = isPointerOutside(e, dialogRef.current);
      }}
      onPointerUp={(e) => {
        if (!lightDismiss || !dialogRef.current) return;
        if (pressedOutsideRef.current && isPointerOutside(e, dialogRef.current)) {
          onClose();
        }
        pressedOutsideRef.current = false;
      }}
      className={`m-auto w-[calc(100%-2rem)] ${maxWidthClass} rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <h1 id={titleId} className="text-base font-bold text-slate-900">
            {title}
          </h1>
          {subtitle && <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p>}
        </div>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="max-h-[75dvh] overflow-y-auto px-5 py-4">{children}</div>

      {footer && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
}

/**
 * Accessible confirmation dialog replacing native window.confirm().
 * Puts autofocus on the safe Cancel action when variant is 'danger'.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'danger',
  busy = false,
}: ConfirmDialogProps) {
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidthClass="max-w-md"
      lightDismiss={!busy}
      footer={
        <>
          <button
            type="button"
            autoFocus={variant === 'danger'}
            disabled={busy}
            onClick={onClose}
            className="h-9 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus={variant === 'primary'}
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`h-9 rounded-xl px-4 text-xs font-bold text-white shadow-xs transition disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-[#1553A2] hover:bg-[#0F3F80]'
            }`}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-700">{message}</p>
    </ModalDialog>
  );
}
