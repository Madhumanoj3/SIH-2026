#include <WiFi.h>
#include <WebServer.h>
#include "esp_timer.h"

// ============================================================
// WIFI
// ============================================================

const char* ssid = "ESP32";
const char* password = "espesp32";

// ============================================================
// ADC PINS
// ============================================================

#define EEG_PIN 34
#define EOG_PIN 35

// ============================================================
// SAMPLING CONFIGURATION
// ============================================================

#define SAMPLE_RATE 128
#define SAMPLE_PERIOD_US 7812   // approximately 1/128 sec

// Number of samples returned per HTTP request
#define MAX_BATCH_SIZE 64

// Ring buffer size
#define BUFFER_SIZE 1024

// ============================================================
// WEB SERVER
// ============================================================

WebServer server(80);

// ============================================================
// SAMPLE STRUCTURE
// ============================================================

struct Sample {
  uint32_t sequence;
  uint32_t timestamp_us;
  uint16_t eeg;
  uint16_t eog;
};

// ============================================================
// RING BUFFER
// ============================================================

Sample sampleBuffer[BUFFER_SIZE];

volatile uint16_t writeIndex = 0;
volatile uint16_t readIndex = 0;

volatile uint32_t totalSamples = 0;
volatile uint32_t droppedSamples = 0;
volatile uint32_t sequenceNumber = 0;

// Used to protect buffer access between sampling and HTTP tasks
portMUX_TYPE bufferMux = portMUX_INITIALIZER_UNLOCKED;

// ============================================================
// SAMPLING TIMER
// ============================================================

esp_timer_handle_t samplingTimer;

// ============================================================
// SAMPLING CALLBACK
// ============================================================

void sampleCallback(void* arg) {

  uint16_t eegValue = analogRead(EEG_PIN);
  uint16_t eogValue = analogRead(EOG_PIN);

  uint32_t now = micros();

  portENTER_CRITICAL(&bufferMux);

  uint16_t nextIndex = (writeIndex + 1) % BUFFER_SIZE;

  // Buffer full
  if (nextIndex == readIndex) {

    droppedSamples++;

    // Drop oldest sample to keep acquisition running
    readIndex = (readIndex + 1) % BUFFER_SIZE;
  }

  sampleBuffer[writeIndex].sequence = sequenceNumber++;
  sampleBuffer[writeIndex].timestamp_us = now;
  sampleBuffer[writeIndex].eeg = eegValue;
  sampleBuffer[writeIndex].eog = eogValue;

  writeIndex = nextIndex;

  totalSamples++;

  portEXIT_CRITICAL(&bufferMux);
}

// ============================================================
// BUFFER COUNT
// ============================================================

uint16_t getBufferCount() {

  uint16_t count;

  portENTER_CRITICAL(&bufferMux);

  if (writeIndex >= readIndex) {
    count = writeIndex - readIndex;
  } else {
    count = BUFFER_SIZE - readIndex + writeIndex;
  }

  portEXIT_CRITICAL(&bufferMux);

  return count;
}

// ============================================================
// /data ENDPOINT
// ============================================================

// ROOT CAUSE FIX (2/2): this used to advance readIndex (i.e. permanently
// remove samples from the ring buffer) WHILE copying them into the outgoing
// JSON - before server.send() had confirmed a single byte reached the
// client. If that send() then stalled/timed out client-side (exactly what
// the WiFi power-save issue above was causing), those samples were gone
// forever - not counted as droppedSamples (that counter only fires on
// genuine ring-full overwrite), just silently missing from the client's
// sequence numbers.
//
// Fix: readIndex now only ever advances when the CLIENT explicitly
// acknowledges (via ?ack=<sequence>) having already processed samples up to
// that point, on a LATER request. handleData() itself only PEEKS the next
// batch (a local index, never written back to readIndex) and never removes
// anything just because it was sent. If the client genuinely stalls for a
// long time (crashes, network down) and never sends another ack, the ring
// buffer still degrades exactly as before once truly full: sampleCallback's
// existing overflow path evicts the oldest sample and correctly increments
// droppedSamples - so the honest "buffer exhausted, we dropped N" case is
// unchanged, but the SILENT "sent but never delivered" loss case is gone.
void handleData() {

  if (server.hasArg("ack")) {

    uint32_t ackedSequence = strtoul(server.arg("ack").c_str(), nullptr, 10);

    portENTER_CRITICAL(&bufferMux);

    while (readIndex != writeIndex) {

      uint32_t seqAtRead = sampleBuffer[readIndex].sequence;

      // Stop as soon as the buffered sample is newer than what the client
      // has acknowledged - signed subtraction makes this correct even
      // around the (practically unreachable in a real test) uint32 wrap.
      if ((int32_t)(ackedSequence - seqAtRead) < 0) {
        break;
      }

      readIndex = (readIndex + 1) % BUFFER_SIZE;
    }

    portEXIT_CRITICAL(&bufferMux);
  }

  String json;

  json.reserve(6000);

  json += "{";
  json += "\"sample_rate\":";
  json += String(SAMPLE_RATE);
  json += ",";

  json += "\"count\":";

  uint16_t available = getBufferCount();

  uint16_t count = available;

  if (count > MAX_BATCH_SIZE) {
    count = MAX_BATCH_SIZE;
  }

  json += String(count);
  json += ",";

  json += "\"samples\":[";

  uint16_t peekIndex;

  portENTER_CRITICAL(&bufferMux);
  peekIndex = readIndex;
  portEXIT_CRITICAL(&bufferMux);

  for (uint16_t i = 0; i < count; i++) {

    Sample s;

    portENTER_CRITICAL(&bufferMux);

    s = sampleBuffer[peekIndex];

    peekIndex = (peekIndex + 1) % BUFFER_SIZE;

    portEXIT_CRITICAL(&bufferMux);

    if (i > 0) {
      json += ",";
    }

    json += "{";

    json += "\"sequence\":";
    json += String(s.sequence);
    json += ",";

    json += "\"timestamp_us\":";
    json += String(s.timestamp_us);
    json += ",";

    json += "\"eeg\":";
    json += String(s.eeg);
    json += ",";

    json += "\"eog\":";
    json += String(s.eog);

    json += "}";
  }

  json += "]";
  json += "}";

  server.send(200, "application/json", json);

  // NOTE: readIndex is intentionally NOT advanced here anymore - see the
  // comment above the function.
}

