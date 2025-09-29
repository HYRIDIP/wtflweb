const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Конфигурация CryptoBot
const CRYPTO_BOT_TOKEN = process.env.CRYPTO_BOT_TOKEN || 'your_cryptobot_token';
const CRYPTO_BOT_URL = 'https://pay.crypt.bot/api';

// База данных в памяти
let users = new Map();
let orders = {
  MINT: { buy: [], sell: [] },
  RWK: { buy: [], sell: [] },
  SKH: { buy: [], sell: [] },
  WTFL: { buy: [], sell: [] },
  CULT: { buy: [], sell: [] }
};

// Данные криптовалют
const cryptoData = {
  MINT: { 
    price: 0.078, 
    supply: 21000000, 
    circulating: 10000000,
    name: 'MINT',
    fullName: 'Mint Token'
  },
  RWK: { 
    price: 0.007, 
    supply: 910900000, 
    circulating: 500000000,
    name: 'RWK', 
    fullName: 'Rewoke Token'
  },
  SKH: { 
    price: 0.0009, 
    supply: 1000900000, 
    circulating: 600000000,
    name: 'SKH',
    fullName: 'Skyhost Token'
  },
  WTFL: { 
    price: 0.09, 
    supply: 980000000, 
    circulating: 450000000,
    name: 'WTFL',
    fullName: 'Waterfall Token'
  },
  CULT: { 
    price: 0.07, 
    supply: 91000000, 
    circulating: 45000000,
    name: 'CULT',
    fullName: 'Cult Token'
  }
};

let priceHistory = {
  MINT: [], RWK: [], SKH: [], WTFL: [], CULT: []
};

// Инициализация истории цен
function initializePriceHistory() {
  const now = Date.now();
  Object.keys(cryptoData).forEach(crypto => {
    const basePrice = cryptoData[crypto].price;
    for (let i = 100; i > 0; i--) {
      const randomChange = (Math.random() - 0.5) * 0.02; // 2% волатильность
      const newPrice = Math.max(0.0001, basePrice * (1 + randomChange));
      priceHistory[crypto].push({
        time: now - (i * 60000), // 1 минута интервал
        price: newPrice
      });
    }
    // Устанавливаем текущую цену как последнюю в истории
    cryptoData[crypto].price = priceHistory[crypto][priceHistory[crypto].length - 1].price;
  });
}
initializePriceHistory();

// Создание пользователя с данными из Telegram
function createUser(telegramData) {
  const userId = telegramData.id.toString();
  
  const user = {
    id: userId,
    username: telegramData.username || `User${userId.slice(-4)}`,
    firstName: telegramData.first_name || '',
    lastName: telegramData.last_name || '',
    photoUrl: telegramData.photo_url || '/assets/homepage/unsplash-p-at-a8xe.png',
    balance: 0,
    crypto: { 
      MINT: 0, 
      RWK: 0, 
      SKH: 0, 
      WTFL: 0, 
      CULT: 0 
    },
    totalInvested: 0,
    firstLogin: true,
    pendingDeposits: new Map(),
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };
  
  users.set(userId, user);
  console.log(`✅ Новый пользователь создан: ${user.username} (ID: ${user.id})`);
  return user;
}

// Получение пользователя с созданием при необходимости
function getOrCreateUser(telegramData) {
  if (!telegramData || !telegramData.id) {
    throw new Error('Invalid Telegram user data');
  }
  
  const userId = telegramData.id.toString();
  let user = users.get(userId);
  
  if (!user) {
    user = createUser(telegramData);
  } else {
    // Обновляем время активности
    user.lastActive = new Date().toISOString();
    user.firstLogin = false;
    console.log(`🔁 Пользователь вошел: ${user.username} (ID: ${user.id})`);
  }
  
  return user;
}

