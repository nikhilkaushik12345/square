import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serves index.html

// OAuth callback
app.get("/callback", (req, res) => {
  res.redirect("/?code=" + req.query.code);
});

// Exchange code + call Square MCP
app.post("/exchange", async (req, res) => {
  try {
    const { code } = req.body;

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", "http://127.0.0.1:3000/callback");
    params.append("client_id", "gjxgLkmUnkj07yeG");
    params.append("client_secret", "NBLBjlVT52Ykhy8QU7YD5jsg0aNlVjpG");
    params.append(
      "code_verifier",
      "O8cEmIWIOAtvEr6fdFzjnM1q-lTRmGS7GPwcLU8ceSg"
    );

    // 1️⃣ Exchange authorization code for access token
    const tokenRes = await fetch("https://mcp.squareup.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: params.toString()
    });

    const token = await tokenRes.json();
    if (!token.access_token) {
      return res.status(400).json(token);
    }

    // 2️⃣ Call Square MCP (example: tools/list)
    const mcpRes = await fetch("https://mcp.squareup.com/mcp", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list"
      })
    });

    const data = await mcpRes.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Square MCP app running on port", PORT)
);
