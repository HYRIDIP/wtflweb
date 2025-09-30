// server-api.js - Клиент для работы с API сервера
class ServerAPI {
  constructor() {
    this.baseURL = '';
    this.socket = null;
  }
  
  setSocket(socket) {
    this.socket = socket;
  }
  
  async request(endpoint, data = {}) {
    try {
      const response = await fetch(endpoint, {
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
      throw error;
    }
  }
  
  // Методы для работы с ордерами
  async createOrder(orderData) {
    return this.request('/api/order/create', orderData);
  }
  
  async cancelOrder(orderId) {
    return this.request('/api/order/cancel', { orderId });
  }
  
  async getOrders(userId) {
    return this.request('/api/orders', { userId });
  }
  
  // Методы для депозитов
  async createDeposit(depositData) {
    return this.request('/api/deposit/create', depositData);
  }
  
  async confirmDeposit(invoiceId) {
    return this.request('/api/deposit/confirm', { invoiceId });
  }
  
  async getDepositHistory(userId) {
    return this.request('/api/deposit/history', { userId });
  }
  
  // Методы для выводов
  async createWithdrawal(withdrawalData) {
    return this.request('/api/withdraw', withdrawalData);
  }
  
  async getWithdrawalHistory(userId) {
    return this.request('/api/withdraw/history', { userId });
  }
  
  // Методы для пользователя
  async getUserData(userId) {
    return this.request('/api/user/data', { userId });
  }
  
  async updateUserProfile(userData) {
    return this.request('/api/user/update', userData);
  }
  
  // Методы для рынка
  async getMarketData() {
    return this.request('/api/market/data');
  }
  
  async getCryptoHistory(crypto, period = '24h') {
    return this.request('/api/market/history', { crypto, period });
  }
}

// Глобальный экземпляр API
window.serverAPI = new ServerAPI();

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
  console.log('🔌 ServerAPI инициализирован');
});
