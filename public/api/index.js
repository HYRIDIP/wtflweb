const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
const server = http.createServer(app);

// Настройка Socket.io для Vercel
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    fullName: 'Mint Token',
    description: 'Децентрализованная платформа для создания токенов'
  },
  RWK: { 
    price: 0.007, 
    supply: 910900000, 
    circulating: 500000000,
    name: 'RWK', 
    fullName: 'Rewoke Token',
    description: 'Токен для вознаграждений и геймификации'
  },
  SKH: { 
    price: 0.0009, 
    supply: 1000900000, 
    circulating: 600000000,
    name: 'SKH',
    fullName: 'Skyhost Token',
    description: 'Токен для облачных сервисов и хостинга'
  },
  WTFL: { 
    price: 0.09, 
    supply: 980000000, 
    circulating: 450000000,
    name: 'WTFL',
    fullName: 'Waterfall Token',
    description: 'Нативный токен платформы WaterFall Trading'
  },
  CULT: { 
    price: 0.07, 
    supply: 91000000, 
    circulating: 45000000,
    name: 'CULT',
    fullName: 'Cult Token',
    description: 'Токен для сообществ и социальных платформ'
  }
};

let priceHistory = {
  MINT: [],
  RWK: [],
  SKH: [],
  WTFL: [],
  CULT: []
};

// Инициализация истории цен
function initializePriceHistory() {
  const now = Date.now();
  Object.keys(cryptoData).forEach(crypto => {
    const basePrice = cryptoData[crypto].price;
    // Создаем реалистичную историю цен
    let currentPrice = basePrice;
    for (let i = 100; i > 0; i--) {
      // Более сложная модель движения цен
      const randomChange = (Math.random() - 0.5) * 0.03; // 3% волатильность
      const trend = Math.sin(i * 0.1) * 0.01; // Добавляем тренд
      currentPrice = Math.max(0.0001, currentPrice * (1 + randomChange + trend));
      
      priceHistory[crypto].push({
        time: now - (i * 60000), // 1 минута интервал
        price: currentPrice,
        volume: Math.random() * 1000 + 100 // Случайный объем
      });
    }
    // Устанавливаем текущую цену как последнюю в истории
    cryptoData[crypto].price = priceHistory[crypto][priceHistory[crypto].length - 1].price;
  });
  console.log('✅ История цен инициализирована для всех криптовалют');
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
    totalWithdrawn: 0,
    firstLogin: true,
    pendingDeposits: new Map(),
    createdAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    tradingStats: {
      totalTrades: 0,
      profitableTrades: 0,
      totalVolume: 0
    },
    telegramData: {
      id: telegramData.id,
      username: telegramData.username,
      first_name: telegramData.first_name,
      last_name: telegramData.last_name,
      language_code: telegramData.language_code,
      is_premium: telegramData.is_premium || false
    }
  };
  
  users.set(userId, user);
  console.log(`✅ Создан новый пользователь: ${user.username} (ID: ${user.id})`);
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
    // Обновляем данные пользователя
    user.lastActive = new Date().toISOString();
    user.firstLogin = false;
    
    // Обновляем данные из Telegram если они изменились
    if (telegramData.username) user.username = telegramData.username;
    if (telegramData.first_name) user.firstName = telegramData.first_name;
    if (telegramData.last_name) user.lastName = telegramData.last_name;
    if (telegramData.photo_url) user.photoUrl = telegramData.photo_url;
    
    console.log(`🔁 Пользователь вошел: ${user.username} (ID: ${user.id})`);
  }
  
  return user;
}

// Функция обновления цены на основе ордеров и рыночной активности
function updateCryptoPrice(cryptoId) {
  const ordersForCrypto = orders[cryptoId];
  const currentData = cryptoData[cryptoId];
  
  const buyVolume = ordersForCrypto.buy.reduce((sum, order) => sum + order.amount, 0);
  const sellVolume = ordersForCrypto.sell.reduce((sum, order) => sum + order.amount, 0);
  
  // Сложная модель ценообразования
  if (buyVolume === 0 && sellVolume === 0) {
    // Если нет ордеров, добавляем небольшое случайное движение
    const randomChange = (Math.random() - 0.5) * 0.008; // 0.8% случайное изменение
    currentData.price = Math.max(0.0001, currentData.price * (1 + randomChange));
  } else {
    // Модель на основе спроса/предложения
    const volumeRatio = (buyVolume - sellVolume) / (currentData.circulating || 1);
    const priceChange = volumeRatio * 0.015; // 1.5% максимальное изменение
    
    // Добавляем инерцию (цена не меняется слишком резко)
    const smoothedChange = priceChange * 0.7;
    
    // Обновляем цену
    currentData.price = Math.max(0.0001, currentData.price * (1 + smoothedChange));
  }
  
  // Добавляем в историю
  const newPricePoint = {
    time: Date.now(),
    price: currentData.price,
    volume: buyVolume + sellVolume,
    buyPressure: buyVolume,
    sellPressure: sellVolume
  };
  
  priceHistory[cryptoId].push(newPricePoint);
  
  // Ограничиваем историю
  if (priceHistory[cryptoId].length > 500) {
    priceHistory[cryptoId].shift();
  }
  
  console.log(`📈 Обновлена цена ${cryptoId}: $${currentData.price.toFixed(6)}`);
  return currentData.price;
}