// ============================================================
// /status ENDPOINT
// ============================================================

void handleStatus() {

  uint16_t buffered = getBufferCount();

  String json;
  json.reserve(200);
  json += "{";

  json += "\"sample_rate\":";
  json += String(SAMPLE_RATE);
  json += ",";

  json += "\"total_samples\":";
  json += String(totalSamples);
  json += ",";

  json += "\"dropped_samples\":";
  json += String(droppedSamples);
  json += ",";

  json += "\"buffered_samples\":";
  json += String(buffered);
  json += ",";

  json += "\"buffer_size\":";
  json += String(BUFFER_SIZE);

  json += "}";

  server.send(200, "application/json", json);
}

// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("========================================");
  Serial.println("SmartSense ESP32 Live Acquisition");
  Serial.println("========================================");

  // ----------------------------------------------------------
  // ADC
  // ----------------------------------------------------------

  analogReadResolution(12);

  pinMode(EEG_PIN, INPUT);
  pinMode(EOG_PIN, INPUT);

  Serial.println("ADC configured");
  Serial.println("EEG GPIO: 34");
  Serial.println("EOG GPIO: 35");
  Serial.println("ADC resolution: 12-bit");

  // ----------------------------------------------------------
  // WIFI
  // ----------------------------------------------------------

  WiFi.mode(WIFI_STA);

  Serial.println();
  Serial.println("Connecting to WiFi...");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {

    delay(500);

    Serial.print(".");
  }

  // ROOT CAUSE FIX (1/2): ESP32 WiFi modem-sleep power-save is ON by
  // default. It periodically sleeps the radio between DTIM beacons and
  // queues/delays TCP traffic until the next wake window - this is the
  // most common, well-documented cause of a "normal most of the time,
  // then a ~100-500ms stall" pattern, and matches the observed 532ms
  // max request latency closely. server.send() below is a fully
  // synchronous/blocking write, so this stall shows up directly as a
  // stalled /data (and /status) response.
  WiFi.setSleep(false);

  Serial.println();
  Serial.println("WiFi connected!");

  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());

  // ----------------------------------------------------------
  // HTTP ENDPOINTS
  // ----------------------------------------------------------

  server.on("/data", HTTP_GET, handleData);

  server.on("/status", HTTP_GET, handleStatus);

  server.begin();

  Serial.println();
  Serial.println("HTTP server started");

  Serial.print("Data endpoint: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/data");

  Serial.print("Status endpoint: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/status");

  // ----------------------------------------------------------
  // HIGH FREQUENCY SAMPLING TIMER
  // ----------------------------------------------------------

  const esp_timer_create_args_t timerArgs = {
    .callback = &sampleCallback,
    .arg = NULL,
    .dispatch_method = ESP_TIMER_TASK,
    .name = "EEG_EOG_SAMPLER"
  };

  esp_err_t result = esp_timer_create(&timerArgs, &samplingTimer);

  if (result != ESP_OK) {

    Serial.println("ERROR: Could not create sampling timer");

    while (true) {
      delay(1000);
    }
  }

  result = esp_timer_start_periodic(
    samplingTimer,
    SAMPLE_PERIOD_US
  );

  if (result != ESP_OK) {

    Serial.println("ERROR: Could not start sampling timer");

    while (true) {
      delay(1000);
    }
  }

  Serial.println();
  Serial.println("========================================");
  Serial.println("SAMPLING STARTED");
  Serial.println("Target rate: 128 Hz");
  Serial.println("Period: ~7812 us");
  Serial.println("Buffer: 1024 samples");
  Serial.println("Batch size: 64 samples");
  Serial.println("========================================");
}

// ============================================================
// LOOP
// ============================================================

unsigned long lastDiagnostic = 0;
uint32_t lastDiagnosticSamples = 0;

void loop() {

  server.handleClient();

  // ----------------------------------------------------------
  // Diagnostic output once every second
  // ----------------------------------------------------------

  if (millis() - lastDiagnostic >= 1000) {

    lastDiagnostic = millis();

    uint32_t currentSamples = totalSamples;

    uint32_t samplesThisSecond =
      currentSamples - lastDiagnosticSamples;

    lastDiagnosticSamples = currentSamples;

    uint16_t buffered = getBufferCount();

    Serial.print("Rate: ");
    Serial.print(samplesThisSecond);

    Serial.print(" Hz | Total: ");
    Serial.print(currentSamples);

    Serial.print(" | Buffer: ");
    Serial.print(buffered);

    Serial.print("/");
    Serial.print(BUFFER_SIZE);

    Serial.print(" | Dropped: ");
    Serial.println(droppedSamples);
  }
}