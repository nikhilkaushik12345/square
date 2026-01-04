import express from "express";
import fetch from "node-fetch";
import path from "path";
import http2 from "http2"; // Native HTTP/2 module
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// CONFIGURATION
// ==========================================
const CLIENT_ID = "4RyTgR2EVMbRKlfD";
const CLIENT_SECRET = "EXQslIrwVRFT6Degkl9Cubsfq1cJQPsO";
const REDIRECT_URI = "https://127.0.0.1";
const CODE_VERIFIER = "O8cEmIWIOAtvEr6fdFzjnM1q-lTRmGS7GPwcLU8ceSg";

const MCP_HOST = "https://mcp.squareup.com";
const USER_AGENT = "BurpSuite";

// ==========================================
// MCP CLIENT LOGIC (Node.js Implementation)
// ==========================================
function runMcpClient(accessToken) {
    return new Promise((resolve, reject) => {
        let logs = [];
        const log = (msg) => {
            console.log(msg);
            logs.push(msg);
        };

        log("[MCP] Initializing HTTP/2 Client...");

        const session = http2.connect(MCP_HOST);
        
        session.on('error', (err) => {
            log(`[MCP ERROR] Session error: ${err.message}`);
            resolve(logs.join('\n'));
        });

        // Headers for SSE
        const sseHeaders = {
            ':path': '/sse',
            ':method': 'GET',
            'authorization': `Bearer ${accessToken}`,
            'accept': 'text/event-stream',
            'user-agent': USER_AGENT,
            'cache-control': 'no-cache'
        };

        const sseStream = session.request(sseHeaders);
        
        let buffer = "";
        let sessionId = null;
        let postUrlPath = null;
        let currentStep = 0; // 0=WaitID, 1=List, 2=Create

        // Customer Payload
        const customerPayload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "make_api_request",
                "arguments": {
                    "service": "customers",
                    "method": "create",
                    "request": {
                        "given_name": "Nikhil",
                        "family_name": "Kaushik User (NodeJS)",
                        "email_address": "travelokfhaisudhaiushdiashdiuh@gmail.com"
                    },
                    "characterization": "Create a new customer for testing"
                }
            },
            "id": 2
        };

        // Helper to send POST requests over the same HTTP/2 session
        const sendJsonRpc = (payload, description) => {
            if (!sessionId || !postUrlPath) return;

            log(`\n[POST] Sending ${description}...`);
            
            const reqHeaders = {
                ':path': postUrlPath,
                ':method': 'POST',
                'authorization': `Bearer ${accessToken}`,
                'content-type': 'application/json',
                'user-agent': USER_AGENT,
                'accept': 'application/json, text/event-stream',
                'mcp-session-id': sessionId
            };

            const req = session.request(reqHeaders);
            req.setEncoding('utf8');
            req.write(JSON.stringify(payload));
            req.end();

            req.on('response', (headers) => {
                log(`[POST] Status: ${headers[':status']}`);
            });
        };

        sseStream.setEncoding('utf8');
        
        sseStream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last incomplete line

            for (const line of lines) {
                if (!line.trim()) continue;

                // 1. Capture Session ID
                if (line.startsWith("data:") && line.includes("sessionId=")) {
                    const dataStr = line.replace("data: ", "").trim();
                    const match = dataStr.match(/sessionId=([^&]+)/);
                    
                    if (match) {
                        sessionId = match[1];
                        // Extract relative path from full URL or data string
                        // e.g., "/sse/message?sessionId=..."
                        postUrlPath = dataStr.replace(MCP_HOST, ""); 
                        
                        if (currentStep === 0) {
                            log(`[SSE] Session ID Captured: ${sessionId}`);
                            
                            // STEP 1: Tools List
                            sendJsonRpc({
                                "jsonrpc": "2.0", 
                                "method": "tools/list", 
                                "id": 1
                            }, "tools/list (ID: 1)");
                            currentStep = 1;
                        }
                    }
                }

                // 2. Handle JSON-RPC Responses
                if (line.startsWith("data:") && line.includes("jsonrpc")) {
                    try {
                        const content = line.replace("data: ", "").trim();
                        const data = JSON.parse(content);

                        // Response to tools/list (ID: 1)
                        if (data.id === 1 && currentStep === 1) {
                            log("\n========================================\n [SUCCESS] TOOLS LIST RECEIVED\n========================================");
                            
                            // STEP 2: Create Customer
                            sendJsonRpc(customerPayload, "Create Customer (ID: 2)");
                            currentStep = 2;
                        }

                        // Response to Create Customer (ID: 2)
                        else if (data.id === 2 && currentStep === 2) {
                            log("\n========================================\n [SUCCESS] CUSTOMER CREATED\n========================================");
                            log(JSON.stringify(data, null, 2));
                            
                            // Cleanup and Finish
                            session.close();
                            resolve(logs.join('\n'));
                        }

                        else if (data.error) {
                            log(`[ERROR] JSON-RPC Error: ${JSON.stringify(data.error)}`);
                        }

                    } catch (e) {
                        // ignore parsing errors for non-json lines
                    }
                }
            }
        });

        sseStream.on('end', () => {
            log("[SSE] Stream Closed");
            resolve(logs.join('\n'));
        });
    });
}

// ==========================================
// EXPRESS SERVER ROUTES
// ==========================================

app.post("/exchange", async (req, res) => {
    try {
        const { code } = req.body;
        console.log("[SERVER] Exchanging code:", code);

        // 1. Exchange Code for Token
        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", REDIRECT_URI);
        params.append("client_id", CLIENT_ID);
        params.append("client_secret", CLIENT_SECRET);
        params.append("code_verifier", CODE_VERIFIER);

        const tokenRes = await fetch("https://mcp.squareup.com/token", {
            method: "POST",
            headers: { 
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: params.toString()
        });

        const tokenData = await tokenRes.json();
        
        if (!tokenData.access_token) {
            return res.status(400).json(tokenData);
        }

        console.log("[SERVER] Token retrieved. Starting MCP Client...");

        // 2. Run Internal MCP Client
        const mcpLogs = await runMcpClient(tokenData.access_token);

        // 3. Return Results
        res.json({
            token_data: tokenData,
            mcp_logs: mcpLogs
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
