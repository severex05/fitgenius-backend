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

// ---------- Health ----------
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend FitGenius está online!' });
});

// ---------- Metas Nutricionais ----------
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ sucesso: false, error: 'Prompt não fornecido.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res
      .status(500)
      .json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
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
              'Você é um nutricionista virtual. Calcule metas nutricionais diárias (calorias, proteínas, carboidratos, gorduras) e forneça uma explicação motivadora. Responda APENAS com JSON válido, sem markdown, no formato: { "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number, "explicacao": string }',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[METAS NUTRICIONAIS] Resposta bruta:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para as metas nutricionais.',
      });
    }

    const metas = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, metas });
  } catch (error) {
    console.error('[ERRO GERAR METAS]', error.message);
    if (error.response) {
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

// ---------- Analisar Imagem ----------
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ sucesso: false, error: 'Arquivo de imagem não enviado.' });
    }

    if (!apiKey) {
      console.error('OPENAI_API_KEY não configurada.');
      return res
        .status(500)
        .json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
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
              'Você é um nutricionista que analisa imagens de refeições. Identifique os alimentos, estime quantidade em gramas e valores de calorias, proteínas, carboidratos e gorduras. Responda APENAS com JSON válido, no formato: { "alimentos": [ { "nome": string, "quantidade": number, "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number } ] }',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Analise esta refeição e retorne os alimentos detectados.' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 600,
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
    console.log('[ANÁLISE IMAGEM] Resposta bruta:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para análise da imagem.',
      });
    }

    const data = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, alimentos: data.alimentos || [] });
  } catch (error) {
    console.error('[ERRO ANALISAR IMAGEM]', error.message);
    if (error.response) {
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

// ---------- Gerar Treino ----------
app.post('/api/gerar-treino', async (req, res) => {
  try {
    const { prompt, userProfile } = req.body;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Chave da OpenAI não configurada.',
      });
    }

    // Se vier prompt direto do app (seu index.tsx já manda um prompt pronto)
    const userPrompt = prompt
      ? prompt
      : `Gere um plano de treino semanal detalhado em JSON para este usuário:
Nome: ${userProfile?.nome}
Sexo: ${userProfile?.sexo}
Idade: ${userProfile?.idade}
Peso: ${userProfile?.peso}
Altura: ${userProfile?.altura}
Objetivo: ${userProfile?.objetivo}
Nível: ${userProfile?.nivel}

Responda APENAS com JSON, no formato:
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
        "descricao": "texto..."
      }
    ]
  }
]`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um treinador experiente. Gere planos de treino estruturados em JSON. Responda APENAS com JSON válido, sem markdown.',
          },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
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
    console.log('[GERAR TREINO] Resposta bruta:', content);

    // A IA responde um ARRAY JSON, então capturamos um bloco que começa com [ e termina com ]
    const jsonMatch = content.match(/|
$
[\s\S]*
$
|/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para o treino.',
      });
    }

    const treino = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, treino });
  } catch (error) {
    console.error('[ERRO GERAR TREINO]', error.message);
    if (error.response) {
      return res.status(500).json({
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar treino.',
      });
    }
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// ---------- Buscar Alimento ----------
app.post('/api/buscar-alimento', async (req, res) => {
  const { termo } = req.body;

  if (!termo) {
    return res
      .status(400)
      .json({ sucesso: false, error: 'Termo de busca não fornecido.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res
      .status(500)
      .json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  try {
    const prompt = `Liste 5 alimentos relacionados a "${termo}", com suas calorias, proteínas, carboidratos e gorduras por 100g.
Responda APENAS com JSON válido, sem markdown, no formato:
{
  "alimentos": [
    { "id": "string", "nome": "string", "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number }
  ]
}`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista virtual. Forneça dados nutricionais de alimentos em JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[BUSCA ALIMENTO] Resposta bruta:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para a busca de alimentos.',
        alimentos: [],
      });
    }

    const data = JSON.parse(jsonMatch[0]);
    if (Array.isArray(data.alimentos)) {
      const alimentosComId = data.alimentos.map((alimento, index) => ({
        ...alimento,
        id: alimento.id || `${termo}-${index}-${Date.now()}`,
      }));
      return res.json({ sucesso: true, alimentos: alimentosComId });
    }

    return res.status(500).json({
      sucesso: false,
      error: 'Formato de resposta da IA inesperado para busca de alimentos.',
      alimentos: [],
    });
  } catch (error) {
    console.error('[ERRO BUSCAR ALIMENTO]', error.message);
    if (error.response) {
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao buscar alimentos.',
        alimentos: [],
      });
    }
    res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor ao buscar alimentos.',
      detalhes: error.message,
      alimentos: [],
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend FitGenius rodando na porta ${PORT}`);
});
