class TradingChart {
  constructor(canvasId, crypto) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`Canvas element with id '${canvasId}' not found`);
      return;
    }
    
    this.ctx = this.canvas.getContext('2d');
    this.crypto = crypto;
    this.data = [];
    this.isDragging = false;
    this.startX = 0;
    this.scrollOffset = 0;
    
    this.init();
  }
  
  init() {
    if (!this.canvas) return;
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Обработчики для интерактивности
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    
    // Touch события
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
    
    console.log(`✅ TradingChart инициализирован для ${this.crypto}`);
  }
  
  resize() {
    if (!this.canvas) return;
    
    const container = this.canvas.parentElement;
    if (!container) return;
    
    const displayStyle = window.getComputedStyle(this.canvas).display;
    if (displayStyle === 'none') {
      console.log(`Canvas ${this.crypto} скрыт, пропускаем resize`);
      return;
    }
    
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    
    console.log(`📏 Canvas ${this.crypto} resized to: ${this.canvas.width}x${this.canvas.height}`);
    this.draw();
  }
  
  updateData(newData) {
    if (!newData || !Array.isArray(newData)) {
      console.error('Invalid data provided to updateData');
      return;
    }
    
    this.data = newData;
    console.log(`📊 Data updated for ${this.crypto}: ${newData.length} points`);
    this.draw();
  }
  
  draw() {
    if (!this.canvas || !this.ctx) {
      console.error('Canvas or context not available');
      return;
    }
    
    const { width, height } = this.canvas;
    
    // Очистка
    this.ctx.clearRect(0, 0, width, height);
    
    if (this.data.length < 2) {
      this.drawNoData();
      return;
    }
    
    try {
      // Настройки
      const padding = { top: 5, right: 5, bottom: 5, left: 5 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      
      // Данные для отображения
      const visibleData = this.getVisibleData();
      if (visibleData.length < 2) {
        this.drawNoData();
        return;
      }
      
      const prices = visibleData.map(d => d.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceRange = maxPrice - minPrice || 1;
      
      // Рисуем график
      this.drawChartLine(visibleData, padding, chartWidth, chartHeight, minPrice, priceRange);
      
    } catch (error) {
      console.error('Error drawing chart:', error);
      this.drawError();
    }
  }
  
  drawChartLine(visibleData, padding, chartWidth, chartHeight, minPrice, priceRange) {
    const ctx = this.ctx;
    
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    // Определяем цвет графика
    const isPositive = visibleData[visibleData.length - 1].price > visibleData[0].price;
    ctx.strokeStyle = isPositive ? '#00b15e' : '#f6465d';
    
    visibleData.forEach((point, index) => {
      const x = padding.left + (index / (visibleData.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Добавляем легкую заливку под графиком
    if (visibleData.length > 1) {
      const firstPoint = visibleData[0];
      const lastPoint = visibleData[visibleData.length - 1];
      
      const firstX = padding.left;
      const firstY = padding.top + chartHeight - ((firstPoint.price - minPrice) / priceRange) * chartHeight;
      const lastX = padding.left + chartWidth;
      const lastY = padding.top + chartHeight - ((lastPoint.price - minPrice) / priceRange) * chartHeight;
      
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = isPositive ? '#00b15e' : '#f6465d';
      
      ctx.beginPath();
      ctx.moveTo(firstX, firstY);
      
      visibleData.forEach((point, index) => {
        const x = padding.left + (index / (visibleData.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight;
        ctx.lineTo(x, y);
      });
      
      ctx.lineTo(lastX, padding.top + chartHeight);
      ctx.lineTo(firstX, padding.top + chartHeight);
      ctx.closePath();
      ctx.fill();
      
      ctx.globalAlpha = 1.0;
    }
  }
  
  drawNoData() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    
    ctx.fillStyle = '#6c757d';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No data', width / 2, height / 2);
  }
  
  drawError() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    
    ctx.fillStyle = '#f6465d';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chart error', width / 2, height / 2);
  }
  
  getVisibleData() {
    // Для мини-графиков показываем последние 20 точек
    return this.data.slice(-20);
  }
  
  // Обработчики событий для интерактивности
  onMouseDown(e) {
    this.isDragging = true;
    this.startX = e.clientX;
    this.scrollOffset = 0;
  }
  
  onMouseMove(e) {
    if (!this.isDragging) return;
    
    const deltaX = e.clientX - this.startX;
    this.scrollOffset = deltaX;
    this.draw();
  }
  
  onMouseUp() {
    this.isDragging = false;
  }
  
  onWheel(e) {
    e.preventDefault();
    // Логика зума может быть добавлена позже
    this.draw();
  }
  
  onTouchStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.startX = e.touches[0].clientX;
  }
  
  onTouchMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    
    const deltaX = e.touches[0].clientX - this.startX;
    this.scrollOffset = deltaX;
    this.draw();
  }
  
  onTouchEnd() {
    this.isDragging = false;
  }
}

// Функция для мини-графиков в кошельке
class MiniChart {
  static draw(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.log(`MiniChart: Canvas ${canvasId} not found`);
      return;
    }
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Очищаем canvas
    ctx.clearRect(0, 0, width, height);
    
    if (!data || data.length < 2) {
      MiniChart.drawNoData(ctx, width, height);
      return;
    }
    
    try {
      const prices = data.map(d => d.price);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const range = maxPrice - minPrice || 1;
      
      // Определяем цвет
      const isPositive = prices[prices.length - 1] > prices[0];
      ctx.strokeStyle = isPositive ? '#00b15e' : '#f6465d';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      
      // Рисуем линию
      ctx.beginPath();
      
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
      console.error(`Error drawing mini chart ${canvasId}:`, error);
      MiniChart.drawError(ctx, width, height);
    }
  }
  
  static drawNoData(ctx, width, height) {
    ctx.fillStyle = '#6c757d';
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('---', width / 2, height / 2);
  }
  
  static drawError(ctx, width, height) {
    ctx.fillStyle = '#f6465d';
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('err', width / 2, height / 2);
  }
}

// Глобальные функции
function initAllMiniCharts(marketData) {
  if (!marketData || !marketData.history) {
    console.error('No market data for mini charts');
    return;
  }
  
  const cryptos = ['MINT', 'RWK', 'SKH', 'WTFL', 'CULT'];
  
  cryptos.forEach(crypto => {
    const history = marketData.history[crypto];
    if (history && history.length > 0) {
      // Используем последние 20 точек для мини-графика
      const chartData = history.slice(-20);
      MiniChart.draw(`chart-${crypto}`, chartData);
      console.log(`✅ Mini chart drawn for ${crypto}`);
    } else {
      console.log(`No history data for ${crypto}`);
    }
  });
}

function updateTradingChart(chartInstance, newData) {
  if (chartInstance && chartInstance.updateData) {
    chartInstance.updateData(newData);
  }
}
