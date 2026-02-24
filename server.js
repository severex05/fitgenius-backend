require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Multer para receber imagens em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de saúde
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend FitGenius está rodando!',
  });
});

// ================== ROTA: GERAR TREINO ==================
app.post('/api/gerar-treino', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        sucesso: false,
        error: 'Prompt obrigatório para gerar treino.',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.',
      });
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
              'Você é um personal trainer. Responda APENAS com JSON válido, sem markdown. O JSON deve ser um array de dias de treino, cada dia com as chaves: "dia" (string), "gruposMusculares" (array de strings) e "exercicios" (array de objetos, cada um com "nome", "series", "repeticoes", "descanso", "descricao").',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2500,
      },
      {
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const content = openaiResponse.data.choices[0].message.content;
    console.log('[TREINO] Resposta:', content);

    // AQUI: supomos que a OpenAI já mandou JSON puro
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

// ================== ROTA: GERAR METAS NUTRICIONAIS ==================
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({
        sucesso: false,
        error: 'Prompt obrigatório para gerar metas.',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.',
      });
    }

    console.log('[NUTRIÇÃO] Chamando OpenAI...');

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
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
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const content = openaiResponse.data.choices[0].message.content;
    console.log('[NUTRIÇÃO] Resposta:', content);

    const metasNutricionais = JSON.parse(content);

    return res.json({ sucesso: true, metas: metasNutricionais });
  } catch (error) {
    console.error('[ERRO NUTRIÇÃO]', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao gerar metas.',
      detalhes: error.message,
    });
  }
});

// ================== ROTA: ANALISAR IMAGEM DA REFEIÇÃO ==================
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        sucesso: false,
        error: 'Nenhuma imagem enviada.',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.',
      });
    }

    console.log('[IMAGEM] Recebida:', req.file.originalname, req.file.size, 'bytes');

    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    console.log('[IMAGEM] Chamando OpenAI Vision...');

    const openaiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista especializado em análise de alimentos por imagem. Analise a imagem e retorne APENAS um JSON válido sem markdown com a chave "alimentos" contendo um array. Cada item deve ter: "nome" (string), "quantidade" (number em gramas), "calorias" (number), "proteinas" (number em gramas), "carboidratos" (number em gramas), "gorduras" (number em gramas). Se não conseguir identificar alimentos, retorne { "alimentos": [] }.',
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
                text: 'Analise esta imagem e identifique os alimentos presentes, estimando as quantidades e valores nutricionais.',
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

    const content = openaiResponse.data.choices[0].message.content;
    console.log('[IMAGEM] Resposta:', content);

    const analise = JSON.parse(content);

    return res.json({ sucesso: true, ...analise });
  } catch (error) {
    console.error('[ERRO IMAGEM]', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data));
    }
    return res.status(500).json({
      sucesso: false,
      error: 'Erro ao analisar imagem.',
      detalhes: error.message,
    });
  }
});

// ================== INICIO DO SERVIDOR ==================
app.listen(PORT, () => {
  console.log('Backend FitGenius rodando!');
  console.log('URL: http://localhost:' + PORT);
  console.log('Health: http://localhost:' + PORT + '/api/health');
});
