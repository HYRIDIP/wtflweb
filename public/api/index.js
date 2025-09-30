const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

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

// Конфигурация CryptoPay
const config = {
  cryptopay: {
    token: process.env.CRYPTOPAY_TOKEN || "ВАШ_ТОКЕН_CRYPTOPAY",
    apiUrl: "https://pay.crypt.bot/api",
    webhookSecret: process.env.WEBHOOK_SECRET || "your-webhook-secret"
  },
  trc20: {
    address: process.env.TRC20_ADDRESS || "ВАШ_TRC20_АДРЕС",
    network: "TRON"
  },
  ton: {
    address: process.env.TON_ADDRESS || "ВАШ_TON_АДРЕС", 
    network: "TON"
  },
  app: {
    name: "WaterFall Trading",
    feePercentage: 1,
    minDeposit: 10,
    minWithdrawal: 5
  }
};

// In-memory storage
const users = new Map();
const pendingInvoices = new Map();

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

// Инициализация исторических данных
Object.keys(marketData.prices).forEach(crypto => {
  marketData.history[crypto] = generateHistory(marketData.prices[crypto]);
});

// Обновление рыночных данных
function updateMarketData() {
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
}

setInterval(updateMarketData, 5000);

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
        expires_in: 1800 // 30 minutes
      })
    });

    if (!response.ok) {
      throw new Error(`CryptoPay API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`CryptoPay error: ${data.error}`);
    }

    // Сохраняем инвойс в ожидании
    pendingInvoices.set(data.result.invoice_id, {
      userId,
      amount,
      status: 'pending',
      createdAt: Date.now()
    });

    return data.result;
  } catch (error) {
    console.error('CryptoPay invoice creation failed:', error);
    // Fallback
    const invoiceId = 'local_' + Date.now();
    pendingInvoices.set(invoiceId, { userId, amount, status: 'pending' });
    
    return {
      invoice_id: invoiceId,
      pay_url: `https://t.me/CryptoBot?start=invoice_${invoiceId}`,
      amount: amount,
      asset: asset
    };
  }
}

