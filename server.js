const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Правильная настройка Socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Конфигурация CryptoPay
const config = {
  cryptopay: {
    token: "403317:AA9S2Aytj2ze6DUO7gLKPdDjwfWgERo9zpu",
    apiUrl: "https://pay.crypt.bot/api"
  },
  trc20: {
    address: "TDj9Fafq4jWJ51TXA5QgXSTduvvjUN6xau",
    network: "TRON"
  },
  ton: {
    address: "UQC5sl8NXJaPPl-MQf3xQm0ZcHTekNRMKW-PJQlIb92Kzt0m", 
    network: "TON"
  },
  app: {
    name: "WaterFall Trading",
    feePercentage: 1,
    minDeposit: 10,
    minWithdrawal: 5
  }
};

// База данных (файловая)
const DB_FILE = path.join(__dirname, 'database.json');

// Функции для работы с базой данных
function readDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('❌ Ошибка чтения базы данных:', error);
  }
  
  // Возвращаем пустую структуру если файла нет
  return {
    users: {},
    marketData: null,
    pendingInvoices: {}
  };
}

function writeDatabase(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Ошибка записи в базу данных:', error);
    return false;
  }
}

function getUser(userId) {
  const db = readDatabase();
  return db.users[userId] || null;
}

function saveUser(user) {
  const db = readDatabase();
  db.users[user.id] = user;
  return writeDatabase(db);
}

function getAllUsers() {
  const db = readDatabase();
  return db.users;
}

function saveMarketData(marketData) {
  const db = readDatabase();
  db.marketData = marketData;
  return writeDatabase(db);
}

function getMarketData() {
  const db = readDatabase();
  return db.marketData;
}

// Инициализация базы данных при запуске
function initializeDatabase() {
  const db = readDatabase();
  
  if (!db.marketData) {
    // Начальные рыночные данные
    const initialMarketData = {
      prices: {
        MINT: 0.2543,
        RWK: 0.0189,
        SKH: 0.0032,
        WTFL: 1.2456,
        CULT: 0.0876
      },
      history: {
        MINT: generateHistory(0.2543),
        RWK: generateHistory(0.0189),
        SKH: generateHistory(0.0032),
        WTFL: generateHistory(1.2456),
        CULT: generateHistory(0.0876)
      }
    };
    
    saveMarketData(initialMarketData);
    console.log('✅ База данных инициализирована');
  }
}

// Генерация исторических данных
function generateHistory(initialPrice, points = 100) {
  const history = [];
  let price = initialPrice;
  const now = Date.now();
  
  for (let i = points; i >= 0; i--) {
    const timestamp = now - (i * 60000);
    const change = (Math.random() - 0.5) * 0.04;
    price = price * (1 + change);
    
    history.push({
      timestamp,
      price: parseFloat(price.toFixed(6))
    });
  }
  
  return history;
}

// Обновление рыночных данных
function updateMarketData() {
  const marketData = getMarketData();
  if (!marketData) return;
  
  Object.keys(marketData.prices).forEach(crypto => {
    const change = (Math.random() - 0.5) * 0.02;
    const currentPrice = marketData.prices[crypto];
    const newPrice = parseFloat((currentPrice * (1 + change)).toFixed(6));
    marketData.prices[crypto] = newPrice;
    
    marketData.history[crypto].push({
      timestamp: Date.now(),
      price: newPrice
    });
    
    if (marketData.history[crypto].length > 100) {
      marketData.history[crypto].shift();
    }
    
    io.emit('marketUpdate', {
      crypto: crypto,
      price: newPrice,
      history: marketData.history[crypto]
    });
  });
  
  saveMarketData(marketData);
}

// Инициализация при запуске
initializeDatabase();

// Запускаем обновление рынка каждые 5 секунд
setInterval(updateMarketData, 5000);

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/wallet.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/wallet.html'));
});

app.get('/deposit.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/deposit.html'));
});

app.get('/withdraw.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/withdraw.html'));
});

app.get('/trading-:crypto.html', (req, res) => {
  const crypto = req.params.crypto.toUpperCase();
  res.sendFile(path.join(__dirname, `public/trading-${crypto}.html`));
});

// Serve Socket.io client
app.get('/socket.io/socket.io.js', (req, res) => {
  res.redirect('https://cdn.socket.io/4.7.2/socket.io.min.js');
});

