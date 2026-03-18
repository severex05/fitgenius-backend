// server.js
require('dotenv').config(); // Carrega variáveis de ambiente do .env
const express = require('express');
const cors = require('cors');
const multer = require('multer'); // Para lidar com upload de arquivos
const axios = require('axios'); // Para fazer requisições HTTP (para a OpenAI)

const app = express();
const PORT = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY; // Chave da OpenAI

// ---------- Multer (upload em memória) ----------
// Isso é importante para que o backend possa ler a imagem e enviar para a OpenAI
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Middlewares ----------
app.use(cors()); // Permite requisições de diferentes origens (seu app Expo)
app.use(express.json()); // Permite que o Express leia JSON no corpo das requisições

// ---------- Rota de Health Check ----------
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Backend FitGenius está online!' });
});

// ---------- Rota para Gerar Metas Nutricionais (com IA) ----------
app.post('/api/gerar-metas-nutricionais', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ sucesso: false, error: 'Prompt não fornecido.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res.status(500).json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  try {
    console.log('[METAS NUTRICIONAIS] Prompt recebido:', prompt);

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o', // Modelo mais recente e capaz
        messages: [
          {
            role: 'system',
            content:
              'Você é um nutricionista virtual. Sua tarefa é calcular metas nutricionais diárias (calorias, proteínas, carboidratos, gorduras) e fornecer uma explicação motivadora. Responda APENAS com um JSON válido, sem markdown, no formato: { "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number, "explicacao": string }',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 segundos de timeout
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[METAS NUTRICIONAIS] Resposta bruta da OpenAI:', content);

    // Tenta extrair o JSON da resposta, caso a IA adicione texto extra
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Não foi possível extrair JSON da resposta da OpenAI para metas.');
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

// ---------- Rota para Analisar Imagem (com IA) ----------
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ sucesso: false, error: 'Nenhuma imagem enviada.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res.status(500).json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  try {
    const base64Image = req.file.buffer.toString('base64');

    const prompt = `Analise esta imagem de uma refeição. Identifique os alimentos presentes, estime suas quantidades em gramas (g) e, para cada alimento, forneça uma estimativa de calorias, proteínas, carboidratos e gorduras. Se não conseguir identificar um alimento, omita-o. Se não houver comida, retorne um array vazio.

    Responda APENAS com um JSON válido, sem markdown, no formato:
    {
      "alimentos": [
        { "nome": "nome do alimento", "quantidade": number (g), "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number },
        { "nome": "outro alimento", "quantidade": number (g), "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number }
      ]
    }
    `;

    const openaiResp = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o', // Modelo mais recente e capaz para visão
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
        timeout: 60000, // 60 segundos de timeout para análise de imagem
      }
    );

    const content = openaiResp.data.choices[0].message.content || '';
    console.log('[ANÁLISE IMAGEM] Resposta bruta da OpenAI:', content);

    // Tenta extrair o JSON da resposta, caso a IA adicione texto extra
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Não foi possível extrair JSON da resposta da OpenAI para análise de imagem.');
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para a análise da refeição.',
        analise: { alimentos: [] }, // Retorna array vazio para o front não quebrar
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
        analise: { alimentos: [] }, // Retorna array vazio para o front não quebrar
      });
    }
    res.status(500).json({
      sucesso: false,
      error: 'Erro interno no servidor ao analisar imagem.',
      detalhes: error.message,
      analise: { alimentos: [] }, // Retorna array vazio para o front não quebrar
    });
  }
});

