class WaterFallApp {
  constructor() {
    this.tg = null;
    this.socket = null;
    this.currentUser = null;
    this.marketData = null;
    this.cryptos = ['MINT', 'RWK', 'SKH', 'WTFL', 'CULT'];
    this.isTelegram = false;
    
    this.init();
  }
  
  async init() {
    try {
      console.log('🚀 Инициализация WaterFall App...');
      
      // Проверяем Telegram Web App
      await this.initTelegram();
      
      // Создаем или загружаем пользователя
      await this.initUser();
      
      // Подключаемся к серверу
      await this.connectToServer();
      
      // Обновляем интерфейс
      this.updateUI();
      
      console.log('✅ Приложение успешно инициализировано');
      
    } catch (error) {
      console.error('❌ Ошибка инициализации:', error);
      this.showNotification('Ошибка загрузки приложения', 'error');
    }
  }
  
  async initTelegram() {
    // Проверяем наличие Telegram Web App
    if (window.Telegram && window.Telegram.WebApp) {
      this.tg = window.Telegram.WebApp;
      this.isTelegram = true;
      
      // Инициализируем Telegram Web App
      this.tg.ready();
      this.tg.expand();
      this.tg.enableClosingConfirmation();
      this.tg.setHeaderColor('#1e2329');
      this.tg.setBackgroundColor('#070707');
      
      console.log('📱 Telegram Web App инициализирован');
    } else {
      console.log('🌐 Режим браузера (не Telegram)');
      this.isTelegram = false;
    }
  }
  
  async initUser() {
    // Пытаемся получить данные из localStorage
    const savedUser = localStorage.getItem('telegramUser');
    const isTelegramSaved = localStorage.getItem('isTelegram') === 'true';
    
    if (savedUser && isTelegramSaved) {
      // Используем сохраненные данные
      const userData = JSON.parse(savedUser);
      this.currentUser = this.createUserObject(userData, true);
      console.log('👤 Пользователь загружен из localStorage:', this.currentUser.username);
    } else if (this.isTelegram && this.tg.initDataUnsafe?.user) {
      // Используем данные из Telegram
      const telegramUser = this.tg.initDataUnsafe.user;
      this.currentUser = this.createUserObject(telegramUser, true);
      
      // Сохраняем для будущего использования
      localStorage.setItem('telegramUser', JSON.stringify(telegramUser));
      localStorage.setItem('isTelegram', 'true');
      
      console.log('👤 Пользователь из Telegram:', this.currentUser.username);
    } else {
      // Создаем демо-пользователя
      this.currentUser = this.createDemoUser();
      console.log('👤 Демо-пользователь создан:', this.currentUser.username);
    }
  }
  
  createUserObject(userData, isRealUser = false) {
    return {
      id: userData.id.toString(),
      username: userData.username || `User${userData.id.toString().slice(-4)}`,
      firstName: userData.first_name || '',
      lastName: userData.last_name || '',
      photoUrl: userData.photo_url || '/assets/homepage/unsplash-p-at-a8xe.png',
      balance: isRealUser ? 0 : 1000, // Демо-пользователь получает стартовый баланс
      crypto: isRealUser ? 
        { MINT: 0, RWK: 0, SKH: 0, WTFL: 0, CULT: 0 } :
        { MINT: 10, RWK: 100, SKH: 1000, WTFL: 5, CULT: 50 },
      totalInvested: 0,
      firstLogin: isRealUser,
      isRealUser: isRealUser,
      telegramData: userData
    };
  }
  
  createDemoUser() {
    return {
      id: 'demo_' + Date.now(),
      username: 'DemoTrader',
      firstName: 'Demo',
      lastName: 'User',
      photoUrl: '/assets/homepage/unsplash-p-at-a8xe.png',
      balance: 1000,
      crypto: { MINT: 10, RWK: 100, SKH: 1000, WTFL: 5, CULT: 50 },
      totalInvested: 1000,
      firstLogin: false,
      isRealUser: false,
      telegramData: null
    };
  }
  
  async connectToServer() {
    try {
      if (!this.currentUser) {
        throw new Error('No user data to connect');
      }
      
      console.log('🔌 Подключение к серверу...');
      
      // Подключаем Socket.io
      this.socket = io();
      this.setupSocketHandlers();
      
      // Отправляем данные пользователя на сервер
      const userDataToSend = this.currentUser.isRealUser ? 
        this.currentUser.telegramData : 
        {
          id: this.currentUser.id,
          username: this.currentUser.username,
          first_name: this.currentUser.firstName,
          last_name: this.currentUser.lastName
        };
      
      this.socket.emit('join', userDataToSend);
      
      console.log('✅ Запрос на подключение отправлен');
      
    } catch (error) {
      console.error('❌ Ошибка подключения к серверу:', error);
      this.showNotification('Ошибка подключения к серверу', 'error');
    }
  }
  
