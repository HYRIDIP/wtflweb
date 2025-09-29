class TradingChart {
  constructor(canvasId, crypto) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.crypto = crypto;
    this.data = [];
    this.isDragging = false;
    this.startX = 0;
    this.scrollOffset = 0;
    
    this.init();
  }
  
  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Обработчики для перемещения графика
    this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    
    // Touch события для мобильных
    this.canvas.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.onTouchEnd.bind(this));
  }
  
  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    this.draw();
  }
  
  updateData(newData) {
    this.data = newData;
    this.draw();
  }
  
  draw() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    
    // Очистка
    ctx.clearRect(0, 0, width, height);
    
    if (this.data.length < 2) return;
    
    // Настройки
    const padding = { top: 20, right: 40, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Данные для отображения (с учетом прокрутки)
    const visibleData = this.getVisibleData();
    if (visibleData.length < 2) return;
    
    const prices = visibleData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    
    // Сетка
    this.drawGrid(padding, chartWidth, chartHeight, minPrice, maxPrice);
    
    // Линия графика
    this.drawPriceLine(visibleData, padding, chartWidth, chartHeight, minPrice, priceRange);
    
    // Текущая цена
    this.drawCurrentPrice(visibleData[visibleData.length - 1].price, padding, chartWidth);
  }
  
  drawGrid(padding, chartWidth, chartHeight, minPrice, maxPrice) {
    const ctx = this.ctx;
    
    ctx.strokeStyle = '#2a2e35';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#b9c1d9';
    ctx.font = '10px Poppins';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    
    // Горизонтальные линии
    const horizontalLines = 5;
    for (let i = 0; i <= horizontalLines; i++) {
      const y = padding.top + (i / horizontalLines) * chartHeight;
      const price = maxPrice - (i / horizontalLines) * (maxPrice - minPrice);
      
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
      
      // Подписи цен
      ctx.fillText(`$${price.toFixed(4)}`, padding.left - 5, y);
    }
    
    // Вертикальные линии (время)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    
    const visibleData = this.getVisibleData();
    const timeStep = Math.max(1, Math.floor(visibleData.length / 6));
    
    for (let i = 0; i < visibleData.length; i += timeStep) {
      const point = visibleData[i];
      const x = padding.left + (i / (visibleData.length - 1)) * chartWidth;
      
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, padding.top + chartHeight);
      ctx.stroke();
      
      // Подписи времени
      const time = new Date(point.time);
      const timeText = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;
      ctx.fillText(timeText, x, padding.top + chartHeight + 10);
    }
  }
  
  drawPriceLine(visibleData, padding, chartWidth, chartHeight, minPrice, priceRange) {
    const ctx = this.ctx;
    
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00b15e';
    
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
    
    // Заливка под графиком
    ctx.globalAlpha = 0.1;
    ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
    ctx.lineTo(padding.left, padding.top + chartHeight);
    ctx.closePath();
    ctx.fillStyle = '#00b15e';
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  
  drawCurrentPrice(price, padding, chartWidth) {
    const ctx = this.ctx;
    const y = this.getPriceY(price);
    
    ctx.strokeStyle = '#00b15e';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Текст текущей цены
    ctx.fillStyle = '#00b15e';
    ctx.font = '12px Poppins';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${price.toFixed(4)}`, padding.left + chartWidth + 35, y);
  }
  
  getPriceY(price) {
    const padding = { top: 20, bottom: 30 };
    const chartHeight = this.canvas.height - padding.top - padding.bottom;
    const visibleData = this.getVisibleData();
    const prices = visibleData.map(d => d.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    
    return padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  }
  
  getVisibleData() {
    // Здесь можно добавить логику для отображения только части данных
    // при прокрутке/зуме
    return this.data.slice(-50); // Показываем последние 50 точек
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
    // Логика зума
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