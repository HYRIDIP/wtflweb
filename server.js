const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

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

    pendingInvoices.set(data.result.invoice_id, {
      userId,
      amount,
      status: 'pending',
      createdAt: Date.now()
    });

    return data.result;
  } catch (error) {
    console.error('CryptoPay invoice creation failed:', error);
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

    // Заглушка для обработки вывода
    const fee = amount * (config.app.feePercentage / 100);
    const netAmount = amount - fee;
    
    user.balance -= amount;
    
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
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💰 CryptoPay configured: ${config.cryptopay.token ? 'Yes' : 'No'}`);
  console.log(`📊 Market data initialized for: ${Object.keys(marketData.prices).join(', ')}`);
});

module.exports = app;
