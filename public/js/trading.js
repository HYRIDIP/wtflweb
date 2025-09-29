class TradingManager {
  constructor() {
    this.currentCrypto = this.getCryptoFromPage();
    this.tradingChart = null;
    this.marketData = null;
    this.orders = { buy: [], sell: [] };
    this.currentPrice = this.getInitialPrice();
    
    this.init();
  }
  
  getCryptoFromPage() {
    // Определяем криптовалюту из названия страницы
    const path = window.location.pathname;
    if (path.includes('MINT')) return 'MINT';
    if (path.includes('RWK')) return 'RWK';
    if (path.includes('SKH')) return 'SKH';
    if (path.includes('WTFL')) return 'WTFL';
    if (path.includes('CULT')) return 'CULT';
    return 'MINT'; // fallback
  }
  
  getInitialPrice() {
    const prices = {
      'MINT': 0.078,
      'RWK': 0.007, 
      'SKH': 0.0009,
      'WTFL': 0.09,
      'CULT': 0.07
    };
    return prices[this.currentCrypto] || 0.01;
  }
  
  getCryptoName() {
    const names = {
      'MINT': 'Mint Token',
      'RWK': 'Rewoke Token',
      'SKH': 'Skyhost Token',
      'WTFL': 'Waterfall Token', 
      'CULT': 'Cult Token'
    };
    return names[this.currentCrypto] || this.currentCrypto;
  }
  
  init() {
    this.setupEventListeners();
    this.loadMarketData();
    this.setupChart();
    this.updateUI();
    this.setInitialPrice();
    
    console.log(`Trading page loaded for: ${this.currentCrypto} (${this.getCryptoName()})`);
  }
  
  setInitialPrice() {
    // Устанавливаем начальную цену в поле ввода
    const priceInput = document.getElementById('limitPrice');
    if (priceInput) {
      priceInput.value = this.currentPrice.toFixed(4);
      this.calculateLimitTotal();
    }
  }
  
  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.switchTab(e.target.dataset.tab);
      });
    });
    
    // Price/amount calculations
    document.getElementById('limitPrice')?.addEventListener('input', () => this.calculateLimitTotal());
    document.getElementById('limitAmount')?.addEventListener('input', () => this.calculateLimitTotal());
    document.getElementById('marketAmount')?.addEventListener('input', () => this.calculateMarketTotal());
    
    // Socket events
    if (app && app.socket) {
      app.socket.on('marketUpdate', (data) => {
        if (data.crypto === this.currentCrypto) {
          this.handleMarketUpdate(data);
        }
      });
      
      app.socket.on('orderExecuted', (data) => {
        if (data.crypto === this.currentCrypto) {
          this.handleOrderExecuted(data);
        }
      });
      
      app.socket.on('userData', (userData) => {
        this.updateUserBalance(userData);
      });
    }
  }
  
  switchTab(tabName) {
    // Update tabs
    document.querySelectorAll('.tab-btn').forEach(tab => {
      tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update forms
    document.querySelectorAll('.order-form').forEach(form => {
      form.classList.remove('active');
    });
    document.getElementById(`${tabName}Form`).classList.add('active');
    
    // Reset calculations
    if (tabName === 'market') {
      this.calculateMarketTotal();
    } else {
      this.calculateLimitTotal();
    }
  }
  
  calculateLimitTotal() {
    const price = parseFloat(document.getElementById('limitPrice').value) || 0;
    const amount = parseFloat(document.getElementById('limitAmount').value) || 0;
    const total = price * amount;
    
    document.getElementById('limitTotal').textContent = `$${total.toFixed(2)}`;
    this.updateOrderButtons('limit', total, amount);
  }
  
  calculateMarketTotal() {
    const amount = parseFloat(document.getElementById('marketAmount').value) || 0;
    const total = this.currentPrice * amount;
    
    document.getElementById('marketTotal').textContent = `~$${total.toFixed(2)}`;
    this.updateOrderButtons('market', total, amount);
  }
  
  updateOrderButtons(orderType, total, amount) {
    const buyBtn = document.querySelector('.buy-btn');
    const sellBtn = document.querySelector('.sell-btn');
    
    if (!buyBtn || !sellBtn) return;
    
    if (orderType === 'limit') {
      const hasFunds = app.currentUser?.balance >= total;
      const hasCrypto = app.currentUser?.crypto[this.currentCrypto] >= amount;
      
      buyBtn.disabled = !hasFunds || total <= 0 || amount <= 0;
      sellBtn.disabled = !hasCrypto || amount <= 0;
    } else {
      const hasFunds = app.currentUser?.balance >= total;
      const hasCrypto = app.currentUser?.crypto[this.currentCrypto] >= amount;
      
      buyBtn.disabled = !hasFunds || amount <= 0;
      sellBtn.disabled = !hasCrypto || amount <= 0;
    }
  }
  
  async placeOrder(type, orderType) {
    if (!app.currentUser) {
      app.showNotification('Please log in first', 'error');
      return;
    }
    
    let price, amount;
    
    if (orderType === 'limit') {
      price = parseFloat(document.getElementById('limitPrice').value);
      amount = parseFloat(document.getElementById('limitAmount').value);
      
      if (!price || price <= 0) {
        app.showNotification('Please enter a valid price', 'error');
        return;
      }
    } else {
      price = this.currentPrice;
      amount = parseFloat(document.getElementById('marketAmount').value);
    }
    
    if (!amount || amount <= 0) {
      app.showNotification('Please enter a valid amount', 'error');
      return;
    }
    
    if (type === 'buy' && app.currentUser.balance < price * amount) {
      app.showNotification('Insufficient USD balance', 'error');
      return;
    }
    
    if (type === 'sell' && app.currentUser.crypto[this.currentCrypto] < amount) {
      app.showNotification(`Insufficient ${this.currentCrypto} balance`, 'error');
      return;
    }
    
    try {
      const success = await app.createOrder(this.currentCrypto, type, price, amount);
      
      if (success) {
        // Reset form
        if (orderType === 'limit') {
          document.getElementById('limitPrice').value = '';
          document.getElementById('limitAmount').value = '';
        } else {
          document.getElementById('marketAmount').value = '';
        }
        
        this.calculateLimitTotal();
        this.calculateMarketTotal();
      }
    } catch (error) {
      app.showNotification('Order failed: ' + error.message, 'error');
    }
  }
  
  setupChart() {
    const canvas = document.getElementById('tradingChart');
    if (canvas) {
      this.tradingChart = new TradingChart('tradingChart', this.currentCrypto);
    }
  }
  
  async loadMarketData() {
    try {
      const response = await fetch(`/api/market/${this.currentCrypto}`);
      const data = await response.json();
      
      if (data.error) {
        console.error('Error loading market data:', data.error);
        return;
      }
      
      this.marketData = data;
      this.orders = data.orders;
      this.currentPrice = data.price;
      
      this.updateChart();
      this.updateOrderBook();
      this.updatePriceDisplay();
      this.calculateMarketTotal();
    } catch (error) {
      console.error('Failed to load market data:', error);
    }
  }
  
  handleMarketUpdate(data) {
    this.currentPrice = data.price;
    this.orders = data.orders;
    
    this.updateChart();
    this.updateOrderBook();
    this.updatePriceDisplay();
    this.calculateMarketTotal();
  }
  
  handleOrderExecuted(data) {
    app.showNotification(
      `Order executed: ${data.type} ${data.amount} ${data.crypto} at $${data.price.toFixed(4)}`,
      'success'
    );
    
    // Reload market data to get updated orders
    this.loadMarketData();
  }
  
  updateUserBalance(userData) {
    app.currentUser = userData;
    this.updateUI();
  }
  
  updateChart() {
    if (this.tradingChart && this.marketData?.history) {
      this.tradingChart.updateData(this.marketData.history);
    }
  }
  
  updateOrderBook() {
    const buyOrdersContainer = document.getElementById('buyOrders');
    const sellOrdersContainer = document.getElementById('sellOrders');
    
    // Display buy orders (highest prices first)
    if (buyOrdersContainer) {
      const buyOrders = this.orders.buy
        .sort((a, b) => b.price - a.price)
        .slice(0, 8);
      
      if (buyOrders.length > 0) {
        buyOrdersContainer.innerHTML = buyOrders
          .map(order => `
            <div class="order-item buy-order">
              <span class="order-price">$${order.price.toFixed(4)}</span>
              <span class="order-amount">${order.amount.toFixed(2)}</span>
            </div>
          `)
          .join('');
      } else {
        buyOrdersContainer.innerHTML = '<div class="order-item" style="color: #6c757d; text-align: center;">No buy orders</div>';
      }
    }
    
    // Display sell orders (lowest prices first)
    if (sellOrdersContainer) {
      const sellOrders = this.orders.sell
        .sort((a, b) => a.price - b.price)
        .slice(0, 8);
      
      if (sellOrders.length > 0) {
        sellOrdersContainer.innerHTML = sellOrders
          .map(order => `
            <div class="order-item sell-order">
              <span class="order-price">$${order.price.toFixed(4)}</span>
              <span class="order-amount">${order.amount.toFixed(2)}</span>
            </div>
          `)
          .join('');
      } else {
        sellOrdersContainer.innerHTML = '<div class="order-item" style="color: #6c757d; text-align: center;">No sell orders</div>';
      }
    }
  }
  
  updatePriceDisplay() {
    const priceElement = document.getElementById('cryptoPrice');
    const currentPriceElement = document.getElementById('currentPriceDisplay');
    
    if (priceElement) {
      priceElement.textContent = `$${this.currentPrice.toFixed(4)}`;
      
      // Add color based on price movement
      const priceChange = this.getPriceChange();
      if (priceChange > 0) {
        priceElement.className = 'crypto-price price-up';
      } else if (priceChange < 0) {
        priceElement.className = 'crypto-price price-down';
      } else {
        priceElement.className = 'crypto-price';
      }
    }
    
    if (currentPriceElement) {
      currentPriceElement.textContent = `$${this.currentPrice.toFixed(4)}`;
    }
  }
  
  getPriceChange() {
    if (!this.marketData?.history || this.marketData.history.length < 2) {
      return 0;
    }
    
    const history = this.marketData.history;
    if (history.length < 2) return 0;
    
    const current = history[history.length - 1].price;
    const previous = history[history.length - 2].price;
    
    return ((current - previous) / previous) * 100;
  }
  
  updateUI() {
    if (app.currentUser) {
      // Update USD balance
      const usdBalanceElement = document.getElementById('usdBalance');
      if (usdBalanceElement) {
        usdBalanceElement.textContent = `$${app.currentUser.balance.toFixed(2)}`;
      }
      
      // Update crypto balance
      const cryptoBalanceElement = document.getElementById('cryptoBalance');
      if (cryptoBalanceElement) {
        cryptoBalanceElement.textContent = (app.currentUser.crypto[this.currentCrypto] || 0).toFixed(4);
      }
    }
    
    this.calculateLimitTotal();
    this.calculateMarketTotal();
  }
  
  refreshData() {
    this.loadMarketData();
    if (app) {
      app.showNotification('Market data refreshed', 'success');
    }
  }
}

// Глобальные функции для кнопок
function placeOrder(type, orderType) {
  if (window.tradingManager) {
    window.tradingManager.placeOrder(type, orderType);
  }
}

function refreshData() {
  if (window.tradingManager) {
    window.tradingManager.refreshData();
  }
}

// Инициализация для каждой страницы
document.addEventListener('DOMContentLoaded', () => {
  window.tradingManager = new TradingManager();
});