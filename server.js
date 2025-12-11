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
async function fetchWithRetry(url, options, retries = 3, backoff = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 503 || response.status === 429) {
        console.log(`Google API busy. Retrying... (Attempt ${i+1})`);
        throw new Error("BUSY");
      }
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, backoff));
      backoff = backoff * 1.5;
    }
  }
}

// --- DIAGNOSTIC: List Available Models ---
async function listModels() {
  if (!apiKey) return;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    if (data.models) {
      console.log("--- AVAILABLE MODELS ---");
      console.log(data.models.map(m => m.name.replace('models/', '')).join("\n"));
      console.log("------------------------");
    }
  } catch (e) {
    console.error("Check models failed:", e.message);
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
            // UPDATED PROMPT: Added specific Chinese Keywords for HK Banks
            text: `Analyze the provided bank or credit card statement.
            Extract transactions into a JSON object with: date, description, amount, type, category, bank.
            
            CRITICAL RULES FOR ACCURACY:
            1. **IDENTIFY BANK:** Look at header/logo (e.g. "Hang Seng", "HSBC", "Bank of China"). Add to 'bank' field.
            
            2. **DETECT COLUMNS (Bilingual):** - **INCOME/DEPOSIT:** Look for headers like "Deposit", "Credit", "存入", "存款". Values in these columns are ALWAYS 'income'.
               - **EXPENSE/WITHDRAWAL:** Look for headers like "Withdrawal", "Debit", "提取", "提款". Values in these columns are ALWAYS 'expense'.
            
            3. **FOREIGN CURRENCY:** - If FCY (JPY/USD), CONVERT to HKD. 
               - Append original amount to description.
            
            4. **Ignore Balance:** NEVER extract 'Balance' or '結餘' column.
            
            5. **Keywords & Context:** - "Credit Interest", "利息", "DEPOSIT", "存入" -> 'income'.
               - "ATM TRF" -> Check which column it is in. If in Deposit/存入, it is 'income'.
            
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