// Функция обновления цены на основе ордеров
function updateCryptoPrice(cryptoId) {
  const ordersForCrypto = orders[cryptoId];
  const currentData = cryptoData[cryptoId];
  
  const buyVolume = ordersForCrypto.buy.reduce((sum, order) => sum + order.amount, 0);
  const sellVolume = ordersForCrypto.sell.reduce((sum, order) => sum + order.amount, 0);
  
  if (buyVolume === 0 && sellVolume === 0) {
    // Если нет ордеров, добавляем небольшое случайное движение
    const randomChange = (Math.random() - 0.5) * 0.01; // 1% случайное изменение
    currentData.price = Math.max(0.0001, currentData.price * (1 + randomChange));
  } else {
    // Модель ценообразования на основе спроса/предложения
    const volumeRatio = (buyVolume - sellVolume) / (currentData.circulating || 1);
    const priceChange = volumeRatio * 0.02; // 2% максимальное изменение
    
    // Обновляем цену
    currentData.price = Math.max(0.0001, currentData.price * (1 + priceChange));
  }
  
  // Добавляем в историю
  priceHistory[cryptoId].push({
    time: Date.now(),
    price: currentData.price
  });
  
  // Ограничиваем историю
  if (priceHistory[cryptoId].length > 200) {
    priceHistory[cryptoId].shift();
  }
  
  return currentData.price;
}

// Обработка ордеров
function processOrders(cryptoId) {
  const cryptoOrders = orders[cryptoId];
  
  // Сортируем ордера
  cryptoOrders.buy.sort((a, b) => b.price - a.price); // Покупки по убыванию цены
  cryptoOrders.sell.sort((a, b) => a.price - b.price); // Продажи по возрастанию цены
  
  let trades = [];
  let changed = false;
  
  while (cryptoOrders.buy.length > 0 && cryptoOrders.sell.length > 0) {
    const bestBuy = cryptoOrders.buy[0];
    const bestSell = cryptoOrders.sell[0];
    
    if (bestBuy.price >= bestSell.price) {
      // Находим совпадение - исполняем сделку
      const tradeAmount = Math.min(bestBuy.amount, bestSell.amount);
      const tradePrice = bestSell.price; // Исполняем по цене продавца
      
      const buyer = users.get(bestBuy.userId);
      const seller = users.get(bestSell.userId);
      
      if (buyer && seller) {
        const totalCost = tradeAmount * tradePrice;
        
        // Исполняем сделку
        seller.crypto[cryptoId] = (seller.crypto[cryptoId] || 0) - tradeAmount;
        buyer.crypto[cryptoId] = (buyer.crypto[cryptoId] || 0) + tradeAmount;
        buyer.balance -= totalCost;
        seller.balance += totalCost;
        
        trades.push({
          crypto: cryptoId,
          buyer: buyer.id,
          seller: seller.id,
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost,
          timestamp: Date.now()
        });
        
        // Отправляем уведомления
        io.to(bestBuy.userId).emit('orderExecuted', {
          crypto: cryptoId,
          type: 'buy',
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost
        });
        
        io.to(bestSell.userId).emit('orderExecuted', {
          crypto: cryptoId,
          type: 'sell',
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost
        });
        
        // Рассылаем всем о сделке
        io.emit('marketTrade', {
          crypto: cryptoId,
          amount: tradeAmount,
          price: tradePrice,
          time: Date.now()
        });
        
        changed = true;
      }
      
      // Обновляем ордера
      bestBuy.amount -= tradeAmount;
      bestSell.amount -= tradeAmount;
      
      if (bestBuy.amount <= 0) cryptoOrders.buy.shift();
      if (bestSell.amount <= 0) cryptoOrders.sell.shift();
      
    } else {
      break;
    }
  }
  
  if (changed) {
    // Обновляем цену после сделок
    updateCryptoPrice(cryptoId);
  }
  
  return trades;
}

// CryptoBot интеграция (упрощенная для демо)
async function createCryptoBotInvoice(amount, userId) {
  try {
    // Для демо просто возвращаем фиктивные данные
    // В реальном приложении здесь будет вызов API CryptoBot
    const invoiceId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    return {
      invoice_id: invoiceId,
      pay_url: `https://t.me/CryptoBot?start=invoice_${invoiceId}`,
      amount: amount.toString(),
      status: 'active'
    };
  } catch (error) {
    console.error('CryptoBot error:', error);
    throw new Error('Payment service temporarily unavailable');
  }
}

// Маршруты
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/loading.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'loading.html'));
});

