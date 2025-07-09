from langchain.document_loaders import DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import OllamaEmbeddings
from langchain.vectorstores import FAISS
import requests

# 1. Load and split company docs
docs = DirectoryLoader("./company_docs").load()
chunks = RecursiveCharacterTextSplitter(chunk_size=1000).split_documents(docs)

# 2. Embed and index
store = FAISS.from_documents(chunks, OllamaEmbeddings(model="llama2:7b"))

# 3. Retrieve relevant context for your query
query = "Generate 5 challenging customer questions"
context = "\n\n".join([d.page_content for d in store.similarity_search(query, k=3)])

# 4. Assemble prompt
prompt = f"""
You are a customer (impatient tone).
Here is some info that might help you ask questions:
{context}

Generate 5 challenging customer questions.
"""

# 5. Send prompt to Ollama (assuming Ollama is running locally)
response = requests.post(
    "http://localhost:11434/api/generate",
    json={"model": "llama2-uncensored", "prompt": prompt, "stream": False}
)
print(response.json()["response"])