// ---------- Rota para Gerar Treino (com IA) ----------
app.post('/api/gerar-treino', async (req, res) => {
  const { userProfile } = req.body;

  if (!userProfile) {
    return res.status(400).json({ error: 'Perfil do usuário não fornecido.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res.status(500).json({ error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  try {
    const prompt = `Gere um plano de treino semanal completo e detalhado para o usuário abaixo. O plano deve ser dividido por dias da semana, com foco em grupos musculares específicos para cada dia, considerando o objetivo, nível e equipamentos disponíveis.

    Para cada dia de treino, inclua:
    - "dia": (string, ex: "Dia 1 - Peito e Tríceps")
    - "foco": (string, ex: "Peito, Tríceps")
    - "exercicios": (array de objetos)
      - Cada objeto em "exercicios" deve ter:
        - "nome": (string, ex: "Supino Reto com Barra")
        - "series": (string, ex: "3-4")
        - "repeticoes": (string, ex: "8-12")
        - "descanso": (string, ex: "60-90 segundos")

    O plano deve ser um array de objetos, onde cada objeto representa um dia de treino.
    Responda APENAS com um JSON válido, sem markdown, no formato:
    [
      {
        "dia": "Dia 1 - Peito e Tríceps",
        "foco": "Peito, Tríceps",
        "exercicios": [
          { "nome": "Supino Reto com Barra", "series": "3-4", "repeticoes": "8-12", "descanso": "60-90 segundos" },
          { "nome": "Supino Inclinado com Halteres", "series": "3", "repeticoes": "10-15", "descanso": "60 segundos" },
          // ... outros exercícios
        ]
      },
      {
        "dia": "Dia 2 - Costas e Bíceps",
        "foco": "Costas, Bíceps",
        "exercicios": [
          // ... exercícios
        ]
      }
      // ... outros dias
    ]

    Perfil do usuário:
    - Idade: ${userProfile.idade} anos
    - Sexo: ${userProfile.sexo}
    - Altura: ${userProfile.altura} cm
    - Peso: ${userProfile.peso} kg
    - Objetivo: ${userProfile.objetivo}
    - Nível de treino: ${userProfile.nivel}
    - Frequência de treino: ${userProfile.frequenciaTreino || 'Não especificado'}
    - Equipamentos disponíveis: ${userProfile.equipamentosDisponiveis?.join(', ') || 'Nenhum'}
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
              'Você é um treinador experiente. Gere treinos estruturados em JSON. Responda APENAS com JSON válido, sem markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
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
    console.log('[GERAR TREINO] Resposta bruta da OpenAI:', content);

    const jsonMatch = content.match(/|
$
[\s\S]*
$
|/); // Ajustado para buscar um array JSON
    if (!jsonMatch) {
      console.error('Não foi possível extrair JSON do array da resposta da OpenAI para treino.');
      return res.status(500).json({
        error: 'Não foi possível interpretar a resposta da IA para o treino.',
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
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI ao gerar treino.',
      });
    }
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// ---------- Rota para Buscar Alimento (com IA) ----------
app.post('/api/buscar-alimento', async (req, res) => {
  const { termo } = req.body;

  if (!termo) {
    return res.status(400).json({ sucesso: false, error: 'Termo de busca não fornecido.' });
  }

  if (!apiKey) {
    console.error('OPENAI_API_KEY não configurada.');
    return res.status(500).json({ sucesso: false, error: 'Chave da API OpenAI não configurada no servidor.' });
  }

  try {
    const prompt = `Liste 5 alimentos relacionados a "${termo}", com suas calorias, proteínas, carboidratos e gorduras por 100g.
    Responda APENAS com um JSON válido, sem markdown, no formato:
    {
      "alimentos": [
        { "id": "string", "nome": "string", "calorias": number, "proteinas": number, "carboidratos": number, "gorduras": number },
        // ... mais 4 alimentos
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
          {
            role: 'user',
            content: prompt,
          },
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
    console.log('[BUSCA ALIMENTO] Resposta bruta da OpenAI:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Não foi possível extrair JSON da resposta da OpenAI para busca de alimento.');
      return res.status(500).json({
        sucesso: false,
        error: 'Não foi possível interpretar a resposta da IA para a busca de alimentos.',
        alimentos: [],
      });
    }

    const data = JSON.parse(jsonMatch[0]);
    if (data.alimentos && Array.isArray(data.alimentos)) {
      // Adiciona um ID único para cada alimento retornado pela IA
      const alimentosComId = data.alimentos.map((alimento, index) => ({
        ...alimento,
        id: alimento.id || `${termo}-${index}-${Date.now()}`, // Garante um ID
      }));
      return res.json({ sucesso: true, alimentos: alimentosComId });
    } else {
      return res.status(500).json({
        sucesso: false,
        error: 'Formato de resposta da IA inesperado para busca de alimentos.',
        alimentos: [],
      });
    }
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


// ===== Inicia o servidor =====
app.listen(PORT, () => {
  console.log(`Backend FitGenius rodando!`);
  console.log(`URL local: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
