const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
// INCREASED LIMIT: Essential for handling large images
app.use(express.json({ limit: '50mb' })); 

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.post('/analyze-statement', async (req, res) => {
  try {
    const { imageParts } = req.body;

    // Basic Validation
    if (!imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
      console.log("Error: No image data received");
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log("Processing request with " + imageParts.length + " images...");

    // TESTING: Using the Preview Model as requested
    // If this fails, we will see the specific error in the logs
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

    console.log("Success! Sending data back to frontend.");
    res.json({ result: text });

  } catch (error) {
    // This logs the REAL error to your Render Dashboard
    console.error('Server Error Details:', error);
    
    // Send a message back to the UI so you know to check logs
    res.status(500).json({ 
      error: 'Server failed. Please check Render Logs for the specific error.' 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
