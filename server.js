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
// Isso é importante para que o backend possa ler a imagem e enviar para a OpenAI
const upload = multer({
  storage: multer.memoryStorage(), // Armazena o arquivo na memória RAM
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10MB por arquivo
});

// ===== CORS: Configuração para permitir requisições de diferentes origens =====
// Ajustado para incluir seu IP local e as portas do Expo, além do backend de produção.
const allowedOrigins = [
  'http://localhost:3000', // Seu backend local (se você ainda quiser rodar ele)
  'http://localhost:8081', // Expo Web/PWA rodando no mesmo PC
  'http://192.168.15.18:8081', // Expo Web/PWA acessando do celular (seu IP)
  'http://192.168.15.18:19000', // Expo Go (porta padrão) acessando do celular (seu IP)
  'http://192.168.15.18:19006', // Expo Go (outra porta possível) acessando do celular (seu IP)
  'https://fitgenius-backend-production-e5ac.up.railway.app', // Seu backend em produção na Railway
  // Adicione aqui outros domínios de frontend em produção se houver (ex: Vercel, Netlify)
  // 'https://seu-frontend-em-producao.com',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições sem 'origin' (ex: de apps nativos, Postman, ou algumas ferramentas de teste)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true); // Permite a requisição
    } else {
      console.warn('[CORS] Origem não permitida:', origin);
      callback(new Error('Not allowed by CORS: ' + origin)); // Bloqueia a requisição
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Métodos HTTP permitidos
  allowedHeaders: ['Content-Type', 'Authorization'], // Cabeçalhos permitidos
  credentials: true, // Permite o envio de cookies e cabeçalhos de autorização
};

app.use(cors(corsOptions)); // Aplica as opções de CORS a todas as rotas
app.use(express.json()); // Middleware para parsear JSON no corpo das requisições

// ===== Health check =====
// Rota simples para verificar se o servidor está online
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend FitGenius rodando!' });
});

// ===== Rota: ANALISAR IMAGEM DA REFEIÇÃO =====
// Recebe uma imagem, envia para a OpenAI Vision e retorna a análise
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

// ===== Rota: GERAR TREINO =====
// Recebe um perfil de usuário e gera um plano de treino
app.post('/api/generate-workout', async (req, res) => {
  try {
    const { userProfile } = req.body;

    if (!userProfile) {
      return res
        .status(400)
        .json({ error: 'Perfil do usuário não fornecido.' });
    }

    if (!apiKey) {
      return res
        .status(500)
        .json({ error: 'Chave da OpenAI não configurada.' });
    }

    const prompt = `Gere um plano de treino detalhado para o seguinte perfil de usuário, com foco em ganho de massa muscular.
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
    - Restrições/Lesões: ${userProfile.restricoesLesoes || 'Nenhuma'}
    `;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um personal trainer virtual. Crie planos de treino personalizados.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res
        .status(500)
        .json({ error: 'Erro ao interpretar resposta da IA.' });
    }

    const plano = JSON.parse(jsonMatch[0]);
    res.json(plano);
  } catch (error) {
    console.error('[ERRO TREINO]', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      return res.status(500).json({
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar treino.',
      });
    }
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// ================== ROTA: GERAR METAS NUTRICIONAIS ==================
// Aceita { prompt } no body (formato atual do seu frontend)
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  try {
    const { prompt } = req.body; // <--- AGORA ESPERA APENAS 'prompt'

    if (!prompt) { // <--- VERIFICA SE O PROMPT FOI FORNECIDO
      return res.status(400).json({
        sucesso: false,
        error: 'Prompt não fornecido para gerar metas nutricionais.',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.',
      });
    }

    console.log('[METAS NUTRICIONAIS] Prompt recebido:', prompt);

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista virtual. Calcule metas nutricionais diárias e forneça uma breve explicação. Responda APENAS com JSON válido, sem markdown. O JSON deve conter as chaves: calorias (number), proteinas (number), carboidratos (number), gorduras (number) e explicacao (string).',
          },
          {
            role: 'user',
            content: prompt, // <--- USA O PROMPT RECEBIDO DIRETAMENTE
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
        timeout: 60000,
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[METAS NUTRICIONAIS] Resposta bruta da OpenAI:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para as metas.',
      });
    }

    const metasNutricionais = JSON.parse(jsonMatch[0]);

    return res.json({ sucesso: true, metas: metasNutricionais });
  } catch (error) {
    console.error('[ERRO METAS NUTRICIONAIS]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', error.response.data);
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar metas nutricionais.',
      });
    }
    res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor ao gerar metas nutricionais.',
      detalhes: error.message,
    });
  }
});

// ===== Inicia o servidor =====
app.listen(PORT, () => {
  console.log(`Backend FitGenius rodando!`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
