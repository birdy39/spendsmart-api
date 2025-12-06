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

app.post('/analyze-statement', async (req, res) => {
  try {
    const { imageParts } = req.body;

    if (!imageParts || imageParts.length === 0) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log("Processing request via Direct HTTP...");

    // 1. Prepare Data
    const contents = [
      {
        parts: [
          { 
            // UNIVERSAL PROMPT: Now with Auto-Currency Conversion
            text: `Analyze the provided bank or credit card statement.
            Extract transactions into a JSON object with: date, description, amount, type, category.
            
            CRITICAL RULES FOR ACCURACY:
            1. **Detect Layout:** - If the table has separate columns for "Deposit" and "Withdrawal", use them.
               - "Deposit" -> TYPE: 'income'.
               - "Withdrawal" -> TYPE: 'expense'.
            
            2. **FOREIGN CURRENCY (FCY) CONVERSION:** - Check the table header or currency column (e.g. JPY, USD, AUD).
               - If the currency is NOT HKD (Hong Kong Dollars):
                 a. **CONVERT** the amount to HKD using approximate current exchange rates (e.g., 1 JPY ≈ 0.052 HKD, 1 USD ≈ 7.78 HKD).
                 b. Use the **converted HKD value** for the 'amount' field.
                 c. Append the original amount and currency to the description. 
                    - Example: "DEPOSIT (Converted from 196,298 JPY)"
            
            3. **Ignore Balance:** NEVER extract the "Balance" column.
            
            4. **Ignore Summaries:** Do not extract "Total", "B/F BALANCE", or "C/F BALANCE".
            
            5. **Keywords:**
               - "Credit Interest" -> TYPE: 'income'.
               - "DEPOSIT" -> TYPE: 'income'.
            
            Standard Rules:
            - Date format: YYYY-MM-DD.
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

    // 2. Direct Fetch Call
    const modelName = "gemini-2.0-flash"; 
    
    console.log(`Attempting to use model: ${modelName}`);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google API Error:", JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || "Unknown error from Google");
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
        throw new Error("AI returned no text.");
    }

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
