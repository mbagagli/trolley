import { useLayoutEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
}

/** Present a native modal with protected focus and return focus on close.
 *
 * Use the browser dialog lifecycle to make background content inert while
 * retaining the existing panel appearance and presence transitions.
 *
 * Args:
 *     children: The dialog content.
 *     label: The accessible dialog name.
 *     onClose: The action to run when Escape cancels the dialog.
 * Returns:
 *     JSX.Element: The modal dialog.
 */
export function Modal({ children, label, onClose }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus();
      }
    };
  }, []);

  return (
    <dialog
      aria-label={label}
      className="modal-root"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") event.stopPropagation();
      }}
      ref={ref}
    >{children}</dialog>
  );
}
