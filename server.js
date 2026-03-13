require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
  'https://fitgenius-backend-production-e5ac.up.railway.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn('[CORS] Origem não permitida:', origin);
      callback(null, true); // liberando tudo por enquanto para não travar o app
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// ================== HEALTH ==================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend FitGenius está rodando!',
    porta: PORT,
  });
});

// ================== GERAR TREINO ==================
app.post('/api/gerar-treino', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ sucesso: false, error: 'Prompt obrigatório.' });
    }
    if (!apiKey) {
      return res.status(500).json({ sucesso: false, error: 'Chave da OpenAI não configurada.' });
    }

    console.log('[TREINO] Chamando OpenAI...');

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um personal trainer de alto nível especializado em musculação e condicionamento físico. ' +
              'Monte treinos detalhados, seguros e eficientes, sempre personalizados ao perfil do aluno. ' +
              'Responda APENAS com JSON válido, sem markdown, sem texto antes ou depois. ' +
              'O JSON deve ser um array onde cada item representa um dia de treino com as chaves: ' +
              '"dia" (string com o nome do dia), ' +
              '"gruposMusculares" (array de strings com os grupos trabalhados), ' +
              '"exercicios" (array de objetos). ' +
              'Cada exercício deve ter: "nome" (string), "series" (string), "repeticoes" (string), ' +
              '"descanso" (string) e "descricao" (string detalhada com técnica de execução, músculos trabalhados e dicas). ' +
              'Adapte séries, repetições, descanso e escolha de exercícios ao objetivo, nível, idade, peso e altura do aluno.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      },
      {
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 90000,
      }
    );

    let content = openaiResponse.data.choices[0].message.content.trim();

    // Remove markdown se vier
    if (content.startsWith('```')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    console.log('[TREINO] Resposta recebida, tamanho:', content.length);

    const treinoGerado = JSON.parse(content);
    return res.json({ sucesso: true, treino: treinoGerado });
  } catch (error) {
    console.error('[ERRO TREINO]', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao gerar treino.',
      detalhes: error.message,
    });
  }
});

// ================== GERAR METAS NUTRICIONAIS ==================
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ sucesso: false, error: 'Prompt obrigatório.' });
    }
    if (!apiKey) {
      return res.status(500).json({ sucesso: false, error: 'Chave da OpenAI não configurada.' });
    }

    console.log('[METAS] Chamando OpenAI...');

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista esportivo especializado em performance e emagrecimento. ' +
              'Calcule metas nutricionais diárias baseadas no perfil do usuário usando evidências científicas. ' +
              'Responda APENAS com JSON válido, sem markdown. ' +
              'O JSON deve conter: "calorias" (number), "proteinas" (number em gramas), ' +
              '"carboidratos" (number em gramas), "gorduras" (number em gramas) e ' +
              '"explicacao" (string explicando a lógica do cálculo de forma motivadora).',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.5,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    let content = openaiResponse.data.choices[0].message.content.trim();

    if (content.startsWith('```')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    console.log('[METAS] Resposta:', content);

    const metasNutricionais = JSON.parse(content);
    return res.json({ sucesso: true, metas: metasNutricionais });
  } catch (error) {
    console.error('[ERRO METAS]', error.message);
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao gerar metas.',
      detalhes: error.message,
    });
  }
});

// ================== BUSCAR ALIMENTO COM IA ==================
app.post('/api/buscar-alimento', async (req, res) => {
  try {
    const { termo } = req.body;

    if (!termo || !termo.trim()) {
      return res.status(400).json({ sucesso: false, error: 'Termo obrigatório.' });
    }
    if (!apiKey) {
      return res.status(500).json({ sucesso: false, error: 'Chave da OpenAI não configurada.' });
    }

    console.log('[BUSCA ALIMENTO] Termo:', termo);

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista especialista em tabelas nutricionais de alimentos, suplementos e produtos brasileiros. ' +
              'Responda APENAS com JSON válido, sem markdown. ' +
              'O JSON deve ter a chave "alimentos" com um array de até 6 itens. ' +
              'Cada item deve ter: "id" (string numérica), "nome" (string completa do alimento/suplemento/marca), ' +
              '"calorias" (number), "proteinas" (number em gramas), ' +
              '"carboidratos" (number em gramas), "gorduras" (number em gramas), ' +
              '"unidadeMedida" (string: "g", "ml" ou "unidade"). ' +
              'Use valores por 100g para alimentos comuns, ou por 1 porção/scoop para suplementos. ' +
              'Se não encontrar nada, retorne { "alimentos": [] }.',
          },
          {
            role: 'user',
            content:
              `O usuário buscou por: "${termo}". ` +
              'Se mencionar marca específica (ex: Whey Dark Lab, Whey Optimum, Atum Gomes da Costa), traga essa marca. ' +
              'Se for genérico (ex: frango, arroz), traga as variações mais comuns (grelhado, cozido, etc.). ' +
              'Retorne os valores nutricionais mais precisos possíveis.',
          },
        ],
        temperature: 0.3,
        max_tokens: 1200,
      },
      {
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    let content = openaiResponse.data.choices[0].message.content.trim();

    if (content.startsWith('```')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    console.log('[BUSCA ALIMENTO] Resposta:', content);

    const resultado = JSON.parse(content);
    return res.json({ sucesso: true, alimentos: resultado.alimentos || [] });
  } catch (error) {
    console.error('[ERRO BUSCA ALIMENTO]', error.message);
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao buscar alimento.',
      detalhes: error.message,
    });
  }
});

// ================== ANALISAR IMAGEM ==================
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ sucesso: false, error: 'Nenhuma imagem enviada.' });
    }
    if (!apiKey) {
      return res.status(500).json({ sucesso: false, error: 'Chave da OpenAI não configurada.' });
    }

    console.log('[IMAGEM] Recebida:', req.file.originalname, req.file.size, 'bytes');

    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista especializado em análise de alimentos por imagem. ' +
              'Analise a imagem e retorne APENAS um JSON válido sem markdown com a chave "alimentos" contendo um array. ' +
              'Cada item deve ter: "nome" (string), "quantidade" (number em gramas), ' +
              '"calorias" (number), "proteinas" (number), "carboidratos" (number), "gorduras" (number). ' +
              'Se não conseguir identificar, retorne { "alimentos": [] }.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: 'data:' + mimeType + ';base64,' + imageBase64,
                  detail: 'low',
                },
              },
              {
                type: 'text',
                text: 'Identifique todos os alimentos desta imagem, estimando quantidades e valores nutricionais.',
              },
            ],
          },
        ],
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    let content = openaiResponse.data.choices[0].message.content.trim();

    if (content.startsWith('```')) {
      content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    console.log('[IMAGEM] Resposta:', content);

    const analise = JSON.parse(content);
    return res.json({ sucesso: true, ...analise });
  } catch (error) {
    console.error('[ERRO IMAGEM]', error.message);
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao analisar imagem.',
      detalhes: error.message,
    });
  }
});

// ================== START ==================
app.listen(PORT, () => {
  console.log('Backend FitGenius rodando na porta ' + PORT);
  console.log('Health: http://localhost:' + PORT + '/api/health');
});
