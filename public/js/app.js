class WaterFallApp {
  constructor() {
    this.tg = null;
    this.socket = null;
    this.currentUser = null;
    this.marketData = null;
    this.cryptos = ['MINT', 'RWK', 'SKH', 'WTFL', 'CULT'];
    this.isTelegram = false;
    this.isInitialized = false;
    this.chartManager = null;
    
    this.init();
  }
  
  async init() {
    try {
      console.log('🚀 Инициализация WaterFall App...');
      
      // Сначала загружаем пользователя
      await this.initUser();
      
      // Затем инициализируем Telegram
      await this.initTelegram();
      
      // Подключаемся к серверу
      await this.connectToServer();
      
      // Инициализируем графики
      this.initCharts();
      
      // Обновляем UI
      this.updateUI();
      
      this.isInitialized = true;
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
    // Пытаемся получить сохраненные данные пользователя
    const savedUserData = localStorage.getItem('waterfallUserData');
    
    if (savedUserData) {
      try {
        const userData = JSON.parse(savedUserData);
        
        // Проверяем актуальность данных (не старше 30 дней)
        const dataAge = Date.now() - (userData.lastSaved || 0);
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 дней
        
        if (dataAge < maxAge) {
          this.currentUser = userData;
          this.currentUser.lastLogin = Date.now();
          console.log('👤 Пользователь загружен из localStorage:', this.currentUser.username);
          
          // Обновляем сообщение приветствия для существующих пользователей
          const nameEl = document.getElementById('userName');
          if (nameEl && !this.currentUser.firstLogin) {
            const displayName = this.currentUser.firstName || this.currentUser.username || 'Трейдер';
            nameEl.textContent = `С возвращением, ${displayName}!`;
          }
          return;
        } else {
          console.log('📅 Данные пользователя устарели, создаем новые');
          localStorage.removeItem('waterfallUserData');
        }
      } catch (error) {
        console.error('❌ Ошибка загрузки пользователя:', error);
        localStorage.removeItem('waterfallUserData');
      }
    }
    
    // Создаем нового пользователя
    if (this.isTelegram && this.tg?.initDataUnsafe?.user) {
      // Пользователь из Telegram
      const telegramUser = this.tg.initDataUnsafe.user;
      this.currentUser = this.createTelegramUser(telegramUser);
      console.log('👤 Новый Telegram пользователь:', this.currentUser.username);
    } else {
      // Демо-пользователь для браузера
      this.currentUser = this.createDemoUser();
      console.log('👤 Демо-пользователь создан:', this.currentUser.username);
    }
    
    // Сохраняем пользователя
    this.saveUserData();
  }
  
  createTelegramUser(telegramData) {
    const userId = telegramData.id.toString();
    
    return {
      id: userId,
      username: telegramData.username || `User${userId.slice(-4)}`,
      firstName: telegramData.first_name || '',
      lastName: telegramData.last_name || '',
      photoUrl: telegramData.photo_url || '/assets/homepage/unsplash-p-at-a8xe.png',
      balance: 1000, // Начальный баланс
      crypto: { MINT: 0, RWK: 0, SKH: 0, WTFL: 0, CULT: 0 },
      totalInvested: 0,
      firstLogin: true,
      isRealUser: true,
      telegramData: telegramData,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      trades: [] // История сделок
    };
  }
  
  createDemoUser() {
    const demoId = 'demo_' + Date.now();
    
    return {
      id: demoId,
      username: 'DemoTrader',
      firstName: 'Demo',
      lastName: 'User',
      photoUrl: '/assets/homepage/unsplash-p-at-a8xe.png',
      balance: 1000,
      crypto: { 
        MINT: 25, 
        RWK: 1500, 
        SKH: 85000, 
        WTFL: 12, 
        CULT: 85 
      },
      totalInvested: 1000,
      firstLogin: false,
      isRealUser: false,
      telegramData: null,
      createdAt: Date.now(),
      lastLogin: Date.now(),
      trades: [] // История сделок
    };
  }
  
  saveUserData() {
    if (this.currentUser) {
      const userData = {
        ...this.currentUser,
        lastSaved: Date.now()
      };
      localStorage.setItem('waterfallUserData', JSON.stringify(userData));
      console.log('💾 Данные пользователя сохранены');
    }
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
      const userDataToSend = {
        id: this.currentUser.id,
        username: this.currentUser.username,
        firstName: this.currentUser.firstName,
        lastName: this.currentUser.lastName,
        isRealUser: this.currentUser.isRealUser,
        balance: this.currentUser.balance,
        crypto: this.currentUser.crypto,
        totalInvested: this.currentUser.totalInvested
      };
      
      this.socket.emit('join', userDataToSend);
      
      console.log('✅ Запрос на подключение отправлен');
      
    } catch (error) {
      console.error('❌ Ошибка подключения к серверу:', error);
      this.showNotification('Ошибка подключения к серверу', 'error');
    }
  }
  
  setupSocketHandlers() {
    this.socket.on('userData', (serverUserData) => {
      console.log('📨 Получены данные пользователя с сервера');
      
      if (serverUserData && serverUserData.id === this.currentUser.id) {
        // Обновляем данные с сервера (баланс, крипто и т.д.)
        this.currentUser.balance = serverUserData.balance !== undefined ? serverUserData.balance : this.currentUser.balance;
        this.currentUser.crypto = serverUserData.crypto || this.currentUser.crypto;
        this.currentUser.totalInvested = serverUserData.totalInvested || this.currentUser.totalInvested;
        this.currentUser.firstLogin = serverUserData.firstLogin !== undefined ? serverUserData.firstLogin : this.currentUser.firstLogin;
        this.currentUser.trades = serverUserData.trades || this.currentUser.trades;
        
        // Сохраняем обновленные данные
        this.saveUserData();
        
        // Обновляем интерфейс
        this.updateUI();
      }
    });
    
    this.socket.on('marketData', (data) => {
      console.log('📈 Получены рыночные данные');
      this.marketData = data;
      
      // Сохраняем рыночные данные
      localStorage.setItem('waterfallMarketData', JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
      
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
      
      // Обновляем локальные данные пользователя
      if (this.currentUser) {
        if (data.type === 'buy') {
          this.currentUser.balance -= data.amount * data.price;
          this.currentUser.crypto[data.crypto] = (this.currentUser.crypto[data.crypto] || 0) + data.amount;
        } else {
          this.currentUser.balance += data.amount * data.price;
          this.currentUser.crypto[data.crypto] = (this.currentUser.crypto[data.crypto] || 0) - data.amount;
        }
        
        // Сохраняем сделку
        this.currentUser.trades.push({
          id: Date.now().toString(),
          crypto: data.crypto,
          type: data.type,
          amount: data.amount,
          price: data.price,
          total: data.amount * data.price,
          timestamp: Date.now()
        });
        
        this.saveUserData();
        this.updateUI();
      }
    });
    
    this.socket.on('depositSuccess', (data) => {
      this.showNotification(
        `💰 Депозит успешен! $${data.amount} зачислен на баланс`,
        'success'
      );
      
      if (this.currentUser) {
        this.currentUser.balance = data.newBalance;
        this.currentUser.totalInvested += data.amount;
        this.saveUserData();
        this.updateUI();
      }
    });
    
    this.socket.on('withdrawalSuccess', (data) => {
      this.showNotification(
        `💸 Вывод успешен! $${data.netAmount} отправлен на ваш кошелек (комиссия: $${data.fee})`,
        'success'
      );
      
      if (this.currentUser) {
        this.currentUser.balance = data.newBalance;
        this.saveUserData();
        this.updateUI();
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('❌ Ошибка от сервера:', error);
      this.showNotification(`Ошибка: ${error.message || error}`, 'error');
    });
    
    this.socket.on('connect', () => {
      console.log('✅ Подключение к серверу установлено');
    });
    
    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Отключение от сервера:', reason);
      if (reason === 'io server disconnect') {
        this.showNotification('Соединение с сервером потеряно', 'warning');
      }
    });
    
    this.socket.on('reconnect', () => {
      console.log('🔁 Переподключение к серверу');
      this.showNotification('Соединение восстановлено', 'success');
    });
  }
  
  initCharts() {
    // Инициализируем ChartManager если он доступен
    if (window.ChartManager) {
      this.chartManager = new window.ChartManager();
      window.chartManager = this.chartManager;
    }
  }
  
  updateUI() {
    if (!this.currentUser) return;
    
    console.log('🎨 Обновление интерфейса...');
    
    // Обновляем аватарку
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl) {
      if (this.currentUser.photoUrl) {
        avatarEl.src = this.currentUser.photoUrl;
      }
      avatarEl.style.display = 'block';
    }
    
    // Обновляем имя пользователя
    const nameEl = document.getElementById('userName');
    if (nameEl) {
      const displayName = this.currentUser.firstName || this.currentUser.username || 'Трейдер';
      nameEl.textContent = this.currentUser.firstLogin ? 
        `Добро пожаловать, ${displayName}!` : 
        `С возвращением, ${displayName}!`;
    }
    
    // Обновляем все элементы баланса
    this.updateBalance();
    this.updateHoldings();
    
    // Обновляем историю сделок если на странице торговли
    this.updateTradeHistory();
  }
  
  updateBalance() {
    const balance = this.currentUser.balance || 0;
    
    // Обновляем все возможные элементы баланса
    const balanceSelectors = [
      '#userBalance',
      '#availableBalance', 
      '#currentBalance',
      '#usdBalance',
      '.balance-amount',
      '.card-subtitle'
    ];
    
    balanceSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        if (element.textContent.includes('$') || element.classList.contains('balance-amount')) {
          element.textContent = `$${balance.toFixed(2)}`;
        }
      });
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
      
      // Обновляем баланс криптовалюты на торговых страницах
      const cryptoBalanceEl = document.getElementById('cryptoBalance');
      if (cryptoBalanceEl && window.location.pathname.includes('trading-')) {
        cryptoBalanceEl.textContent = amount.toFixed(4);
      }
    });
  }
  
  updateTradeHistory() {
    if (!this.currentUser?.trades || !Array.isArray(this.currentUser.trades)) return;
    
    const historyContainer = document.getElementById('tradeHistory');
    if (!historyContainer) return;
    
    const recentTrades = this.currentUser.trades.slice(-10).reverse();
    
    if (recentTrades.length === 0) {
      historyContainer.innerHTML = '<div class="text-center text-gray2 py-4">Нет сделок</div>';
      return;
    }
    
    historyContainer.innerHTML = recentTrades.map(trade => `
      <div class="trade-item ${trade.type}">
        <div class="trade-info">
          <span class="trade-type ${trade.type}">${trade.type === 'buy' ? 'ПОКУПКА' : 'ПРОДАЖА'}</span>
          <span class="trade-crypto">${trade.crypto}</span>
        </div>
        <div class="trade-details">
          <span class="trade-amount">${trade.amount} ${trade.crypto}</span>
          <span class="trade-price">$${trade.price.toFixed(4)}</span>
          <span class="trade-total">$${trade.total.toFixed(2)}</span>
        </div>
        <div class="trade-time">${new Date(trade.timestamp).toLocaleTimeString()}</div>
      </div>
    `).join('');
  }
  
  updateCharts() {
    if (!this.marketData) return;
    
    // Используем ChartManager если доступен
    if (this.chartManager) {
      this.chartManager.updateAllCharts(this.marketData);
    } else if (window.initAllMiniCharts) {
      // Используем глобальную функцию для мини-графиков
      window.initAllMiniCharts(this.marketData);
    } else {
      // Fallback: рисуем базовые графики
      this.drawBasicCharts();
    }
  }
  
  drawBasicCharts() {
    this.cryptos.forEach(crypto => {
      const history = this.marketData.history?.[crypto];
      if (history && history.length > 0) {
        this.drawMiniChart(`chart-${crypto}`, history.slice(-20));
      }
    });
  }
  
  drawMiniChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.log(`Canvas ${canvasId} not found`);
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Очищаем canvas
    ctx.clearRect(0, 0, width, height);
    
    if (!data || data.length < 2) {
      return;
    }
    
    const prices = data.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = maxPrice - minPrice || 1;
    
    // Рисуем линию графика
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
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
      const notification = document.createElement('div');
      notification.className = `notification ${type}`;
      notification.innerHTML = `
        <div class="notification-content">
          <span class="notification-message">${message}</span>
          <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
      `;
      
      document.body.appendChild(notification);
      
      // Автоматическое удаление через 5 секунд
      setTimeout(() => {
        if (notification.parentElement) {
          notification.remove();
        }
      }, 5000);
    }
  }
  
  // API вызовы
  async apiCall(endpoint, data) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...data,
          userId: this.currentUser?.id,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
      }
      
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ API Error (${endpoint}):`, error);
      throw new Error(`Сетевая ошибка: ${error.message}`);
    }
  }
  
  async createOrder(crypto, type, price, amount) {
    try {
      const result = await this.apiCall('/api/order/create', {
        crypto: crypto,
        type: type,
        price: parseFloat(price),
        amount: parseFloat(amount)
      });
      
      if (result.success) {
        this.showNotification('✅ Ордер успешно создан!', 'success');
        return true;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      this.showNotification(`❌ ${error.message}`, 'error');
      return false;
    }
  }
  
  async createDeposit(amount) {
    try {
      const result = await this.apiCall('/api/deposit/create', {
        amount: parseFloat(amount)
      });
      
      if (result.success) {
        if (this.tg && this.tg.openInvoice) {
          // В Telegram - используем встроенную оплату
          this.tg.openInvoice(result.invoiceUrl, (status) => {
            console.log('Invoice status:', status);
            if (status === 'paid') {
              this.confirmDeposit(result.invoiceId);
            } else if (status === 'failed' || status === 'cancelled') {
              this.showNotification('Оплата отменена или не удалась', 'error');
            }
          });
        } else {
          // В браузере - открываем в новом окне
          window.open(result.invoiceUrl, '_blank', 'width=400,height=600');
          this.showNotification('Откройте ссылку для завершения оплаты', 'info');
        }
        
        return result.invoiceUrl;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return null;
      }
    } catch (error) {
      this.showNotification(`❌ ${error.message}`, 'error');
      return null;
    }
  }
  
  async confirmDeposit(invoiceId) {
    try {
      const result = await this.apiCall('/api/deposit/confirm', {
        invoiceId: invoiceId
      });
      
      if (result.success) {
        this.showNotification(`✅ Депозит $${result.amount} подтвержден!`, 'success');
        return true;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return false;
      }
    } catch (error) {
      this.showNotification(`❌ ${error.message}`, 'error');
      return false;
    }
  }
  
  async createWithdrawal(amount, address, method = 'USDT') {
    try {
      const result = await this.apiCall('/api/withdraw', {
        amount: parseFloat(amount),
        address: address,
        method: method
      });
      
      if (result.success) {
        this.showNotification(`✅ Вывод $${result.netAmount} успешно обработан!`, 'success');
        return result;
      } else {
        this.showNotification(`❌ ${result.error}`, 'error');
        return null;
      }
    } catch (error) {
      this.showNotification(`❌ ${error.message}`, 'error');
      return null;
    }
  }
}

// Глобальная инициализация
let app;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM загружен, инициализация приложения...');
  
  // Пытаемся загрузить сохраненные рыночные данные
  const savedMarketData = localStorage.getItem('waterfallMarketData');
  if (savedMarketData) {
    try {
      const marketData = JSON.parse(savedMarketData);
      // Используем сохраненные данные если они не старше 5 минут
      if (Date.now() - marketData.timestamp < 5 * 60 * 1000) {
        window.preloadedMarketData = marketData.data;
        console.log('📊 Предзагружены рыночные данные');
      }
    } catch (error) {
      console.error('Ошибка загрузки рыночных данных:', error);
    }
  }
  
  app = new WaterFallApp();
});

// Глобальные функции для HTML
function startTrading(crypto) {
  if (window.app && window.app.showTradingPage) {
    window.app.showTradingPage(crypto);
  } else {
    // Fallback
    const pages = {
      'MINT': 'trading-MINT.html',
      'RWK': 'trading-RWK.html',
      'SKH': 'trading-SKH.html', 
      'WTFL': 'trading-WTFL.html',
      'CULT': 'trading-CULT.html'
    };
    window.location.href = pages[crypto] || 'wallet.html';
  }
}

function goToDeposit() {
  if (window.app && window.app.showDeposit) {
    window.app.showDeposit();
  } else {
    window.location.href = 'deposit.html';
  }
}

function goToWithdraw() {
  if (window.app && window.app.showWithdraw) {
    window.app.showWithdraw();
  } else {
    window.location.href = 'withdraw.html';
  }
}

function goToWallet() {
  if (window.app && window.app.showWallet) {
    window.app.showWallet();
  } else {
    window.location.href = 'wallet.html';
  }
}

// Стили для уведомлений
const notificationStyles = `
  .notification {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    min-width: 300px;
    max-width: 500px;
    background: #1e2329;
    border-left: 4px solid #00b15e;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease-out;
  }
  
  .notification.error {
    border-left-color: #f6465d;
  }
  
  .notification.warning {
    border-left-color: #f0b90b;
  }
  
  .notification-content {
    padding: 12px 16px;
    display: flex;
    justify-content: between;
    align-items: center;
    color: white;
  }
  
  .notification-message {
    flex: 1;
    margin-right: 10px;
  }
  
  .notification-close {
    background: none;
    border: none;
    color: white;
    font-size: 18px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
`;

// Добавляем стили в документ
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);
