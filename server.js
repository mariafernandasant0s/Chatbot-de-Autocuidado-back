// server.js
import dotenv from 'dotenv'; // Manter apenas esta importação
dotenv.config(); // Manter esta configuração

// ... outras importações ...
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import path from "path";
import { fileURLToPath } from "url";
// Remover esta linha: import dotenv from "dotenv"; (duplicada)
import axios from "axios";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("ERRO CRÍTICO: Variável GEMINI_API_KEY não definida no .env");
  process.exit(1);
}
if (!OPENWEATHER_API_KEY) {
    console.warn("AVISO: OPENWEATHER_API_KEY não está definida no .env. A função de previsão do tempo não funcionará corretamente e pode retornar um erro para o usuário.");
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// --- 1. Definição das Ferramentas (Function Declarations) ---
const tools = [
  {
    functionDeclarations: [
      {
        name: "getCurrentTime",
        description: "Obtém a data e hora atuais formatadas em português do Brasil. Use quando o usuário perguntar sobre a hora, data, dia atual, etc.",
        parameters: { type: "object", properties: {}, required: [] },
      },
      {
        name: "getWeather",
        description: "Obtém a previsão do tempo atual para uma cidade específica. Use quando o usuário perguntar sobre o clima ou tempo em uma localidade.",
        parameters: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "A cidade e, opcionalmente, o país para o qual obter a previsão do tempo (ex: 'Curitiba, BR', 'Londres', 'Nova York, US').",
            },
          },
          required: ["location"],
        },
      },
    ],
  },
];

// --- 2. Implementação das Funções Reais no Backend ---
function getCurrentTime() {
  console.log("LOG: Executando função: getCurrentTime");
  const now = new Date();
  const result = {
    currentTime: now.toLocaleString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/Sao_Paulo", // Ajuste o fuso horário se necessário
      // timeZoneName: "short", // Opcional
    }),
  };
  console.log("LOG: Resultado de getCurrentTime:", JSON.stringify(result));
  return result;
}

