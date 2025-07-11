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
  console.log('POST /generate-examples called');
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
    // Generate Trainer (Ollama) questions
    const trainerPrompt = `Given the following company info, generate a list of 3 example customer questions (not answers) about the company. Only output the questions, each on a new line.\n\n${companyText}`;
    const trainerQuestionsRaw = await getPromptFromTrainer(trainerPrompt);
    console.log('Trainer output:', trainerQuestionsRaw);
    if (!trainerQuestionsRaw) {
      console.error('Trainer did not return any questions!');
      return res.status(500).json({ error: 'Trainer did not return any questions.' });
    }
    const trainerQuestions = trainerQuestionsRaw
      .split('\n')
      .map(q => q.trim())
      .filter(q => q.length > 0);
    const qaPairs = [];
    for (const question of trainerQuestions) {
      const answer = await runAssistantWithPrompt(question);
      qaPairs.push({ question, answer });
    }
    console.log('Sending to frontend:', qaPairs);
    res.json({ qaPairs });
  } catch (err) {
    console.error('Error in /generate-examples:', err);
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
