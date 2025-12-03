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

    // 1. Prepare the Data manually
    // This format is exactly what Google's server expects
    const contents = [
      {
        parts: [
          { 
            text: `Analyze the provided bank statement.
            Extract transactions into a JSON object with: date, description, amount, type, category.
            Categories: Food, Transport, Shopping, Utilities, Entertainment, Health, Income, Other.
            CRITICAL: Return ONLY raw JSON. Do not use markdown code blocks.` 
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

    // 2. Direct Fetch Call (Bypassing the buggy library)
    // We explicitly call the 1.5-flash endpoint
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contents })
      }
    );

    const data = await response.json();

    // 3. Handle Errors from Google
    if (!response.ok) {
      console.error("Google API Error:", JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || "Unknown error from Google");
    }

    // 4. Extract the text
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