// Обработка ордеров с улучшенной логикой
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
      const tradePrice = (bestBuy.price + bestSell.price) / 2; // Средняя цена между ордерами
      
      const buyer = users.get(bestBuy.userId);
      const seller = users.get(bestSell.userId);
      
      if (buyer && seller) {
        const totalCost = tradeAmount * tradePrice;
        
        // Исполняем сделку
        seller.crypto[cryptoId] = (seller.crypto[cryptoId] || 0) - tradeAmount;
        buyer.crypto[cryptoId] = (buyer.crypto[cryptoId] || 0) + tradeAmount;
        buyer.balance -= totalCost;
        seller.balance += totalCost;
        
        // Обновляем статистику
        buyer.tradingStats.totalTrades += 1;
        seller.tradingStats.totalTrades += 1;
        buyer.tradingStats.totalVolume += totalCost;
        seller.tradingStats.totalVolume += totalCost;
        
        // Проверяем прибыльность сделки
        const buyerAvgPrice = buyer.crypto[cryptoId] ? (buyer.crypto[cryptoId] * tradePrice) / (buyer.crypto[cryptoId] + tradeAmount) : tradePrice;
        if (tradePrice > buyerAvgPrice) {
          buyer.tradingStats.profitableTrades += 1;
        }
        
        const trade = {
          crypto: cryptoId,
          buyer: buyer.id,
          seller: seller.id,
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost,
          timestamp: Date.now(),
          tradeId: 'TR' + Date.now() + Math.random().toString(36).substr(2, 6).toUpperCase()
        };
        
        trades.push(trade);
        
        // Отправляем уведомления участникам сделки
        io.to(bestBuy.userId).emit('orderExecuted', {
          crypto: cryptoId,
          type: 'buy',
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost,
          tradeId: trade.tradeId
        });
        
        io.to(bestSell.userId).emit('orderExecuted', {
          crypto: cryptoId,
          type: 'sell',
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost,
          tradeId: trade.tradeId
        });
        
        // Рассылаем всем о сделке
        io.emit('marketTrade', {
          crypto: cryptoId,
          amount: tradeAmount,
          price: tradePrice,
          total: totalCost,
          time: Date.now(),
          tradeId: trade.tradeId
        });
        
        console.log(`💱 Исполнена сделка ${cryptoId}: ${tradeAmount} по $${tradePrice} (${trade.tradeId})`);
        changed = true;
      }
      
      // Обновляем ордера
      bestBuy.amount -= tradeAmount;
      bestSell.amount -= tradeAmount;
      
      if (bestBuy.amount <= 0) cryptoOrders.buy.shift();
      if (bestSell.amount <= 0) cryptoOrders.sell.shift();
      
    } else {
      break; // Больше нет совпадающих ордеров
    }
  }
  
  if (changed) {
    // Обновляем цену после сделок
    updateCryptoPrice(cryptoId);
  }
  
  return trades;
}

// CryptoBot интеграция
async function createCryptoBotInvoice(amount, userId) {
  try {
    // Генерируем уникальный ID инвойса
    const invoiceId = 'inv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // В реальном приложении здесь будет вызов API CryptoBot
    // Для демо возвращаем фиктивные данные
    return {
      invoice_id: invoiceId,
      pay_url: `https://t.me/CryptoBot?start=invoice_${invoiceId}`,
      amount: amount.toString(),
      status: 'active',
      created_at: Date.now(),
      expires_at: Date.now() + 30 * 60 * 1000 // 30 минут
    };
  } catch (error) {
    console.error('❌ CryptoBot error:', error);
    throw new Error('Payment service temporarily unavailable. Please try again later.');
  }
}

