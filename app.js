import express from "express";
import fetch from "node-fetch";
import path from "path";
import http2 from "http2";
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
// MCP CLIENT LOGIC
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
        
        // State Machine:
        // 0: Initial
        // 1: Waiting for Tools List (ID 1)
        // 2: Waiting for Create Customer (ID 2)
        // 3: Waiting for Create Team Member (ID 3)
        let currentStep = 0; 

        // --- PAYLOADS ---

        // 1. Create Customer
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
                        "family_name": "Kaushik",
                        "email_address": "travelokafbhdaiuhdsaiushd@gmail.com"
                    },
                    "characterization": "Create Nikhil Kaushik Customer"
                }
            },
            "id": 2
        };

        // 2. Create Team Member (Bulk)
        const teamMemberPayload = {
            "jsonrpc": "2.0",
            "method": "tools/call",
            "params": {
                "name": "make_api_request",
                "arguments": {
                    "service": "team",
                    "method": "bulkCreatemembers", // Note: Verify method name case-sensitivity (API often uses snake_case or camelCase)
                    "request": {
                        "team_members": {
                            "invite_nikhil_kaushik_20260103": {
                                "team_member": {
                                    "given_name": "Nikhil",
                                    "family_name": "Kaushik",
                                    "email_address": "travelokafbhdaiuhdsaiushd@gmail.com",
                                    "assigned_locations": {
                                        "location_ids": ["LEM77QX2ADM7X"],
                                        "assignment_type": "EXPLICIT_LOCATIONS"
                                    },
                                    "wage_setting": {
                                        "job_assignments": [
                                            {
                                                "job_id": "BwEYtsGojCAdzMTVG1ZC5HHC",
                                                "pay_type": "SALARY",
                                                "annual_rate": {
                                                    "amount": 0,
                                                    "currency": "USD"
                                                },
                                                "weekly_hours": 40
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    "characterization": "Add Nikhil Kaushik as Team Member"
                }
            },
            "id": 3
        };

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
                log(`[POST STATUS] ${headers[':status']}`);
            });
        };

        sseStream.setEncoding('utf8');
        
        sseStream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop(); 

            for (const line of lines) {
                if (!line.trim()) continue;

                // Capture Session ID
                if (line.startsWith("data:") && line.includes("sessionId=")) {
                    const dataStr = line.replace("data: ", "").trim();
                    const match = dataStr.match(/sessionId=([^&]+)/);
                    
                    if (match) {
                        sessionId = match[1];
                        postUrlPath = dataStr.replace(MCP_HOST, ""); 
                        
                        if (currentStep === 0) {
                            log(`[SSE] Session ID Captured: ${sessionId}`);
                            
                            // STEP 1: List Tools
                            sendJsonRpc({
                                "jsonrpc": "2.0", 
                                "method": "tools/list", 
                                "id": 1
                            }, "tools/list (ID: 1)");
                            currentStep = 1;
                        }
                    }
                }

                // Handle JSON-RPC Responses
                if (line.startsWith("data:") && line.includes("jsonrpc")) {
                    try {
                        const content = line.replace("data: ", "").trim();
                        const data = JSON.parse(content);
                        const msgId = data.id;

                        // ID 1: Tools List Received -> Send Create Customer
                        if (msgId === 1 && currentStep === 1) {
                            log("\n[SUCCESS] TOOLS LIST RECEIVED");
                            sendJsonRpc(customerPayload, "Create Customer (ID: 2)");
                            currentStep = 2;
                        }

                        // ID 2: Customer Created -> Send Create Team Member
                        else if (msgId === 2 && currentStep === 2) {
                            log("\n[SUCCESS] CUSTOMER CREATED");
                            log(JSON.stringify(data, null, 2));
                            
                            sendJsonRpc(teamMemberPayload, "Create Team Member (ID: 3)");
                            currentStep = 3;
                        }

                        // ID 3: Team Member Created -> FINISH
                        else if (msgId === 3 && currentStep === 3) {
                            log("\n[SUCCESS] TEAM MEMBER CREATED");
                            log(JSON.stringify(data, null, 2));
                            
                            session.close();
                            resolve(logs.join('\n'));
                        }

                        else if (data.error) {
                            log(`\n[ERROR] JSON-RPC Error (ID: ${msgId}):`);
                            log(JSON.stringify(data.error, null, 2));
                            // On error, we might want to close or keep going. Here we close.
                            session.close();
                            resolve(logs.join('\n'));
                        }

                    } catch (e) {
                        // ignore parse errors
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
// SERVER ROUTES
// ==========================================

app.post("/exchange", async (req, res) => {
    try {
        let { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: "No code provided" });
        }

        // 1. URL DECODE THE CODE
        code = decodeURIComponent(code);
        console.log("[SERVER] Decoded Code:", code);

        // 2. Exchange for Token
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
            console.error("Token Error:", tokenData);
            return res.status(400).json(tokenData);
        }

        console.log("[SERVER] Access Token OK. Starting MCP...");

        // 3. Run MCP Sequence
        const mcpLogs = await runMcpClient(tokenData.access_token);

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
