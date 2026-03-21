// server.js
require('dotenv').config(); // Carrega variáveis de ambiente do .env
const express = require('express');
const cors = require('cors');
const multer = require('multer'); // Upload de arquivos (imagem)
const axios = require('axios'); // HTTP para OpenAI

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// ---------- Multer (upload em memória) ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json());

// ---------- Health Check ----------
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend FitGenius está online!' });
});

// ---------- Rota: GERAR METAS NUTRICIONAIS ----------
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
    console.log('[METAS NUTRICIONAIS] Prompt recebido:', prompt);

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
      console.error('Falha ao extrair JSON da resposta de metas');
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

// ---------- Rota: ANALISAR IMAGEM ----------
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ sucesso: false, error: 'Nenhuma imagem enviada.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res
      .status(500)
      .json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  try {
    const base64Image = req.file.buffer.toString('base64');

    const prompt = `Analise esta imagem de uma refeição. Identifique os alimentos presentes, estime suas quantidades em gramas (g) e, para cada alimento, forneça uma estimativa de calorias, proteínas, carboidratos e gorduras.
Se não conseguir identificar um alimento, omita-o. Se não houver comida, retorne um array vazio.

Responda APENAS com JSON válido, sem markdown, no formato:
{
  "alimentos": [
    { "nome": "nome do alimento", "quantidade": number, "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number }
  ]
}`;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${req.file.mimetype};base64,${base64Image}`,
                },
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
        timeout: 60000,
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[ANÁLISE IMAGEM] Resposta bruta:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Falha ao extrair JSON da resposta de imagem');
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para a análise da refeição.',
        analise: { alimentos: [] },
      });
    }

    const analise = JSON.parse(jsonMatch[0]);
    return res.json({ sucesso: true, analise });
  } catch (error) {
    console.error('[ERRO ANALISAR IMAGEM]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', error.response.data);
      return res.status(500).json({
        sucesso: false,
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao analisar imagem.',
        analise: { alimentos: [] },
      });
    }
    res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor ao analisar imagem.',
      detalhes: error.message,
      analise: { alimentos: [] },
    });
  }
});

// ---------- Rota: GERAR TREINO ----------
app.post('/api/gerar-treino', async (req, res) => {
  const { userProfile, prompt: promptDireto } = req.body;

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res.status(500).json({ error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  // Dois modos de uso:
  // 1) front manda userProfile (seu app onboarding/profile)
  // 2) front manda um "prompt" pronto (caso da tela index.tsx atual)
  let prompt;

  if (promptDireto) {
    prompt = promptDireto;
  } else if (userProfile) {
    prompt = `Gere um plano de treino semanal completo e detalhado para o usuário abaixo.

Perfil:
- Idade: ${userProfile.idade} anos
- Sexo: ${userProfile.sexo}
- Altura: ${userProfile.altura} cm
- Peso: ${userProfile.peso} kg
- Objetivo: ${userProfile.objetivo}
- Nível de treino: ${userProfile.nivel}

Saída obrigatória: um ARRAY JSON de dias de treino.
Cada elemento do array deve ter:
{
  "dia": "Dia 1 - Peito e Tríceps",
  "foco": "Peito, Tríceps",
  "exercicios": [
    { "nome": "Supino Reto com Barra", "series": "3-4", "repeticoes": "8-12", "descanso": "60-90 segundos" }
  ]
}

Responda APENAS com o array JSON (começando em "[" e terminando em "]"), sem texto antes ou depois.`;
  } else {
    return res
      .status(400)
      .json({ error: 'Envie "userProfile" ou um "prompt" direto para gerar treino.' });
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
              'Você é um treinador experiente. Gere treinos estruturados em JSON. Responda APENAS com JSON válido, sem markdown.',
          },
          { role: 'user', content: prompt },
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
    console.log('[GERAR TREINO] Resposta bruta:', content);

    // Aqui esperamos um ARRAY JSON, então buscamos por algo que começa com "[" e termina com "]"
    const jsonMatch = content.match(/|
$
[\s\S]*
$
|/);
    if (!jsonMatch) {
      console.error('Falha ao extrair array JSON do treino');
      return res
        .status(500)
        .json({ error: 'Não foi possível interpretar a resposta da IA para o treino.' });
    }

    const treino = JSON.parse(jsonMatch[0]); // deve ser um array de dias
    return res.json({ sucesso: true, treino });
  } catch (error) {
    console.error('[ERRO GERAR TREINO]', error.message);
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', error.response.data);
      return res.status(500).json({
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar treino.',
      });
    }
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// ---------- Rota: BUSCAR ALIMENTO ----------
app.post('/api/buscar-alimento', async (req, res) => {
  const { termo } = req.body;

  if (!termo) {
    return res.status(400).json({ sucesso: false, error: 'Termo de busca não fornecido.' });
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
      console.error('Falha ao extrair JSON da resposta de busca');
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
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', error.response.data);
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

// ---------- Sobe servidor ----------
app.listen(PORT, () => {
  console.log(`Backend FitGenius rodando na porta ${PORT}`);
});
