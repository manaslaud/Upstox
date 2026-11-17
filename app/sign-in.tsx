"use client";

import { signIn } from "next-auth/react";

export default function SignIn({ accessDenied }: { accessDenied: boolean }) {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <a className="brand auth-brand" href="/" aria-label="Scanner home">
          <span className="brand-mark" aria-hidden="true">U</span>
          <span className="brand-copy">
            <strong>UPSTOX</strong>
            <small>MARKET SCANNER</small>
          </span>
        </a>
        <div className="auth-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <p className="eyebrow">PRIVATE MARKET WORKSPACE</p>
        <h1>Sign in to your scanner</h1>
        <p className="auth-copy">
          Compare NSE candles in a focused workspace. Access is limited to
          approved Google accounts.
        </p>
        {accessDenied && (
          <p className="auth-error" role="alert">
            This Google account is not on the server-side allowlist.
          </p>
        )}
        <button
          className="google-button"
          type="button"
          onClick={() => signIn("google")}
        >
          <span className="google-g" aria-hidden="true">G</span>
          Continue with Google
          <span aria-hidden="true">→</span>
        </button>
        <p className="auth-footnote">
          Read-only market data · Powered by the official Upstox API
        </p>
      </section>
    </main>
  );
}
