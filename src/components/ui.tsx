"use client";

import {
  useEffect,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import Link from "next/link";

export function Icon({
  name = "arrow",
  size = 20,
}: {
  name?: string;
  size?: number;
}) {
  const paths: Record<string, ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
      </>
    ),
    history: (
      <>
        <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" />
      </>
    ),
    chart: (
      <>
        <path d="M4 3v17h17M8 15l4-5 4 2 5-7" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16M8 4v6M16 14v6" />
      </>
    ),
    run: (
      <>
        <circle cx="15" cy="4" r="2" />
        <path d="m5 10 5-3 4 3 5 1M10 7l-2 7 5 2-1 6M8 14l-5 6" />
      </>
    ),
    pull: (
      <>
        <path d="M3 4h18M6 4v6l6 3 6-3V4M12 13v6M8 22l4-3 4 3" />
        <circle cx="12" cy="8" r="2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 2" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m8 4 12 8-12 8Z" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a5 5 0 0 0 5 5M17 5h4v2a5 5 0 0 1-5 5M12 14v7M8 21h8" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 2v6M17 2v6M3 11h18" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.arrow}
    </svg>
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} className={`button ${variant} ${className}`}>
      {children}
    </button>
  );
}
export function ActionLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link
      className={`button ${secondary ? "secondary" : "primary"}`}
      href={href}
    >
      {children}
    </Link>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "mint" | "warning" | "muted";
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children && <p className="page-description">{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
  icon = "chart",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prior = document.activeElement as HTMLElement | null;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
    return () => {
      if (open) prior?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" />
        </Button>
      </div>
      {children}
    </dialog>
  );
}
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="error-text" role="alert">
      {children}
    </p>
  );
}