app.get('/wallet.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'wallet.html'));
});

// Маршруты для отдельных криптовалют
app.get('/trading-MINT.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trading-MINT.html'));
});

app.get('/trading-RWK.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trading-RWK.html'));
});

app.get('/trading-SKH.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trading-SKH.html'));
});

app.get('/trading-WTFL.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trading-WTFL.html'));
});

app.get('/trading-CULT.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'trading-CULT.html'));
});

app.get('/deposit.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'deposit.html'));
});

app.get('/withdraw.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'withdraw.html'));
});

// API endpoints
app.get('/api/user/:userId', (req, res) => {
  const user = users.get(req.params.userId);
  if (user) {
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.get('/api/market/:crypto', (req, res) => {
  const crypto = req.params.crypto.toUpperCase();
  if (cryptoData[crypto]) {
    res.json({
      price: cryptoData[crypto].price,
      history: priceHistory[crypto] || [],
      orders: orders[crypto] || { buy: [], sell: [] },
      info: cryptoData[crypto]
    });
  } else {
    res.status(404).json({ error: 'Crypto not found' });
  }
});

app.get('/api/cryptos', (req, res) => {
  res.json(cryptoData);
});

app.get('/api/users/count', (req, res) => {
  res.json({ 
    count: users.size,
    users: Array.from(users.values()).map(u => ({
      id: u.id,
      username: u.username,
      balance: u.balance
    }))
  });
});

app.post('/api/deposit/create', async (req, res) => {
  const { userId, amount } = req.body;
  
  if (!userId || !amount) {
    return res.json({ success: false, error: 'Missing user ID or amount' });
  }
  
  if (amount < 10) {
    return res.json({ success: false, error: 'Minimum deposit is $10' });
  }
  
  if (amount > 1000) {
    return res.json({ success: false, error: 'Maximum deposit is $1000' });
  }
  
  try {
    const invoice = await createCryptoBotInvoice(amount, userId);
    const user = users.get(userId);
    
    if (user) {
      user.pendingDeposits.set(invoice.invoice_id, {
        amount: parseFloat(amount),
        created: Date.now(),
        status: 'pending'
      });
    }
    
    res.json({ 
      success: true, 
      invoiceUrl: invoice.pay_url,
      invoiceId: invoice.invoice_id,
      amount: amount
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

app.post('/api/deposit/confirm', (req, res) => {
  const { userId, invoiceId } = req.body;
  const user = users.get(userId);
  
  if (!user) {
    return res.json({ success: false, error: 'User not found' });
  }
  
  const pendingDeposit = user.pendingDeposits.get(invoiceId);
  if (!pendingDeposit) {
    return res.json({ success: false, error: 'Invoice not found' });
  }
  
  // В реальном приложении здесь будет проверка статуса через CryptoBot API
  // Для демо просто подтверждаем депозит
  user.balance += pendingDeposit.amount;
  user.totalInvested += pendingDeposit.amount;
  user.pendingDeposits.delete(invoiceId);
  
  // Уведомляем пользователя через socket
  io.to(userId).emit('depositSuccess', {
    amount: pendingDeposit.amount,
    newBalance: user.balance
  });
  
  res.json({ 
    success: true, 
    amount: pendingDeposit.amount,
    newBalance: user.balance
  });
});

app.post('/api/withdraw', (req, res) => {
  const { userId, amount, address } = req.body;
  const user = users.get(userId);
  
  if (!user) {
    return res.json({ success: false, error: 'User not found' });
  }
  
  if (!user.balance || user.balance < amount) {
    return res.json({ success: false, error: 'Insufficient balance' });
  }
  
  if (amount < 5) {
    return res.json({ success: false, error: 'Minimum withdrawal is $5' });
  }
  
  if (!address || address.length < 10) {
    return res.json({ success: false, error: 'Invalid withdrawal address' });
  }
  
  const fee = amount * 0.03;
  const netAmount = amount - fee;
  
  // Выполняем вывод
  user.balance -= amount;
  
  res.json({ 
    success: true, 
    netAmount: netAmount.toFixed(2),
    fee: fee.toFixed(2),
    transactionId: 'TX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase()
  });
});

app.post('/api/order/create', (req, res) => {
  const { userId, crypto, type, price, amount } = req.body;
  
  if (!userId || !crypto || !type || !price || !amount) {
    return res.json({ success: false, error: 'Missing required fields' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.json({ success: false, error: 'User not found' });
  }
  
  if (!cryptoData[crypto]) {
    return res.json({ success: false, error: 'Invalid cryptocurrency' });
  }
  
  const order = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    userId: userId,
    crypto: crypto,
    type: type,
    price: parseFloat(price),
    amount: parseFloat(amount),
    timestamp: Date.now()
  };
  
  // Проверка баланса
  if (type === 'buy') {
    const totalCost = order.amount * order.price;
    if (!user.balance || user.balance < totalCost) {
      return res.json({ success: false, error: 'Insufficient balance' });
    }
    // Резервируем средства
    user.balance -= totalCost;
  } else if (type === 'sell') {
    if (!user.crypto[crypto] || user.crypto[crypto] < order.amount) {
      return res.json({ success: false, error: `Insufficient ${crypto} balance` });
    }
    // Резервируем криптовалюту
    user.crypto[crypto] -= order.amount;
  } else {
    return res.json({ success: false, error: 'Invalid order type' });
  }
  
  // Добавляем ордер
  orders[crypto][type].push(order);
  
  // Обрабатываем ордера
  const trades = processOrders(crypto);
  
  res.json({ 
    success: true, 
    orderId: order.id,
    trades: trades.length,
    executed: trades.length > 0
  });
  
  // Рассылаем обновления
  io.emit('marketUpdate', {
    crypto: crypto,
    price: cryptoData[crypto].price,
    orders: orders[crypto]
  });
  
  // Обновляем данные пользователя
  io.to(userId).emit('userData', user);
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔌 Новое подключение:', socket.id);
  
  socket.on('join', (telegramData) => {
    try {
      if (!telegramData || !telegramData.id) {
        socket.emit('error', 'Invalid user data');
        return;
      }
      
      const user = getOrCreateUser(telegramData);
      socket.userId = user.id;
      socket.join(user.id);
      
      // Отправляем данные пользователю
      socket.emit('userData', user);
      socket.emit('marketData', {
        prices: Object.fromEntries(
          Object.entries(cryptoData).map(([key, data]) => [key, data.price])
        ),
        history: priceHistory
      });
      
      console.log(`👤 Пользователь ${user.username} присоединился к сессии`);
      
    } catch (error) {
      console.error('Error in socket join:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Отключение:', socket.id);
  });
});

// Периодическое обновление цен
setInterval(() => {
  // Обновляем цены на основе активности
  Object.keys(cryptoData).forEach(crypto => {
    if (Math.random() > 0.5) { // 50% chance для естественного движения
      updateCryptoPrice(crypto);
    }
  });
  
  // Рассылаем обновления всем подключенным клиентам
  if (io.engine.clientsCount > 0) {
    io.emit('marketData', {
      prices: Object.fromEntries(
        Object.entries(cryptoData).map(([key, data]) => [key, data.price])
      ),
      history: priceHistory
    });
  }
}, 5000); // Обновляем каждые 5 секунд

// Статистика сервера
setInterval(() => {
  const activeUsers = Array.from(users.values()).filter(u => {
    const lastActive = new Date(u.lastActive);
    const now = new Date();
    return (now - lastActive) < 5 * 60 * 1000; // 5 минут
  }).length;
  
  console.log(`📊 Статистика сервера - Пользователи: ${users.size}, Активные: ${activeUsers}, Сокеты: ${io.engine.clientsCount}`);
}, 30000);

module.exports = server;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 WaterFall Trading Server запущен на порту ${PORT}`);
    console.log('💰 Поддерживаемые криптовалюты:');
    Object.entries(cryptoData).forEach(([symbol, data]) => {
      console.log(`   ${symbol}: $${data.price.toFixed(4)} - ${data.fullName}`);
    });
    console.log('📊 Доступны страницы: /wallet.html, /trading-*.html, /deposit.html, /withdraw.html');
    console.log('🔌 WebSocket подключения активны для реального времени');
  });
}
