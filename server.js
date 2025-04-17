import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Configurar a API do Gemini
const genAI = new GoogleGenerativeAI("AIzaSyCmH5UkQLx5own34k8q47qKUBsBVBarVU8"); // Troque aqui pela sua chave

// Endpoint principal
app.post("/chat", async (req, res) => {
  const prompt = req.body.prompt;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Usando Gemini 2.0 Flash
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ result: text });
  } catch (error) {
    console.error("Erro ao gerar dica de autocuidado:", error);
    res.status(500).json({ error: "Erro ao gerar dica de autocuidado." });
  }
});

// Rota para favicon
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.listen(port, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
