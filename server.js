const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');

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

// Конфигурация платежных систем
const CRYPTO_BOT_TOKEN = '403317:AA9S2Aytj2ze6DUO7gLKPdDjwfWgERo9zpu';
const CRYPTO_BOT_URL = 'https://pay.crypt.bot/api';

// Кошельки для вывода
const WALLETS = {
  TON: 'UQC5sl8NXJaPPl-MQf3xQm0ZcHTekNRMKW-PJQlIb92Kzt0m',
  USDT: 'TDj9Fafq4jWJ51TXA5QgXSTduvvjUN6xau'
};

// Файлы для сохранения данных
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const MARKET_FILE = path.join(DATA_DIR, 'market.json');

// Создаем папку data если не существует
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Загрузка данных из файлов
function loadData() {
  try {
    let users = new Map();
    let orders = {
      MINT: { buy: [], sell: [] },
      RWK: { buy: [], sell: [] },
      SKH: { buy: [], sell: [] },
      WTFL: { buy: [], sell: [] },
      CULT: { buy: [], sell: [] }
    };
    let marketData = {
      prices: {
        MINT: 0.078, RWK: 0.007, SKH: 0.0009, WTFL: 0.09, CULT: 0.07
      },
      history: {
        MINT: [], RWK: [], SKH: [], WTFL: [], CULT: []
      }
    };

    // Загружаем пользователей
    if (fs.existsSync(USERS_FILE)) {
      const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      users = new Map(Object.entries(usersData));
      console.log(`✅ Загружено ${users.size} пользователей`);
    }

    // Загружаем ордера
    if (fs.existsSync(ORDERS_FILE)) {
      orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
      console.log('✅ Ордера загружены');
    }

    // Загружаем рыночные данные
    if (fs.existsSync(MARKET_FILE)) {
      marketData = JSON.parse(fs.readFileSync(MARKET_FILE, 'utf8'));
      console.log('✅ Рыночные данные загружены');
    }

    return { users, orders, marketData };
  } catch (error) {
    console.error('❌ Ошибка загрузки данных:', error);
    return {
      users: new Map(),
      orders: {
        MINT: { buy: [], sell: [] }, RWK: { buy: [], sell: [] },
        SKH: { buy: [], sell: [] }, WTFL: { buy: [], sell: [] },
        CULT: { buy: [], sell: [] }
      },
      marketData: {
        prices: { MINT: 0.078, RWK: 0.007, SKH: 0.0009, WTFL: 0.09, CULT: 0.07 },
        history: { MINT: [], RWK: [], SKH: [], WTFL: [], CULT: [] }
      }
    };
  }
}

// Сохранение данных в файлы
function saveData() {
  try {
    // Сохраняем пользователей
    const usersObj = Object.fromEntries(users);
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersObj, null, 2));
    
    // Сохраняем ордера
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
    
    // Сохраняем рыночные данные
    const marketToSave = {
      prices: cryptoData,
      history: priceHistory
    };
    fs.writeFileSync(MARKET_FILE, JSON.stringify(marketToSave, null, 2));
    
    console.log('💾 Данные сохранены');
  } catch (error) {
    console.error('❌ Ошибка сохранения данных:', error);
  }
}

// Инициализация данных
let { users, orders, marketData } = loadData();

// Данные криптовалют
const cryptoData = marketData.prices;
let priceHistory = marketData.history;

// Инициализация истории цен если пустая
function initializePriceHistory() {
  const now = Date.now();
  Object.keys(cryptoData).forEach(crypto => {
    if (!priceHistory[crypto] || priceHistory[crypto].length === 0) {
      priceHistory[crypto] = [];
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
    }
  });
}
initializePriceHistory();

// Создание пользователя
function createUser(telegramData) {
  const userId = telegramData.id.toString();
  
  const user = {
    id: userId,
    username: telegramData.username || `User${userId.slice(-4)}`,
    firstName: telegramData.first_name || '',
    lastName: telegramData.last_name || '',
    photoUrl: telegramData.photo_url || '/assets/homepage/unsplash-p-at-a8xe.png',
    balance: 0,
    crypto: { MINT: 0, RWK: 0, SKH: 0, WTFL: 0, CULT: 0 },
    totalInvested: 0,
    firstLogin: false, // Изменено на false чтобы не показывать создание аккаунта
    pendingDeposits: new Map(),
    withdrawals: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    telegramData: telegramData
  };
  
  users.set(userId, user);
  saveData(); // Сохраняем сразу
  console.log(`✅ Пользователь создан: ${user.username}`);
  return user;
}

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
    console.log(`🔁 Пользователь вошел: ${user.username}`);
  }
  
  return user;
}

