#include <WiFi.h>
#include <AsyncUDP.h>
#include <HTTPClient.h>
#include <IRremote.h>
#include <esp32DHT.h>

#include "config.h"

const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;

const char *notify_url = NOTIFY_URL;

//esp led pin
const int ledPin = 2;
//motion sensor
const int sensorPin = 27;

//udp
AsyncUDP udp;

//motion sensor state
int sensorState = 0;     // current state of the sensor
int lastSensorState = 0; // previous state of the sensor

//ir
IRsend irsend;
int khz = 38;

unsigned int IR_OFF[] = {3360, 1684, 460, 424, 504, 416, 460, 1212, 488, 448, 460, 1212, 484, 444, 460, 420, 484, 444, 460, 1220, 488, 1216, 480, 412, 488, 424, 524, 368, 488, 1236, 456, 1212, 488, 440, 484, 392, 488, 444, 460, 416, 488, 444, 460, 420, 488, 440, 464, 416, 488, 444, 460, 416, 488, 444, 460, 416, 488, 444, 484, 1188, 492, 440, 460, 416, 488, 444, 460, 420, 484, 444, 460, 416, 488, 440, 460, 1212, 488, 444, 460, 416, 488, 420, 484, 412, 488, 1236, 460, 416, 488, 444, 480, 392, 488, 440, 480, 396, 484, 444, 460, 1212, 532, 392, 460, 1212, 488, 1244, 460, 1212, 488, 1236, 460, 1208, 488, 1236, 460};
unsigned int IR_ON[] = {3388, 1660, 456, 412, 508, 396, 480, 1168, 488, 440, 460, 1208, 488, 440, 460, 408, 488, 436, 460, 1200, 488, 1232, 460, 420, 484, 440, 460, 412, 488, 1232, 460, 1196, 488, 436, 460, 396, 504, 440, 460, 412, 488, 436, 460, 412, 488, 440, 460, 408, 488, 436, 460, 408, 488, 436, 460, 388, 508, 436, 460, 1200, 488, 436, 460, 412, 484, 436, 460, 412, 484, 436, 464, 388, 504, 436, 460, 1200, 488, 436, 460, 408, 488, 436, 460, 408, 488, 1228, 460, 1200, 488, 1204, 480, 1204, 484, 1224, 460, 1200, 488, 1224, 460, 1200, 484, 436, 460, 404, 488, 1224, 460, 412, 484, 436, 460, 412, 484, 436, 460, 412, 488, 436, 464, 408, 484, 436, 460, 1200, 488, 1224, 460, 408, 488, 436, 460, 1200, 484, 436, 460, 412, 484, 436, 460, 412, 484, 1224, 460, 1200, 488, 1224, 460, 412, 488, 436, 460, 412, 488, 416, 480, 408, 488, 436, 460, 408, 488, 436, 460, 1200, 488, 1224, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 432, 460, 412, 488, 440, 460, 408, 488, 432, 464, 408, 484, 436, 464, 408, 484, 436, 464, 404, 488, 436, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 436, 460, 408, 488, 432, 460, 412, 484, 436, 460, 412, 488, 1228, 460, 408, 488, 436, 460, 408, 488, 436, 460, 1200, 488, 1228, 460, 408, 488, 436, 460, 1196, 488, 1228, 460};
unsigned int IR_30[] = {3340, 1620, 452, 376, 452, 376, 452, 1184, 456, 376, 452, 1184, 452, 380, 452, 380, 452, 388, 452, 1180, 452, 1184, 456, 356, 472, 380, 452, 376, 452, 1188, 452, 1184, 452, 388, 452, 376, 452, 380, 476, 356, 448, 380, 452, 380, 452, 380, 448, 384, 448, 392, 448, 384, 444, 380, 452, 380, 448, 384, 448, 1188, 448, 380, 452, 380, 452, 388, 452, 376, 452, 380, 448, 380, 452, 380, 452, 1184, 452, 380, 448, 384, 448, 392, 452, 376, 448, 1188, 452, 1184, 452, 1188, 448, 1188, 448, 1188, 448, 1188, 452, 1196, 452, 1180, 452, 380, 448, 380, 452, 1188, 448, 380, 452, 380, 452, 380, 448, 392, 448, 380, 448, 380, 452, 380, 448, 384, 448, 1188, 452, 1184, 452, 380, 452, 388, 452, 376, 452, 380, 448, 380, 452, 380, 452, 380, 448, 1188, 448, 1188, 452, 1196, 452, 1180, 452, 380, 448, 384, 448, 380, 452, 380, 452, 380, 448, 380, 452, 388, 452, 1184, 448, 1188, 452, 380, 452, 380, 448, 380, 452, 380, 452, 380, 448, 392, 452, 376, 448, 380, 452, 380, 452, 380, 448, 380, 452, 380, 452, 380, 448, 392, 452, 376, 448, 380, 452, 380, 452, 380, 448, 380, 452, 380, 452, 380, 452, 388, 452, 376, 452, 376, 452, 380, 452, 380, 452, 380, 448, 380, 452, 380, 452, 388, 452, 376, 452, 380, 452, 376, 452, 380, 452, 380, 452, 1184, 452, 380, 448, 392, 452, 372, 452, 380, 452, 1184, 452, 1188, 452, 376, 452, 380, 456, 1180, 452, 1196, 448};
unsigned int IR_29[] = {3336, 1624, 452, 376, 452, 376, 456, 1184, 452, 376, 452, 1184, 456, 376, 452, 380, 452, 388, 452, 1180, 456, 1180, 456, 376, 452, 380, 452, 376, 456, 1184, 452, 1184, 452, 388, 452, 376, 452, 380, 452, 376, 452, 380, 452, 380, 452, 380, 452, 380, 452, 388, 452, 376, 452, 376, 452, 380, 452, 380, 452, 1184, 452, 376, 456, 376, 452, 388, 452, 376, 452, 380, 452, 376, 452, 380, 452, 1184, 452, 380, 452, 380, 452, 388, 452, 376, 452, 1184, 452, 1184, 452, 1188, 452, 1184, 452, 1184, 452, 1184, 452, 1196, 452, 1180, 452, 380, 452, 380, 476, 1160, 452, 376, 456, 376, 452, 380, 452, 388, 452, 376, 452, 380, 452, 376, 452, 380, 452, 1184, 452, 1184, 588, 364, 452, 392, 448, 376, 452, 380, 452, 376, 452, 380, 452, 1184, 452, 380, 452, 1184, 452, 1196, 452, 1180, 452, 380, 452, 380, 448, 384, 448, 380, 452, 380, 452, 376, 456, 388, 452, 1184, 448, 1184, 452, 380, 556, 372, 452, 380, 448, 380, 452, 380, 452, 388, 452, 376, 452, 380, 448, 380, 452, 380, 452, 380, 448, 380, 452, 380, 452, 388, 452, 376, 452, 376, 452, 380, 452, 380, 452, 380, 448, 380, 452, 380, 452, 388, 452, 376, 452, 380, 452, 376, 452, 380, 452, 380, 452, 376, 452, 384, 452, 388, 452, 376, 448, 380, 452, 380, 452, 380, 448, 380, 452, 1184, 452, 380, 452, 388, 452, 376, 452, 380, 452, 1184, 452, 1184, 452, 1184, 452, 380, 452, 1184, 452, 1192, 452};
unsigned int IR_28[] = {3336, 1624, 420, 404, 448, 380, 452, 1188, 448, 384, 448, 1184, 452, 380, 452, 380, 452, 388, 452, 1184, 448, 1188, 448, 380, 452, 380, 452, 380, 448, 1188, 448, 1188, 452, 388, 452, 376, 452, 380, 448, 380, 452, 384, 448, 380, 452, 380, 448, 384, 448, 392, 448, 380, 448, 380, 452, 380, 452, 380, 448, 1188, 448, 380, 452, 380, 452, 388, 452, 376, 452, 380, 448, 380, 452, 380, 452, 1184, 452, 380, 452, 380, 448, 392, 448, 380, 448, 1188, 448, 1188, 452, 1188, 448, 1188, 448, 1188, 452, 1188, 448, 1196, 452, 1180, 452, 380, 452, 360, 468, 1188, 452, 380, 448, 380, 452, 380, 452, 388, 452, 376, 452, 376, 452, 380, 452, 380, 452, 1184, 452, 1188, 448, 384, 448, 392, 448, 376, 452, 408, 452, 360, 468, 380, 452, 380, 452, 380, 448, 1188, 452, 1196, 448, 1184, 452, 380, 448, 380, 452, 380, 452, 380, 448, 380, 452, 380, 452, 388, 452, 1184, 448, 1188, 452, 488, 448, 380, 452, 380, 452, 380, 448, 384, 448, 392, 448, 376, 452, 380, 452, 380, 448, 384, 448, 380, 476, 356, 448, 384, 448, 392, 448, 380, 448, 380, 452, 380, 448, 384, 448, 380, 452, 380, 448, 384, 448, 392, 448, 380, 448, 380, 452, 380, 448, 384, 448, 380, 452, 380, 452, 380, 452, 388, 452, 376, 452, 380, 448, 380, 452, 380, 452, 380, 448, 1188, 452, 380, 448, 392, 452, 376, 448, 380, 452, 1188, 448, 1188, 452, 376, 456, 1180, 452, 1188, 448, 1196, 452};

