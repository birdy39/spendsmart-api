const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- SAFER KEY HANDLING ---
let rawKey = process.env.GEMINI_API_KEY;
if (!rawKey) {
  console.error("CRITICAL: GEMINI_API_KEY is undefined.");
}
const apiKey = rawKey ? rawKey.trim() : "";
// -----------------------------

// --- HELPER: Auto-Retry Function ---
// If Google is overloaded (503) or rate limited (429), we wait and try again.
async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      
      // If successful, return immediately
      if (response.ok) return response;

      // If specific "busy" errors, throw to trigger retry
      if (response.status === 503 || response.status === 429) {
        console.log(`Google API busy (Status ${response.status}). Retrying in ${backoff/1000}s... (Attempt ${i+1}/${retries})`);
        throw new Error("BUSY");
      }

      // If it's a real error (like 400 Bad Request), return it immediately (don't retry)
      return response;

    } catch (err) {
      // If we ran out of retries, or if it's a network crash, stop.
      if (i === retries - 1) throw err;
      
      // Wait for the backoff period
      await new Promise(resolve => setTimeout(resolve, backoff));
      
      // Increase wait time for next try (2s -> 4s -> 6s)
      backoff = backoff * 1.5;
    }
  }
}

// --- DIAGNOSTIC: List Available Models ---
async function listModels() {
  if (!apiKey) return;
  try {
    console.log("System: Checking available models...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.models) {
      console.log("--- AVAILABLE MODELS ---");
      console.log(data.models.map(m => m.name.replace('models/', '')).join("\n"));
      console.log("------------------------");
    }
  } catch (e) {
    console.error("System: Failed to check models:", e.message);
  }
}
listModels();

// --- MAIN ENDPOINT ---
app.post('/analyze-statement', async (req, res) => {
  try {
    const { imageParts } = req.body;

    if (!imageParts || imageParts.length === 0) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log("Processing request via Direct HTTP...");

    const contents = [
      {
        parts: [
          { 
            text: `Analyze the provided bank or credit card statement.
            Extract transactions into a JSON object with: date, description, amount, type, category, bank.
            
            CRITICAL RULES FOR ACCURACY:
            1. **IDENTIFY BANK:** Look at header/logo (e.g. "Hang Seng", "HSBC"). Add to 'bank' field.
            2. **Detect Layout:** - Deposit col -> 'income'. Withdrawal col -> 'expense'.
            3. **FOREIGN CURRENCY:** - If FCY (JPY/USD), CONVERT to HKD. 
               - Append original amount to description.
            4. **Ignore Balance:** NEVER extract 'Balance' column.
            5. **Keywords:** "Credit Interest"/"DEPOSIT" -> 'income'.
            
            Standard Rules:
            - Date: YYYY-MM-DD.
            - Amount: Absolute number (positive) in HKD.
            - Categories: Food, Transport, Shopping, Utilities, Entertainment, Health, Income, Other.

            Return ONLY raw JSON.` 
          },
          ...imageParts.map(part => ({
            inlineData: {
              mimeType: part.mimeType,
              data: part.data
            }
          }))
        ]
      }
    ];

    const modelName = "gemini-flash-latest"; 
    
    console.log(`Attempting to use model: ${modelName}`);

    // USE RETRY FUNCTION HERE
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google API Error:", JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || "Unknown error from Google");
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("AI returned no text.");

    console.log("Success! Data generated.");
    res.json({ result: text });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ 
      error: `AI Error: ${error.message}` 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
