// ROTA: GERAR TREINO
app.post('/api/gerar-treino', async (req, res) => {
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

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
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
