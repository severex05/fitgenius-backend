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
app.use(express.json()); // Middleware para parsear o corpo das requisições em formato JSON

// ===== Rota de Saúde (Health Check) =====
// Usada para verificar se o servidor está online e respondendo
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend FitGenius está rodando!' });
});

// ================== ROTA: ANALISAR IMAGEM DA REFEIÇÃO ==================
// Recebe uma imagem, envia para a OpenAI Vision e retorna a análise nutricional
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ sucesso: false, error: 'Nenhuma imagem enviada.' });
    }

    if (!apiKey) {
      return res
        .status(500)
        .json({ sucesso: false, error: 'OPENAI_API_KEY não configurada.' });
    }

    console.log(
      '[IMAGEM] Recebida:',
      req.file.originalname,
      req.file.size,
      'bytes'
    );

    // Converte o buffer da imagem para base64, formato exigido pela OpenAI Vision
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg'; // Garante um MIME type

    console.log('[IMAGEM] Chamando OpenAI Vision...');

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o', // Modelo mais avançado para visão
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analise esta imagem de refeição e identifique todos os alimentos visíveis.
Para cada alimento, estime as quantidades em gramas e os macronutrientes (calorias, proteínas, carboidratos, gorduras).
Responda APENAS com um JSON válido no seguinte formato, sem texto adicional ou markdown:
{
  "alimentos": [
    {
      "nome": "nome do alimento",
      "quantidade": 150,
      "calorias": 200,
      "proteinas": 25,
      "carboidratos": 10,
      "gorduras": 8
    }
  ],
  "totalCalorias": 200,
  "totalProteinas": 25,
  "totalCarboidratos": 10,
  "totalGorduras": 8,
  "observacao": "observação opcional sobre a refeição"
}`,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                  detail: 'high', // Detalhe 'high' para melhor análise
                },
              },
            ],
          },
        ],
        max_tokens: 1000, // Limite de tokens para a resposta da IA
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000, // Timeout de 60 segundos para a requisição da OpenAI
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[IMAGEM] Resposta bruta da OpenAI:', content);

    // Regex para extrair o JSON, caso a IA adicione texto extra (ex: ```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA.',
      });
    }

    const resultado = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, ...resultado });

  } catch (error) {
    console.error('[ERRO IMAGEM]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', JSON.stringify(error.response.data));
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao analisar imagem.',
      });
    }
    res.status(500).json({ sucesso: false, error: 'Erro interno no servidor.' });
  }
});

// ================== ROTA: GERAR PLANO DE TREINO ==================
// Gera um plano de treino personalizado com base no perfil do usuário
app.post('/api/generate-workout', async (req, res) => {
  try {
    const { userProfile } = req.body;

    if (!userProfile) {
      return res.status(400).json({ error: 'Perfil do usuário não fornecido.' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY não configurada.' });
    }

    console.log('[TREINO] Chamando OpenAI...');

    const prompt = `Crie um plano de treino personalizado para:
- Nome: ${userProfile.nome}
- Objetivo: ${userProfile.objetivo}
- Nível: ${userProfile.nivel}
- Peso: ${userProfile.peso}kg
- Altura: ${userProfile.altura}cm
- Idade: ${userProfile.idade} anos
- Sexo: ${userProfile.sexo}

Responda APENAS com um JSON válido no seguinte formato, sem texto adicional ou markdown:
{
  "dataGeracao": "${new Date().toISOString()}",
  "dias": [
    {
      "dia": "Segunda-feira",
      "gruposMusculares": ["Peito", "Tríceps"],
      "exercicios": [
        {
          "nome": "Supino Reto",
          "series": "4",
          "repeticoes": "10-12",
          "descanso": "60s",
          "descricao": "Deite no banco, segure a barra na largura dos ombros"
        }
      ]
    }
  ]
}`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
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
    console.log('[TREINO] Resposta bruta da OpenAI:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Erro ao interpretar resposta da IA.' });
    }

    const plano = JSON.parse(jsonMatch[0]);
    res.json(plano);

  } catch (error) {
    console.error('[ERRO TREINO]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', JSON.stringify(error.response.data));
      return res.status(500).json({
        error: error.response.data?.error?.message || 'Erro na API da OpenAI ao gerar treino.',
      });
    }
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// ================== ROTA: GERAR METAS NUTRICIONAIS ==================
// Gera metas nutricionais diárias com base no perfil do usuário
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  try {
    const { userProfile } = req.body; // O app envia o userProfile completo

    if (!userProfile) {
      return res.status(400).json({
        sucesso: false,
        error: 'Perfil do usuário não fornecido para gerar metas.',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.',
      });
    }

    console.log('[METAS NUTRICIONAIS] Chamando OpenAI...');

    // Monta o prompt com base no userProfile
    const prompt = `Com base no seguinte perfil de usuário, gere metas nutricionais diárias (calorias, proteínas, carboidratos, gorduras) e uma breve explicação.
    Perfil:
    - Nome: ${userProfile.nome}
    - Idade: ${userProfile.idade}
    - Sexo: ${userProfile.sexo}
    - Altura: ${userProfile.altura} cm
    - Peso: ${userProfile.peso} kg
    - Objetivo: ${userProfile.objetivo}
    - Nível de Atividade: ${userProfile.nivelAtividade}

    Responda APENAS com um JSON válido, sem markdown, no formato:
    {
      "calorias": 2000,
      "proteinas": 150,
      "carboidratos": 200,
      "gorduras": 60,
      "explicacao": "Sua meta de calorias é baseada no seu objetivo de..."
    }`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini', // gpt-4o-mini é mais rápido e econômico para este tipo de tarefa
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista. Responda APENAS com JSON válido, sem markdown. O JSON deve conter as chaves: calorias (number), proteinas (number), carboidratos (number), gorduras (number) e explicacao (string).',
          },
          {
            role: 'user',
            content: prompt,
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

    // Regex para extrair o JSON, caso a IA adicione texto extra
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
