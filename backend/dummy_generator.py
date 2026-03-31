import requests
import time
import random

API_URL = "http://127.0.0.1:8000"

SENSORS = [
    {"device_id": "sensor_grocka_01", "lat": 44.6758, "lon": 20.7175, "owner_address": "0x111111111111"},
    {"device_id": "sensor_bg_centar", "lat": 44.8125, "lon": 20.4612, "owner_address": "0x222222222222"},
    {"device_id": "sensor_nbg_01", "lat": 44.8200, "lon": 20.4100, "owner_address": "0x333333333333"}
]

def register_sensors():
    print("--- Registering Sensors ---")
    for sensor in SENSORS:
        try:
            response = requests.post(f"{API_URL}/sensors/", json=sensor)
            if response.status_code == 200:
                print(f"Registered: {sensor['device_id']}")
            elif response.status_code == 400:
                print(f"Already exists: {sensor['device_id']}")
            else:
                print(f"Failed to register {sensor['device_id']}: {response.text}")
        except requests.exceptions.ConnectionError:
            print("Cannot connect to API. Is the Uvicorn server running?")
            return False
    return True

def generate_telemetry():
    print("\n--- Starting Telemetry Generation (Press CTRL+C to stop) ---")
    while True:
        for sensor in SENSORS:
            base_pm25 = random.uniform(5.0, 45.0)
            
            pm10_value = round(base_pm25 * random.uniform(1.2, 1.8), 2)
            pm25_value = round(base_pm25, 2)
            
            payload = {
                "device_id": sensor["device_id"],
                "pm25": pm25_value,
                "pm10": pm10_value
            }
            
            try:
                response = requests.post(f"{API_URL}/telemetry/", json=payload)
                if response.status_code == 200:
                    print(f"[{time.strftime('%H:%M:%S')}] Data sent for {sensor['device_id']} -> PM2.5: {pm25_value}, PM10: {pm10_value}")
                else:
                    print(f"Sending failed for {sensor['device_id']}: {response.text}")
            except Exception as e:
                print(f"Error occurred: {e}")
        
        print("Waiting 10 seconds...\n")
        time.sleep(10)

if __name__ == "__main__":
    if register_sensors():
        generate_telemetry()