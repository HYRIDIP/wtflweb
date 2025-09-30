const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (в продакшене используйте базу данных)
const users = new Map();

// Начальные рыночные данные
const marketData = {
  prices: {
    MINT: 0.2543,
    RWK: 0.0189,
    SKH: 0.0032,
    WTFL: 1.2456,
    CULT: 0.0876
  },
  history: {
    MINT: [],
    RWK: [],
    SKH: [],
    WTFL: [],
    CULT: []
  }
};

// Генерация исторических данных
function generateHistory(initialPrice, points = 100) {
  const history = [];
  let price = initialPrice;
  const now = Date.now();
  
  for (let i = points; i >= 0; i--) {
    const timestamp = now - (i * 60000); // 1 минута интервал
    // Случайное изменение цены ±2%
    const change = (Math.random() - 0.5) * 0.04;
    price = price * (1 + change);
    
    history.push({
      timestamp,
      price: parseFloat(price.toFixed(6))
    });
  }
  
  return history;
}

// Инициализация исторических данных
Object.keys(marketData.prices).forEach(crypto => {
  marketData.history[crypto] = generateHistory(marketData.prices[crypto]);
});

// Обновление рыночных данных
function updateMarketData() {
  Object.keys(marketData.prices).forEach(crypto => {
    const change = (Math.random() - 0.5) * 0.02; // ±1%
    const currentPrice = marketData.prices[crypto];
    const newPrice = parseFloat((currentPrice * (1 + change)).toFixed(6));
    marketData.prices[crypto] = newPrice;
    
    // Обновляем историю
    marketData.history[crypto].push({
      timestamp: Date.now(),
      price: newPrice
    });
    
    // Держим только последние 100 точек
    if (marketData.history[crypto].length > 100) {
      marketData.history[crypto].shift();
    }
    
    // Рассылаем обновления по отдельности для каждого крипто
    io.emit('marketUpdate', {
      crypto: crypto,
      price: newPrice,
      history: marketData.history[crypto]
    });
  });
}

// Запускаем обновление рынка каждые 5 секунд
setInterval(updateMarketData, 5000);

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    users: users.size
  });
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
    
    const user = users.get(userId);
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
    
    // Сохраняем сделку
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
    
    // Рассылаем уведомление
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

app.post('/api/deposit/create', (req, res) => {
  try {
    const { userId, amount } = req.body;
    
    console.log('💰 Создание депозита:', { userId, amount });
    
    if (!userId || !amount) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    // В реальном приложении здесь была бы интеграция с платежной системой
    const invoiceId = 'inv_' + Date.now();
    const invoiceUrl = `https://example.com/payment/${invoiceId}`;
    
    res.json({
      success: true,
      invoiceId,
      invoiceUrl,
      amount: parseFloat(amount)
    });
    
  } catch (error) {
    console.error('❌ Deposit creation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

app.post('/api/deposit/confirm', (req, res) => {
  try {
    const { userId, invoiceId } = req.body;
    
    console.log('✅ Подтверждение депозита:', { userId, invoiceId });
    
    if (!userId || !invoiceId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const user = users.get(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // В реальном приложении здесь была бы проверка статуса платежа
    const amount = 100; // Примерная сумма
    
    user.balance += amount;
    user.totalInvested += amount;
    
    console.log('💳 Депозит зачислен:', { userId, amount, newBalance: user.balance });
    
    // Рассылаем уведомление
    io.to(userId).emit('depositSuccess', {
      amount,
      newBalance: user.balance
    });
    
    res.json({
      success: true,
      amount,
      newBalance: user.balance
    });
    
  } catch (error) {
    console.error('❌ Deposit confirmation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

app.post('/api/withdraw', (req, res) => {
  try {
    const { userId, amount, address, method } = req.body;
    
    console.log('💸 Запрос на вывод:', { userId, amount, address, method });
    
    if (!userId || !amount || !address) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields' 
      });
    }
    
    const user = users.get(userId);
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
    
    const fee = amount * 0.01; // 1% комиссия
    const netAmount = amount - fee;
    
    user.balance -= amount;
    
    console.log('✅ Вывод обработан:', { userId, amount, netAmount, fee });
    
    // Рассылаем уведомление
    io.to(userId).emit('withdrawalSuccess', {
      amount: parseFloat(amount),
      fee: parseFloat(fee),
      netAmount: parseFloat(netAmount),
      newBalance: user.balance,
      address,
      method
    });
    
    res.json({
      success: true,
      amount: parseFloat(amount),
      fee: parseFloat(fee),
      netAmount: parseFloat(netAmount),
      newBalance: user.balance
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
      
      console.log('👤 User join:', { 
        userId, 
        username: userData.username,
        isNew: !users.has(userId)
      });
      
      // Сохраняем/обновляем пользователя
      if (!users.has(userId)) {
        users.set(userId, {
          id: userId,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
          balance: userData.balance || 1000,
          crypto: userData.crypto || { MINT: 0, RWK: 0, SKH: 0, WTFL: 0, CULT: 0 },
          totalInvested: userData.totalInvested || 0,
          firstLogin: userData.firstLogin !== false,
          isRealUser: userData.isRealUser || false,
          trades: userData.trades || [],
          lastActive: Date.now(),
          socketId: socket.id
        });
        console.log('✅ Новый пользователь создан:', userData.username);
      } else {
        // Обновляем время активности и socket ID
        const user = users.get(userId);
        user.lastActive = Date.now();
        user.socketId = socket.id;
        console.log('✅ Существующий пользователь обновлен:', userData.username);
      }
      
      // Присоединяем сокет к комнате пользователя
      socket.join(userId);
      
      // Отправляем данные пользователя
      socket.emit('userData', users.get(userId));
      
      // Отправляем рыночные данные
      socket.emit('marketData', marketData);
      
      console.log(`✅ User ${userData.username} successfully joined`);
      
    } catch (error) {
      console.error('❌ Join error:', error);
      socket.emit('error', { message: 'Failed to join' });
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 User disconnected:', socket.id, 'Reason:', reason);
    
    // Находим пользователя по socket.id и обновляем статус
    for (let [userId, user] of users) {
      if (user.socketId === socket.id) {
        user.lastActive = Date.now();
        console.log(`📱 User ${user.username} marked as inactive`);
        break;
      }
    }
  });
  
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: 'Endpoint not found' 
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'WaterFall Trading API',
    status: 'running',
    timestamp: Date.now(),
    version: '1.0.0'
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Market data initialized for: ${Object.keys(marketData.prices).join(', ')}`);
  console.log(`👥 Active users: ${users.size}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;
