const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- SAFER KEY HANDLING ---
let rawKey = process.env.GEMINI_API_KEY;
if (!rawKey) {
  console.error("CRITICAL: GEMINI_API_KEY is undefined in Environment Variables.");
}
const apiKey = rawKey ? rawKey.trim() : "";

if (apiKey) {
    console.log(`System: API Key loaded. Length: ${apiKey.length} characters.`);
}
// -----------------------------

const genAI = new GoogleGenerativeAI(apiKey);

app.post('/analyze-statement', async (req, res) => {
  try {
    const { imageParts } = req.body;

    if (!imageParts || imageParts.length === 0) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log("Processing request...");

    // FIX: The Frontend sends flat objects { data, mimeType }.
    // Google Gemini REQUIRES them to be wrapped in { inlineData: { ... } }
    const formattedParts = imageParts.map(part => ({
      inlineData: {
        data: part.data,
        mimeType: part.mimeType
      }
    }));

    // Use the stable 1.5-flash model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Analyze the provided bank statement.
      Extract transactions into a JSON object with: date, description, amount, type, category.
      CRITICAL: Return ONLY raw JSON. Do not use markdown code blocks.
    `;

    // Send the FIX formattedParts, not the raw imageParts
    const result = await model.generateContent([prompt, ...formattedParts]);
    const response = await result.response;
    const text = response.text();

    console.log("Success! Data generated.");
    res.json({ result: text });

  } catch (error) {
    console.error('Generative AI Error:', error);
    res.status(500).json({ 
      error: `AI Error: ${error.message}` 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
