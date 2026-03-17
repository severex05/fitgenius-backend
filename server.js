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
  'http://192.168.15.18:19006', // Expo Go (outra porta possível) acess

