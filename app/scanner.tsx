"use client";

import { FormEvent, useState } from "react";
import { signOut } from "next-auth/react";

type Candle = {
  timestamp: string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  oi: string | number;
  status: "Completed" | "Forming";
};

type Result = {
  symbol: string;
  instrument_key: string;
  fetched: string;
  latest: Candle | null;
  forming: Candle | null;
  previous: { date: string; high: string | number; low: string | number } | null;
  rows: Candle[];
};

const columns: (keyof Candle)[] = [
  "timestamp",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "oi",
  "status",
];

export default function Scanner({
  email,
  authBypassed = false,
}: {
  email: string;
  authBypassed?: boolean;
}) {
  const [symbol, setSymbol] = useState("BECTORFOOD");
  const [timeframe, setTimeframe] = useState("15");
  const [days, setDays] = useState("7");
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState(
    "Ready. The Upstox token is loaded from the server's .env file.",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function fetchOhlc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    setStatus("Fetching from Upstox…");

    try {
      const response = await fetch("/api/ohlc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, tf: timeframe, days: Number(days) }),
      });
      const data = (await response.json()) as Result | { error: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Request failed");
      }

      const fetched = data as Result;
      setResult(fetched);
      setStatus(
        `${fetched.symbol} · ${fetched.instrument_key} · fetched ${fetched.fetched} · Source: Upstox official API`,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : String(requestError),
      );
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!result?.rows.length) return;
    const csvRows = [
      columns.join(","),
      ...result.rows.map((row) =>
        columns
          .map((column) => `"${String(row[column] ?? "").replaceAll('"', '""')}"`)
          .join(","),
      ),
    ];
    const url = URL.createObjectURL(
      new Blob([csvRows.join("\r\n")], { type: "text/csv" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "upstox_ohlcv.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main>
      <h1>📈 Scanner 3 — NSE OHLC Collector</h1>
      <p className="muted">
        Official Upstox API · read-only · times in IST · token stays on the server
      </p>
      <p className="muted">
        {authBypassed ? (
          <strong>Development auth bypass is active</strong>
        ) : (
          <>
            Signed in as {email}{" "}
            <button
              className="secondary"
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
            >
              Sign out
            </button>
          </>
        )}
      </p>

      <form className="form" onSubmit={fetchOhlc}>
        <div className="grid">
          <div>
            <label htmlFor="symbol">Stock symbol or company name</label>
            <input
              id="symbol"
              maxLength={50}
              required
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="timeframe">Timeframe</label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
            >
              <option value="15">15-minute</option>
              <option value="30">30-minute</option>
              <option value="day">Daily</option>
            </select>
          </div>
          <div>
            <label htmlFor="days">Lookback (calendar days)</label>
            <select
              id="days"
              value={days}
              onChange={(event) => setDays(event.target.value)}
            >
              <option value="7">7</option>
              <option value="14">14</option>
              <option value="30">30</option>
            </select>
          </div>
        </div>
        <div className="actions">
          <button type="submit" disabled={loading}>
            {loading ? "Fetching…" : "Fetch OHLCV"}
          </button>
          <button
            className="secondary"
            type="button"
            disabled={!result?.rows.length}
            onClick={downloadCsv}
          >
            Download CSV
          </button>
        </div>
      </form>

      <p className={error ? "error" : "muted"} role={error ? "alert" : "status"}>
        {error || status}
      </p>

      {result && (
        <>
          {result.latest ? (
            <section className="panel">
              <h2>Latest completed candle</h2>
              <div className="grid">
                {Object.entries(result.latest).map(([key, value]) => (
                  <div key={key}>
                    <small>{key}</small>
                    <br />
                    <b>{value}</b>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <p>No completed candle in range.</p>
          )}

          {result.previous && (
            <p>
              Previous completed trading day: {result.previous.date} | High:{" "}
              {result.previous.high} | Low: {result.previous.low}
            </p>
          )}
          {result.forming && (
            <p>
              <b>Possible forming candle:</b> {result.forming.timestamp} (not
              confirmed closed)
            </p>
          )}

          <div className="panel tablewrap">
            <table>
              <thead>
                <tr>
                  {[
                    "Time (IST)",
                    "Open",
                    "High",
                    "Low",
                    "Close",
                    "Volume",
                    "OI",
                    "Status",
                  ].map((heading) => (
                    <th key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={`${row.timestamp}-${index}`}>
                    {columns.map((column) => (
                      <td key={column}>{row[column]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
