// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do multer para upload de imagens
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Middlewares
app.use(cors());
app.use(express.json());

// ✅ Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend FitGenius rodando!' });
});

// ✅ Rota principal de análise de imagem com OpenAI Vision
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  let imagePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    }

    imagePath = req.file.path;

    // Lê a imagem e converte para base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    // Chama a API da OpenAI com Vision
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analise esta imagem de refeição e identifique todos os alimentos visíveis.
Para cada alimento, estime as quantidades em gramas e os macronutrientes.
Responda APENAS com um JSON válido no seguinte formato, sem texto adicional:
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
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Extrai e parseia o JSON da resposta
    const content = response.data.choices[0].message.content;

    // Remove possíveis blocos de markdown (```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({
        error: 'Não foi possível interpretar a resposta da IA.',
      });
    }

    const resultado = JSON.parse(jsonMatch[0]);
    res.json(resultado);

  } catch (error) {
    console.error('Erro ao analisar imagem:');
    if (error.response) {
      console.error('Status OpenAI:', error.response.status);
      console.error('Data OpenAI:', JSON.stringify(error.response.data));
      return res.status(500).json({
        error:
          error.response.data?.error?.message ||
          'Erro na API da OpenAI.',
      });
    }
    console.error('Mensagem:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });

  } finally {
    // Remove o arquivo temporário
    if (imagePath && fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }
});

// ✅ Rota de geração de plano de treino
app.post('/api/generate-workout', async (req, res) => {
  try {
    const { userProfile } = req.body;

    if (!userProfile) {
      return res.status(400).json({ error: 'Perfil do usuário não fornecido.' });
    }

    const prompt = `Crie um plano de treino personalizado para:
- Nome: ${userProfile.nome}
- Objetivo: ${userProfile.objetivo}
- Nível: ${userProfile.nivel}
- Peso: ${userProfile.peso}kg
- Altura: ${userProfile.altura}cm
- Idade: ${userProfile.idade} anos
- Sexo: ${userProfile.sexo}

Responda APENAS com um JSON válido no seguinte formato:
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

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const content = response.data.choices[0].message.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: 'Erro ao interpretar resposta da IA.' });
    }

    const plano = JSON.parse(jsonMatch[0]);
    res.json(plano);

  } catch (error) {
    console.error('Erro ao gerar treino:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data));
      return res.status(500).json({
        error: error.response.data?.error?.message || 'Erro na API da OpenAI.',
      });
    }
    console.error('Mensagem:', error.message);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Backend FitGenius rodando!`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
});