// CryptoPay API функции
async function createCryptoPayInvoice(amount, userId, asset = 'USDT') {
  try {
    const response = await fetch(`${config.cryptopay.apiUrl}/createInvoice`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': config.cryptopay.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asset: asset,
        amount: amount.toString(),
        description: `Deposit for user ${userId}`,
        hidden_message: `User ID: ${userId}`,
        payload: JSON.stringify({ 
          userId: userId, 
          type: 'deposit',
          amount: amount 
        }),
        allowed_currencies: ['USDT', 'BTC', 'ETH', 'TON', 'BNB'],
        expires_in: 1800
      })
    });

    if (!response.ok) {
      throw new Error(`CryptoPay API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`CryptoPay error: ${data.error}`);
    }

    return data.result;
  } catch (error) {
    console.error('CryptoPay invoice creation failed:', error);
    const invoiceId = 'local_' + Date.now();
    
    return {
      invoice_id: invoiceId,
      pay_url: `https://t.me/CryptoBot?start=invoice_${invoiceId}`,
      amount: amount,
      asset: asset
    };
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  const db = readDatabase();
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    users: Object.keys(db.users).length,
    totalBalance: Object.values(db.users).reduce((sum, user) => sum + user.balance, 0)
  });
});

// Получить статистику (для админа)
app.get('/api/admin/stats', (req, res) => {
  const db = readDatabase();
  const users = Object.values(db.users);
  
  const stats = {
    totalUsers: users.length,
    totalBalance: users.reduce((sum, user) => sum + user.balance, 0),
    totalInvested: users.reduce((sum, user) => sum + user.totalInvested, 0),
    activeTrades: users.reduce((sum, user) => sum + (user.trades?.length || 0), 0),
    users: users.map(user => ({
      id: user.id,
      username: user.username,
      balance: user.balance,
      totalInvested: user.totalInvested,
      trades: user.trades?.length || 0,
      lastActive: user.lastActive
    }))
  };
  
  res.json(stats);
});