// ВАЖНО: Правильные маршруты для Vercel
// Основной маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// Явно указываем все HTML файлы
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/loading.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/loading.html'));
});

app.get('/wallet.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/wallet.html'));
});

app.get('/trading-MINT.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trading-MINT.html'));
});

app.get('/trading-RWK.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trading-RWK.html'));
});

app.get('/trading-SKH.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trading-SKH.html'));
});

app.get('/trading-WTFL.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trading-WTFL.html'));
});

app.get('/trading-CULT.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/trading-CULT.html'));
});

app.get('/deposit.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/deposit.html'));
});

app.get('/withdraw.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/withdraw.html'));
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
      info: cryptoData[crypto],
      stats: {
        totalBuyOrders: orders[crypto].buy.length,
        totalSellOrders: orders[crypto].sell.length,
        buyVolume: orders[crypto].buy.reduce((sum, order) => sum + order.amount, 0),
        sellVolume: orders[crypto].sell.reduce((sum, order) => sum + order.amount, 0)
      }
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
    activeUsers: Array.from(users.values()).filter(u => {
      const lastActive = new Date(u.lastActive);
      return (Date.now() - lastActive) < 5 * 60 * 1000; // 5 минут
    }).length,
    users: Array.from(users.values()).map(u => ({
      id: u.id,
      username: u.username,
      balance: u.balance,
      totalInvested: u.totalInvested
    }))
  });
});

app.get('/api/orders/:crypto', (req, res) => {
  const crypto = req.params.crypto.toUpperCase();
  if (orders[crypto]) {
    res.json(orders[crypto]);
  } else {
    res.status(404).json({ error: 'Crypto not found' });
  }
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
        status: 'pending',
        expires: Date.now() + 30 * 60 * 1000 // 30 минут
      });
    }
    
    res.json({ 
      success: true, 
      invoiceUrl: invoice.pay_url,
      invoiceId: invoice.invoice_id,
      amount: amount,
      expiresIn: 30 * 60 // 30 минут в секундах
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
    return res.json({ success: false, error: 'Invoice not found or expired' });
  }
  
  // Проверяем не истекло ли время инвойса
  if (Date.now() > pendingDeposit.expires) {
    user.pendingDeposits.delete(invoiceId);
    return res.json({ success: false, error: 'Invoice expired' });
  }
  
  // Зачисляем средства
  user.balance += pendingDeposit.amount;
  user.totalInvested += pendingDeposit.amount;
  user.pendingDeposits.delete(invoiceId);
  
  // Уведомляем пользователя через socket
  io.to(userId).emit('depositSuccess', {
    amount: pendingDeposit.amount,
    newBalance: user.balance,
    invoiceId: invoiceId
  });
  
  res.json({ 
    success: true, 
    amount: pendingDeposit.amount,
    newBalance: user.balance,
    message: `Deposit of $${pendingDeposit.amount} completed successfully`
  });
});

app.post('/api/withdraw', (req, res) => {
  const { userId, amount, address, network = 'USDT_TRC20' } = req.body;
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
  
  if (amount > 5000) {
    return res.json({ success: false, error: 'Maximum withdrawal is $5000' });
  }
  
  if (!address || address.length < 10) {
    return res.json({ success: false, error: 'Invalid withdrawal address' });
  }
  
  // Проверяем формат адреса в зависимости от сети
  if (network.includes('TRC20') && !address.startsWith('T')) {
    return res.json({ success: false, error: 'Invalid TRC20 address' });
  }
  
  const fee = amount * 0.03; // 3% комиссия
  const netAmount = amount - fee;
  
  // Выполняем вывод
  user.balance -= amount;
  user.totalWithdrawn += netAmount;
  
  const transactionId = 'TX' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
  
  res.json({ 
    success: true, 
    netAmount: netAmount.toFixed(2),
    fee: fee.toFixed(2),
    transactionId: transactionId,
    address: address,
    network: network,
    processedAt: new Date().toISOString()
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
  
  // Валидация данных
  const parsedPrice = parseFloat(price);
  const parsedAmount = parseFloat(amount);
  
  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    return res.json({ success: false, error: 'Invalid price' });
  }
  
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.json({ success: false, error: 'Invalid amount' });
  }
  
  if (parsedPrice > cryptoData[crypto].price * 10) {
    return res.json({ success: false, error: 'Price too high' });
  }
  
  if (parsedPrice < cryptoData[crypto].price * 0.1) {
    return res.json({ success: false, error: 'Price too low' });
  }
  
  const order = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    userId: userId,
    crypto: crypto,
    type: type,
    price: parsedPrice,
    amount: parsedAmount,
    timestamp: Date.now(),
    status: 'active'
  };
  
  // Проверка баланса и резервирование средств
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
    executed: trades.length > 0,
    remainingAmount: order.amount,
    message: trades.length > 0 ? 'Order partially executed' : 'Order placed successfully'
  });
  
  // Рассылаем обновления рынка
  io.emit('marketUpdate', {
    crypto: crypto,
    price: cryptoData[crypto].price,
    orders: orders[crypto],
    lastTrade: trades.length > 0 ? trades[trades.length - 1] : null
  });
  
  // Обновляем данные пользователя
  io.to(userId).emit('userData', user);
});