  setupSocketHandlers() {
    this.socket.on('userData', (userData) => {
      console.log('📨 Получены данные пользователя с сервера');
      
      // Обновляем данные пользователя с сервера
      if (userData && userData.id === this.currentUser.id) {
        this.currentUser.balance = userData.balance || this.currentUser.balance;
        this.currentUser.crypto = userData.crypto || this.currentUser.crypto;
        this.currentUser.totalInvested = userData.totalInvested || this.currentUser.totalInvested;
        
        this.updateUI();
      }
    });
    
    this.socket.on('marketData', (data) => {
      console.log('📈 Получены рыночные данные');
      this.marketData = data;
      this.updateCharts();
      this.updatePrices();
      this.updateHoldings();
    });
    
    this.socket.on('marketUpdate', (data) => {
      if (this.marketData && data.crypto) {
        this.marketData.prices[data.crypto] = data.price;
        this.updatePrices();
        this.updateHoldings();
      }
    });
    
    this.socket.on('orderExecuted', (data) => {
      this.showNotification(
        `✅ Ордер исполнен: ${data.type === 'buy' ? 'ПОКУПКА' : 'ПРОДАЖА'} ${data.amount} ${data.crypto} по $${data.price.toFixed(4)}`,
        'success'
      );
    });
    
    this.socket.on('depositSuccess', (data) => {
      this.showNotification(
        `💰 Депозит успешен! $${data.amount} зачислен на баланс`,
        'success'
      );
      if (this.currentUser) {
        this.currentUser.balance = data.newBalance;
        this.updateUI();
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('❌ Ошибка от сервера:', error);
      this.showNotification(`Ошибка: ${error}`, 'error');
    });
    
    this.socket.on('connect', () => {
      console.log('✅ Подключение к серверу установлено');
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Отключение от сервера:', reason);
    });
  }
  
  updateUI() {
    if (!this.currentUser) return;
    
    // Обновляем аватарку
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl && this.currentUser.photoUrl) {
      avatarEl.src = this.currentUser.photoUrl;
      avatarEl.style.display = 'block';
    }
    
    // Обновляем имя пользователя
    const nameEl = document.getElementById('userName');
    if (nameEl) {
      const displayName = this.currentUser.firstName || this.currentUser.username || 'Трейдер';
      nameEl.textContent = `Привет, ${displayName}`;
    }
    
    // Обновляем балансы
    this.updateBalance();
    this.updateHoldings();
  }
  
  updateBalance() {
    const balanceElements = [
      'userBalance',
      'availableBalance', 
      'currentBalance',
      'usdBalance'
    ];
    
    balanceElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = `$${(this.currentUser.balance || 0).toFixed(2)}`;
      }
    });
  }
  
  updateHoldings() {
    if (!this.currentUser || !this.marketData) return;
    
    this.cryptos.forEach(crypto => {
      const amount = this.currentUser.crypto?.[crypto] || 0;
      const price = this.marketData.prices?.[crypto] || 0;
      const value = amount * price;
      const change = this.getPriceChange(crypto);
      
      // Обновляем холдинги в кошельке
      const container = document.getElementById(`holding-${crypto}`);
      if (container) {
        container.innerHTML = `
          <p class="text-gray2">${amount.toFixed(2)} ${crypto}</p>
          <p class="text-white1">$${value.toFixed(2)}</p>
          ${change !== 0 ? `
            <p class="${change > 0 ? 'text-profit' : 'text-loss'}">
              ${change > 0 ? '↗' : '↘'} ${Math.abs(change).toFixed(1)}%
            </p>
          ` : ''}
        `;
      }
      
      // Обновляем баланс на торговых страницах
      const cryptoBalanceEl = document.getElementById('cryptoBalance');
      if (cryptoBalanceEl) {
        cryptoBalanceEl.textContent = amount.toFixed(4);
      }
    });
  }
  
  updateCharts() {
    if (!this.marketData) return;
    
    this.cryptos.forEach(crypto => {
      const history = this.marketData.history?.[crypto];
      if (history && history.length > 0) {
        this.drawMiniChart(`chart-${crypto}`, history.slice(-20));
      }
    });
  }
  
  updatePrices() {
    if (!this.marketData) return;
    
    this.cryptos.forEach(crypto => {
      const priceElement = document.getElementById(`price-${crypto}`);
      if (priceElement) {
        const price = this.marketData.prices?.[crypto] || 0;
        const change = this.getPriceChange(crypto);
        
        priceElement.innerHTML = `
          $${price.toFixed(4)}
          ${change !== 0 ? `
            <span class="${change > 0 ? 'price-up' : 'price-down'}">
              ${change > 0 ? '↗' : '↘'} ${Math.abs(change).toFixed(1)}%
            </span>
          ` : ''}
        `;
      }
    });
  }
  
  getPriceChange(crypto) {
    if (!this.marketData?.history?.[crypto] || this.marketData.history[crypto].length < 2) {
      return 0;
    }
    
    const history = this.marketData.history[crypto];
    const current = history[history.length - 1].price;
    const previous = history[Math.max(0, history.length - 10)].price;
    
    return ((current - previous) / previous) * 100;
  }
  
  drawMiniChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (data.length < 2) return;
    
    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    
    ctx.beginPath();
    ctx.lineWidth = 2;
    
    const isPositive = prices[prices.length - 1] > prices[0];
    ctx.strokeStyle = isPositive ? '#00b15e' : '#f6465d';
    
    data.forEach((point, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((point.price - minPrice) / range) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
  }
  
  // Навигация
  showTradingPage(crypto) {
    const cryptoPages = {
      'MINT': 'trading-MINT.html',
      'RWK': 'trading-RWK.html', 
      'SKH': 'trading-SKH.html',
      'WTFL': 'trading-WTFL.html',
      'CULT': 'trading-CULT.html'
    };
    
    const page = cryptoPages[crypto];
    if (page) {
      window.location.href = page;
    } else {
      this.showNotification('Страница торговли не найдена', 'error');
    }
  }
  
  showDeposit() {
    window.location.href = 'deposit.html';
  }
  
  showWithdraw() {
    window.location.href = 'withdraw.html';
  }
  
  showWallet() {
    window.location.href = 'wallet.html';
  }
  
  // Уведомления
  showNotification(message, type = 'info') {
    console.log(`📢 Уведомление [${type}]:`, message);
    
    if (this.tg && this.tg.showPopup) {
      if (type === 'error') {
        this.tg.showPopup({
          title: 'Ошибка',
          message: message,
          buttons: [{ type: 'ok' }]
        });
      } else {
        this.tg.showAlert(message);
      }
    } else {
      // Fallback для браузера
      alert(message);
    }
  }
  
  // API вызовы
  async createOrder(crypto, type, price, amount) {
    try {
      if (!this.currentUser) {
        throw new Error('Пользователь не авторизован');
      }
      
      const response = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: this.currentUser.id,
          crypto: crypto,
          type: type,
          price: parseFloat(price),
          amount: parseFloat(amount)
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification('✅ Ордер успешно создан!', 'success');
        return true;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      console.error('❌ Ошибка создания ордера:', error);
      this.showNotification('❌ Ошибка сети', 'error');
      return false;
    }
  }
  
  async createDeposit(amount) {
    try {
      if (!this.currentUser) {
        throw new Error('Пользователь не авторизован');
      }
      
      const response = await fetch('/api/deposit/create', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: this.currentUser.id,
          amount: parseFloat(amount)
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        if (this.tg && this.tg.openInvoice) {
          // В Telegram - используем встроенную оплату
          this.tg.openInvoice(result.invoiceUrl, (status) => {
            if (status === 'paid') {
              this.showNotification('Оплата подтверждена!', 'success');
            }
          });
        } else {
          // В браузере - открываем в новом окне
          window.open(result.invoiceUrl, '_blank');
        }
        
        return result.invoiceUrl;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return null;
      }
    } catch (error) {
      console.error('❌ Ошибка создания депозита:', error);
      this.showNotification('❌ Ошибка сети', 'error');
      return null;
    }
  }
}

// Глобальная инициализация
let app;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM загружен, инициализация приложения...');
  app = new WaterFallApp();
});

// Глобальные функции для HTML
function startTrading(crypto) {
  if (app && app.showTradingPage) {
    app.showTradingPage(crypto);
  }
}

function goToDeposit() {
  if (app && app.showDeposit) {
    app.showDeposit();
  }
}

function goToWithdraw() {
  if (app && app.showWithdraw) {
    app.showWithdraw();
  }
}

function goToWallet() {
  if (app && app.showWallet) {
    app.showWallet();
  }
}

function placeOrder(type, orderType) {
  if (window.tradingManager) {
    window.tradingManager.placeOrder(type, orderType);
  }
}
