// config.js - Конфигурация платежных систем
const config = {
  // Crypto Bot (Telegram)
  cryptoBot: {
    token: "403317:AA9S2Aytj2ze6DUO7gLKPdDjwfWgERo9zpu", // Токен от @CryptoBot
    apiUrl: "https://pay.crypt.bot/api"
  },
  
  // TRC20 (USDT)
  trc20: {
    address: "TDj9Fafq4jWJ51TXA5QgXSTduvvjUN6xau", // Ваш USDT TRC20 адрес
    network: "TRON"
  },
  
  // TON (Tonkeeper)
  ton: {
    address: "UQC5sl8NXJaPPl-MQf3xQm0ZcHTekNRMKW-PJQlIb92Kzt0m", // Ваш TON адрес для Tonkeeper
    network: "TON"
  },
  
  // Другие настройки
  app: {
    name: "WaterFall Trading",
    currency: "USD",
    feePercentage: 1, // 1% комиссия
    minDeposit: 10,
    minWithdrawal: 5
  }
};

// Для использования в браузере
if (typeof window !== 'undefined') {
  window.appConfig = config;
}

// Для использования в Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = config;
}
