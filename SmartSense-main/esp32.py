import requests
import time
import argparse
from collections import deque


# ============================================================
# ARGUMENTS
# ============================================================

parser = argparse.ArgumentParser(
    description="SmartSense ESP32 128 Hz receiver"
)

parser.add_argument(
    "--esp32-url",
    default="http://192.168.137.242",
    help="ESP32 base URL"
)

parser.add_argument(
    "--backend-url",
    default="http://127.0.0.1:8000",
    help="SmartSense backend URL"
)

parser.add_argument(
    "--forward",
    action="store_true",
    help="Forward samples to SmartSense backend"
)

parser.add_argument(
    "--duration",
    type=float,
    default=0.0,
    help="Run for N seconds then print the transport summary and exit (0 = run forever, Ctrl+C to stop)"
)

args = parser.parse_args()

ESP32_URL = args.esp32_url.rstrip("/")
BACKEND_URL = args.backend_url.rstrip("/")

DATA_URL = ESP32_URL + "/data"
STATUS_URL = ESP32_URL + "/status"
INGEST_URL = BACKEND_URL + "/api/live/ingest"


# ============================================================
# CONFIGURATION
#
# ROOT CAUSE of the observed "Read timed out -> exactly one
# batch's worth of samples lost" pattern (diagnosed against a
# local mock of the /data + /status contract, since the real
# ESP32 network wasn't reachable for direct testing):
#
#   1. The original code used a bare `requests.get()` per poll
#      (no Session) for /data, forcing a fresh TCP handshake on
#      every single request instead of reusing a warm keep-alive
#      connection to the ESP32's WebServer.
#   2. A single 2.0s combined connect+read timeout meant a stall
#      cost up to 2 full seconds (~256 samples at 128 Hz) before
#      the client even noticed.
#   3. On ANY RequestException (including a plain timeout), the
#      code slept a FULL extra second before retrying. That 1s is
#      pure additional, self-inflicted loss window on top of the
#      timeout itself - at 128 Hz that's ~128 samples the ESP32's
#      buffer has to hold (or drop) that a faster recovery would
#      have collected.
#
# None of this is a firmware problem to fix here - it's the
# client waiting far longer than necessary to notice and recover
# from a stall. The fixes below: a persistent Session (keep-alive
# connection reuse), a short connect timeout / modest read
# timeout instead of one long combined one, and an IMMEDIATE
# retry on timeout (no sleep at all) - only a brief backoff for
# genuine connection failures (the link actually being down),
# which is a different failure mode than a slow response.
# ============================================================

SAMPLE_RATE_HZ = 128.0  # matches smartsense_128hz.ino's SAMPLE_RATE - only used as a fallback for
                        # reconstructing per-sample wall-clock timestamps if timestamp_us is absent.

CONNECT_TIMEOUT = 0.5
READ_TIMEOUT = 1.0
REQUEST_TIMEOUT = (CONNECT_TIMEOUT, READ_TIMEOUT)  # kept for /status, which is called rarely

# Backoff only for genuine connection failures (WiFi actually down), never for
# a mere timeout - a timeout means "retry now", not "wait before retrying".
CONNECTION_ERROR_BACKOFF = 0.2

# Don't print every sample at 128 Hz.
PRINT_EVERY = 128

sample_counter = 0

received_sequences = 0
dropped_sequences = 0
timeout_count = 0

last_sequence = None

start_time = time.perf_counter()

last_report_time = start_time
last_report_samples = 0

# Transport diagnostics for the end-of-run summary (latency, batch size,
# ESP32-reported buffer depth) - not previously tracked at all.
request_latencies_ms: deque = deque(maxlen=100_000)
batch_sizes: deque = deque(maxlen=100_000)

# Snapshot semantics: "start_*" is captured ONCE, from the very first /status
# call before the main loop begins. dropped_samples on the ESP32 is a
# cumulative counter that may already be nonzero from time BEFORE this
# receiver ever connected - the only honest way to know whether THIS run
# lost anything is (latest - start), never the raw latest value alone.
start_total_samples = None
start_dropped_samples = None
start_buffered_samples = None

latest_total_samples = None
latest_dropped_samples = None
latest_buffered_samples = None

buffered_min = None
buffered_max = None

STATUS_POLL_INTERVAL = 1.0  # tightened from 2.0s for finer-grained min/max buffer-depth resolution

# Steady-state vs startup/backlog rate: the first STEADY_STATE_WARMUP_SECONDS
# can be inflated if the ESP32/firmware had already buffered a backlog
# before the receiver attached (draining a backlog briefly looks like a much
# higher rate than the true acquisition rate). Steady-state is measured only
# from after this warmup window.
STEADY_STATE_WARMUP_SECONDS = 10.0
steady_state_start_sample_count = None
steady_state_start_time = None


