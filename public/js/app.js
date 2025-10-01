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
    this.api = null;
    
    this.init();
  }
  
  async init() {
    try {
      console.log('🚀 Инициализация WaterFall App...');
      
      this.initAPI();
      await this.initTelegram();
      
      // ПРОВЕРКА TELEGRAM - БЕЗ ДЕМО РЕЖИМА
      if (!this.isTelegram) {
        this.showTelegramRequired();
        return;
      }
      
      await this.initUser();
      await this.connectToServer();
      this.initCharts();
      this.updateUI();
      
      this.isInitialized = true;
      console.log('✅ Приложение успешно инициализировано');
      
    } catch (error) {
      console.error('❌ Ошибка инициализации:', error);
      this.showNotification('Ошибка загрузки приложения', 'error');
    }
  }
  
  showTelegramRequired() {
    const html = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: #070707;
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        color: white;
        text-align: center;
        padding: 20px;
      ">
        <div>
          <h1 style="color: #00b15e; margin-bottom: 20px;">WaterFall Trading</h1>
          <p style="font-size: 18px; margin-bottom: 30px;">
            Для использования платформы необходимо открыть приложение через Telegram
          </p>
          <div style="
            background: #1e2329;
            padding: 20px;
            border-radius: 12px;
            max-width: 400px;
            margin: 0 auto;
          ">
            <p style="color: #6c757d; margin-bottom: 15px;">
              Откройте это приложение через Telegram бота чтобы начать торговлю
            </p>
            <p style="color: #f6465d; font-size: 14px;">
              Демо-режим отключен. Только реальные Telegram пользователи.
            </p>
          </div>
        </div>
      </div>
    `;
    
    document.body.innerHTML = html;
  }
  
  initAPI() {
    this.api = window.serverAPI || {
      async request(endpoint, data = {}) {
        try {
          const baseUrl = window.location.origin;
          const fullUrl = endpoint.startsWith('/') ? `${baseUrl}${endpoint}` : endpoint;
          
          const response = await fetch(fullUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const result = await response.json();
          
          if (result.error) {
            throw new Error(result.error);
          }
          
          return result;
        } catch (error) {
          console.error(`API Error (${endpoint}):`, error);
          throw new Error(`Сетевая ошибка: ${error.message}`);
        }
      },
      
      async createOrder(orderData) {
        return this.request('/api/order/create', orderData);
      },
      
      async createDeposit(depositData) {
        return this.request('/api/deposit/create', depositData);
      },
      
      async createWithdrawal(withdrawalData) {
        return this.request('/api/withdraw', withdrawalData);
      }
    };
    console.log('🔌 API клиент инициализирован');
  }
  
  async initTelegram() {
    if (window.Telegram && window.Telegram.WebApp) {
      this.tg = window.Telegram.WebApp;
      this.isTelegram = true;
      
      this.tg.ready();
      this.tg.expand();
      this.tg.enableClosingConfirmation();
      this.tg.setHeaderColor('#1e2329');
      this.tg.setBackgroundColor('#070707');
      
      console.log('📱 Telegram Web App инициализирован');
    } else {
      console.log('❌ Требуется Telegram Web App');
      this.isTelegram = false;
    }
  }
  
  async initUser() {
    // НЕТ LOCALSTORAGE - все данные только из базы
    console.log('👤 Инициализация пользователя из базы данных...');
    
    if (!this.isTelegram || !this.tg?.initDataUnsafe?.user) {
      throw new Error('Telegram user data not available');
    }
    
    // Ждем подключения к серверу для получения данных пользователя
    console.log('⏳ Ожидаем данные пользователя с сервера...');
  }
  
  async connectToServer() {
    try {
      if (!this.isTelegram || !this.tg?.initDataUnsafe?.user) {
        throw new Error('Telegram user data required');
      }
      
      console.log('🔌 Подключение к серверу...');
      
      const telegramUser = this.tg.initDataUnsafe.user;
      const socketUrl = window.location.origin;
      
      this.socket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });
      
      this.setupSocketHandlers();
      
      // Отправляем данные Telegram пользователя
      const userDataToSend = {
        id: telegramUser.id.toString(),
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        photoUrl: telegramUser.photo_url,
        isTelegramUser: true,
        telegramData: telegramUser
      };
      
      if (this.socket.connected) {
        this.socket.emit('join', userDataToSend);
      } else {
        this.socket.once('connect', () => {
          this.socket.emit('join', userDataToSend);
        });
      }
      
      console.log('✅ Запрос на подключение отправлен');
      
    } catch (error) {
      console.error('❌ Ошибка подключения к серверу:', error);
      this.showNotification('Ошибка подключения к серверу', 'error');
      throw error;
    }
  }
  
  setupSocketHandlers() {
    this.socket.on('userData', (serverUserData) => {
      console.log('📨 Получены данные пользователя с сервера:', serverUserData);
      
      this.currentUser = serverUserData;
      this.updateUI();
    });
    
    this.socket.on('marketData', (data) => {
      console.log('📈 Получены рыночные данные:', data);
      this.marketData = data;
      
      this.updateCharts();
      this.updatePrices();
      this.updateHoldings();
    });
    
    this.socket.on('marketUpdate', (data) => {
      if (this.marketData && data.crypto) {
        this.marketData.prices[data.crypto] = data.price;
        
        if (data.history && this.marketData.history) {
          this.marketData.history[data.crypto] = data.history;
        }
        
        this.updatePrices();
        this.updateHoldings();
        this.updateCharts();
      }
    });
    
    this.socket.on('orderExecuted', (data) => {
      this.showNotification(
        `✅ Ордер исполнен: ${data.type === 'buy' ? 'ПОКУПКА' : 'ПРОДАЖА'} ${data.amount} ${data.crypto} по $${data.price.toFixed(4)}`,
        'success'
      );
      
      if (this.currentUser) {
        if (data.type === 'buy') {
          this.currentUser.balance -= data.amount * data.price;
          this.currentUser.crypto[data.crypto] = (this.currentUser.crypto[data.crypto] || 0) + data.amount;
        } else {
          this.currentUser.balance += data.amount * data.price;
          this.currentUser.crypto[data.crypto] = (this.currentUser.crypto[data.crypto] || 0) - data.amount;
        }
        
        this.currentUser.trades = this.currentUser.trades || [];
        this.currentUser.trades.push({
          id: Date.now().toString(),
          crypto: data.crypto,
          type: data.type,
          amount: data.amount,
          price: data.price,
          total: data.amount * data.price,
          timestamp: Date.now()
        });
        
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
        this.updateUI();
      }
    });
    
    this.socket.on('error', (error) => {
      console.error('❌ Ошибка от сервера:', error);
      this.showNotification(`Ошибка: ${error.message}`, 'error');
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
    if (window.ChartManager) {
      this.chartManager = new window.ChartManager();
      window.chartManager = this.chartManager;
      console.log('📈 ChartManager инициализирован');
    } else {
      console.log('⚠️ ChartManager не найден, используем fallback');
    }
  }
  
  updateUI() {
    if (!this.currentUser) {
      console.log('❌ Нет данных пользователя для обновления UI');
      return;
    }
    
    console.log('🎨 Обновление интерфейса...', this.currentUser);
    
    // Обновляем аватарку
    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl && this.currentUser.photoUrl) {
      avatarEl.src = this.currentUser.photoUrl;
      avatarEl.onerror = () => {
        avatarEl.src = '/assets/homepage/unsplash-p-at-a8xe.png';
      };
    }
    
    // Обновляем имя пользователя
    const nameEl = document.getElementById('userName');
    if (nameEl) {
      const displayName = this.currentUser.firstName || this.currentUser.username || 'Трейдер';
      nameEl.textContent = this.currentUser.firstLogin ? 
        `Добро пожаловать, ${displayName}!` : 
        `С возвращением, ${displayName}!`;
    }
    
    // Обновляем баланс
    this.updateBalance();
    this.updateHoldings();
    this.updateTradeHistory();
  }
  
  updateBalance() {
    if (!this.currentUser) return;
    
    const balance = this.currentUser.balance || 0;
    
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
        if (element.textContent.includes('$') || element.classList.contains('balance-amount') || 
            element.id.includes('Balance')) {
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
      
      const cryptoBalanceEl = document.getElementById('cryptoBalance');
      if (cryptoBalanceEl && window.location.pathname.includes('trading-')) {
        cryptoBalanceEl.textContent = amount.toFixed(4);
      }
      
      const priceElement = document.getElementById(`price-${crypto}`);
      if (priceElement) {
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
    if (!this.marketData) {
      console.log('❌ Нет рыночных данных для графиков');
      return;
    }
    
    console.log('📊 Обновление графиков с данными:', this.marketData);
    
    if (this.chartManager && this.chartManager.updateAllCharts) {
      console.log('✅ Используем ChartManager для обновления графиков');
      this.chartManager.updateAllCharts(this.marketData);
    } 
    else if (window.initAllMiniCharts) {
      console.log('✅ Используем initAllMiniCharts для мини-графиков');
      window.initAllMiniCharts(this.marketData);
    }
    else {
      console.log('⚠️ Используем fallback для графиков');
      this.drawBasicCharts();
    }
  }
  
  drawBasicCharts() {
    this.cryptos.forEach(crypto => {
      const history = this.marketData.history?.[crypto];
      const canvasId = `chart-${crypto}`;
      
      if (history && history.length > 0) {
        this.drawMiniChart(canvasId, history.slice(-20));
      }
    });
  }
  
  drawMiniChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (!data || data.length < 2) return;
    
    try {
      const prices = data.map(d => d.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const range = maxPrice - minPrice || 1;
      
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
      
    } catch (error) {
      console.error(`❌ Ошибка рисования графика ${canvasId}:`, error);
    }
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
  
  showHome() {
    window.location.href = 'index.html';
  }
  
  // Депозит с выбором метода
  async createDeposit(amount, method = 'CRYPTOPAY', asset = 'USDT') {
    try {
      if (!this.currentUser) {
        this.showNotification('Пользователь не авторизован', 'error');
        return null;
      }
      
      const result = await this.api.createDeposit({
        amount: parseFloat(amount),
        userId: this.currentUser.id,
        method: method,
        asset: asset
      });
      
      if (result.success) {
        if (method === 'CRYPTOPAY') {
          if (this.tg && this.tg.openInvoice) {
            this.tg.openInvoice(result.invoiceUrl, (status) => {
              console.log('CryptoPay invoice status:', status);
              if (status === 'paid') {
                this.showNotification('Депозит успешно зачислен!', 'success');
              } else if (status === 'failed' || status === 'cancelled') {
                this.showNotification('Оплата отменена или не удалась', 'error');
              }
            });
          } else {
            window.open(result.invoiceUrl, '_blank', 'width=400,height=600');
            this.showNotification('Откройте ссылку для завершения оплаты', 'info');
          }
        } else {
          this.showPaymentAddress(method, result.address, amount);
        }
        
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
  
  showPaymentAddress(method, address, amount) {
    const methodNames = {
      'TRC20': 'USDT (TRC20)',
      'TON': 'TON'
    };
    
    const message = `
💰 Для пополнения на $${amount}:

Метод: ${methodNames[method] || method}
Адрес: ${address}

После перевода средства поступят в течение 10-15 минут.
    `;
    
    this.showNotification(message, 'info');
    this.showPaymentModal(method, address, amount);
  }
  
  showPaymentModal(method, address, amount) {
    const methodNames = {
      'TRC20': 'USDT (TRC20 Network)',
      'TON': 'TON (TON Network)'
    };
    
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 10000;
    `;
    
    modal.innerHTML = `
      <div style="
        background: #1e2329;
        padding: 20px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        text-align: center;
      ">
        <h3 style="color: white; margin-bottom: 15px;">Пополнение $${amount}</h3>
        <p style="color: #6c757d; margin-bottom: 15px;">${methodNames[method] || method}</p>
        <div style="
          background: white;
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 15px;
          word-break: break-all;
          font-family: monospace;
          font-size: 12px;
          color: black;
        ">
          ${address}
        </div>
        <button id="copyAddressBtn" style="
          background: #00b15e;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
          margin-right: 10px;
        ">
          Скопировать адрес
        </button>
        <button id="closeModalBtn" style="
          background: #6c757d;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
        ">
          Закрыть
        </button>
        <p style="color: #6c757d; margin-top: 15px; font-size: 12px;">
          Средства поступят после 1 подтверждения сети
        </p>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('#copyAddressBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(address).then(() => {
        this.showNotification('Адрес скопирован в буфер обмена', 'success');
      });
    });
    
    modal.querySelector('#closeModalBtn').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }
  
  // Вывод средств
  async createWithdrawal(amount, address, method = 'TRC20', asset = 'USDT') {
    try {
      if (!this.currentUser) {
        this.showNotification('Пользователь не авторизован', 'error');
        return null;
      }
      
      const result = await this.api.createWithdrawal({
        amount: parseFloat(amount),
        address: address,
        method: method,
        asset: asset,
        userId: this.currentUser.id
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
  
  // Создание ордера
  async createOrder(crypto, type, price, amount) {
    try {
      if (!this.currentUser) {
        this.showNotification('Пользователь не авторизован', 'error');
        return false;
      }
      
      const result = await this.api.createOrder({
        crypto: crypto,
        type: type,
        price: parseFloat(price),
        amount: parseFloat(amount),
        userId: this.currentUser.id
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
      this.showBrowserNotification(message, type);
    }
  }
  
  showBrowserNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notification-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
      `;
      document.body.appendChild(container);
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.style.cssText = `
      background: #1e2329;
      border-left: 4px solid ${type === 'error' ? '#f6465d' : type === 'warning' ? '#f0b90b' : '#00b15e'};
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 10px;
      color: white;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideInRight 0.3s ease-out;
      max-width: 400px;
      word-wrap: break-word;
    `;
    
    notification.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.remove()" style="
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
          margin-left: 10px;
        ">×</button>
      </div>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentElement) {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
      }
    }, 5000);
  }
  
  destroy() {
    if (this.socket) {
      this.socket.disconnect();
    }
    if (this.chartManager) {
      this.chartManager.destroyAll();
    }
  }
}

