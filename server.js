const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Важно для Docker


const app = express();
const server = http.createServer(app);

// Для Render важно правильно настроить CORS
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Конфигурация для Render
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

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
      const randomChange = (Math.random() - 0.5) * 0.02;
      const newPrice = Math.max(0.0001, basePrice * (1 + randomChange));
      priceHistory[crypto].push({
        time: now - (i * 60000),
        price: newPrice
      });
    }
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
    photoUrl: telegramData.photo_url || '',
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
  console.log(`✅ Новый пользователь: ${user.username} (ID: ${user.id})`);
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
    const randomChange = (Math.random() - 0.5) * 0.01;
    currentData.price = Math.max(0.0001, currentData.price * (1 + randomChange));
  } else {
    const volumeRatio = (buyVolume - sellVolume) / (currentData.circulating || 1);
    const priceChange = volumeRatio * 0.02;
    currentData.price = Math.max(0.0001, currentData.price * (1 + priceChange));
  }
  
  priceHistory[cryptoId].push({
    time: Date.now(),
    price: currentData.price
  });
  
  if (priceHistory[cryptoId].length > 200) {
    priceHistory[cryptoId].shift();
  }
  
  return currentData.price;
}

// Обработка ордеров
function processOrders(cryptoId) {
  const cryptoOrders = orders[cryptoId];
  
  cryptoOrders.buy.sort((a, b) => b.price - a.price);
  cryptoOrders.sell.sort((a, b) => a.price - b.price);
  
  let trades = [];
  let changed = false;
  
  while (cryptoOrders.buy.length > 0 && cryptoOrders.sell.length > 0) {
    const bestBuy = cryptoOrders.buy[0];
    const bestSell = cryptoOrders.sell[0];
    
    if (bestBuy.price >= bestSell.price) {
      const tradeAmount = Math.min(bestBuy.amount, bestSell.amount);
      const tradePrice = bestSell.price;
      
      const buyer = users.get(bestBuy.userId);
      const seller = users.get(bestSell.userId);
      
      if (buyer && seller) {
        const totalCost = tradeAmount * tradePrice;
        
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
        
        io.emit('marketTrade', {
          crypto: cryptoId,
          amount: tradeAmount,
          price: tradePrice,
          time: Date.now()
        });
        
        changed = true;
      }
      
      bestBuy.amount -= tradeAmount;
      bestSell.amount -= tradeAmount;
      
      if (bestBuy.amount <= 0) cryptoOrders.buy.shift();
      if (bestSell.amount <= 0) cryptoOrders.sell.shift();
      
    } else {
      break;
    }
  }
  
  if (changed) {
    updateCryptoPrice(cryptoId);
  }
  
  return trades;
}

// CryptoBot интеграция (упрощенная для демо)
async function createCryptoBotInvoice(amount, userId) {
  try {
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

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    users: users.size,
    cryptos: Object.keys(cryptoData).length,
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });
});

app.get('/api/stats', (req, res) => {
  const activeUsers = Array.from(users.values()).filter(u => {
    const lastActive = new Date(u.lastActive);
    return (Date.now() - lastActive) < 5 * 60 * 1000;
  }).length;
  
  res.json({
    totalUsers: users.size,
    activeUsers: activeUsers,
    totalOrders: Object.values(orders).reduce((sum, cryptoOrders) => 
      sum + cryptoOrders.buy.length + cryptoOrders.sell.length, 0
    ),
    serverUptime: process.uptime(),
    nodeVersion: process.version
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
  
  user.balance += pendingDeposit.amount;
  user.totalInvested += pendingDeposit.amount;
  user.pendingDeposits.delete(invoiceId);
  
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
  
  if (type === 'buy') {
    const totalCost = order.amount * order.price;
    if (!user.balance || user.balance < totalCost) {
      return res.json({ success: false, error: 'Insufficient balance' });
    }
    user.balance -= totalCost;
  } else if (type === 'sell') {
    if (!user.crypto[crypto] || user.crypto[crypto] < order.amount) {
      return res.json({ success: false, error: `Insufficient ${crypto} balance` });
    }
    user.crypto[crypto] -= order.amount;
  } else {
    return res.json({ success: false, error: 'Invalid order type' });
  }
  
  orders[crypto][type].push(order);
  
  const trades = processOrders(crypto);
  
  res.json({ 
    success: true, 
    orderId: order.id,
    trades: trades.length,
    executed: trades.length > 0
  });
  
  io.emit('marketUpdate', {
    crypto: crypto,
    price: cryptoData[crypto].price,
    orders: orders[crypto]
  });
  
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
      
      socket.emit('userData', user);
      socket.emit('marketData', {
        prices: Object.fromEntries(
          Object.entries(cryptoData).map(([key, data]) => [key, data.price])
        ),
        history: priceHistory
      });
      
      console.log(`👤 Пользователь ${user.username} присоединился`);
      
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
  Object.keys(cryptoData).forEach(crypto => {
    if (Math.random() > 0.5) {
      updateCryptoPrice(crypto);
    }
  });
  
  if (io.engine.clientsCount > 0) {
    io.emit('marketData', {
      prices: Object.fromEntries(
        Object.entries(cryptoData).map(([key, data]) => [key, data.price])
      ),
      history: priceHistory
    });
  }
}, 5000);

// Graceful shutdown для Render
process.on('SIGTERM', () => {
  console.log('🔄 Получен SIGTERM, graceful shutdown...');
  server.close(() => {
    console.log('✅ Сервер остановлен');
    process.exit(0);
  });
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WaterFall Trading Server запущен на порту ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log('💰 Поддерживаемые криптовалюты:');
  Object.entries(cryptoData).forEach(([symbol, data]) => {
    console.log(`   ${symbol}: $${data.price.toFixed(4)} - ${data.fullName}`);
  });
  console.log('📊 Доступны страницы:');
  console.log('   /, /wallet.html, /trading-*.html, /deposit.html, /withdraw.html');
  console.log('🔌 WebSocket подключения активны');
  console.log('🏥 Health check: /api/health');
});

module.exports = app;