async function getWeather(args) {
  console.log("LOG: Executando função: getWeather com args:", args);
  const location = args.location;

  if (!OPENWEATHER_API_KEY) {
    console.error("LOG: Chave da API OpenWeatherMap não configurada no .env.");
    return { error: "Desculpe, o serviço de meteorologia não está configurado no momento." };
  }
  if (!location) {
    return { error: "Por favor, especifique uma cidade para buscar o tempo." };
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(
    location
  )}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=pt_br`;

  try {
    const response = await axios.get(url);
    const weatherData = {
      location: response.data.name,
      temperature: response.data.main.temp,
      description: response.data.weather[0].description,
      humidity: response.data.main.humidity,
      windSpeed: response.data.wind.speed,
    };
    console.log("LOG: Resultado de getWeather (OpenWeatherMap):", JSON.stringify(weatherData));
    return weatherData;
  } catch (error) {
    console.error("LOG: Erro ao chamar OpenWeatherMap:", error.response?.data?.message || error.message);
    if (error.response?.status === 404) {
        return { error: `Não foi possível encontrar o tempo para "${location}". Verifique o nome da cidade.` };
    }
    return { error: "Desculpe, não foi possível obter a previsão do tempo no momento." };
  }
}

// --- 3. Mapeamento de Nomes de Funções para Funções Reais ---
const availableFunctions = { getCurrentTime, getWeather };

// --- Configuração de Segurança (Safety Settings) ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Instrução do Sistema (Prompt do Sistema) ---
const systemInstructionContent = `Você é um assistente virtual especializado em autocuidado, chamado "Aura". Seu objetivo é promover bem-estar e positividade.
Você pode:
1.  Conversar sobre temas de autocuidado, relaxamento, mindfulness, gerenciamento de estresse e bem-estar geral.
2.  Fornecer a data e hora atuais quando solicitado, usando a ferramenta 'getCurrentTime'.
3.  Informar a previsão do tempo para qualquer cidade, usando a ferramenta 'getWeather'.
Responda sempre de forma amigável, empática, gentil e clara.
Se não souber uma resposta ou não puder realizar uma tarefa, informe educadamente.
Evite dar conselhos médicos ou terapêuticos profundos, mas pode sugerir práticas gerais de bem-estar e encorajar a busca por profissionais qualificados quando apropriado.
Quando usar uma ferramenta, formule a resposta final de forma natural, por exemplo: "Agora são 14:30 de sábado." ou "O tempo em Curitiba está agradável, com 22°C e céu limpo."`;

// --- Configuração do Modelo Gemini ---
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
  tools: tools,
  safetySettings: safetySettings,
  systemInstruction: { role: "system", parts: [{text: systemInstructionContent}] }
});

// --- Middleware ---
// Configuração melhorada de CORS para permitir requisições de qualquer origem
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Express 5 já tem seu próprio JSON parser, mas body-parser ainda funciona.
// Para Express 5 nativo: app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(__dirname)); // Serve arquivos da raiz do projeto (onde server.js está)

// --- Rota Principal para servir o index.html ---
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// --- Rota de Chat Modificada para Function Calling ---
app.post("/chat", async (req, res) => {
  console.log("\n--- LOG: Rota /chat POST ---");
  const userMessage = req.body.mensagem || req.body.prompt; // Aceita ambos os formatos
  let clientPreviousHistory = req.body.historico || [];

  console.log("LOG: Mensagem do Usuário:", userMessage);
  // console.log("LOG: Histórico Recebido do Cliente (últimos 2 turnos se houver):", JSON.stringify(clientPreviousHistory.slice(-2), null, 2));

  if (!userMessage) {
    return res.status(400).json({ erro: "A mensagem do usuário é obrigatória." });
  }

  try {
    const chat = model.startChat({
      history: clientPreviousHistory, // System instruction já está no 'model'
    });

    console.log("LOG: Enviando mensagem inicial para Gemini:", userMessage);
    let geminiAPIResult = await chat.sendMessage(userMessage);
    let currentModelResponse = geminiAPIResult.response;
    let botResponseText = "";

    // --- Loop de Chat para Tratar Function Calls ---
    while (true) {
      const candidate = currentModelResponse.candidates?.[0];
      // Verifica se há uma functionCall na resposta
      const partWithFunctionCall = candidate?.content?.parts?.find(part => part.functionCall);

      if (partWithFunctionCall && partWithFunctionCall.functionCall) {
        const functionCall = partWithFunctionCall.functionCall;
        console.log(`LOG: Gemini solicitou Function Call: ${functionCall.name}`);
        console.log(`LOG: Argumentos para ${functionCall.name}:`, JSON.stringify(functionCall.args));

        const functionToCall = availableFunctions[functionCall.name];
        let functionExecutionResult;

        if (functionToCall) {
          const functionArgs = functionCall.args || {}; // Garante que args exista
          functionExecutionResult = await functionToCall(functionArgs);
          console.log(`LOG: Resultado da função ${functionCall.name} (JS):`, JSON.stringify(functionExecutionResult));
        } else {
          console.error(`LOG: ERRO - Função ${functionCall.name} solicitada pelo Gemini não encontrada.`);
          functionExecutionResult = { error: `A função ${functionCall.name} não está implementada no servidor.` };
        }

        // Envia o resultado da função de volta para o Gemini
        console.log(`LOG: Enviando FunctionResponse para Gemini sobre ${functionCall.name}`);
        geminiAPIResult = await chat.sendMessage([
          {
            functionResponse: {
              name: functionCall.name,
              response: functionExecutionResult
            }
          }
        ]);
        currentModelResponse = geminiAPIResult.response; // Atualiza com a nova resposta do Gemini
      } else {
        // Não há mais function calls, extrair texto e sair do loop
        const finalCandidate = currentModelResponse.candidates?.[0];
        if (finalCandidate?.content?.parts) {
          botResponseText = finalCandidate.content.parts
            .filter(part => part.text != null)
            .map(part => part.text)
            .join("");
        }
        break; // Sai do loop de function calling
      }
    }

    if (!botResponseText) {
        // Fallback se, após o loop, não houver texto (pode acontecer se uma função falhar e o Gemini não gerar texto)
        const lastCandidate = currentModelResponse.candidates?.[0];
        if (lastCandidate?.finishReason === 'STOP' && !lastCandidate?.content?.parts?.some(p => p.text)) {
            botResponseText = "Recebi uma resposta, mas não continha texto. Pode ter ocorrido um problema com a ferramenta solicitada.";
            console.warn("LOG: Resposta final do Gemini não continha partes de texto esperadas, mas terminou normalmente (STOP).", JSON.stringify(currentModelResponse));
        } else {
            botResponseText = "Desculpe, não consegui gerar uma resposta textual no momento.";
            console.warn("LOG: Resposta final do Gemini não continha partes de texto esperadas:", JSON.stringify(currentModelResponse));
        }
    }

    console.log("LOG: Resposta final do Bot (texto):", botResponseText);

    const currentHistoryFromServer = await chat.getHistory();
    // console.log("LOG: Histórico Atualizado do Servidor (últimos 2 turnos se houver):", JSON.stringify(currentHistoryFromServer.slice(-2), null, 2));

    // Responde com ambos os formatos para compatibilidade
    res.json({ 
      resposta: botResponseText, 
      result: botResponseText, // Para compatibilidade com main.js
      historico: currentHistoryFromServer 
    });

  } catch (error) {
    console.error("LOG: Erro GERAL na rota /chat:", error);
    let errorMessage = "Erro ao comunicar com o chatbot.";
    if (error.response && error.response.promptFeedback && error.response.promptFeedback.blockReason) {
        errorMessage = `Erro da API Gemini: ${error.response.promptFeedback.blockReason}`;
        if(error.response.promptFeedback.blockReasonMessage) {
            errorMessage += ` - ${error.response.promptFeedback.blockReasonMessage}`;
        }
    } else if (error.message) {
        errorMessage = `Erro: ${error.message}`;
    }
    res.status(500).json({ erro: errorMessage, details: error.toString() });
  }
});

// --- Rota para Favicon (evita erros 404 no log) ---
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- Tratamento para rotas não encontradas (404) ---
app.use((req, res, next) => {
    console.log(`LOG: Rota não encontrada - 404: ${req.method} ${req.originalUrl}`);
    if (!res.headersSent) {
      res.status(404).send("<h1>404 - Página não encontrada</h1><p>O recurso que você está procurando não existe.</p>");
    }
});

// Modificado para escutar em todas as interfaces (0.0.0.0)
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
  console.log("Arquivos estáticos (index.html, client.js, style.css) devem estar na raiz do projeto.");
  if (!process.env.OPENWEATHER_API_KEY) {
    console.warn("AVISO: OPENWEATHER_API_KEY não está definida no .env. A função de previsão do tempo não funcionará como esperado.");
  }
});

// Ajustes para garantir que o servidor sempre retorne JSON válido
// Adicione este código ao final do seu arquivo server.js, antes da linha app.listen

// --- Middleware para garantir que todas as respostas de erro sejam em formato JSON ---
app.use((err, req, res, next) => {
  console.error("LOG: Erro não tratado:", err);
  
  // Garantir que a resposta seja sempre JSON
  res.status(500).json({
    erro: "Erro interno do servidor",
    mensagem: err.message || "Ocorreu um erro inesperado",
    detalhes: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

// --- Tratamento para rotas não encontradas (404) em formato JSON ---
app.use((req, res, next) => {
  console.log(`LOG: Rota não encontrada - 404: ${req.method} ${req.originalUrl}`);
  
  // Sempre retornar JSON, nunca HTML
  res.status(404).json({
    erro: "Rota não encontrada",
    mensagem: `A rota ${req.originalUrl} não existe neste servidor`,
    status: 404
  });
});

// --- Verificação de saúde do servidor ---
app.get('/health', (req, res) => {
  // Endpoint simples para verificar se o servidor está funcionando
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    env: {
      gemini_api_configured: !!process.env.GEMINI_API_KEY,
      openweather_api_configured: !!process.env.OPENWEATHER_API_KEY,
      node_env: process.env.NODE_ENV || 'development'
    }
  });
});

// --- Rota de teste para validar a comunicação cliente-servidor ---
app.post('/test', (req, res) => {
  console.log("LOG: Requisição de teste recebida:", req.body);
  
  // Retorna os mesmos dados enviados pelo cliente, para validar a comunicação
  res.json({
    success: true,
    message: "Teste de comunicação bem-sucedido",
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// Modificado para escutar em todas as interfaces (0.0.0.0)
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${port}`);
  console.log("Arquivos estáticos (index.html, client.js, style.css) devem estar na raiz do projeto.");
  if (!process.env.OPENWEATHER_API_KEY) {
    console.warn("AVISO: OPENWEATHER_API_KEY não está definida no .env. A função de previsão do tempo não funcionará como esperado.");
  }
});
