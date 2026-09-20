"""Live bridge: ESP32 (BioAmp) -> SmartSense backend.

Reuses the exact GET-polling interface already proven working in
SmartSense-main/esp32.py (GET http://<esp32-ip>/data -> {"eeg": ..., "eog": ...}).
That script only printed the values to a terminal; this one forwards each
sample, with a local receive timestamp, to the SmartSense backend's live
ingestion endpoint so the real buffering -> feature-extraction -> trained
model -> prediction pipeline (live_hub.py) can run on real hardware data.
esp32.py itself is left untouched.

Run this on whichever machine can actually reach the ESP32's IP — that may
be a different machine than the one running the FastAPI backend (e.g. the
"friend's laptop" acting as the WiFi hub). Point --backend-url at wherever
the backend is reachable from that machine (its LAN IP, not 127.0.0.1, if
the bridge and the backend are on different machines).

Usage:
    python esp32_bridge.py --esp32-url http://192.168.137.242/data --backend-url http://127.0.0.1:8000

Note on rate: the original esp32.py slept 0.1s between polls (~10 Hz cap,
before HTTP round-trip overhead). Both trained models need far more than
that (100 Hz Rest / 128 Hz Drive), so this bridge polls back-to-back with no
artificial delay by default (--poll-interval 0) to get as close to the
network's real ceiling as possible. The backend still measures and reports
the ACTUAL achieved rate from real timestamps — this script does not and
cannot force it to be 100/128 Hz.
"""

import argparse
import time

import requests


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--esp32-url", default="http://192.168.137.242/data")
    parser.add_argument("--backend-url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=0.0,
        help="Extra sleep between polls, in seconds. 0 = poll back-to-back (as fast as the ESP32/network allows).",
    )
    args = parser.parse_args()

    ingest_url = args.backend_url.rstrip("/") + "/api/live/ingest"
    session = requests.Session()

    n = 0
    window_start = time.time()
    last_report = window_start

    print(f"[BRIDGE] Polling {args.esp32_url}")
    print(f"[BRIDGE] Forwarding to {ingest_url}")

    while True:
        try:
            resp = session.get(args.esp32_url, timeout=1.0)
            t_recv = time.time()
            data = resp.json()
            eeg = float(data["eeg"])
            eog = float(data["eog"])

            session.post(ingest_url, json={"eeg": eeg, "eog": eog, "timestamp": t_recv}, timeout=1.0)
            n += 1

            if t_recv - last_report >= 2.0:
                elapsed = t_recv - window_start
                hz = n / elapsed if elapsed > 0 else 0.0
                print(f"[BRIDGE] EEG={eeg:.0f} EOG={eog:.0f} | samples_sent={n} | measured_rate={hz:.2f} Hz")
                last_report = t_recv

            if args.poll_interval > 0:
                time.sleep(args.poll_interval)

        except Exception as e:
            print("[BRIDGE] Error:", e)
            time.sleep(1)


if __name__ == "__main__":
    main()
