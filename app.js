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

// ✅ STORE TOKEN FOR SEND REQUEST BUTTON
let storedAccessToken = null;

// ==========================================
// MCP CLIENT LOGIC (UNCHANGED)
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

        session.on("error", (err) => {
            log(`[MCP ERROR] ${err.message}`);
            resolve(logs.join("\n"));
        });

        const sseHeaders = {
            ":path": "/sse",
            ":method": "GET",
            authorization: `Bearer ${accessToken}`,
            accept: "text/event-stream",
            "user-agent": USER_AGENT,
            "cache-control": "no-cache",
        };

        const sseStream = session.request(sseHeaders);

        let buffer = "";
        let sessionId = null;
        let postUrlPath = null;
        let currentStep = 0;

        const customerPayload = {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: "make_api_request",
                arguments: {
                    service: "customers",
                    method: "create",
                    request: {
                        given_name: "Lynsey",
                        family_name: "Admin",
                        email_address: "5381lynsey@airsworld.net",
                    },
                    characterization: "Create Lynsey Admin Customer",
                },
            },
            id: 2,
        };

        const teamMemberPayload = {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: "make_api_request",
                arguments: {
                    service: "team",
                    method: "bulkCreatemembers",
                    request: {
                        team_members: {
                            invite_lynsey_admin_20260103: {
                                team_member: {
                                    given_name: "Lynsey",
                                    family_name: "Admin",
                                    email_address: "5381lynsey@airsworld.net",
                                    assigned_locations: {
                                        location_ids: ["LEM77QX2ADM7X"],
                                        assignment_type: "EXPLICIT_LOCATIONS",
                                    },
                                },
                            },
                        },
                    },
                    characterization: "Add Lynsey Admin as Team Member",
                },
            },
            id: 3,
        };

        const sendJsonRpc = (payload, label) => {
            if (!sessionId || !postUrlPath) return;

            const req = session.request({
                ":path": postUrlPath,
                ":method": "POST",
                authorization: `Bearer ${accessToken}`,
                "content-type": "application/json",
                "user-agent": USER_AGENT,
                accept: "application/json, text/event-stream",
                "mcp-session-id": sessionId,
            });

            req.write(JSON.stringify(payload));
            req.end();
        };

        sseStream.setEncoding("utf8");

        sseStream.on("data", (chunk) => {
            buffer += chunk;
            const lines = buffer.split("\n");
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                if (line.includes("sessionId=")) {
                    const match = line.match(/sessionId=([^&]+)/);
                    if (match) {
                        sessionId = match[1];
                        postUrlPath = line.replace("data: ", "").replace(MCP_HOST, "");
                        if (currentStep === 0) {
                            sendJsonRpc({ jsonrpc: "2.0", method: "tools/list", id: 1 });
                            currentStep = 1;
                        }
                    }
                }

                if (line.includes("jsonrpc")) {
                    const data = JSON.parse(line.replace("data: ", ""));
                    if (data.id === 1 && currentStep === 1) {
                        sendJsonRpc(customerPayload);
                        currentStep = 2;
                    } else if (data.id === 2 && currentStep === 2) {
                        sendJsonRpc(teamMemberPayload);
                        currentStep = 3;
                    } else if (data.id === 3 && currentStep === 3) {
                        session.close();
                        resolve(logs.join("\n"));
                    }
                }
            }
        });
    });
}

// ==========================================
// ROUTES
// ==========================================

app.post("/exchange", async (req, res) => {
    try {
        let { code } = req.body;
        code = decodeURIComponent(code);

        const params = new URLSearchParams();
        params.append("grant_type", "authorization_code");
        params.append("code", code);
        params.append("redirect_uri", REDIRECT_URI);
        params.append("client_id", CLIENT_ID);
        params.append("client_secret", CLIENT_SECRET);
        params.append("code_verifier", CODE_VERIFIER);

        const tokenRes = await fetch("https://mcp.squareup.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString(),
        });

        const tokenData = await tokenRes.json();
        storedAccessToken = tokenData.access_token;

        res.json({ token_data: tokenData });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/run-mcp", async (req, res) => {
    if (!storedAccessToken) {
        return res.status(400).json({ error: "No access token available" });
    }

    const logs = await runMcpClient(storedAccessToken);
    res.json({ mcp_logs: logs });
});

app.listen(3000, () =>
    console.log("Server running at http://localhost:3000")
);
