"""Live bridge: ESP32 (BioAmp, USB Serial firmware) -> SmartSense backend.

For the WiFi/HTTP firmware (ESP32 exposing GET /data), use esp32_bridge.py
instead. This script is for the USB Serial firmware — the ESP32 sketch that
just does `Serial.begin(115200)` and prints one JSON line per sample:
    {"eeg":<int>,"eog":<int>,"sequence":<int>}
(plus a one-time "SMARTSENSE_READY" line on boot, which is ignored here).

Reuses the exact serial-parsing logic already proven working in
SmartSense-main/usb_receiver.py, but forwards each sample — with a local
receive timestamp — to the SmartSense backend's live ingestion endpoint
(POST /api/live/ingest) instead of running its own standalone WebSocket
server. That's the difference from usb_receiver.py: this feeds the real
buffering -> feature-extraction -> trained-model -> prediction pipeline
(live_hub.py) that the frontend's LIVE mode is already wired to via
ws://127.0.0.1:8000/api/live/stream/{rest,drive} — usb_receiver.py's own
/ws endpoint bypasses all of that and would also collide with backend/
main.py on the same port 8000. Run backend/main.py as the one server on
port 8000, and this script alongside it — not usb_receiver.py.

Usage (from the backend folder, with the ESP32 plugged in over USB):
    python usb_serial_bridge.py --port COM6 --backend-url http://127.0.0.1:8000

If you see "PermissionError: could not open port": close whatever else has
the port open first — commonly the Arduino IDE (its background board-detection
service holds the port even with no Serial Monitor tab open) or a leftover
usb_receiver.py/Arduino Serial Monitor still running.
"""

import argparse
import json
import time

import requests
import serial


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default="COM6", help="ESP32 USB serial port")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--backend-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    ingest_url = args.backend_url.rstrip("/") + "/api/live/ingest"
    session = requests.Session()

    print("===================================")
    print(" SmartSense USB Serial Bridge")
    print("===================================")
    print("Port:", args.port)
    print("Baud:", args.baud)
    print("Forwarding to:", ingest_url)
    print()

    try:
        ser = serial.Serial(args.port, args.baud, timeout=1)
    except Exception as e:
        print("ERROR: Could not open ESP32 serial port")
        print(e)
        return

    print("ESP32 connected — waiting for data...")
    print()

    n = 0
    window_start = time.time()
    last_report = window_start

    try:
        while True:
            line = ser.readline().decode("utf-8", errors="ignore").strip()
            if not line:
                continue

            if line == "SMARTSENSE_READY":
                print("ESP32 READY")
                continue

            try:
                data = json.loads(line)
                eeg = float(data["eeg"])
                eog = float(data["eog"])
                sequence = int(data["sequence"])
            except (json.JSONDecodeError, KeyError, ValueError):
                continue

            t_recv = time.time()
            try:
                session.post(
                    ingest_url,
                    json={"eeg": eeg, "eog": eog, "timestamp": t_recv, "sequence": sequence},
                    timeout=1.0,
                )
            except requests.RequestException as e:
                print("[BRIDGE] Could not reach backend:", e)
                time.sleep(1)
                continue

            n += 1
            if t_recv - last_report >= 2.0:
                elapsed = t_recv - window_start
                hz = n / elapsed if elapsed > 0 else 0.0
                print(f"EEG: {eeg:.0f} | EOG: {eog:.0f} | SEQ: {sequence} | RATE: {hz:.2f} Hz")
                last_report = t_recv

    except KeyboardInterrupt:
        print()
        print("Bridge stopped.")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
