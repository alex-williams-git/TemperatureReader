#include <Arduino.h>
#include "DHT.h"

#define DHTPIN 2        // Digital pin connected to the DHT sensor
#define DHTTYPE DHT11   // DHT 11

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  // DHT11 hard floor: ~2s between reads (slow sensor). See CLAUDE.md.
  delay(10000);

  float humidity = dht.readHumidity();
  float temp = dht.readTemperature();      // Celsius
  float temp_f = dht.readTemperature(true);  // Fahrenheit

  // Emit errors as JSON too, so the backend has ONE parsing code path.
  if (isnan(humidity) || isnan(temp) || isnan(temp_f)) {
    Serial.println("{\"error\":\"Failed to read from DHT sensor\"}");
    return;
  }

  // One JSON object per line. 1 decimal place only - more would be false
  // precision for a +/-2C sensor.
  Serial.print("{\"temp_c\":");
  Serial.print(temp, 1);
  Serial.print(",\"temp_f\":");
  Serial.print(temp_f, 1);
  Serial.print(",\"humidity\":");
  Serial.print(humidity, 1);
  Serial.println("}");
}
