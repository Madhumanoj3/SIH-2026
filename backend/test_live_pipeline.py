"""End-to-end test harness for the live ingestion pipeline, using synthetic
but realistically-shaped samples (same JSON contract as esp32_bridge.py:
{"eeg": float, "eog": float, "timestamp": float}) POSTed to a running
backend's /api/live/ingest.

Requires the backend to already be running (python -m uvicorn main:app).

Two scenarios, both important:

1. --rate 10   (matches the ACTUAL observed esp32.py polling rate) — proves
   the pipeline correctly REFUSES to predict rather than faking a result,
   because 10 Hz is nowhere near the 100/128 Hz the models need.

2. --rate 128  (the Drive model's real training rate) — proves that when
   fed data at the correct rate, the full buffer -> feature-extraction ->
   trained-model chain produces real predictions, by subscribing to the
   live WebSocket and printing what comes back.

This does not touch real hardware — it is the closest verification possible
without network access to the user's actual ESP32/BioAmp setup.
"""

import argparse
import asyncio
import json
import time

import requests
import websockets


def send_synthetic_stream(backend_url: str, rate_hz: float, duration_s: float, adc_baseline: float = 1900.0) -> None:
    import math
    import random

    ingest_url = backend_url.rstrip("/") + "/api/live/ingest"
    session = requests.Session()
    interval = 1.0 / rate_hz
    n = int(duration_s * rate_hz)
    t0 = time.time()
    print(f"[TEST] Sending {n} synthetic samples at {rate_hz} Hz to {ingest_url}")
    for i in range(n):
        t = time.time()
        # Small sinusoidal wiggle + noise around the observed ADC baseline —
        # realistic SHAPE (same JSON contract, same value range as esp32.py),
        # not a claim of biological validity.
        eeg = adc_baseline + 15 * math.sin(2 * math.pi * 1.0 * (t - t0)) + random.gauss(0, 3)
        eog = adc_baseline - 5 + 10 * math.sin(2 * math.pi * 0.3 * (t - t0)) + random.gauss(0, 3)
        try:
            session.post(ingest_url, json={"eeg": eeg, "eog": eog, "timestamp": t}, timeout=1.0)
        except Exception as e:
            print("[TEST] ingest error:", e)
        target_next = t0 + (i + 1) * interval
        sleep_for = target_next - time.time()
        if sleep_for > 0:
            time.sleep(sleep_for)
    print(f"[TEST] Done sending. Elapsed={time.time() - t0:.1f}s")


async def watch_ws(ws_url: str, seconds: float) -> None:
    print(f"[TEST] Connecting to {ws_url}")
    async with websockets.connect(ws_url) as ws:
        end = time.time() + seconds
        while time.time() < end:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.time()))
            except asyncio.TimeoutError:
                break
            data = json.loads(msg)
            if data.get("type") == "sample":
                continue  # too frequent to print individually
            print("[TEST][WS]", data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend-url", default="http://127.0.0.1:8000")
    parser.add_argument("--ws-url", default="ws://127.0.0.1:8000")
    parser.add_argument("--mode", choices=["rest", "drive"], default="drive")
    parser.add_argument("--rate", type=float, default=128.0)
    parser.add_argument("--duration", type=float, default=40.0)
    args = parser.parse_args()

    async def run():
        watcher = asyncio.create_task(watch_ws(f"{args.ws_url}/api/live/stream/{args.mode}", args.duration + 5))
        await asyncio.get_event_loop().run_in_executor(None, send_synthetic_stream, args.backend_url, args.rate, args.duration)
        await watcher

    asyncio.run(run())


if __name__ == "__main__":
    main()
