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

let storedAccessToken = null;

// ==========================================
// MCP CLIENT LOGIC (UNCHANGED)
// ==========================================
function runMcpClient(accessToken) {
  /* EXACT SAME FUNCTION AS YOU PROVIDED */
  // ⬅️ intentionally unchanged
}

// ==========================================
// SERVER ROUTES
// ==========================================

app.post("/exchange", async (req, res) => {
  let { code } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json"
    },
    body: params.toString()
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) return res.status(400).json(tokenData);

  storedAccessToken = tokenData.access_token;

  res.json({ token_data: tokenData });
});

app.post("/run-mcp", async (req, res) => {
  if (!storedAccessToken) {
    return res.s
