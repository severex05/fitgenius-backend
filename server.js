// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

// ---------- HEALTH ----------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend FitGenius está online!'
  });
});

// ---------- METAS NUTRICIONAIS ----------
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res
      .status(400)
      .json({ sucesso: false, error: 'Prompt não fornecido.' });
  }

  if (!apiKey) {
    return res
      .status(500)
      .json({ sucesso: false, error: 'Chave da OpenAI não configurada.' });
  }

  try {
    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista virtual. Calcule metas nutricionais diárias (calorias, proteínas, carboidratos, gorduras) e forneça uma explicação motivadora. Responda APENAS com JSON válido, sem markdown, no formato: { "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number, "explicacao": string }'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 500
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[METAS NUTRICIONAIS] Resposta bruta:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error:
          'Não foi possível interpretar a resposta da IA para as metas nutricionais.'
      });
    }

    const metas = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, metas });
  } catch (error) {
    console.error('[ERRO METAS]', error.message);
    if (error.response) {
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar metas nutricionais.'
      });
    }
    return res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor ao gerar metas nutricionais.'
    });
  }
});

// ---------- ANALISAR IMAGEM ----------
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
        error: 'Chave da OpenAI não configurada.'
      });
    }

    const base64Image = req.file.buffer.toString('base64');

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista e analisador de imagens. Recebe uma foto de refeição e deve identificar os alimentos e estimar macros. Responda APENAS com JSON, sem markdown, formato: { "alimentos": [ { "nome": string, "quantidade": number, "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number } ] }'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analise a refeição desta foto.' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 800,
        temperature: 0.4
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[ANALISAR IMAGEM] Resposta bruta:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error:
          'Não foi possível interpretar a resposta da IA para a imagem.'
      });
    }

    const data = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(data.alimentos)) {
      return res.status(500).json({
        sucesso: false,
        error: 'Formato inesperado da resposta de alimentos.'
      });
    }

    return res.json({ sucesso: true, alimentos: data.alimentos });
  } catch (error) {
    console.error('[ERRO ANALISAR IMAGEM]', error.message);
    if (error.response) {
      console.error('OpenAI status:', error.response.status);
      console.error('OpenAI data:', error.response.data);
    }
    return res.status(500).json({
      sucesso: false,
      error: 'Erro interno ao analisar imagem.'
    });
  }
});

// ---------- GERAR TREINO ----------
app.post('/api/gerar-treino', async (req, res) => {
  try {
    const { prompt, userProfile } = req.body;

    if (!prompt && !userProfile) {
      return res.status(400).json({
        sucesso: false,
        error: 'Nenhum prompt ou perfil de usuário enviado.'
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        sucesso: false,
        error: 'Chave da OpenAI não configurada.'
      });
    }

    const promptFinal =
      prompt ||
      `
Gere um plano de treino semanal detalhado, no formato JSON, para o seguinte perfil de usuário.
Responda APENAS com JSON válido, no formato:
[
  {
    "dia": "Segunda-feira",
    "gruposMusculares": ["Peito", "Tríceps"],
    "exercicios": [
      {
        "nome": "Supino reto com barra",
        "series": "4",
        "repeticoes": "8-12",
        "descanso": "90 segundos",
        "descricao": "Descrição detalhada da execução..."
      }
    ]
  }
]

Perfil:
${userProfile ? JSON.stringify(userProfile, null, 2) : 'Sem perfil detalhado.'}
`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um treinador experiente. Gere treinos estruturados em JSON. Responda APENAS com JSON válido, sem markdown.'
          },
          { role: 'user', content: promptFinal }
        ],
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[GERAR TREINO] Resposta bruta:', content);

    // AQUI é onde estava o problema. Fica APENAS isto:
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para o treino.'
      });
    }

    const treino = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, treino });
  } catch (error) {
    console.error('[ERRO GERAR TREINO]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', error.response.data);
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar treino.'
      });
    }
    return res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor.'
    });
  }
});

// ---------- BUSCAR ALIMENTO ----------
app.post('/api/buscar-alimento', async (req, res) => {
  const { termo } = req.body || {};
  if (!termo) {
    return res.status(400).json({
      sucesso: false,
      error: 'Termo de busca não fornecido.',
      alimentos: []
    });
  }

  if (!apiKey) {
    return res.status(500).json({
      sucesso: false,
      error: 'Chave da OpenAI não configurada.',
      alimentos: []
    });
  }

  try {
    const prompt = `Liste 5 alimentos relacionados a "${termo}", com suas calorias, proteínas, carboidratos e gorduras por 100g.
Responda APENAS com um JSON válido, sem markdown, no formato:
{
  "alimentos": [
    { "id": "string", "nome": "string", "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number }
  ]
}`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions

