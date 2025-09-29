class WaterFallApp {
  constructor() {
    this.tg = window.Telegram?.WebApp;
    this.socket = null;
    this.currentUser = null;
    this.marketData = null;
    this.cryptos = ['MINT', 'RWK', 'SKH', 'WTFL', 'CULT'];
    this.isInitialized = false;
    
    this.init();
  }
  
  async init() {
    try {
      console.log('🚀 Инициализация WaterFall App...');
      
      if (this.tg) {
        // Инициализация Telegram Web App
        this.tg.ready();
        this.tg.expand();
        this.tg.enableClosingConfirmation();
        this.tg.setHeaderColor('#1e2329');
        this.tg.setBackgroundColor('#070707');
        
        console.log('📱 Telegram Web App инициализирован');
        
        // Получаем данные пользователя из Telegram
        const telegramUser = this.tg.initDataUnsafe?.user;
        
        if (telegramUser) {
          console.log('👤 Данные пользователя Telegram:', telegramUser);
          await this.handleTelegramUser(telegramUser);
        } else {
          console.log('❌ Данные пользователя не найдены');
          this.handleNoUserData();
        }
      } else {
        console.log('🌐 Режим браузера (не Telegram)');
        this.handleBrowserMode();
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Ошибка инициализации:', error);
      this.showNotification('Ошибка загрузки приложения', 'error');
    }
  }
  
  async handleTelegramUser(telegramData) {
    try {
      this.currentUser = {
        id: telegramData.id.toString(),
        username: telegramData.username || `User${telegramData.id.toString().slice(-4)}`,
        firstName: telegramData.first_name || '',
        lastName: telegramData.last_name || '',
        photoUrl: telegramData.photo_url || '',
        languageCode: telegramData.language_code || 'en',
        isPremium: telegramData.is_premium || false,
        telegramData: telegramData
      };
      
      console.log('✅ Пользователь обработан:', this.currentUser.username);
      
      // Подключаемся к серверу
      await this.connectToServer();
      
      // Определяем текущую страницу и действуем соответственно
      const currentPage = this.getCurrentPage();
      console.log('📄 Текущая страница:', currentPage);
      
      switch (currentPage) {
        case 'login':
        case 'loading':
          // Автоматически переходим в кошелек
          setTimeout(() => this.showWallet(), 500);
          break;
        case 'other':
          // Если неизвестная страница, идем в кошелек
          this.showWallet();
          break;
        default:
          // Для торговых страниц и кошелька остаемся на них
          this.updateUI();
          break;
      }
      
    } catch (error) {
      console.error('❌ Ошибка обработки пользователя:', error);
      this.showNotification('Ошибка загрузки данных пользователя', 'error');
    }
  }
  
  handleNoUserData() {
    const currentPage = this.getCurrentPage();
    if (currentPage !== 'login' && currentPage !== 'loading') {
      this.showLogin();
    }
  }
  
  handleBrowserMode() {
    // Режим разработки/тестирования в браузере
    this.currentUser = {
      id: 'dev_' + Date.now(),
      username: 'DemoUser',
      firstName: 'Demo',
      lastName: 'User',
      photoUrl: '',
      balance: 1000,
      crypto: { MINT: 10, RWK: 100, SKH: 1000, WTFL: 5, CULT: 50 }
    };
    
    this.connectToServer();
    
    const currentPage = this.getCurrentPage();
    if (currentPage === 'login' || currentPage === 'loading') {
      this.showWallet();
    } else {
      this.updateUI();
    }
  }
  
  getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'login.html';
    
    if (page === 'login.html' || page === '' || page === '/') return 'login';
    if (page === 'loading.html') return 'loading';
    if (page === 'wallet.html') return 'wallet';
    if (page.includes('trading-')) return 'trading';
    if (page === 'deposit.html') return 'deposit';
    if (page === 'withdraw.html') return 'withdraw';
    return 'other';
  }
  
  async connectToServer() {
    try {
      if (!this.currentUser) {
        throw new Error('No user data to connect');
      }
      
      console.log('🔌 Подключение к серверу...');
      this.socket = io();
      
      // Обработчики событий Socket.io
      this.setupSocketHandlers();
      
      // Отправляем данные Telegram пользователя на сервер
      if (this.currentUser.telegramData) {
        this.socket.emit('join', this.currentUser.telegramData);
      } else {
        // Для демо-режима отправляем базовые данные
        this.socket.emit('join', {
          id: this.currentUser.id,
          username: this.currentUser.username,
          first_name: this.currentUser.firstName
        });
      }
      
      console.log('✅ Запрос на подключение отправлен');
      
    } catch (error) {
      console.error('❌ Ошибка подключения к серверу:', error);
      this.showNotification('Ошибка подключения к серверу', 'error');
    }
  }
  
  setupSocketHandlers() {
    this.socket.on('userData', (userData) => {
      console.log('📨 Получены данные пользователя:', userData);
      this.currentUser = { ...this.currentUser, ...userData };
      this.updateUI();
    });
    
    this.socket.on('marketData', (data) => {
      console.log('📈 Получены рыночные данные');
      this.marketData = data;
      this.updateCharts();
      this.updatePrices();
      this.updateHoldings();
    });
    
    this.socket.on('marketUpdate', (data) => {
      if (this.marketData) {
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
      }
      this.updateUI();
    });
    
    this.socket.on('marketTrade', (data) => {
      // Логируем рыночные сделки
      console.log('💱 Рыночная сделка:', data);
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
      if (reason === 'io server disconnect') {
        this.showNotification('Соединение с сервером потеряно', 'error');
      }
    });
    
    this.socket.on('reconnect', () => {
      console.log('🔁 Переподключение к серверу');
      this.showNotification('Соединение восстановлено', 'success');
    });
  }
  
  updateUI() {
    if (!this.currentUser) return;
    
    console.log('🎨 Обновление интерфейса...');
    
    // Обновляем аватарку
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) {
      if (this.currentUser.photoUrl) {
        avatarEl.src = this.currentUser.photoUrl;
        avatarEl.style.display = 'block';
      } else {
        // Заглушка для аватара
        avatarEl.src = '/assets/homepage/unsplash-p-at-a8xe.png';
      }
    }
    
    // Обновляем имя пользователя
    const nameEl = document.getElementById('userName');
    if (nameEl) {
      const displayName = this.currentUser.firstName || this.currentUser.username || 'Трейдер';
      nameEl.textContent = `Привет, ${displayName}`;
    }
    
    // Обновляем баланс
    this.updateBalance();
    this.updateHoldings();
  }
  
  updateBalance() {
    const balanceEl = document.getElementById('userBalance');
    if (balanceEl) {
      balanceEl.textContent = `$${(this.currentUser.balance || 0).toFixed(2)}`;
    }
    
    const availableBalanceEl = document.getElementById('availableBalance');
    if (availableBalanceEl) {
      availableBalanceEl.textContent = `$${(this.currentUser.balance || 0).toFixed(2)}`;
    }
    
    const currentBalanceEl = document.getElementById('currentBalance');
    if (currentBalanceEl) {
      currentBalanceEl.textContent = `$${(this.currentUser.balance || 0).toFixed(2)}`;
    }
  }
  
  updateHoldings() {
    if (!this.currentUser || !this.marketData) return;
    
    this.cryptos.forEach(crypto => {
      const amount = this.currentUser.crypto?.[crypto] || 0;
      const price = this.marketData.prices?.[crypto] || 0;
      const value = amount * price;
      const change = this.getPriceChange(crypto);
      
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
      if (cryptoBalanceEl && this.getCurrentPage() === 'trading') {
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
  showLogin() {
    window.location.href = 'login.html';
  }
  
  showLoading() {
    window.location.href = 'loading.html';
  }
  
  showWallet() {
    window.location.href = 'wallet.html';
  }
  
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
        // Открываем ссылку на оплату в Telegram
        if (this.tg && this.tg.openInvoice) {
          this.tg.openInvoice(result.invoiceUrl, (status) => {
            if (status === 'paid') {
              this.confirmDeposit(result.invoiceId);
            } else if (status === 'failed' || status === 'cancelled') {
              this.showNotification('Оплата отменена', 'error');
            }
          });
        } else {
          // Fallback - открываем в новом окне
          window.open(result.invoiceUrl, '_blank');
          this.showNotification('Откройте ссылку для оплаты', 'info');
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
  
  async confirmDeposit(invoiceId) {
    try {
      const response = await fetch('/api/deposit/confirm', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: this.currentUser.id,
          invoiceId: invoiceId
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showNotification(`✅ Депозит $${result.amount} подтвержден!`, 'success');
        return true;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      console.error('❌ Ошибка подтверждения депозита:', error);
      return false;
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
  } else {
    console.error('App not initialized');
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
