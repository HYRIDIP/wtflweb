class DepositManager {
  constructor() {
    this.selectedAmount = 0;
    this.selectedMethod = 'cryptobot';
    this.currentInvoice = null;
    this.checkInterval = null;
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.updateUI();
  }
  
  setupEventListeners() {
    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const amount = e.target.dataset.amount;
        this.setAmount(amount);
      });
    });
    
    // Amount input
    const amountInput = document.getElementById('depositAmount');
    amountInput.addEventListener('input', (e) => {
      this.setAmount(e.target.value);
    });
    
    // Payment methods
    document.querySelectorAll('.method-option').forEach(option => {
      option.addEventListener('click', (e) => {
        this.selectMethod(e.currentTarget.dataset.method);
      });
    });
    
    // Deposit button
    const depositBtn = document.getElementById('depositBtn');
    depositBtn.addEventListener('click', () => {
      this.processDeposit();
    });
  }
  
  setAmount(amount) {
    this.selectedAmount = parseFloat(amount);
    document.getElementById('depositAmount').value = this.selectedAmount;
    this.updateDepositButton();
  }
  
  selectMethod(method) {
    this.selectedMethod = method;
    
    // Update UI
    document.querySelectorAll('.method-option').forEach(option => {
      option.classList.remove('active');
    });
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
  }
  
  updateDepositButton() {
    const depositBtn = document.getElementById('depositBtn');
    const isValid = this.selectedAmount >= 10;
    
    depositBtn.disabled = !isValid;
    
    if (isValid) {
      depositBtn.textContent = `Deposit $${this.selectedAmount.toFixed(2)}`;
    } else {
      depositBtn.textContent = 'Continue to Payment';
    }
  }
  
  async processDeposit() {
    if (this.selectedAmount < 10) {
      app.showNotification('Minimum deposit is $10', 'error');
      return;
    }
    
    try {
      // Показываем секцию оплаты
      this.showPaymentSection();
      
      // Создаем инвойс через CryptoBot
      const invoiceUrl = await app.createDeposit(this.selectedAmount);
      
      if (invoiceUrl) {
        this.setupPaymentMonitoring();
      }
      
    } catch (error) {
      app.showNotification('Deposit failed: ' + error.message, 'error');
      this.hidePaymentSection();
    }
  }
  
  showPaymentSection() {
    document.getElementById('paymentAmount').textContent = `$${this.selectedAmount.toFixed(2)}`;
    document.getElementById('paymentSection').classList.remove('hidden');
    
    // Прокрутка к секции оплаты
    document.getElementById('paymentSection').scrollIntoView({ 
      behavior: 'smooth' 
    });
  }
  
  setupPaymentMonitoring() {
    // Здесь можно добавить мониторинг статуса платежа
    // Для демо просто ждем 30 секунд и показываем успех
    setTimeout(() => {
      this.showPaymentSuccess();
    }, 30000);
  }
  
  showPaymentSuccess() {
    app.showNotification('Payment completed successfully!', 'success');
    this.hidePaymentSection();
    
    // Обновляем баланс
    if (app.currentUser) {
      app.currentUser.balance += this.selectedAmount;
      app.updateUI();
    }
  }
  
  hidePaymentSection() {
    document.getElementById('paymentSection').classList.add('hidden');
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
  
  updateUI() {
    // Обновляем текущий баланс
    if (app.currentUser) {
      document.getElementById('currentBalance').textContent = 
        `$${app.currentUser.balance.toFixed(2)}`;
    }
  }
}

// Глобальные функции
function hidePaymentSection() {
  if (window.depositManager) {
    window.depositManager.hidePaymentSection();
  }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  window.depositManager = new DepositManager();
});