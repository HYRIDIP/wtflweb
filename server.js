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

// Конфигурация платежных систем
const CRYPTO_BOT_TOKEN = '403317:AA9S2Aytj2ze6DUO7gLKPdDjwfWgERo9zpu';
const CRYPTO_BOT_URL = 'https://pay.crypt.bot/api';

// Кошельки для вывода
const WALLETS = {
  TON: 'UQC5sl8NXJaPPl-MQf3xQm0ZcHTekNRMKW-PJQlIb92Kzt0m',
  USDT: 'TDj9Fafq4jWJ51TXA5QgXSTduvvjUN6xau' // TRC20
};

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
    crypto: { 
      MINT: 0, RWK: 0, SKH: 0, WTFL: 0, CULT: 0 
    },
    totalInvested: 0,
    firstLogin: true,
    pendingDeposits: new Map(),
    withdrawals: [],
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString()
  };
  
  users.set(userId, user);
  console.log(`✅ Новый пользователь: ${user.username}`);
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
    user.firstLogin = false;
  }
  
  return user;
}

// CryptoBot интеграция
async function createCryptoBotInvoice(amount, userId) {
  try {
    const response = await axios.post(`${CRYPTO_BOT_URL}/createInvoice`, {
      asset: 'USDT',
      amount: amount.toString(),
      description: `Deposit to WaterFall Trading - User ${userId}`,
      hidden_message: `User ID: ${userId}`,
      paid_btn_name: 'viewItem',
      paid_btn_url: `https://t.me/your_bot?start=deposit_success_${userId}`,
      payload: JSON.stringify({ userId, amount, type: 'deposit' })
    }, {
      headers: {
        'Crypto-Pay-API-Token': CRYPTO_BOT_TOKEN
      }
    });
    
    console.log('CryptoBot Invoice Response:', response.data);
    return response.data.result;
  } catch (error) {
    console.error('CryptoBot Error:', error.response?.data || error.message);
    throw new Error('Payment service unavailable. Please try again later.');
  }
}

// Функция вывода через CryptoBot
async function processWithdrawal(userId, amount, asset, address) {
  try {
    // В реальном приложении здесь будет вызов API для вывода
    // Для демо просто возвращаем успех
    
    const user = users.get(userId);
    if (!user) throw new Error('User not found');
    
    // Проверяем баланс
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
  }
  
  return trades;
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
    
    // Уведомляем пользователя
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

// Webhook для CryptoBot (для обработки платежей)
app.post('/webhook/cryptobot', (req, res) => {
  try {
    const update = req.body;
    console.log('CryptoBot Webhook:', update);
    
    // Обработка входящих платежей
    if (update.update_id && update.payload) {
      const payload = JSON.parse(update.payload);
      
      if (payload.type === 'deposit' && payload.userId) {
        const user = users.get(payload.userId);
        if (user) {
          user.balance += parseFloat(payload.amount);
          user.totalInvested += parseFloat(payload.amount);
          
          io.to(payload.userId).emit('depositSuccess', {
            amount: payload.amount,
            newBalance: user.balance
          });
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
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
        prices: Object.fromEntries(
          Object.entries(cryptoData).map(([key, data]) => [key, data.price])
        ),
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

// Обновление цен
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

module.exports = server;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`🚀 WaterFall Trading Server запущен на порту ${PORT}`);
    console.log('💰 Поддерживаемые криптовалюты:');
    Object.entries(cryptoData).forEach(([symbol, data]) => {
      console.log(`   ${symbol}: $${data.price.toFixed(4)} - ${data.fullName}`);
    });
    console.log('💳 Интегрированные платежи: CryptoBot');
    console.log('👛 Кошельки для вывода настроены');
  });
}
