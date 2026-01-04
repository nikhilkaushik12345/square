import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process"; // Import spawn

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const CLIENT_ID = "4RyTgR2EVMbRKlfD";
const CLIENT_SECRET = "EXQslIrwVRFT6Degkl9Cubsfq1cJQPsO";
const REDIRECT_URI = "https://127.0.0.1";
const CODE_VERIFIER = "O8cEmIWIOAtvEr6fdFzjnM1q-lTRmGS7GPwcLU8ceSg";

app.post("/exchange", async (req, res) => {
    try {
        const { code } = req.body;
        console.log("[+] Exchanging code:", code);

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

        console.log("[+] Access Token retrieved!");
        console.log("[+] Starting Python MCP Client...");

        // ========================================================
        // EXECUTE PYTHON SCRIPT WITH THE TOKEN
        // ========================================================
        const pythonProcess = spawn("python", ["mcp_client.py", tokenData.access_token]);

        let pythonOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log(output); // Print to Node console
            pythonOutput += output;
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error(`[PYTHON ERROR]: ${data}`);
            pythonOutput += `[ERROR] ${data}`;
        });

        pythonProcess.on("close", (code) => {
            console.log(`[+] Python script finished with code ${code}`);
            
            // Send both the token AND the python logs back to the browser
            res.json({
                token_data: tokenData,
                mcp_logs: pythonOutput
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, () => console.log("Server running: http://localhost:3000"));
