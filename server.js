import express from "express";
import bodyParser from "body-parser"; // Pode ser substituído por express.json()
import cors from "cors";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from 'dotenv'; // Importar dotenv

dotenv.config(); // Carregar variáveis de ambiente do .env

const app = express();
const port = process.env.PORT || 3000; // Usar PORT do ambiente ou 3000

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors());
app.use(bodyParser.json()); // express.json() é mais comum hoje em dia
// app.use(express.json()); // Alternativa ao bodyParser.json()
app.use(express.static(__dirname)); // Serve arquivos estáticos da raiz do backend

// --- Configuração do Gemini e Function Calling ---

// Chave da API do Gemini (AGORA USANDO VARIÁVEL DE AMBIENTE)
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    console.error("Chave da API Gemini não encontrada. Defina GEMINI_API_KEY no arquivo .env");
    process.exit(1); // Encerra se a chave não estiver definida
}
const genAI = new GoogleGenerativeAI(API_KEY);

// 1. Definição da Ferramenta (Tool) que o Gemini pode "chamar"
const tools = [
    {
        functionDeclarations: [
            {
                name: "getCurrentDateTime",
                description: "Obtém a data e hora atuais. Use esta função sempre que o usuário perguntar sobre a data, a hora, ou data e hora juntas.",
                // Não são necessários parâmetros para esta função específica
            },
            // Você pode adicionar outras funções aqui no futuro
            // Ex: { name: "getWeather", description: "Obtém o clima para uma cidade", parameters: ... }
        ],
    },
];

// 2. Implementação local da função que será executada
function executeGetCurrentDateTime() {
    const now = new Date();
    // Formatação mais completa para o exemplo
    const formattedDateTime = now.toLocaleString('pt-BR', {
        weekday: 'long', // "segunda-feira"
        year: 'numeric', // "2024"
        month: 'long',   // "julho"
        day: 'numeric',    // "24"
        hour: '2-digit',   // "14"
        minute: '2-digit', // "30"
        second: '2-digit', // "55"
        timeZoneName: 'short', // "GMT-3" ou "BRT"
        timeZone: 'America/Sao_Paulo' // Ajuste para o fuso horário desejado
    });
    console.log(`[Tool Executed] getCurrentDateTime: retornou ${formattedDateTime}`);
    return { // O Gemini espera um objeto como conteúdo da resposta da função
        currentDateTime: formattedDateTime,
        timezone: "Horário de Brasília (America/Sao_Paulo)" // Informação adicional útil
    };
}

// Histórico de chat simples em memória (para manter o contexto)
// É importante iniciar com uma instrução de sistema para o bot e uma resposta inicial do modelo.
let chatHistory = [
    {
        role: "user",
        parts: [{ text: "Você é um chatbot amigável e prestativo chamado SelfCare Bot. Você pode fornecer a data e hora atuais quando solicitado e dar dicas de autocuidado. Ao fornecer a data e hora, seja explícito sobre o fuso horário." }],
    },
    {
        role: "model",
        parts: [{ text: "Olá! Sou o SelfCare Bot. Como posso te ajudar hoje? Se precisar saber a data ou hora, é só pedir! Também posso te dar dicas de autocuidado." }],
    },
];

// Modelo Gemini configurado com as ferramentas
// Use um nome de modelo válido, como 'gemini-1.5-flash-latest' ou 'gemini-1.5-pro-latest'
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest", // Modelo atualizado
    tools: tools, // Informa ao modelo sobre as ferramentas disponíveis
    // Opcional: Configurações de segurança
    // safetySettings: [
    //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    //   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    // ],
});

