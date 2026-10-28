import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty">
      <p className="eyebrow">404 · A different path</p>
      <h1>This page isn’t here.</h1>
      <p>Head back to your training space.</p>
      <Link className="button primary" href="/">
        Return home
      </Link>
    </div>
  );
}
