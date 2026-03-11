import requests
import time

def test_api():
    base_url = "http://127.0.0.1:8055"
    print("Testing Backend API Endpoints...")
    time.sleep(2) # Give server time to boot

    # 1. Health
    try:
        r = requests.get(f"{base_url}/health")
        print(f"Health: {r.status_code} - {r.json()}")
    except requests.exceptions.ConnectionError:
        print("Error: Server is not running. Start server.py first.")
        return

    # 2. Config Get
    r = requests.get(f"{base_url}/config")
    print(f"Config GET: {r.status_code}")
    
    # 3. Skills Get
    r = requests.get(f"{base_url}/skills")
    print(f"Skills GET: {r.status_code} - Found {len(r.json().get('skills', []))} skills")

    # 4. Config Update (Testing Hot Reload)
    updates = {"llm": {"temperature": 0.5}}
    r = requests.post(f"{base_url}/config", json=updates)
    print(f"Config POST: {r.status_code} - {r.json()}")

if __name__ == "__main__":
    test_api()
