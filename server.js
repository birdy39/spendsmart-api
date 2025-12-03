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

// --- DIAGNOSTIC: List Available Models on Startup ---
async function listModels() {
  if (!apiKey) return;
  try {
    console.log("System: Checking available models for this API key...");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const data = await response.json();
    if (data.models) {
      console.log("--- AVAILABLE MODELS ---");
      const visualModels = data.models.map(m => m.name.replace('models/', ''));
      console.log(visualModels.join("\n"));
      console.log("------------------------");
    }
  } catch (e) {
    console.error("System: Failed to check models:", e.message);
  }
}
listModels();
// ----------------------------------------------------

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
            // IMPROVED PROMPT: Specifically handles multi-line rows like "Apple Pay"
            text: `Analyze the provided bank statement image.
            Extract transactions into a JSON object with: date, description, amount, type, category.
            
            CRITICAL RULES FOR ACCURACY:
            1. **Row Merging:** Many transactions span two lines. (e.g., Line 1 has the Merchant Name and Amount, Line 2 has "APPLE PAY" or "Ref No").
            2. **Check for Amounts:** If a line of text does NOT have its own distinct amount in the amount column, it is NOT a new transaction. Merge that text into the description of the previous transaction.
            3. **Do Not Duplicate:** Never create two transactions for the same amount unless the statement explicitly lists the amount twice.
            4. **Data Types:** Date format YYYY-MM-DD. Amount must be a number.
            5. **Categories:** Food, Transport, Shopping, Utilities, Entertainment, Health, Income, Other.

            Return ONLY raw JSON. Do not use markdown code blocks.` 
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
