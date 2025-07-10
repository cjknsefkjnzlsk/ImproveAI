const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const { runAssistantWithPrompt, storeInMongo, getPromptFromTrainer } = require('./ai');

const app = express();
app.use(cors());
app.use(bodyParser.json());
const upload = multer({ dest: 'uploads/' });

// POST /generate-examples
app.post('/generate-examples', upload.single('file'), async (req, res) => {
  try {
    let companyText = req.body.companyText || '';
    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(dataBuffer);
        companyText += '\n' + pdfData.text;
      } else if (req.file.mimetype === 'text/plain') {
        const txtData = fs.readFileSync(req.file.path, 'utf8');
        companyText += '\n' + txtData;
      } else {
        return res.status(400).json({ error: 'Unsupported file type.' });
      }
      fs.unlinkSync(req.file.path); // Clean up
    }
    // Send to Ollama and OpenAI (simulate: generate 3 examples)
    
    const prompt = await getPromptFromTrainer();
    const response = await runAssistantWithPrompt(prompt);
    // Split into examples (assume numbered list or Q&A pairs)
    const examples = response.split(/\n\d+\.\s|\nQ\d+:|\n- /).filter(Boolean).map(s => s.trim()).filter(Boolean);
    res.json({ examples });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /save-examples
app.post('/save-examples', async (req, res) => {
  try {
    const { examples } = req.body;
    if (!examples || !Array.isArray(examples)) {
      return res.status(400).json({ error: 'No examples provided.' });
    }
    for (const ex of examples) {
      await storeInMongo('User-edited example', ex);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log('API server running on http://localhost:3001'));