//temp, humidity sensor
DHT11 dht;
volatile uint8_t error = 0;
volatile int8_t result = 0;
volatile float humidity = 0;
volatile float temperature = 0;

void sendNotifyEvent(const String &eventURI)
{
  HTTPClient http;
  http.begin(notify_url + eventURI); //HTTP
  Serial.print("Sending request..." + eventURI);
  // start connection and send HTTP header
  int httpCode = http.GET();
  Serial.printf("Got response code: %d\n", httpCode);

  // httpCode will be negative on error
  if (httpCode > 0)
  {
    // file found at server
    if (httpCode == HTTP_CODE_OK)
    {
      String payload = http.getString();
      Serial.printf("Request response text: %s\n", payload);
    }
  }

  http.end();
}

void IRAM_ATTR isr()
{
  //digitalWrite(ledPin, HIGH);
  //sendMotionDetectionEvent();
  sensorState = 1;
}

void setup()
{
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT);

  setupMotionSensor();

  setupWIFI();

  setupUDPListener();

  setupDHT();
}

void setupMotionSensor()
{
  pinMode(sensorPin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(sensorPin), isr, RISING);
}

void setupWIFI()
{
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  Serial.printf("Connecting to %s\n", ssid);

  if (WiFi.waitForConnectResult() != WL_CONNECTED)
  {
    Serial.println("WiFi Failed");
    while (1)
    {
      delay(1000);
    }
  }

  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void setupUDPListener()
{
  if (udp.listen(5000))
  {
    Serial.print("UDP Listening on IP: ");
    Serial.println(WiFi.localIP());
    udp.onPacket([](AsyncUDPPacket packet) {
      Serial.print("UDP Packet Type: ");
      Serial.print(packet.isBroadcast() ? "Broadcast" : packet.isMulticast() ? "Multicast" : "Unicast");
      Serial.print(", From: ");
      Serial.print(packet.remoteIP());
      Serial.print(":");
      Serial.print(packet.remotePort());
      Serial.print(", To: ");
      Serial.print(packet.localIP());
      Serial.print(":");
      Serial.print(packet.localPort());
      Serial.print(", Length: ");
      Serial.print(packet.length());
      Serial.print(", Data: ");
      Serial.write(packet.data(), packet.length());
      Serial.println();

      String str = (char *)packet.data();

      String state = str.substring(str.length() - 2);

      Serial.print("State: ");
      Serial.println(state);

      blinkLed();

      if (str.indexOf("cooler") >= 0)
      {
        if (state == "ff")
        {
          irsend.sendRaw(IR_OFF, sizeof(IR_OFF) / sizeof(int), khz);
        }
        else if (state == "on")
        {
          irsend.sendRaw(IR_ON, sizeof(IR_ON) / sizeof(int), khz);
        }
        else if (state == "30")
        {
          irsend.sendRaw(IR_30, sizeof(IR_30) / sizeof(int), khz);
        }
        else if (state == "29")
        {
          irsend.sendRaw(IR_29, sizeof(IR_29) / sizeof(int), khz);
        }
        else if (state == "28")
        {
          irsend.sendRaw(IR_28, sizeof(IR_28) / sizeof(int), khz);
        }
      }
      else if (str.indexOf("light") >= 0)
      {
        if (state == "ff")
        {
          digitalWrite(ledPin, LOW);
        }
        else if (state == "on")
        {
          digitalWrite(ledPin, HIGH);
        }
      }
      else if (str.indexOf("weather") >= 0)
      {
        char url[100];
        sprintf(url, "/weather?t=%g&h=%g", temperature, humidity);
        sendNotifyEvent(url);
      }

      //reply to the client
      packet.printf("Got %u bytes of data", packet.length());
    });
  }
}

void ICACHE_RAM_ATTR handleData(float h, float t)
{
  result = 1;
  humidity = h;
  temperature = t;
  if (result > 0)
  {
    Serial.printf("Humid: %g%%\n", h);
    Serial.printf("Temp: %g Celsius\n", t);
  }
  else if (result < 0)
  {
    Serial.printf("DHT Error: %s\n", dht.getError());
  }
  result = 0;
}

// this callback will be called from an interrupt
// it should be short and carry the ICACHE_RAM_ATTR attribute
void ICACHE_RAM_ATTR handleError(uint8_t e)
{
  error = e;
  result = -1;
  Serial.printf("DHT Error: %u\n", error);
}

void setupDHT()
{
  dht.setup(23);
  //  dht.setCallback([](int8_t result) {
  //    if (result > 0) {
  //      Serial.printf("Temp: %.1f°C\nHumid: %.1f%%\n", dht.getTemperature(), dht.getHumidity());
  //    } else {
  //      Serial.printf("Sensor error: %s", dht.getError());
  //    }
  //  });

  dht.onData(handleData);
  dht.onError(handleError);
}

void blinkLed()
{
  digitalWrite(ledPin, HIGH);
  delay(500);
  digitalWrite(ledPin, LOW);
}

void loop()
{
  //delay(1000);
  //Send broadcast
  //udp.broadcast("Anyone here?");

  //  sensorState = digitalRead(sensorPin);
  //  if (sensorState != lastSensorState && sensorState == HIGH)
  //    sendMotionDetectionEvent();
  //  lastSensorState = sensorState;

  if (sensorState == 1)
  {
    sensorState = 0;
    char url[100];
    sprintf(url, "/motion?id=%s", DEVICE_ID);
    sendNotifyEvent(url);
  }

  static uint32_t lastMillis = 0;
  if (millis() - lastMillis > 5000)
  {
    lastMillis = millis();
    dht.read();
    delay(500);
    dht.read();
  }
}