async function checkCryptoPayInvoice(invoiceId) {
  try {
    const response = await fetch(`${config.cryptopay.apiUrl}/getInvoices?invoice_ids=${invoiceId}`, {
      method: 'GET',
      headers: {
        'Crypto-Pay-API-Token': config.cryptopay.token
      }
    });

    if (!response.ok) {
      throw new Error(`CryptoPay API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`CryptoPay error: ${data.error}`);
    }

    return data.result.items[0] || null;
  } catch (error) {
    console.error('CryptoPay invoice check failed:', error);
    return null;
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: Date.now(),
    users: users.size,
    pendingInvoices: pendingInvoices.size
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
      // Создаем инвойс в CryptoPay
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

app.post('/api/deposit/confirm', async (req, res) => {
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

    // Проверяем статус инвойса в CryptoPay
    const invoice = await checkCryptoPayInvoice(invoiceId);
    
    if (!invoice) {
      return res.status(404).json({ 
        success: false, 
        error: 'Invoice not found' 
      });
    }

    if (invoice.status === 'paid') {
      const amount = parseFloat(invoice.amount);
      
      user.balance += amount;
      user.totalInvested += amount;
      
      // Удаляем из ожидания
      pendingInvoices.delete(invoiceId);
      
      console.log('💳 Депозит зачислен:', { userId, amount, newBalance: user.balance });
      
      io.to(userId).emit('depositSuccess', {
        amount,
        newBalance: user.balance,
        txHash: invoice.payment_hash
      });
      
      res.json({
        success: true,
        amount,
        newBalance: user.balance
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: `Invoice status: ${invoice.status}` 
      });
    }
    
  } catch (error) {
    console.error('❌ Deposit confirmation error:', error);
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

    if (amount < config.app.minWithdrawal) {
      return res.status(400).json({ 
        success: false, 
        error: `Minimum withdrawal is $${config.app.minWithdrawal}` 
      });
    }

    let transferResult;
    
    if (method === 'TRC20') {
      transferResult = await processTRC20Withdrawal(address, amount, userId);
    } else if (method === 'TON') {
      transferResult = await processTONWithdrawal(address, amount, userId);
    } else if (method === 'CRYPTOPAY') {
      transferResult = await processCryptoPayWithdrawal(address, amount, userId, asset);
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Unsupported withdrawal method' 
      });
    }

    if (!transferResult.success) {
      return res.status(400).json({ 
        success: false, 
        error: transferResult.error 
      });
    }

    const fee = amount * (config.app.feePercentage / 100);
    const netAmount = amount - fee;
    
    user.balance -= amount;
    
    console.log('✅ Вывод обработан:', { 
      userId, 
      amount, 
      netAmount, 
      fee,
      method,
      txHash: transferResult.txHash 
    });
    
    io.to(userId).emit('withdrawalSuccess', {
      amount: parseFloat(amount),
      fee: parseFloat(fee),
      netAmount: parseFloat(netAmount),
      newBalance: user.balance,
      address,
      method,
      txHash: transferResult.txHash
    });
    
    res.json({
      success: true,
      amount: parseFloat(amount),
      fee: parseFloat(fee),
      netAmount: parseFloat(netAmount),
      newBalance: user.balance,
      txHash: transferResult.txHash
    });
    
  } catch (error) {
    console.error('❌ Withdrawal error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Функции для обработки выводов
async function processTRC20Withdrawal(address, amount, userId) {
  // Заглушка для TRC20 вывода
  console.log(`Processing TRC20 withdrawal: ${amount} USDT to ${address}`);
  
  return {
    success: true,
    txHash: 'TRX_' + Math.random().toString(16).substr(2, 64),
    network: 'TRC20'
  };
}

async function processTONWithdrawal(address, amount, userId) {
  // Заглушка для TON вывода
  console.log(`Processing TON withdrawal: ${amount} TON to ${address}`);
  
  return {
    success: true,
    txHash: 'TON_' + Math.random().toString(16).substr(2, 64),
    network: 'TON'
  };
}

async function processCryptoPayWithdrawal(address, amount, userId, asset = 'USDT') {
  try {
    const response = await fetch(`${config.cryptopay.apiUrl}/transfer`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': config.cryptopay.token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        asset: asset,
        amount: amount.toString(),
        spend_id: `withdrawal_${userId}_${Date.now()}`,
        comment: `Withdrawal to ${address}`
      })
    });

    if (!response.ok) {
      throw new Error(`CryptoPay transfer error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(`CryptoPay transfer failed: ${data.error}`);
    }

    return {
      success: true,
      txHash: data.result.id,
      network: 'CRYPTOPAY'
    };
  } catch (error) {
    console.error('CryptoPay withdrawal failed:', error);
    return {
      success: false,
      error: 'CryptoPay transfer failed: ' + error.message
    };
  }
}

// Webhook для CryptoPay
app.post('/api/webhook/cryptopay', async (req, res) => {
  try {
    const signature = req.headers['crypto-pay-api-signature'];
    const payload = JSON.stringify(req.body);
    
    // Проверка подписи (опционально)
    const expectedSignature = crypto
      .createHmac('sha256', config.cryptopay.webhookSecret)
      .update(payload)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      console.warn('⚠️ Invalid webhook signature');
      return res.status(401).json({ success: false });
    }
    
    const update = req.body;
    console.log('🔔 CryptoPay webhook:', update);
    
    if (update.update_type === 'invoice_paid') {
      const invoice = update.payload;
      const payloadData = JSON.parse(invoice.payload || '{}');
      
      if (payloadData.type === 'deposit' && payloadData.userId) {
        const user = users.get(payloadData.userId);
        if (user) {
          const amount = parseFloat(invoice.amount);
          user.balance += amount;
          user.totalInvested += amount;
          
          // Удаляем из ожидания
          pendingInvoices.delete(invoice.invoice_id);
          
          io.to(payloadData.userId).emit('depositSuccess', {
            amount: amount,
            newBalance: user.balance,
            txHash: invoice.hash
          });
          
          console.log(`✅ Deposit confirmed via webhook for user ${payloadData.userId}: ${amount}`);
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false });
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
        const user = users.get(userId);
        user.lastActive = Date.now();
        user.socketId = socket.id;
        console.log('✅ Существующий пользователь обновлен:', userData.username);
      }
      
      socket.join(userId);
      socket.emit('userData', users.get(userId));
      socket.emit('marketData', marketData);
      
      console.log(`✅ User ${userData.username} successfully joined`);
      
    } catch (error) {
      console.error('❌ Join error:', error);
      socket.emit('error', { message: 'Failed to join' });
    }
  });
  
  socket.on('disconnect', (reason) => {
    console.log('🔌 User disconnected:', socket.id, 'Reason:', reason);
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
    version: '1.0.0',
    paymentMethods: ['CRYPTOPAY', 'TRC20', 'TON']
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💰 CryptoPay configured: ${config.cryptopay.token ? 'Yes' : 'No'}`);
  console.log(`📊 Market data initialized for: ${Object.keys(marketData.prices).join(', ')}`);
});

module.exports = app;
