"use client";

import { signIn } from "next-auth/react";

export default function SignIn({ accessDenied }: { accessDenied: boolean }) {
  return (
    <main>
      <h1>📈 Scanner 3 — NSE OHLC Collector</h1>
      <p className="muted">
        Sign in with an approved Google account to access the scanner.
      </p>
      {accessDenied && (
        <p className="error" role="alert">
          Access denied. This Google account is not on the server-side allowlist.
        </p>
      )}
      <button type="button" onClick={() => signIn("google")}>
        Continue with Google
      </button>
    </main>
  );
}