# ============================================================
# BACKEND SESSION
# ============================================================

backend_session = requests.Session()

# Persistent, keep-alive session for polling the ESP32 itself - the missing
# piece that made every single poll pay a fresh TCP handshake before.
esp32_session = requests.Session()
esp32_session.headers.update({"Connection": "keep-alive"})


# ============================================================
# FORWARD SAMPLE TO BACKEND
# ============================================================

def forward_sample(sample, wallclock_timestamp):

    # IMPORTANT: `timestamp` must be a Python wall-clock Unix time in
    # seconds - the backend's rate/staleness logic compares it against
    # time.time(). The ESP32's own sample["timestamp_us"] is microseconds
    # since ESP32 BOOT, not Unix time - forwarding it directly here used to
    # be a real bug (backend would compute nonsense rates/ages from it).
    # wallclock_timestamp is computed by the caller by anchoring this
    # batch's real arrival time and walking backward using the ESP32's own
    # (still useful for RELATIVE spacing) timestamp_us deltas.
    payload = {
        "eeg": float(sample["eeg"]),
        "eog": float(sample["eog"]),
        "timestamp": wallclock_timestamp,
        "sequence": sample.get("sequence"),
    }

    try:

        response = backend_session.post(
            INGEST_URL,
            json=payload,
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()

        return True

    except Exception as e:

        print("[BACKEND ERROR]", e)

        return False


# ============================================================
# CHECK ESP32 STATUS
# ============================================================

def check_status(quiet=False, is_baseline=False):
    """Polls /status and updates the running start/latest/min/max tracking.

    is_baseline=True marks the VERY FIRST call (before the main loop starts)
    as the baseline snapshot that every delta is computed against - this is
    what lets the summary distinguish "lost during this run" from "already
    nonzero before we connected"."""

    global start_total_samples, start_dropped_samples, start_buffered_samples
    global latest_total_samples, latest_dropped_samples, latest_buffered_samples
    global buffered_min, buffered_max

    try:

        response = esp32_session.get(
            STATUS_URL,
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()

        status = response.json()

        total = status.get("total_samples")
        dropped = status.get("dropped_samples")
        buffered = status.get("buffered_samples")

        if isinstance(total, (int, float)):
            latest_total_samples = total
        if isinstance(dropped, (int, float)):
            latest_dropped_samples = dropped
        if isinstance(buffered, (int, float)):
            latest_buffered_samples = buffered
            buffered_min = buffered if buffered_min is None else min(buffered_min, buffered)
            buffered_max = buffered if buffered_max is None else max(buffered_max, buffered)

        if is_baseline:
            start_total_samples = latest_total_samples
            start_dropped_samples = latest_dropped_samples
            start_buffered_samples = latest_buffered_samples

        if quiet:
            return

        print()
        print("========== ESP32 STATUS ==========")
        print(
            "Configured sample rate:",
            status.get("sample_rate")
        )

        print(
            "Total samples:",
            status.get("total_samples")
        )

        print(
            "Dropped samples (ESP32-reported, cumulative):",
            status.get("dropped_samples")
        )

        print(
            "Buffered samples:",
            status.get("buffered_samples")
        )

        print("==================================")
        print()

    except Exception as e:

        print("[STATUS ERROR]", e)


# ============================================================
# MAIN LOOP
# ============================================================

print()
print("==========================================")
print(" SmartSense ESP32 Live Receiver")
print("==========================================")
print("ESP32 :", ESP32_URL)
print("Backend:", BACKEND_URL)
print("Forwarding:", args.forward)
print("==========================================")
print()


# Initial status check - this is the BASELINE every delta is measured against.
check_status(is_baseline=True)

print(f"[BASELINE] total_samples={start_total_samples}  dropped_samples={start_dropped_samples}  buffered_samples={start_buffered_samples}")
print("[BASELINE] All deltas below are measured against this snapshot, not against zero.")
print()

run_start = time.perf_counter()
last_status_poll = run_start


def print_summary():
    elapsed = time.perf_counter() - run_start
    overall_rate = sample_counter / elapsed if elapsed > 0 else 0.0

    if steady_state_start_time is not None and elapsed > STEADY_STATE_WARMUP_SECONDS:
        steady_elapsed = time.perf_counter() - steady_state_start_time
        steady_samples = sample_counter - steady_state_start_sample_count
        steady_rate = steady_samples / steady_elapsed if steady_elapsed > 0 else 0.0
        steady_note = f"(excludes first {STEADY_STATE_WARMUP_SECONDS:.0f}s startup/backlog window)"
    else:
        steady_rate = None
        steady_note = "(run shorter than warmup window - no steady-state figure available)"

    avg_latency = (sum(request_latencies_ms) / len(request_latencies_ms)) if request_latencies_ms else 0.0
    max_latency = max(request_latencies_ms) if request_latencies_ms else 0.0
    avg_batch = (sum(batch_sizes) / len(batch_sizes)) if batch_sizes else 0.0

    dropped_delta = None
    if start_dropped_samples is not None and latest_dropped_samples is not None:
        dropped_delta = latest_dropped_samples - start_dropped_samples

    total_delta = None
    if start_total_samples is not None and latest_total_samples is not None:
        total_delta = latest_total_samples - start_total_samples

    print()
    print("========== TRANSPORT TEST SUMMARY ==========")
    print(f"Duration: {elapsed:.1f}s")
    print(f"Receiver sample rate (overall, includes startup): {overall_rate:.2f} Hz")
    if steady_rate is not None:
        print(f"Receiver sample rate (steady-state): {steady_rate:.2f} Hz  {steady_note}")
    else:
        print(f"Receiver sample rate (steady-state): n/a  {steady_note}")
    print(f"HTTP timeout count: {timeout_count}")
    print(f"Sequence gaps (client-detected): {dropped_sequences}")
    print(f"Total samples received by Python: {sample_counter}")
    print("---")
    print(f"ESP32 total_samples  : start={start_total_samples}  final={latest_total_samples}  delta={total_delta}")
    print(f"ESP32 dropped_samples: start={start_dropped_samples}  final={latest_dropped_samples}  delta={dropped_delta}")
    print(f"ESP32 buffered_samples: start={start_buffered_samples}  min={buffered_min}  max={buffered_max}  final={latest_buffered_samples}")
    print("---")
    print(f"Average request latency: {avg_latency:.1f} ms")
    print(f"Maximum request latency: {max_latency:.1f} ms")
    print(f"Average batch size: {avg_batch:.1f} samples")
    print("---")
    if dropped_delta is None:
        print("VERDICT: UNKNOWN - /status never returned a usable dropped_samples value.")
    elif dropped_delta > 0:
        print(f"VERDICT: FAIL - dropped_samples increased by {dropped_delta} DURING this run (not historical).")
    elif dropped_delta == 0:
        print("VERDICT: dropped_samples_delta = 0 - no samples were lost during this run's window,")
        print("         per the ESP32's own counter. Combined with 0 sequence gaps and 0 timeouts,")
        print("         if both also hold, the transport layer passes this test.")
    else:
        print(f"VERDICT: UNKNOWN - dropped_samples DECREASED ({dropped_delta}), which means the ESP32")
        print("         counter was reset (e.g. reboot) during this run - treat this run as invalid,")
        print("         reset cleanly and re-run.")
    print("=============================================")
    print()


while True:

    elapsed_since_start = time.perf_counter() - run_start

    # Arm the steady-state boundary exactly once, the first time we cross
    # the warmup window - everything after this point counts toward the
    # steady-state rate; everything before it (which can be inflated by a
    # startup backlog being drained) does not.
    if steady_state_start_time is None and elapsed_since_start >= STEADY_STATE_WARMUP_SECONDS:
        steady_state_start_time = time.perf_counter()
        steady_state_start_sample_count = sample_counter

    if args.duration > 0 and elapsed_since_start >= args.duration:
        print()
        print(f"Duration limit reached ({args.duration:.0f}s).")
        check_status(quiet=True)  # final snapshot
        print_summary()
        break

    try:

        req_start = time.perf_counter()

        # Acknowledge the last sample we actually processed so the firmware
        # can safely free it from its ring buffer - see smartsense_128hz.ino
        # handleData()'s "ack" handling. Before this, the firmware freed a
        # batch the moment it copied it into the outgoing JSON, regardless
        # of whether the response ever actually reached us; a client-side
        # timeout after that point meant the samples were gone with no
        # record of it. Omitted on the very first request (nothing to ack
        # yet).
        params = {"ack": last_sequence} if last_sequence is not None else None

        response = esp32_session.get(
            DATA_URL,
            params=params,
            timeout=REQUEST_TIMEOUT
        )

        request_latencies_ms.append((time.perf_counter() - req_start) * 1000.0)

        response.raise_for_status()

        batch_arrival_wallclock = time.time()

        data = response.json()

        samples = data.get("samples", [])
        batch_sizes.append(len(samples))

        # Anchor this batch's samples to real wall-clock time: the LAST
        # sample in the batch is closest to "now" (batch_arrival_wallclock),
        # and earlier samples are placed using the ESP32's own relative
        # timestamp_us spacing (accurate hardware timing, just not a Unix
        # epoch) walked backward from that anchor. Falls back to spacing
        # samples evenly at the target rate if timestamp_us is missing.
        batch_wallclock_timestamps = []
        if samples:
            last_ts_us = samples[-1].get("timestamp_us")
            if last_ts_us is not None and all(s.get("timestamp_us") is not None for s in samples):
                for s in samples:
                    delta_s = (last_ts_us - s["timestamp_us"]) / 1_000_000.0
                    batch_wallclock_timestamps.append(batch_arrival_wallclock - delta_s)
            else:
                n = len(samples)
                for i in range(n):
                    batch_wallclock_timestamps.append(batch_arrival_wallclock - (n - 1 - i) / SAMPLE_RATE_HZ)

        # Periodic /status poll (piggybacked on the main loop, not a separate
        # busy-loop) to keep the ESP32-reported dropped/buffered numbers -
        # the ground truth for buffer high-water mark - current.
        now_for_status = time.perf_counter()
        if now_for_status - last_status_poll >= STATUS_POLL_INTERVAL:
            check_status(quiet=True)
            last_status_poll = now_for_status

        if not samples:
            time.sleep(0.005)
            continue

        # ----------------------------------------------------
        # PROCESS BATCH
        # ----------------------------------------------------

        for batch_idx, sample in enumerate(samples):

            sequence = sample.get("sequence")

            # -----------------------------------------------
            # Detect missing samples
            # -----------------------------------------------

            if last_sequence is not None:

                expected = last_sequence + 1

                if sequence != expected:

                    gap = sequence - expected

                    if gap > 0:

                        dropped_sequences += gap

                        print(
                            f"[WARNING] Sequence gap: "
                            f"expected {expected}, "
                            f"received {sequence}, "
                            f"missing {gap}"
                        )

            last_sequence = sequence

            # -----------------------------------------------
            # Count sample
            # -----------------------------------------------

            sample_counter += 1

            # -----------------------------------------------
            # Print occasional samples
            # -----------------------------------------------

            if sample_counter % PRINT_EVERY == 0:

                print(
                    f"EEG: {sample['eeg']} | "
                    f"EOG: {sample['eog']} | "
                    f"SEQ: {sequence}"
                )

            # -----------------------------------------------
            # Forward to backend
            # -----------------------------------------------

            if args.forward:

                forward_sample(sample, batch_wallclock_timestamps[batch_idx])

        # ----------------------------------------------------
        # RATE REPORT
        # ----------------------------------------------------

        now = time.perf_counter()

        if now - last_report_time >= 5.0:

            elapsed = now - last_report_time

            new_samples = (
                sample_counter -
                last_report_samples
            )

            measured_rate = new_samples / elapsed

            avg_latency = (sum(request_latencies_ms) / len(request_latencies_ms)) if request_latencies_ms else 0.0
            max_latency = max(request_latencies_ms) if request_latencies_ms else 0.0
            avg_batch = (sum(batch_sizes) / len(batch_sizes)) if batch_sizes else 0.0

            print()
            print("========== LIVE RATE ==========")
            print(
                f"Received samples: {new_samples}"
            )
            print(
                f"Measured rate: {measured_rate:.2f} Hz"
            )
            print(
                f"Sequence gaps: {dropped_sequences}"
            )
            print(
                f"HTTP timeouts: {timeout_count}"
            )
            print(
                f"Avg/Max request latency: {avg_latency:.1f} / {max_latency:.1f} ms"
            )
            print(
                f"Avg batch size: {avg_batch:.1f}"
            )
            print(
                f"ESP32 configured rate: "
                f"{data.get('sample_rate')} Hz"
            )
            print("===============================")
            print()

            last_report_time = now
            last_report_samples = sample_counter

        # Immediately request the next batch - no artificial pacing delay.
        # (The 1ms here is negligible compared to a ~0.5s natural batch
        # period at 128 Hz/64-sample batches; it is not a contributor to
        # the loss pattern and is left as-is rather than removed for its
        # own sake.)
        time.sleep(0.001)

    except requests.exceptions.Timeout as e:

        # A timeout means the ESP32/network was momentarily slow to respond,
        # not that the link is down - retry immediately. The old code slept
        # a full extra second here on top of the timeout itself, which is
        # exactly the kind of self-inflicted extra loss window a fresh
        # 60s hardware test should no longer show.
        timeout_count += 1
        print("[ESP32 TIMEOUT]", e)

    except requests.exceptions.RequestException as e:

        # A real connection failure (link actually down) - still recover
        # much faster than the original 1s, but don't hammer a genuinely
        # dead link with zero backoff either.
        print("[ESP32 CONNECTION ERROR]", e)

        time.sleep(CONNECTION_ERROR_BACKOFF)

    except KeyboardInterrupt:

        print()
        print("Receiver stopped.")

        print_summary()

        break

    except Exception as e:

        print("[ERROR]", e)

        time.sleep(CONNECTION_ERROR_BACKOFF)
