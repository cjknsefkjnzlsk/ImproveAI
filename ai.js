require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));


const ASSISTANT_ID = process.env.ASSISTANT_ID;
const OPENAI_API_KEY = process.env.OPENAI_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "ai_interactions";
const COLLECTION_NAME = "qa_pairs";

// Get a prompt from a local model called "Trainer"
async function getPromptFromTrainer() {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "trainer",
      prompt: "Generate a question about AI ethics.",
      stream: false
    })
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch from Trainer: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.response.trim();
}

// Call OpenAI Assistant API
async function runAssistantWithPrompt(prompt) {
  console.log("Creating thread...");
  const threadRes = await fetch('https://api.openai.com/v1/threads', {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2"
    }
  });
  const threadData = await threadRes.json();
  if (!threadData.id) {
    console.error("Error creating thread:", threadData);
    throw new Error("Failed to create thread");
  }
  const threadId = threadData.id;
  console.log("Thread created:", threadId);

  console.log("Posting message to thread...");
  await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2"
    },
    body: JSON.stringify({
      role: "user",
      content: prompt
    })
  });
  console.log("Message posted.");

  console.log("Starting run...");
  const runRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2"
    },
    body: JSON.stringify({
      assistant_id: ASSISTANT_ID
    })
  });
  const runData = await runRes.json();
  if (!runData.id) {
    console.error("Error starting run:", runData);
    throw new Error("Failed to start run");
  }
  const runId = runData.id;
  console.log("Run started:", runId);

  let status = "in_progress";
  let pollCount = 0;
  while (status !== "completed") {
    pollCount++;
    console.log(`Polling run status... (attempt ${pollCount})`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    const runStatusRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "assistants=v2"
      }
    });
    const runStatusData = await runStatusRes.json();
    status = runStatusData.status;
    console.log("Current run status:", status);
    if (status === "failed" || status === "cancelled") {
      throw new Error(`Run failed or cancelled: ${JSON.stringify(runStatusData)}`);
    }
  }

  console.log("Fetching assistant's response...");
  const messagesRes = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "assistants=v2"
    }
  });
  const messagesData = await messagesRes.json();
  const lastMessage = messagesData.data.find(msg => msg.role === 'assistant');

  return lastMessage.content[0].text.value;
}

// Store in MongoDB
async function storeInMongo(prompt, response) {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    await collection.insertOne({
      prompt,
      response,
      timestamp: new Date()
    });
    console.log("Stored in MongoDB");
  } finally {
    await client.close();
  }
}

// Main runner
(async () => {
  try {
    console.log("Getting prompt from Trainer...");
    const prompt = await getPromptFromTrainer();
    console.log("Prompt from Trainer:", prompt);

    console.log("Sending prompt to OpenAI Assistant...");
    const response = await runAssistantWithPrompt(prompt);
    console.log("Response from Assistant:", response);

    console.log("Storing in MongoDB...");
    await storeInMongo(prompt, response);

    console.log("Q&A saved successfully:", { prompt, response });
  } catch (err) {
    console.error("Error:", err);
  }
})();