// CryptoBot интеграция с обработкой ошибок
async function createCryptoBotInvoice(amount, userId) {
  try {
    console.log(`Создание инвойса: $${amount} для пользователя ${userId}`);
    
    const response = await axios.post(`${CRYPTO_BOT_URL}/createInvoice`, {
      asset: 'USDT',
      amount: amount.toString(),
      description: `Deposit to WaterFall Trading`,
      hidden_message: `User ID: ${userId}`,
      paid_btn_name: 'viewItem',
      paid_btn_url: `https://t.me/your_bot?start=deposit_${userId}`,
      payload: JSON.stringify({ userId, amount, type: 'deposit' })
    }, {
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_BOT_TOKEN,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.data.ok) {
      console.log('✅ CryptoBot инвойс создан');
      return response.data.result;
    } else {
      throw new Error(response.data.error || 'Unknown CryptoBot error');
    }
  } catch (error) {
    console.error('❌ CryptoBot Error:', error.response?.data || error.message);
    
    // Демо-режим если CryptoBot недоступен
    console.log('🔄 Используем демо-режим для платежей');
    const invoiceId = 'demo_inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    return {
      invoice_id: invoiceId,
      pay_url: `https://t.me/CryptoBot?start=invoice_${invoiceId}`,
      amount: amount.toString(),
      status: 'active'
    };
  }
}

// Функция вывода
async function processWithdrawal(userId, amount, asset, address) {
  try {
    const user = users.get(userId);
    if (!user) throw new Error('User not found');
    
    if (user.balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    const fee = amount * 0.03;
    const netAmount = amount - fee;
    
    // Списываем средства
    user.balance -= amount;
    
    // Добавляем в историю выводов
    const withdrawal = {
      id: 'WD' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(),
      userId: userId,
      amount: amount,
      netAmount: netAmount,
      fee: fee,
      asset: asset,
      address: address,
      status: 'completed',
      timestamp: new Date().toISOString()
    };
    
    user.withdrawals.push(withdrawal);
    saveData(); // Сохраняем изменения
    
    return {
      success: true,
      withdrawalId: withdrawal.id,
      netAmount: netAmount,
      fee: fee,
      address: address
    };
    
  } catch (error) {
    console.error('Withdrawal Error:', error);
    throw error;
  }
}

// Обновление цены
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
    saveData(); // Сохраняем после изменений
  }
  
  return trades;
}

// Маршруты (остаются без изменений)
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
      saveData();
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
  saveData();
  
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

app.post('/api/withdraw', async (req, res) => {
  const { userId, amount, address, method } = req.body;
  
  try {
    if (!userId || !amount || !address || !method) {
      return res.json({ success: false, error: 'Missing required fields' });
    }
    
    const result = await processWithdrawal(userId, parseFloat(amount), method, address);
    
    res.json({ 
      success: true,
      withdrawalId: result.withdrawalId,
      netAmount: result.netAmount,
      fee: result.fee,
      address: result.address
    });
    
    io.to(userId).emit('withdrawalSuccess', {
      withdrawalId: result.withdrawalId,
      amount: amount,
      netAmount: result.netAmount,
      fee: result.fee
    });
    
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
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

// Socket.io
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
        prices: cryptoData,
        history: priceHistory
      });
      
    } catch (error) {
      console.error('Error in socket join:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Отключение:', socket.id);
  });
});

// Автосохранение каждые 30 секунд
setInterval(() => {
  saveData();
}, 30000);

// Обновление цен
setInterval(() => {
  Object.keys(cryptoData).forEach(crypto => {
    if (Math.random() > 0.5) {
      updateCryptoPrice(crypto);
    }
  });
  
  if (io.engine.clientsCount > 0) {
    io.emit('marketData', {
      prices: cryptoData,
      history: priceHistory
    });
  }
}, 5000);

module.exports = server;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 WaterFall Trading Server запущен на порту ${PORT}`);
    console.log(`💾 Данные сохраняются в папку: ${DATA_DIR}`);
    console.log('💰 Поддерживаемые криптовалюты:');
    Object.entries(cryptoData).forEach(([symbol, data]) => {
      console.log(`   ${symbol}: $${data.price.toFixed(4)}`);
    });
  });
}
