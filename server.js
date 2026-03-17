// server.js
require('dotenv').config(); // Carrega variáveis de ambiente do .env
const express = require('express');
const cors = require('cors');
const multer = require('multer'); // Para lidar com upload de arquivos
const axios = require('axios'); // Para fazer requisições HTTP (para a OpenAI)

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY; // Chave da OpenAI

// ===== Multer: Configura para guardar arquivos em memória (buffer) =====
const upload = multer({
  storage: multer.memoryStorage(), // Armazena o arquivo na memória RAM
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB por arquivo
});

// ===== CORS =====
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://192.168.15.18:8081',
  'http://192.168.15.18:19000',
  'http://192.168.15.18:19006',
  'https://fitgenius-backend-production-e5ac.up.railway.app',
  // coloque aqui depois o domínio do Vercel, tipo:
  // 'https://fitgenius.vercel.app',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Origem não permitida:', origin);
      callback(new Error('Not allowed by CORS: ' + origin));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ===== Health check =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend FitGenius rodando!' });
});

// ===== Rota: ANALISAR IMAGEM DA REFEIÇÃO (VERSÃO ANTIGA, QUE FUNCIONAVA) =====
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ sucesso: false, error: 'Nenhuma imagem enviada.' });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.',
      });
    }

    // Converte o buffer da imagem para base64
    const base64Image = req.file.buffer.toString('base64');

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o', // Modelo da OpenAI para visão
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente nutricional. Analise a imagem da refeição e liste os alimentos detectados, suas quantidades estimadas em gramas e os macronutrientes (calorias, proteínas, carboidratos, gorduras) para cada um. Responda APENAS com um JSON válido, sem markdown. O JSON deve conter uma chave "alimentos" que é um array de objetos, cada um com "nome", "quantidade" (em gramas), "calorias", "proteinas", "carboidratos", "gorduras".',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Quais alimentos estão nesta imagem?' },
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${base64Image}` },
              },
            ],
          },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // Aumenta o timeout para a API da OpenAI
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[ANÁLISE IMAGEM] Resposta bruta da OpenAI:', content);

    // Regex para extrair o JSON, caso a IA adicione texto extra
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Erro ao interpretar resposta da IA para análise de imagem.',
      });
    }

    const analise = JSON.parse(jsonMatch[0]);
    res.json({ sucesso: true, analise });
  } catch (error) {
    console.error('[ERRO ANÁLISE IMAGEM]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', error.response.data);
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao analisar imagem.',
      });
    }
    res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor ao analisar imagem.',
      detalhes: error.message,
    });
  }
});

// ===== Rota: GERAR TREINO (a mesma que você já tinha) =====
app.post('/api/generate-workout', async (req, res) => {
  try {
    const { userProfile } = req.body;

    if (!userProfile) {
      return res
        .status(400)
        .json({ error: 'Perfil do usuário não fornecido.' });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Chave da OpenAI não configurada.',
      });
    }

    const prompt = `
    Gere um plano de treino semanal detalhado, no formato JSON, para o seguinte perfil de usuário, com foco em ganho de massa muscular.
    O plano deve ser para 5 dias na semana, com exercícios, séries, repetições e descanso.
    Inclua um aquecimento e alongamento final.
    Responda APENAS com um JSON válido, sem markdown. O JSON deve conter as chaves: "titulo" (string), "dias" (array de objetos), "aquecimento" (string), "alongamento" (string).
    Cada objeto em "dias" deve ter "dia" (string, ex: "Dia 1 - Peito e Tríceps"), "foco" (string), "exercicios" (array de objetos).
    Cada objeto em "exercicios" deve ter "nome" (string), "series" (string), "repeticoes" (string), "descanso" (string).

    Perfil do usuário:
    - Nome: ${userProfile.nome}
    - Idade: ${userProfile.idade}
    - Sexo: ${userProfile.sexo}
    - Altura: ${userProfile.altura} cm
    - Peso: ${userProfile.peso} kg
    - Objetivo: ${userProfile.objetivo}
    - Nível de treino: ${userProfile.nivelTreino}
    - Frequência de treino: ${userProfile.frequenciaTreino}
    - Equipamentos disponíveis: ${userProfile.equipamentosDisponiveis.join(
      ', ',
    )}
    - Restrições/Lesões: ${userProfile.restricoesLesoes || 'Nen

