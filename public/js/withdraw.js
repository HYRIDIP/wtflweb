class WithdrawManager {
  constructor() {
    this.selectedAmount = 0;
    this.selectedMethod = 'usdt';
    this.withdrawAddress = '';
    
    this.init();
  }
  
  init() {
    this.setupEventListeners();
    this.updateUI();
    this.calculateFees();
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
    const amountInput = document.getElementById('withdrawAmount');
    amountInput.addEventListener('input', (e) => {
      this.setAmount(e.target.value);
    });
    
    // Address input
    const addressInput = document.getElementById('withdrawAddress');
    addressInput.addEventListener('input', (e) => {
      this.withdrawAddress = e.target.value.trim();
      this.updateWithdrawButton();
    });
    
    // Payment methods
    document.querySelectorAll('.method-option').forEach(option => {
      option.addEventListener('click', (e) => {
        this.selectMethod(e.currentTarget.dataset.method);
      });
    });
    
    // Withdraw button
    const withdrawBtn = document.getElementById('withdrawBtn');
    withdrawBtn.addEventListener('click', () => {
      this.showConfirmation();
    });
  }
  
  setAmount(amount) {
    this.selectedAmount = parseFloat(amount);
    document.getElementById('withdrawAmount').value = this.selectedAmount;
    this.calculateFees();
    this.updateWithdrawButton();
  }
  
  selectMethod(method) {
    this.selectedMethod = method;
    
    // Update UI
    document.querySelectorAll('.method-option').forEach(option => {
      option.classList.remove('active');
    });
    document.querySelector(`[data-method="${method}"]`).classList.add('active');
    
    this.updateNetworkInfo();
  }
  
  updateNetworkInfo() {
    const networkNames = {
      usdt: 'USDT (TRC-20)',
      ton: 'TON',
      btc: 'Bitcoin'
    };
    
    document.getElementById('confirmNetwork').textContent = 
      networkNames[this.selectedMethod] || 'Unknown';
  }
  
  calculateFees() {
    if (this.selectedAmount <= 0) {
      this.updateFeeDisplay(0, 0, 0);
      return;
    }
    
    const fee = this.selectedAmount * 0.03; // 3% fee
    const netAmount = this.selectedAmount - fee;
    
    this.updateFeeDisplay(this.selectedAmount, fee, netAmount);
  }
  
  updateFeeDisplay(amount, fee, netAmount) {
    document.getElementById('withdrawNetAmount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('withdrawFee').textContent = `$${fee.toFixed(2)}`;
    document.getElementById('withdrawTotal').textContent = `$${netAmount.toFixed(2)}`;
    
    // Confirmation section
    document.getElementById('confirmAmount').textContent = `$${amount.toFixed(2)}`;
    document.getElementById('confirmFee').textContent = `$${fee.toFixed(2)}`;
    document.getElementById('confirmNet').textContent = `$${netAmount.toFixed(2)}`;
  }
  
  updateWithdrawButton() {
    const withdrawBtn = document.getElementById('withdrawBtn');
    const hasValidAmount = this.selectedAmount >= 5;
    const hasValidAddress = this.withdrawAddress.length > 10; // Basic validation
    const hasSufficientBalance = app.currentUser?.balance >= this.selectedAmount;
    
    withdrawBtn.disabled = !(hasValidAmount && hasValidAddress && hasSufficientBalance);
    
    if (hasValidAmount) {
      withdrawBtn.textContent = `Withdraw $${this.selectedAmount.toFixed(2)}`;
    } else {
      withdrawBtn.textContent = 'Confirm Withdrawal';
    }
    
    if (!hasSufficientBalance && this.selectedAmount > 0) {
      this.showError('Insufficient balance');
    }
  }
  
  showConfirmation() {
    if (this.selectedAmount < 5) {
      app.showNotification('Minimum withdrawal is $5', 'error');
      return;
    }
    
    if (!this.withdrawAddress) {
      app.showNotification('Please enter withdrawal address', 'error');
      return;
    }
    
    if (app.currentUser?.balance < this.selectedAmount) {
      app.showNotification('Insufficient balance', 'error');
      return;
    }
    
    // Update confirmation details
    document.getElementById('confirmAddress').textContent = this.withdrawAddress;
    this.updateNetworkInfo();
    
    // Show confirmation section
    document.getElementById('confirmationSection').classList.remove('hidden');
    
    // Scroll to confirmation
    document.getElementById('confirmationSection').scrollIntoView({ 
      behavior: 'smooth' 
    });
  }
  
  async processWithdrawal() {
    try {
      const response = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: app.currentUser.id,
          amount: this.selectedAmount,
          address: this.withdrawAddress,
          method: this.selectedMethod
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.showSuccess(result);
      } else {
        app.showNotification(`Withdrawal failed: ${result.error}`, 'error');
        this.hideConfirmation();
      }
    } catch (error) {
      app.showNotification('Network error', 'error');
      this.hideConfirmation();
    }
  }
  
  showSuccess(result) {
    const confirmationSection = document.getElementById('confirmationSection');
    confirmationSection.innerHTML = `
      <div class="withdraw-success">
        <div class="success-icon">✅</div>
        <h3 class="success-title">Withdrawal Successful!</h3>
        <p class="success-message">
          Your withdrawal of $${this.selectedAmount.toFixed(2)} has been processed.<br>
          You will receive $${result.netAmount} after fees.
        </p>
        <div class="transaction-id">
          Transaction ID: ${result.transactionId}
        </div>
        <p class="success-message">
          Funds will arrive within 1-24 hours.
        </p>
        <button class="confirm-btn" onclick="app.showWallet()">Back to Wallet</button>
      </div>
    `;
    
    // Update user balance
    if (app.currentUser) {
      app.currentUser.balance -= this.selectedAmount;
      app.updateUI();
    }
  }
  
  hideConfirmation() {
    document.getElementById('confirmationSection').classList.add('hidden');
  }
  
  showError(message) {
    // Можно добавить визуальное отображение ошибки
    console.error('Withdrawal error:', message);
  }
  
  updateUI() {
    // Обновляем доступный баланс
    if (app.currentUser) {
      document.getElementById('availableBalance').textContent = 
        `$${app.currentUser.balance.toFixed(2)}`;
    }
    
    this.calculateFees();
    this.updateWithdrawButton();
  }
}

// Глобальные функции
function processWithdrawal() {
  if (window.withdrawManager) {
    window.withdrawManager.processWithdrawal();
  }
}

function hideConfirmation() {
  if (window.withdrawManager) {
    window.withdrawManager.hideConfirmation();
  }
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  window.withdrawManager = new WithdrawManager();
});