"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "@/features/workout/provider";
import { createDownload } from "@/lib/backup";
import { rawExport } from "@/lib/storage/repository";
import { Button, Icon } from "./ui";
const nav = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/history", label: "History", icon: "history" },
  { href: "/progress", label: "Progress", icon: "chart" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname(),
    app = useApp();
  const workout = path.startsWith("/workout");
  const [rawError, setRawError] = useState("");
  const [rawLink, setRawLink] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const rawDownload = useRef<ReturnType<typeof createDownload> | null>(null);
  useEffect(
    () => () => {
      rawDownload.current?.release();
    },
    [],
  );
  const navItems = nav.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className={`nav-item ${(item.href === "/" ? path === "/" : path.startsWith(item.href)) ? "active" : ""}`}
      aria-current={
        (item.href === "/" ? path === "/" : path.startsWith(item.href))
          ? "page"
          : undefined
      }
    >
      <Icon name={item.icon} size={18} />
      <span>{item.label}</span>
    </Link>
  ));
  return (
    <>
      <a className="sr-only" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <div className="header-inner">
          <Link
            href={workout ? "/workout" : "/"}
            className="brand"
            aria-label="FORM home"
          >
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            FORM<span className="sr-only"> Personal training</span>
          </Link>
          {!workout && (
            <nav className="header-nav" aria-label="Main navigation">
              {navItems}
            </nav>
          )}
          <span className="local-indicator">PERSONAL. LOCAL. YOURS.</span>
          {workout && (
            <span className="save-state">
              {app.busy ? "Saving…" : "On this device"}
            </span>
          )}
        </div>
      </header>
      <main id="main" className="app-main">
        {!app.ready && (
          <div className="loading" role="status">
            Opening your training log…
          </div>
        )}
        {app.error && (
          <div className="notice error" role="alert">
            <div>
              <strong>Local data needs attention</strong>
              <p>{app.error}</p>
              {rawError && <p className="error-text">{rawError}</p>}
              {rawLink && (
                <a
                  className="text-link"
                  href={rawLink.url}
                  download={rawLink.filename}
                >
                  Download raw recovery file again
                </a>
              )}
            </div>
            <div className="row wrap">
              <Button variant="secondary" onClick={app.retry}>
                Retry
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  void rawExport()
                    .then((raw) => {
                      const file = createDownload(
                        JSON.stringify(raw, null, 2),
                        "fitness-raw-recovery.json",
                      );
                      rawDownload.current?.release();
                      rawDownload.current = file;
                      setRawLink(file);
                      setRawError("");
                    })
                    .catch(() => {
                      setRawError(
                        "The browser could not read raw storage. Keep this page open and retry; do not clear site data.",
                      );
                    });
                }}
              >
                Export raw records
              </Button>
            </div>
          </div>
        )}
        {app.notice && (
          <div className="notice" role="status">
            <p>{app.notice}</p>
            <Button
              variant="ghost"
              onClick={app.clearError}
              aria-label="Dismiss message"
            >
              <Icon name="close" />
            </Button>
          </div>
        )}
        {children}
        {!workout && (
          <p className="footer-note">
            <Icon name="lock" size={12} /> Stored on this browser. Back up your
            progress in Settings.
          </p>
        )}
      </main>
      {!workout && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems}
        </nav>
      )}
    </>
  );
}
