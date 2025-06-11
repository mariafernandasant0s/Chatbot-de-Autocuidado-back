// server.js
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import dotenv from 'dotenv'; // <<< Adicionado

dotenv.config(); // <<< Carrega variáveis do .env

const app = express();
const port = process.env.PORT || 3000; // <<< Usar porta do ambiente ou 3000

// --- Configurações ---
const API_KEY = process.env.GEMINI_API_KEY; // <<< Pega a chave do .env

// <<< Validação da API Key >>>
if (!API_KEY) {
    console.error("ERRO FATAL: Variável de ambiente GEMINI_API_KEY não definida.");
    console.log("Crie um arquivo .env na raiz do projeto e adicione a linha:");
    console.log("GEMINI_API_KEY=SUA_CHAVE_API_AQUI");
    process.exit(1); // Aborta a execução se a chave não existir
}

const genAI = new GoogleGenerativeAI(API_KEY);

// <<< Configurações do Modelo (Ajuste conforme necessário) >>>
const model = genAI.getGenerativeModel({ model: "gemini-pro" }); // Modelo recomendado para chat

const generationConfig = {
    temperature: 0.7, // Ajuste a criatividade (0.0 a 1.0)
    topK: 1,
    topP: 1,
    maxOutputTokens: 2048, // Limite de tokens na resposta
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Middlewares ---
app.use(cors()); // Habilita CORS para todas as origens
app.use(express.json()); // <<< Substitui bodyParser.json()
app.use(express.static('public')); // <<< Serve arquivos estáticos da pasta 'public'

// --- Endpoint de Chat (Substitui /flashcard) ---
app.post('/chat', async (req, res) => {
    console.log("Requisição /chat recebida:", req.body); // Log para depuração

    // <<< Pega a mensagem e o histórico do corpo da requisição >>>
    const mensagemUsuario = req.body.mensagem;
    const historicoRecebido = req.body.historico || []; // Garante que seja um array, mesmo que vazio

    // Validação básica da mensagem
    if (!mensagemUsuario || typeof mensagemUsuario !== 'string' || mensagemUsuario.trim() === '') {
        console.log("Requisição inválida: mensagem ausente ou vazia.");
        return res.status(400).json({ erro: "Mensagem inválida ou ausente." });
    }
    // Validação básica do histórico (deve ser um array)
    if (!Array.isArray(historicoRecebido)) {
         console.log("Requisição inválida: histórico não é um array.");
         return res.status(400).json({ erro: "Formato de histórico inválido." });
    }

    try {
        // <<< Inicia o chat com o histórico recebido >>>
        const chat = model.startChat({
            history: historicoRecebido,
            generationConfig: generationConfig,
            safetySettings: safetySettings,
        });

        // <<< Envia a nova mensagem do usuário para a API >>>
        const result = await chat.sendMessage(mensagemUsuario);
        const response = result.response; // Acesso direto à resposta

        // Verifica se a resposta foi bloqueada por segurança
        if (!response || response.promptFeedback?.blockReason) {
            const blockReason = response?.promptFeedback?.blockReason || 'desconhecido';
            console.warn(`Resposta bloqueada pela API Gemini. Motivo: ${blockReason}`);
            return res.status(400).json({ erro: `Sua mensagem ou a resposta foi bloqueada por questões de segurança (${blockReason}). Tente reformular.` });
        }

        const textoResposta = response.text();

        // <<< Cria o novo histórico para enviar de volta ao frontend >>>
        const novoHistorico = [
            ...historicoRecebido,
            { role: "user", parts: [{ text: mensagemUsuario }] },
            { role: "model", parts: [{ text: textoResposta }] }
        ];

        console.log("Enviando resposta e histórico atualizado.");
        // <<< Envia a resposta e o histórico atualizado para o frontend >>>
        res.json({ resposta: textoResposta, historico: novoHistorico });

    } catch (error) {
        // <<< Tratamento de Erros Aprimorado >>>
        console.error("Erro ao interagir com a API Gemini:", error); // Log detalhado do erro no servidor

        // Tenta extrair uma mensagem mais específica do erro da API, se disponível
        const apiErrorMessage = error?.response?.data?.error?.message || error?.message;

        res.status(500).json({
             erro: `Desculpe, ocorreu um erro interno no servidor ao processar sua solicitação. Tente novamente mais tarde. (Detalhe: ${apiErrorMessage || 'Erro desconhecido'})`
        });
    }
});

// Rota para evitar erros de favicon no console (opcional, mas útil)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- Inicialização do Servidor ---
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
    console.log(`Pasta pública servindo arquivos estáticos: 'public'`);
    // Verifica se a API Key foi carregada (apenas para confirmação no console)
    console.log(`API Key do Gemini carregada: ${API_KEY ? 'Sim' : 'NÃO (Verifique o arquivo .env!)'}`);
});