// --- Endpoint principal do chat ---
app.post("/chat", async (req, res) => {
    const userInput = req.body.prompt;

    if (!userInput) {
        return res.status(400).json({ error: "Prompt é obrigatório." });
    }
    console.log(`\n[User]: ${userInput}`);

    try {
        // Adiciona a mensagem do usuário ao histórico ANTES de enviar para o modelo
        // Assim o modelo tem o contexto da pergunta atual ao decidir usar uma ferramenta.
        chatHistory.push({ role: "user", parts: [{ text: userInput }] });

        // Inicia/continua o chat com o histórico
        const chat = model.startChat({
            history: chatHistory,
            // tools já foi definido ao criar o 'model'
        });

        // Primeira chamada para o Gemini com a mensagem do usuário
        let result = await chat.sendMessage(userInput);
        let response = result.response;
        let botResponseText = "";

        // Loop para lidar com chamadas de função (se houver)
        // O Gemini pode pedir para chamar uma ou mais funções.
        while (response.functionCalls && response.functionCalls().length > 0) {
            const functionCalls = response.functionCalls(); // Array de chamadas de função
            console.log("[Gemini] Solicitou chamada de função:", functionCalls.map(fc => fc.name));

            const functionCallResponses = []; // Array para armazenar os resultados das nossas funções

            for (const fc of functionCalls) { // Itera sobre cada chamada de função solicitada
                if (fc.name === "getCurrentDateTime") {
                    const toolResultContent = executeGetCurrentDateTime(); // Executa sua função local

                    // Prepara a resposta da função no formato que o Gemini espera
                    functionCallResponses.push({
                        functionResponse: {
                            name: "getCurrentDateTime", // Mesmo nome da função declarada
                            response: { // O objeto 'response' deve conter 'name' e 'content'
                                name: "getCurrentDateTime", // Sim, o nome da função novamente
                                content: toolResultContent, // O resultado da sua função (um objeto)
                            },
                        },
                    });
                } else {
                    console.warn(`Função desconhecida solicitada pelo Gemini: ${fc.name}`);
                    // Se o Gemini solicitar uma função que não implementamos,
                    // podemos retornar um erro ou uma indicação de que não foi encontrada.
                    functionCallResponses.push({
                        functionResponse: {
                            name: fc.name,
                            response: {
                                name: fc.name,
                                content: { error: `Função ${fc.name} não implementada pelo servidor.` },
                            },
                        },
                    });
                }
            }

            // Envia as respostas das funções de volta para o Gemini
            console.log("[Backend] Enviando resposta(s) da(s) função(ões) para Gemini:", JSON.stringify(functionCallResponses, null, 2));
            result = await chat.sendMessage(functionCallResponses); // Envia como um array de respostas de função
            response = result.response; // Atualiza a resposta do Gemini
        }

        // Após o loop (se houve chamadas de função ou não), obtemos a resposta final em texto
        if (response.text) {
            botResponseText = response.text();
        } else {
            // Caso inesperado onde não há texto nem function call.
            botResponseText = "Não consegui processar sua solicitação desta vez. Tente reformular.";
            console.warn("[Bot] Resposta do Gemini não continha texto após o processamento de function calls (ou ausência delas).", response);
        }
        
        console.log(`[Bot]: ${botResponseText}`);

        // Adiciona a resposta final do bot ao histórico
        chatHistory.push({ role: "model", parts: [{ text: botResponseText }] });

        // Opcional: Limitar o tamanho do histórico para não consumir muita memória/tokens
        // Manter as últimas N interações (10 pares user/model = 20 entradas)
        const MAX_HISTORY_LENGTH = 20; 
        if (chatHistory.length > MAX_HISTORY_LENGTH) {
            chatHistory = chatHistory.slice(-MAX_HISTORY_LENGTH);
        }

        res.json({ result: botResponseText });

    } catch (error) {
        console.error("Erro ao processar chat:", error);
        let errorMessage = "Erro ao processar sua solicitação.";
        let statusCode = 500;

        if (error.message) {
            if (error.message.includes('API key not valid')) {
                 errorMessage = "Chave da API Gemini inválida. Verifique sua configuração.";
                 statusCode = 401;
            } else if (error.message.includes('Could not find model')) {
                errorMessage = `Modelo Gemini ('${model.model}') não encontrado. Verifique o nome do modelo.`;
                statusCode = 400;
            } else if (error.message.includes('請求的實體中包含無效的引數') || error.message.includes('Invalid argument in the request entity')) {
                // Exemplo de erro de argumento inválido, pode acontecer com function calling mal formatado
                errorMessage = "Argumento inválido na solicitação para a API Gemini. Verifique os dados enviados.";
                statusCode = 400;
            }
        }
        res.status(statusCode).json({ error: errorMessage, details: error.message });
    }
});

// Rota para favicon (mantida do seu código original)
app.get("/favicon.ico", (req, res) => res.status(204).end());

app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
    console.log('Certifique-se de que sua GEMINI_API_KEY está configurada no arquivo .env');
    console.log('Frontend deve enviar requisições para http://localhost:3000/chat (ou o endereço do seu deploy)');
});
