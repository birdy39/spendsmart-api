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
            // UNIVERSAL PROMPT: Handles Credit Cards (1 amount col) AND Bank Statements (Deposit/Withdrawal cols)
            text: `Analyze the provided bank or credit card statement.
            Extract transactions into a JSON object with: date, description, amount, type, category.
            
            CRITICAL RULES FOR ACCURACY:
            1. **Detect Layout:** - If the table has separate columns for "Deposit" (or Credit) and "Withdrawal" (or Debit), use them.
               - Values in "Deposit" column -> TYPE: 'income'.
               - Values in "Withdrawal" column -> TYPE: 'expense'.
            
            2. **Ignore Balance:** NEVER extract the "Balance" column as a transaction. Only extract the movement of money.
            
            3. **Ignore Summaries:** Do not extract lines like "Total", "B/F BALANCE", "C/F BALANCE", or "Transaction Summary".
            
            4. **Specific Keywords (Bank Statement Override):**
               - "Credit Interest" -> TYPE: 'income', CATEGORY: 'Income'.
               - "DEPOSIT" -> TYPE: 'income', CATEGORY: 'Income'.
               - "AUTOPAY" -> TYPE: 'expense' (unless in deposit column).
            
            5. **Row Merging:** If a description spans multiple lines (e.g. "APPLE PAY-OTHERS" below the merchant name), merge them into one description.
            
            Standard Rules:
            - Date format: YYYY-MM-DD. (If date is missing on a row, use the date from the previous row or section header).
            - Amount: Absolute number (positive).
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
