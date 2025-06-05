# Chatbot de Autocuidado

Este é um chatbot de autocuidado que utiliza a API Gemini do Google para fornecer respostas sobre bem-estar, além de informações sobre data/hora e previsão do tempo.

## Funcionalidades

- Conversas sobre autocuidado, relaxamento e bem-estar
- Informações sobre data e hora atuais
- Previsão do tempo para qualquer cidade

## Tecnologias Utilizadas

- Node.js
- Express
- Google Generative AI (Gemini API)
- OpenWeatherMap API

## Configuração

1. Clone o repositório
2. Instale as dependências com `npm install`
3. Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:
   ```
   GEMINI_API_KEY=sua_chave_da_api_gemini
   OPENWEATHER_API_KEY=sua_chave_da_api_openweather
   PORT=3000
   ```
4. Inicie o servidor com `npm start`

## Deploy no Render

Para fazer o deploy deste projeto no Render:

1. Crie uma conta no [Render](https://render.com)
2. Crie um novo Web Service e conecte ao repositório GitHub
3. Configure as variáveis de ambiente (GEMINI_API_KEY e OPENWEATHER_API_KEY)
4. Use `npm install` como comando de build
5. Use `npm start` como comando de start
6. Selecione o plano Free

## Estrutura do Projeto

- `server.js`: Arquivo principal do servidor
- `package.json`: Configurações e dependências do projeto

