const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors()); // Allows your React app to talk to this server
app.use(express.json({ limit: '50mb' })); // Increased limit to handle large image uploads

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const CATEGORIES = [
  'Food & Dining', 
  'Transportation', 
  'Shopping', 
  'Utilities', 
  'Entertainment', 
  'Health', 
  'Income', 
  'Transfers',
  'Other'
];

app.post('/analyze-statement', async (req, res) => {
  try {
    const { imageParts } = req.body;

    if (!imageParts || !Array.isArray(imageParts) || imageParts.length === 0) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Use the Flash model for speed and cost-efficiency
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-09-2025" });

    const prompt = `
      Analyze the provided bank or credit card statement images/PDFs.
      Extract all individual transactions from the table rows.
      
      CRITICAL INSTRUCTIONS FOR ACCURACY:
      1. Read the document row by row.
      2. Ensure the 'Amount' strictly aligns horizontally with the 'Description' and 'Date'.
      3. If a description spans multiple lines, merge it into a single description field.
      4. Ignore running balances, only extract the transaction amount.
      
      For each transaction, extract:
      1. "date": The date of the transaction (Format: YYYY-MM-DD). If year is missing, assume current year.
      2. "description": The merchant name or transaction description.
      3. "amount": The numerical amount (positive number). 
      4. "type": Either "expense" or "income".
      5. "category": Categorize based on the description into one of: ${CATEGORIES.join(', ')}.

      Return ONLY a JSON object with a single key "transactions" which is an array of these objects.
      Do not include markdown formatting like \`\`\`json. Just the raw JSON.
    `;

    // Send to Gemini
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // Send the raw text back to the frontend
    res.json({ result: text });

  } catch (error) {
    console.error('Server Error:', error);
    
    // Send a user-friendly error message
    res.status(500).json({ 
      error: 'Failed to process document. Please try again or check the file size.' 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});