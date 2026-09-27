import serial
import json
import time
import asyncio
import threading

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ==============================
# SMARTSENSE CONFIGURATION
# ==============================

PORT = "COM6"
BAUD_RATE = 115200
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 8000

# ==============================
# FASTAPI
# ==============================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Connected frontend clients
clients = set()

# Latest EEG/EOG data
latest_data = {
    "eeg": 0,
    "eog": 0,
    "sequence": 0
}

# Event loop reference
main_loop = None


# ==============================
# WEBSOCKET
# ==============================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):

    await websocket.accept()
    clients.add(websocket)

    print("Frontend connected")

    try:
        # Immediately send latest value
        await websocket.send_json(latest_data)

        while True:
            # Keep connection alive
            await websocket.receive_text()

    except WebSocketDisconnect:
        print("Frontend disconnected")

    except Exception as e:
        print("WebSocket error:", e)

    finally:
        clients.discard(websocket)


# ==============================
# HEALTH CHECK
# ==============================

@app.get("/")
def root():
    return {
        "status": "SmartSense USB receiver running",
        "connected_clients": len(clients),
        "latest_data": latest_data
    }


# ==============================
# BROADCAST DATA
# ==============================

async def broadcast_data(data):

    if not clients:
        return

    disconnected = set()

    for client in clients:

        try:
            await client.send_json(data)

        except Exception:
            disconnected.add(client)

    for client in disconnected:
        clients.discard(client)


# ==============================
# SERIAL READER
# ==============================

def serial_reader():

    global latest_data
    global main_loop

    print("===================================")
    print(" SmartSense USB EEG/EOG Receiver")
    print("===================================")
    print("Port:", PORT)
    print("Baud:", BAUD_RATE)
    print()

    try:

        ser = serial.Serial(
            PORT,
            BAUD_RATE,
            timeout=1
        )

        print("ESP32 connected!")
        print("Receiving EEG + EOG...")
        print()

    except Exception as e:

        print("ERROR: Could not open ESP32 serial port")
        print(e)
        return

    sample_count = 0
    start_time = time.perf_counter()

    try:

        while True:

            line = ser.readline().decode(
                "utf-8",
                errors="ignore"
            ).strip()

            if not line:
                continue

            # ESP32 startup message
            if line == "SMARTSENSE_READY":
                print("ESP32 READY")
                continue

            try:

                data = json.loads(line)

                eeg = int(data["eeg"])
                eog = int(data["eog"])
                sequence = int(data["sequence"])

                # Store latest data
                latest_data = {
                    "eeg": eeg,
                    "eog": eog,
                    "sequence": sequence
                }

                sample_count += 1

                # Send every sample to frontend
                if main_loop is not None:

                    asyncio.run_coroutine_threadsafe(
                        broadcast_data(latest_data),
                        main_loop
                    )

                # Display rate every 128 samples
                if sample_count % 128 == 0:

                    elapsed = time.perf_counter() - start_time

                    if elapsed > 0:
                        rate = sample_count / elapsed
                    else:
                        rate = 0

                    print(
                        f"EEG: {eeg:4d} | "
                        f"EOG: {eog:4d} | "
                        f"SEQ: {sequence:6d} | "
                        f"RATE: {rate:.2f} Hz"
                    )

            except json.JSONDecodeError:
                continue

            except KeyError:
                continue

    except KeyboardInterrupt:

        print()
        print("Receiver stopped.")

    finally:

        ser.close()


# ==============================
# START SERVER
# ==============================

if __name__ == "__main__":

    main_loop = asyncio.new_event_loop()

    asyncio.set_event_loop(main_loop)

    # Start serial reader in background
    serial_thread = threading.Thread(
        target=serial_reader,
        daemon=True
    )

    serial_thread.start()

    print()
    print("SmartSense WebSocket server starting...")
    print(f"WebSocket: ws://localhost:{SERVER_PORT}/ws")
    print()

    uvicorn.run(
        app,
        host=SERVER_HOST,
        port=SERVER_PORT
    )