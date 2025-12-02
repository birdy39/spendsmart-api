const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// --- DEBUGGING SECTION ---
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("CRITICAL ERROR: GEMINI_API_KEY is missing in Environment Variables!");
} else {
  // We only print the first 5 characters for safety. 
  // COMPARE THIS with your real key in the logs.
  console.log(`DEBUG: API Key loaded. It starts with: '${apiKey.substring(0, 5)}...'`);
  console.log(`DEBUG: Total Key Length: ${apiKey.length} characters`);
}
// -------------------------

// Initialize Gemini
const genAI = new GoogleGenerativeAI(apiKey);

app.post('/analyze-statement', async (req, res) => {
  try {
    const { imageParts } = req.body;

    if (!imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
      console.log("Error: No image data received");
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log("Processing request...");

    // Using the Preview model as requested
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

    const prompt = `
      Analyze the provided bank statement.
      Extract transactions into a JSON object with: date, description, amount, type, category.
      Categories: Food, Transport, Shopping, Utilities, Entertainment, Health, Income, Other.
      CRITICAL: Return ONLY raw JSON. Do not use markdown code blocks.
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    console.log("Success!");
    res.json({ result: text });

  } catch (error) {
    console.error('Server Error Details:', error);
    res.status(500).json({ 
      error: 'Server failed. Please check Render Logs for the specific error.' 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