app.post('/api/order/create', (req, res) => {
  try {
    const { userId, crypto, type, price, amount } = req.body;
    
    console.log('📝 Создание ордера:', { userId, crypto, type, price, amount });
    
    if (!userId || !crypto || !type || !price || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const user = getUser(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    const totalCost = price * amount;
    
    if (type === 'buy') {
      if (user.balance < totalCost) {
        return res.status(400).json({ 
          success: false, 
          error: 'Insufficient balance' 
        });
      }
      
      user.balance -= totalCost;
      user.crypto[crypto] = (user.crypto[crypto] || 0) + parseFloat(amount);
    } else if (type === 'sell') {
      if (!user.crypto[crypto] || user.crypto[crypto] < amount) {
        return res.status(400).json({ 
          success: false, 
          error: 'Insufficient crypto balance' 
        });
      }
      
      user.balance += totalCost;
      user.crypto[crypto] -= parseFloat(amount);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid order type' 
      });
    }
    
    const trade = {
      id: Date.now().toString(),
      crypto,
      type,
      amount: parseFloat(amount),
      price: parseFloat(price),
      total: totalCost,
      timestamp: Date.now()
    };
    
    user.trades = user.trades || [];
    user.trades.push(trade);
    user.lastActive = Date.now();
    
    saveUser(user);
    
    io.to(userId).emit('orderExecuted', trade);
    
    console.log('✅ Ордер исполнен:', trade);
    
    res.json({ 
      success: true,
      message: 'Order executed successfully',
      trade: trade
    });
    
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

app.post('/api/deposit/create', async (req, res) => {
  try {
    const { userId, amount, method = 'CRYPTOPAY', asset = 'USDT' } = req.body;
    
    console.log('💰 Создание депозита:', { userId, amount, method, asset });
    
    if (!userId || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }

    if (amount < config.app.minDeposit) {
      return res.status(400).json({ 
        success: false, 
        error: `Minimum deposit is $${config.app.minDeposit}` 
      });
    }

    let result;

    if (method === 'CRYPTOPAY') {
      const invoice = await createCryptoPayInvoice(amount, userId, asset);
      
      result = {
        success: true,
        invoiceId: invoice.invoice_id,
        invoiceUrl: invoice.pay_url,
        amount: parseFloat(amount),
        asset: invoice.asset,
        method: 'CRYPTOPAY'
      };
    } else if (method === 'TRC20') {
      result = {
        success: true,
        address: config.trc20.address,
        amount: parseFloat(amount),
        network: config.trc20.network,
        method: 'TRC20'
      };
    } else if (method === 'TON') {
      result = {
        success: true,
        address: config.ton.address,
        amount: parseFloat(amount),
        network: config.ton.network,
        method: 'TON'
      };
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Unsupported deposit method' 
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Deposit creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const { userId, amount, address, method = 'TRC20', asset = 'USDT' } = req.body;
    
    console.log('💸 Запрос на вывод:', { userId, amount, address, method, asset });
    
    if (!userId || !amount || !address) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const user = getUser(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (user.balance < amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Insufficient balance' 
      });
    }

    if (amount < config.app.minWithdrawal) {
      return res.status(400).json({ 
        success: false, 
        error: `Minimum withdrawal is $${config.app.minWithdrawal}` 
      });
    }

    // Заглушка для обработки вывода
    const fee = amount * (config.app.feePercentage / 100);
    const netAmount = amount - fee;
    
    user.balance -= amount;
    user.lastActive = Date.now();
    
    saveUser(user);
    
    console.log('✅ Вывод обработан:', { 
      userId, 
      amount, 
      netAmount, 
      fee,
      method
    });
    
    io.to(userId).emit('withdrawalSuccess', {
      amount: parseFloat(amount),
      fee: parseFloat(fee),
      netAmount: parseFloat(netAmount),
      newBalance: user.balance,
      address,
      method,
      txHash: 'tx_' + Date.now()
    });
    
    res.json({
      success: true,
      amount: parseFloat(amount),
      fee: parseFloat(fee),
      netAmount: parseFloat(netAmount),
      newBalance: user.balance,
      txHash: 'tx_' + Date.now()
    });
    
  } catch (error) {
    console.error('❌ Withdrawal error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  
  socket.on('join', (userData) => {
    try {
      const userId = userData.id;
      
      if (!userId) {
        socket.emit('error', { message: 'User ID is required' });
        return;
      }
      
      console.log('👤 User join attempt:', { 
        userId, 
        username: userData.username,
        isTelegram: userData.isTelegramUser
      });
      
      let user = getUser(userId);
      const isNewUser = !user;
      
      if (isNewUser) {
        // СОЗДАЕМ ТОЛЬКО TELEGRAM ПОЛЬЗОВАТЕЛЕЙ
        if (!userData.isTelegramUser) {
          socket.emit('error', { message: 'Only Telegram users are allowed' });
          return;
        }
        
        user = {
          id: userId,
          username: userData.username || `User${userId.slice(-4)}`,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          photoUrl: userData.photoUrl || '/assets/homepage/unsplash-p-at-a8xe.png',
          balance: 0, // Начинаем с 0 баланса
          crypto: { MINT: 0, RWK: 0, SKH: 0, WTFL: 0, CULT: 0 },
          totalInvested: 0,
          firstLogin: true,
          isTelegramUser: true,
          telegramData: userData.telegramData || null,
          createdAt: Date.now(),
          lastActive: Date.now(),
          trades: [],
          socketId: socket.id
        };
        
        saveUser(user);
        console.log('✅ Новый Telegram пользователь создан:', user.username);
      } else {
        // Обновляем существующего пользователя
        user.lastActive = Date.now();
        user.socketId = socket.id;
        saveUser(user);
        console.log('✅ Существующий пользователь обновлен:', user.username);
      }
      
      socket.join(userId);
      socket.emit('userData', user);
      socket.emit('marketData', getMarketData());
      
      console.log(`✅ User ${user.username} successfully joined`);
      
    } catch (error) {
      console.error('❌ Join error:', error);
      socket.emit('error', { message: 'Failed to join' });
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 User disconnected:', socket.id, 'Reason:', reason);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  const db = readDatabase();
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💰 CryptoPay configured: ${config.cryptopay.token ? 'Yes' : 'No'}`);
  console.log(`👥 Total users: ${Object.keys(db.users).length}`);
  console.log(`📊 Market data: ${db.marketData ? 'Loaded' : 'Not loaded'}`);
});

module.exports = app;