app.delete('/api/order/cancel/:orderId', (req, res) => {
  const { orderId } = req.params;
  const { userId } = req.body;
  
  if (!userId) {
    return res.json({ success: false, error: 'User ID required' });
  }
  
  let orderFound = false;
  let cancelledOrder = null;
  
  // Ищем ордер во всех криптовалютах и типах
  Object.keys(orders).forEach(crypto => {
    ['buy', 'sell'].forEach(type => {
      const orderIndex = orders[crypto][type].findIndex(order => order.id === orderId && order.userId === userId);
      if (orderIndex !== -1) {
        cancelledOrder = orders[crypto][type][orderIndex];
        orders[crypto][type].splice(orderIndex, 1);
        orderFound = true;
        
        // Возвращаем средства
        const user = users.get(userId);
        if (user && cancelledOrder) {
          if (cancelledOrder.type === 'buy') {
            user.balance += cancelledOrder.amount * cancelledOrder.price;
          } else {
            user.crypto[crypto] += cancelledOrder.amount;
          }
        }
      }
    });
  });
  
  if (orderFound && cancelledOrder) {
    res.json({ 
      success: true, 
      orderId: orderId,
      message: 'Order cancelled successfully'
    });
    
    // Уведомляем пользователя
    io.to(userId).emit('orderCancelled', {
      orderId: orderId,
      crypto: cancelledOrder.crypto,
      type: cancelledOrder.type
    });
  } else {
    res.json({ success: false, error: 'Order not found' });
  }
});

// Health check для Vercel
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    users: users.size,
    cryptos: Object.keys(cryptoData).length,
    activeConnections: io.engine.clientsCount,
    server: 'WaterFall Trading API',
    version: '1.0.0'
  });
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
        history: priceHistory,
        serverTime: Date.now()
      });
      
      console.log(`👤 Пользователь ${user.username} присоединился к торговой сессии`);
      
    } catch (error) {
      console.error('Error in socket join:', error);
      socket.emit('error', error.message);
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 Отключение:', socket.id, 'Причина:', reason);
  });
  
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Периодическое обновление цен и очистка
setInterval(() => {
  // Обновляем цены на основе активности
  Object.keys(cryptoData).forEach(crypto => {
    if (Math.random() > 0.6) { // 40% chance для естественного движения
      updateCryptoPrice(crypto);
    }
  });
  
  // Рассылаем обновления всем подключенным клиентам
  if (io.engine.clientsCount > 0) {
    io.emit('marketData', {
      prices: Object.fromEntries(
        Object.entries(cryptoData).map(([key, data]) => [key, data.price])
      ),
      history: priceHistory,
      serverTime: Date.now()
    });
  }
  
  // Очищаем просроченные pending депозиты
  const now = Date.now();
  users.forEach(user => {
    user.pendingDeposits.forEach((deposit, invoiceId) => {
      if (now > deposit.expires) {
        user.pendingDeposits.delete(invoiceId);
        console.log(`🗑️ Удален просроченный инвойс: ${invoiceId}`);
      }
    });
  });
}, 10000); // Обновляем каждые 10 секунд

// Статистика сервера
setInterval(() => {
  const activeUsers = Array.from(users.values()).filter(u => {
    const lastActive = new Date(u.lastActive);
    return (Date.now() - lastActive) < 5 * 60 * 1000; // 5 минут
  }).length;
  
  console.log(`📊 Статистика сервера - Пользователи: ${users.size}, Активные: ${activeUsers}, Сокеты: ${io.engine.clientsCount}`);
}, 30000);

// Экспортируем app для Vercel
module.exports = app;
