import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BASE_URL = "https://api.upstox.com";
const IST = "Asia/Kolkata";

type Candle = {
  timestamp: string;
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
  oi: unknown;
  status: "Completed" | "Forming";
  _dt: Date;
};

function istDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function istTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function istTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second} IST`;
}

async function upstoxApi(
  path: string,
  token: string,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Api-Version": "2.0",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "TimeoutError") {
      throw new Error(`Upstox API timed out: ${cause.message}`);
    }
    throw new Error(
      `Upstox network error: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `Upstox HTTP ${response.status} on ${path}: ${text.slice(0, 800)}`,
    );
  }

  let obj: { status?: string; errors?: unknown; data?: unknown };
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error(`Upstox returned non-JSON data on ${path}: ${text.slice(0, 300)}`);
  }
  if (obj.status !== "success") {
    throw new Error(`Upstox error: ${JSON.stringify(obj.errors ?? obj)}`);
  }
  return obj.data ?? {};
}

function parseRows(
  raw: unknown[],
  timeframe: string,
  now: Date,
): Candle[] {
  const rows = new Map<string, Candle>();
  const deltaMs =
    timeframe === "day"
      ? 24 * 60 * 60 * 1000
      : Number(timeframe) * 60 * 1000;

  for (const value of raw) {
    if (!Array.isArray(value) || value.length < 6 || typeof value[0] !== "string") {
      continue;
    }
    const date = new Date(value[0]);
    if (Number.isNaN(date.getTime())) continue;

    const end = new Date(date.getTime() + deltaMs);
    const localDate = istDate(date);
    const nowDate = istDate(now);
    const complete =
      timeframe === "day"
        ? localDate < nowDate ||
          (localDate === nowDate && istTime(now) >= "15:30:00")
        : end.getTime() <= now.getTime();
    rows.set(value[0], {
      timestamp: istTimestamp(date),
      open: value[1],
      high: value[2],
      low: value[3],
      close: value[4],
      volume: value[5],
      oi: value[6] ?? "",
      status: complete ? "Completed" : "Forming",
      _dt: date,
    });
  }
  return [...rows.values()].sort((a, b) => b._dt.getTime() - a._dt.getTime());
}

function publicCandle(row: Candle | undefined): Omit<Candle, "_dt"> | null {
  if (!row) return null;
  const { _dt: _, ...result } = row;
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function collect(
  body: { symbol?: unknown; tf?: unknown; days?: unknown },
  token: string,
) {
  const symbol = String(body.symbol ?? "").trim().slice(0, 50);
  const timeframe = body.tf;
  const days = Number(body.days ?? 7);
  if (
    !symbol ||
    !["15", "30", "day"].includes(String(timeframe)) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 30
  ) {
    throw new Error("Invalid request fields");
  }

  const search = asRecord(
    await upstoxApi("/v2/instruments/search", token, {
      query: symbol,
      exchanges: "NSE",
      segments: "EQ",
      records: "30",
    }),
  );
  const foundValue = Array.isArray(search)
    ? search
    : (search.instruments ?? search.results ?? []);
  if (!Array.isArray(foundValue)) {
    throw new Error("Unexpected Upstox instrument-search response");
  }
  const matches = foundValue
    .map(asRecord)
    .filter(
      (instrument) =>
        instrument.segment === "NSE_EQ" && instrument.instrument_key,
    );
  if (!matches.length) {
    throw new Error("No NSE equity matched. Try the exact NSE trading symbol.");
  }
  matches.sort(
    (a, b) =>
      Number(String(a.trading_symbol).toUpperCase() !== symbol.toUpperCase()) -
        Number(String(b.trading_symbol).toUpperCase() !== symbol.toUpperCase()) ||
      Number(a.instrument_type !== "EQ") - Number(b.instrument_type !== "EQ"),
  );

  const stock = matches[0];
  const instrumentKey = String(stock.instrument_key);
  const encodedKey = encodeURIComponent(instrumentKey);
  const now = new Date();
  const today = istDate(now);
  const dateAgo = (count: number) =>
    new Date(Date.parse(`${today}T00:00:00Z`) - count * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  const sinceDate = dateAgo(days);
  const unit = timeframe === "day" ? "days" : "minutes";
  const interval = timeframe === "day" ? "1" : String(timeframe);

  const historical = asRecord(
    await upstoxApi(
      `/v3/historical-candle/${encodedKey}/${unit}/${interval}/${today}/${sinceDate}`,
      token,
    ),
  );
  let candles = Array.isArray(historical.candles) ? historical.candles : [];
  if (timeframe !== "day") {
    const intraday = asRecord(
      await upstoxApi(
        `/v3/historical-candle/intraday/${encodedKey}/${unit}/${interval}`,
        token,
      ),
    );
    if (Array.isArray(intraday.candles)) candles = [...candles, ...intraday.candles];
  }

  const rows = parseRows(candles, String(timeframe), now);
  const daily = asRecord(
    await upstoxApi(
      `/v3/historical-candle/${encodedKey}/days/1/${today}/${dateAgo(20)}`,
      token,
    ),
  );
  const dailyRows = parseRows(
    Array.isArray(daily.candles) ? daily.candles : [],
    "day",
    now,
  );
  const previous = dailyRows.find(
    (row) => istDate(row._dt) < today && row.status === "Completed",
  );
  const latest = rows.find((row) => row.status === "Completed");
  const forming = rows.find((row) => row.status === "Forming");

  return {
    symbol: stock.trading_symbol,
    instrument_key: instrumentKey,
    fetched: `${istTimestamp(now).replace(" IST", "")} IST`,
    latest: publicCandle(latest),
    forming: publicCandle(forming),
    previous: previous
      ? {
          date: istDate(previous._dt),
          high: previous.high,
          low: previous.low,
        }
      : null,
    rows: rows.map((row) => publicCandle(row)),
  };
}

export async function POST(request: Request) {
  const token = process.env.UPSTOX_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(
      { error: "UPSTOX_TOKEN is not configured in the server .env file." },
      { status: 500 },
    );
  }

  try {
    const bodyText = await request.text();
    if (!bodyText.length || Buffer.byteLength(bodyText, "utf8") > 20_000) {
      return NextResponse.json(
        { error: "Invalid request size" },
        { status: 400 },
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 },
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Invalid request fields" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      await collect(body as { symbol?: unknown; tf?: unknown; days?: unknown }, token),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (cause) {
    return NextResponse.json(
      {
        error: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
