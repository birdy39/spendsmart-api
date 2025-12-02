const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- 1. SAFER KEY HANDLING ---
// We get the key and immediately remove accidental spaces (trim)
let rawKey = process.env.GEMINI_API_KEY;
if (!rawKey) {
  console.error("CRITICAL: GEMINI_API_KEY is undefined in Environment Variables.");
}
const apiKey = rawKey ? rawKey.trim() : "";

// Debugging: Print details to Render Logs
if (apiKey) {
    console.log(`System: API Key loaded. Length: ${apiKey.length} characters.`);
    console.log(`System: Key starts with: '${apiKey.substring(0, 5)}...'`);
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

    // 2. SWITCH TO STABLE MODEL
    // If 2.5 is giving you trouble, let's use the rock-solid 1.5-flash first to prove it works.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
      Analyze the provided bank statement.
      Extract transactions into a JSON object with: date, description, amount, type, category.
      CRITICAL: Return ONLY raw JSON. Do not use markdown code blocks.
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    console.log("Success! Data generated.");
    res.json({ result: text });

  } catch (error) {
    console.error('Generative AI Error:', error);
    // Send the actual error message back to the frontend so you can see it in the browser console
    res.status(500).json({ 
      error: `AI Error: ${error.message}` 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
