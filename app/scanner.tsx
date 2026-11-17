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

type TickerResult = {
  symbol: string;
  error?: string;
  instrument_key?: string;
  fetched?: string;
  latest?: Candle | null;
  forming?: Candle | null;
  previous?: { date: string; high: string | number; low: string | number } | null;
  rows: Candle[];
};

type Result = { results: TickerResult[] };

const candleColumns: (keyof Omit<Candle, "timestamp">)[] = [
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
  const [symbols, setSymbols] = useState("BECTORFOOD");
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
    const tickerNames = symbols
      .split(",")
      .map((ticker) => ticker.trim())
      .filter(Boolean);
    if (tickerNames.length < 1 || tickerNames.length > 5) {
      setError("Enter between 1 and 5 ticker names, separated by commas.");
      setStatus("");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setStatus("Fetching from Upstox…");

    try {
      const response = await fetch("/api/ohlc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbols: tickerNames,
          tf: timeframe,
          days: Number(days),
        }),
      });
      const data = (await response.json()) as Result | { error: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "Request failed");
      }

      const fetched = data as Result;
      setResult(fetched);
      const successful = fetched.results.filter((item) => !item.error).length;
      const failed = fetched.results.length - successful;
      setStatus(
        `${successful} of ${fetched.results.length} ticker(s) fetched from the Upstox official API${failed ? ` · ${failed} failed` : ""}`,
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

  function getSuccessfulResults() {
    return result?.results.filter((item) => !item.error) ?? [];
  }

  function getTimestamps(results: TickerResult[]) {
    return [...new Set(results.flatMap((item) => item.rows.map((row) => row.timestamp)))].sort(
      (a, b) => b.localeCompare(a),
    );
  }

  function downloadCsv() {
    const successful = getSuccessfulResults();
    const timestamps = getTimestamps(successful);
    if (!timestamps.length) return;
    const csvValue = (value: unknown) =>
      `"${String(value ?? "").replaceAll('"', '""')}"`;
    const headers = [
      "Time (IST)",
      ...successful.flatMap((item) =>
        candleColumns.map((column) => `${item.symbol} ${column.toUpperCase()}`),
      ),
    ];
    const csvRows = [
      headers.map(csvValue).join(","),
      ...timestamps.map((timestamp) =>
        [
          timestamp,
          ...successful.flatMap((item) => {
            const candle = item.rows.find((row) => row.timestamp === timestamp);
            return candleColumns.map((column) => candle?.[column] ?? "");
          }),
        ]
          .map(csvValue)
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

  const successfulResults = getSuccessfulResults();
  const timestamps = getTimestamps(successfulResults);

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Scanner home">
          <span className="brand-mark" aria-hidden="true">
            U
          </span>
          <span className="brand-copy">
            <strong>UPSTOX</strong>
            <small>MARKET SCANNER</small>
          </span>
        </a>
        <div className="account-area">
          <span className="market-badge">
            <span className="live-dot" />
            NSE MARKET DATA
          </span>
          {authBypassed ? (
            <span className="dev-badge">DEV BYPASS</span>
          ) : (
            <>
              <span className="account-email">{email}</span>
              <button
                className="sign-out-button"
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">MARKET WORKSPACE <span>/</span> EQUITIES</p>
          <h1>Compare market moves.</h1>
          <p className="intro-copy">
            Track OHLCV candles across up to five NSE symbols in one view.
          </p>
        </div>
        <div className="timezone-card">
          <span className="timezone-icon" aria-hidden="true">◷</span>
          <span>
            <small>MARKET TIMEZONE</small>
            <strong>India Standard Time</strong>
          </span>
        </div>
      </section>

      <form className="query-card" onSubmit={fetchOhlc}>
        <div className="query-heading">
          <div>
            <p className="eyebrow">DATA QUERY</p>
            <h2>Build your comparison</h2>
          </div>
          <span className="limit-badge">UP TO 5 TICKERS</span>
        </div>

        <div className="form-grid">
          <div className="ticker-input-field">
            <label htmlFor="symbols">Ticker symbols or company names</label>
            <input
              id="symbols"
              maxLength={300}
              required
              placeholder="BECTORFOOD, TCS, INFY"
              value={symbols}
              onChange={(event) => setSymbols(event.target.value)}
            />
            <small>Separate names with commas. Example: TCS, INFY</small>
          </div>
          <div className="control-field">
            <label htmlFor="timeframe">CANDLE INTERVAL</label>
            <select
              id="timeframe"
              value={timeframe}
              onChange={(event) => setTimeframe(event.target.value)}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="day">Daily</option>
            </select>
          </div>
          <div className="control-field">
            <label htmlFor="days">LOOKBACK PERIOD</label>
            <select
              id="days"
              value={days}
              onChange={(event) => setDays(event.target.value)}
            >
              <option value="7">7 calendar days</option>
              <option value="14">14 calendar days</option>
              <option value="30">30 calendar days</option>
            </select>
          </div>
        </div>

        <div className="query-footer">
          <div className="form-note">
            <span className="shield-icon" aria-hidden="true">↗</span>
            Read-only data · fetched securely from Upstox
          </div>
          <div className="actions">
            <button className="primary-button" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="button-spinner" />
                  Fetching data…
                </>
              ) : (
                <>
                  Fetch OHLCV
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!timestamps.length}
              onClick={downloadCsv}
            >
              <span aria-hidden="true">↓</span>
              Export CSV
            </button>
          </div>
        </div>
      </form>

      {(error || loading || (result && status)) && (
        <div
          className={`feedback ${error ? "feedback-error" : loading ? "feedback-loading" : "feedback-success"}`}
          role={error ? "alert" : "status"}
        >
          <span className="feedback-icon" aria-hidden="true">
            {error ? "!" : loading ? <span className="button-spinner" /> : "✓"}
          </span>
          <span>{error || status}</span>
        </div>
      )}

      {!result && !error && !loading && (
        <section className="empty-state">
          <div className="empty-graphic" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="eyebrow">READY WHEN YOU ARE</p>
          <h2>Your market view starts here</h2>
          <p>
            Add up to five tickers above to compare price, volume, and candle
            status side by side.
          </p>
        </section>
      )}

      {result && (
        <section className="results-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR WATCHLIST</p>
              <h2>Candle comparison</h2>
            </div>
            <span className="result-count">
              {successfulResults.length} SYMBOL
              {successfulResults.length === 1 ? "" : "S"}
            </span>
          </div>

          {result.results.some((item) => item.error) && (
            <div className="ticker-cards">
              {result.results
                .filter((item) => item.error)
                .map((item, index) => (
                  <section
                    className="ticker-card ticker-card-error"
                    key={`${item.symbol}-${index}`}
                  >
                    <div className="ticker-card-heading">
                      <h3>{item.symbol}</h3>
                      <span className="error-tag">LOOKUP FAILED</span>
                    </div>
                    <p className="error">{item.error}</p>
                  </section>
                ))}
            </div>
          )}

          <div className="ticker-cards">
            {successfulResults.map((item, index) => (
              <section className="ticker-card" key={`${item.symbol}-${index}`}>
                <div className="ticker-card-heading">
                  <div>
                    <h3>{item.symbol}</h3>
                    <p className="instrument-key">{item.instrument_key}</p>
                  </div>
                  <span className="data-tag">NSE · EQ</span>
                </div>
                <p className="latest-label">LATEST COMPLETED CANDLE</p>
                {item.latest ? (
                  <div className="metric-grid">
                    {Object.entries(item.latest).map(([key, value]) => (
                      <div className="metric" key={key}>
                        <small>{key.replace("_", " ")}</small>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-data">No completed candle in range.</p>
                )}
                <div className="ticker-card-footer">
                  {item.previous && (
                    <span>
                      Prev. day H/L&nbsp;
                      <b>{item.previous.high}</b> / <b>{item.previous.low}</b>
                    </span>
                  )}
                  {item.forming && (
                    <span className="forming-tag">Forming candle available</span>
                  )}
                </div>
              </section>
            ))}
          </div>

          {successfulResults.length > 0 && (
            <section className="table-section">
              <div className="table-heading">
                <div>
                  <p className="eyebrow">HISTORICAL DATA</p>
                  <h2>Side-by-side candles</h2>
                  <p>Rows align on candle time. Scroll horizontally to compare all symbols.</p>
                </div>
                <span className="table-timezone">ALL TIMES · IST</span>
              </div>
              <div className="tablewrap">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th className="time-column time-group" rowSpan={2}>
                        CANDLE TIME
                      </th>
                      {successfulResults.map((item, tickerIndex) => (
                        <th
                          className={`ticker-group ticker-group-${tickerIndex + 1}`}
                          key={`${item.symbol}-${tickerIndex}`}
                          colSpan={candleColumns.length}
                        >
                          <span className="ticker-dot" />
                          {item.symbol}
                        </th>
                      ))}
                    </tr>
                    <tr className="subhead-row">
                      {successfulResults.flatMap((item, tickerIndex) =>
                        candleColumns.map((column) => (
                          <th
                            key={`${item.symbol}-${tickerIndex}-${column}`}
                            className="column-heading"
                          >
                            {column.toUpperCase()}
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {timestamps.map((timestamp) => (
                      <tr key={timestamp}>
                        <td className="time-column">{timestamp}</td>
                        {successfulResults.flatMap((item, tickerIndex) => {
                          const candle = item.rows.find(
                            (row) => row.timestamp === timestamp,
                          );
                          return candleColumns.map((column) => (
                            <td
                              className={column === "status" ? "status-cell" : ""}
                              key={`${tickerIndex}-${column}`}
                            >
                              {column === "status" && candle ? (
                                <span
                                  className={`candle-status ${candle.status === "Completed" ? "is-completed" : "is-forming"}`}
                                >
                                  {candle.status}
                                </span>
                              ) : (
                                candle?.[column] ?? "—"
                              )}
                            </td>
                          ));
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
