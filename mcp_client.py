import asyncio
import json
import httpx
import re
import sys

# Configuration
HOST = "https://mcp.squareup.com"
USER_AGENT = "BurpSuite"

# Get Token from Command Line Arguments
if len(sys.argv) < 2:
    print("[ERROR] No access token provided")
    sys.exit(1)

TOKEN = sys.argv[1]

# Payload for creating the customer
CUSTOMER_PAYLOAD = {
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
        "name": "make_api_request",
        "arguments": {
            "service": "customers",
            "method": "create",
            "request": {
                "given_name": "Nikhil",
                "family_name": "Kaushik User",
                "email_address": "travelokfhaisudhaiushdiashdiuh@gmail.com"
            },
            "characterization": "Create a new customer for testing"
        }
    },
    "id": 2
}

async def send_json_rpc(client, post_url, session_id, payload, description):
    """Helper to send JSON-RPC requests asynchronously."""
    await asyncio.sleep(0.5)
    
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "Accept": "application/json, text/event-stream",
        "Mcp-Session-Id": session_id
    }

    print(f"\n[POST] Sending {description}...")
    response = await client.post(post_url, json=payload, headers=headers)
    print(f"[POST] Status: {response.status_code}")

async def run_mcp_client():
    headers_sse = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "text/event-stream",
        "User-Agent": USER_AGENT,
        "Cache-Control": "no-cache"
    }

    async with httpx.AsyncClient(http2=True, timeout=60.0) as client:
        print(f"[SSE] Connecting to: {HOST}/sse")
        
        async with client.stream("GET", f"{HOST}/sse", headers=headers_sse) as response:
            if response.status_code != 200:
                print(f"[-] Connection Failed: {response.status_code}")
                return

            print("[SSE] Connected. Waiting for Session ID...")
            
            current_step = 0
            session_id = None
            post_url = None

            async for line in response.aiter_lines():
                if not line: continue
                
                # 1. Capture Session ID
                if line.startswith("data:") and "sessionId=" in line:
                    data_str = line.replace("data: ", "").strip()
                    match = re.search(r'sessionId=([^&]+)', data_str)
                    
                    if match:
                        session_id = match.group(1)
                        if data_str.startswith("http"):
                            post_url = data_str
                        else:
                            post_url = f"{HOST}{data_str}"

                        if current_step == 0:
                            print(f"[SSE] Session ID Captured: {session_id}")
                            list_payload = {"jsonrpc": "2.0", "method": "tools/list", "id": 1}
                            asyncio.create_task(
                                send_json_rpc(client, post_url, session_id, list_payload, "tools/list (ID: 1)")
                            )
                            current_step = 1

                # 2. Handle JSON-RPC Responses
                if line.startswith("data:") and "jsonrpc" in line:
                    content = line.replace("data: ", "").strip()
                    try:
                        data = json.loads(content)
                        msg_id = data.get("id")

                        if msg_id == 1 and current_step == 1:
                            print("\n" + "="*40 + "\n [SUCCESS] TOOLS LIST RECEIVED\n" + "="*40)
                            asyncio.create_task(
                                send_json_rpc(client, post_url, session_id, CUSTOMER_PAYLOAD, "Create Customer (ID: 2)")
                            )
                            current_step = 2

                        elif msg_id == 2 and current_step == 2:
                            print("\n" + "="*40 + "\n [SUCCESS] CUSTOMER CREATED\n" + "="*40)
                            print(json.dumps(data, indent=2))
                            return 

                        elif "error" in data:
                            print(f"\n[ERROR] JSON-RPC Error: {data['error']}")

                    except json.JSONDecodeError:
                        pass

if __name__ == "__main__":
    try:
        asyncio.run(run_mcp_client())
    except KeyboardInterrupt:
        print("\nStopped.")