// Глобальная инициализация
let app;

document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 DOM загружен, инициализация приложения...');
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
  
  app = new WaterFallApp();
});

// Глобальные функции для HTML
function startTrading(crypto) {
  if (window.app && window.app.showTradingPage) {
    window.app.showTradingPage(crypto);
  } else {
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

function goToHome() {
  if (window.app && window.app.showHome) {
    window.app.showHome();
  } else {
    window.location.href = 'index.html';
  }
}

// Торговые функции
function placeBuyOrder() {
  if (!window.app) return;
  
  const crypto = getCurrentCrypto();
  const priceInput = document.getElementById('buyPrice');
  const amountInput = document.getElementById('buyAmount');
  
  if (!priceInput || !amountInput) return;
  
  const price = parseFloat(priceInput.value);
  const amount = parseFloat(amountInput.value);
  
  if (!price || !amount) {
    window.app.showNotification('Введите цену и количество', 'error');
    return;
  }
  
  window.app.createOrder(crypto, 'buy', price, amount);
}

function placeSellOrder() {
  if (!window.app) return;
  
  const crypto = getCurrentCrypto();
  const priceInput = document.getElementById('sellPrice');
  const amountInput = document.getElementById('sellAmount');
  
  if (!priceInput || !amountInput) return;
  
  const price = parseFloat(priceInput.value);
  const amount = parseFloat(amountInput.value);
  
  if (!price || !amount) {
    window.app.showNotification('Введите цену и количество', 'error');
    return;
  }
  
  window.app.createOrder(crypto, 'sell', price, amount);
}

function getCurrentCrypto() {
  const path = window.location.pathname;
  if (path.includes('trading-')) {
    return path.split('trading-')[1].replace('.html', '').toUpperCase();
  }
  return 'MINT';
}

window.addEventListener('beforeunload', () => {
  if (window.app) {
    window.app.destroy();
  }
});
