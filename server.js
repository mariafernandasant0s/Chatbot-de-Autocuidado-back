import express from "express";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";

// 🔑 SUBSTITUA PELA SUA CHAVE REAL
const GEMINI_API_KEY = "AIzaSyCmH5UkQLx5own34k8q47qKUBsBVBarVU8";

if (!GEMINI_API_KEY || GEMINI_API_KEY===("")) {
    console.error("❌ ERRO: Configure sua chave da API Gemini corretamente.");
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ✅ Define a ferramenta que será usada pelo modelo
const tools = [
    {
        functionDeclarations: [
            {
                name: "getCurrentDateTime",
                description: "Obtém a data e hora atuais no fuso horário de Brasília.",
                parameters: {
                    type: "object",
                    properties: {}
                }
            }
        ]
    }
];

// ✅ Implementação real da ferramenta
function getCurrentDateTime() {
    const now = new Date();
    const formatted = now.toLocaleString("pt-BR", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "America/Sao_Paulo",
        timeZoneName: "short"
    });

    console.log(`[Tool] Horário retornado: ${formatted}`);
    return {
        datetime: formatted,
        timezone: "Horário de Brasília (America/Sao_Paulo)"
    };
}

app.post("/chat", async (req, res) => {
    const userInput = req.body.prompt;

    if (!userInput) {
        return res.status(400).json({ error: "Prompt é obrigatório." });
    }

    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        tools: tools
    });

    const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{
                    text: "Você é um assistente de autocuidado. Use a ferramenta getCurrentDateTime para responder perguntas sobre data ou hora atuais no Brasil."
                }]
            },
            {
                role: "model",
                parts: [{ text: "Olá! Posso te ajudar com dicas de autocuidado ou te informar a data e hora atuais. É só perguntar!" }]
            }
        ]
    });

    try {
        let result = await chat.sendMessage(userInput);
        let response = result.response;

        // 🔁 Verifica se há function call solicitada
        while (response.functionCalls && response.functionCalls().length > 0) {
            const fc = response.functionCalls()[0];
            console.log(`[Gemini] Solicitou função: ${fc.name}`);

            let functionResult = {};

            if (fc.name === "getCurrentDateTime") {
                functionResult = getCurrentDateTime();
            }

            result = await chat.sendMessage([
                {
                    functionResponse: {
                        name: fc.name,
                        response: functionResult
                    }
                }
            ]);

            response = result.response;
        }

        const finalText = response.text();
        console.log(`[Bot]: ${finalText}`);
        res.json({ result: finalText });

    } catch (err) {
        console.error("❌ Erro:", err.message);
        res.status(500).json({ error: "Erro interno", details: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
    console.log("Pronto para responder perguntas como 'Que horas são agora?'.");
});
