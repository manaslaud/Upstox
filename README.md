# Upstox

A lightweight Next.js app that fetches and normalizes historical OHLC/candle data from the Upstox API for NSE equities.

## Overview

This project exposes a secure server-side API endpoint that:

- searches for an NSE equity by symbol
- looks up the matching instrument key
- fetches historical candles for 15-minute, 30-minute, or daily intervals
- returns the latest completed candle, the forming candle, previous day range, and a full candle list

The implementation is built around the route in `app/api/ohlc/route.ts` and is intended for use in trading or market-data tooling where you need a clean JSON response from Upstox.

## Features

- Symbol lookup against Upstox instrument search
- Timeframes supported: `15`, `30`, and `day`
- Day range validation: `1` to `30` days
- IST timestamp conversion for all responses
- Completed vs forming candle status detection
- No client-side secret exposure; Upstox token stays on the server

## Tech Stack

- Next.js 15
- React 19
- TypeScript
- Upstox REST API

## Prerequisites

- Node.js 18+
- npm
- An Upstox API token

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root with your Upstox token:

   ```env
   UPSTOX_TOKEN=your_upstox_access_token
   ```

## Run locally

```bash
npm run dev
```

The app will run on:

```text
http://localhost:3000
```

## API endpoint

### POST `/api/ohlc`

Request body:

```json
{
  "symbol": "TCS",
  "tf": "15",
  "days": 7
}
```

#### Supported values

- `symbol`: exact or near-exact NSE trading symbol
- `tf`: `15`, `30`, or `day`
- `days`: integer from `1` to `30`

### Example request

```bash
curl -X POST http://localhost:3000/api/ohlc \
  -H "Content-Type: application/json" \
  -d '{"symbol":"TCS","tf":"15","days":7}'
```

### Example response

```json
{
  "symbol": "TCS",
  "instrument_key": "NSE_EQ|INE467B01029",
  "fetched": "2026-11-17 15:30:00 IST",
  "latest": {
    "timestamp": "2026-11-17 15:30:00 IST",
    "open": 3860,
    "high": 3878,
    "low": 3858,
    "close": 3871,
    "volume": 183456,
    "oi": "",
    "status": "Completed"
  },
  "forming": {
    "timestamp": "2026-11-17 15:45:00 IST",
    "open": 3871,
    "high": 3880,
    "low": 3868,
    "close": 3879,
    "volume": 94231,
    "oi": "",
    "status": "Forming"
  },
  "previous": {
    "date": "2026-11-16",
    "high": 3895,
    "low": 3838
  },
  "rows": []
}
```

## Notes

- The app calls the Upstox API server-side to avoid exposing credentials or tokens to the browser.
- If the token is missing or invalid, the endpoint responds with an error payload.
- Historical candle queries are automatically normalized into readable IST timestamps and status markers.

## Production build

```bash
npm run build
npm run start
```

## License

This project is currently unlicensed unless a license file is added later.
