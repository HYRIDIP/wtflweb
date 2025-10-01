class TradingChart {
  constructor(canvasId, crypto) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error(`❌ Canvas element with id '${canvasId}' not found`);
      return;
    }
    
    this.ctx = this.canvas.getContext('2d');
    this.crypto = crypto;
    this.data = [];
    this.isDragging = false;
    this.startX = 0;
    this.scrollOffset = 0;
    this.isInitialized = false;
    
    console.log(`✅ TradingChart создан для ${crypto}`, { canvasId, canvas: this.canvas });
    this.init();
  }
  
  init() {
    if (!this.canvas) return;
    
    this.resize();
    this.setupEventListeners();
    
    this.isInitialized = true;
    console.log(`✅ TradingChart инициализирован для ${this.crypto}`);
  }
  
  setupEventListeners() {
    window.addEventListener('resize', () => this.resize());
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
    
    const oldWidth = this.canvas.width;
    const oldHeight = this.canvas.height;
    
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    
    if (oldWidth !== this.canvas.width || oldHeight !== this.canvas.height) {
      console.log(`📏 Canvas ${this.crypto} resized to: ${this.canvas.width}x${this.canvas.height}`);
      this.draw();
    }
  }
  
  updateData(newData) {
    if (!newData || !Array.isArray(newData)) {
      console.error('Invalid data provided to updateData');
      return;
    }
    
    this.data = newData;
    console.log(`📊 Data updated for ${this.crypto}: ${newData.length} points`);
    
    if (this.data.length > 0) {
      requestAnimationFrame(() => this.draw());
    }
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
      console.log(`❌ Недостаточно данных для графика ${this.crypto}: ${this.data.length} точек`);
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
      
      console.log(`✅ График ${this.crypto} нарисован: ${visibleData.length} точек`);
      
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
    const startIndex = Math.max(0, this.data.length - 20);
    return this.data.slice(startIndex);
  }
  
  destroy() {
    window.removeEventListener('resize', this.resize);
  }
}

// Функция для мини-графиков в кошельке
class MiniChart {
  static instances = new Map();
  
  static init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.log(`❌ MiniChart: Canvas ${canvasId} not found`);
      return null;
    }
    
    if (this.instances.has(canvasId)) {
      return this.instances.get(canvasId);
    }
    
    const instance = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      data: [],
      lastDataHash: ''
    };
    
    this.instances.set(canvasId, instance);
    console.log(`✅ MiniChart инициализирован: ${canvasId}`);
    return instance;
  }
  
  static draw(canvasId, data) {
    let instance = this.instances.get(canvasId);
    if (!instance) {
      instance = this.init(canvasId);
    }
    
    if (!instance) return;
    
    const canvas = instance.canvas;
    const ctx = instance.ctx;
    
    // Проверяем, изменились ли данные
    const dataHash = JSON.stringify(data);
    if (dataHash === instance.lastDataHash && instance.data.length > 0) {
      return;
    }
    
    instance.data = data || [];
    instance.lastDataHash = dataHash;
    
    const width = canvas.width;
    const height = canvas.height;
    
    // Очищаем canvas
    ctx.clearRect(0, 0, width, height);
    
    if (!data || data.length < 2) {
      MiniChart.drawNoData(ctx, width, height);
      console.log(`❌ MiniChart ${canvasId}: недостаточно данных`);
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
      console.log(`✅ MiniChart ${canvasId} нарисован: ${data.length} точек`);
      
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
  
  static updateAll(marketData) {
    if (!marketData || !marketData.history) {
      console.error('No market data for mini charts');
      return;
    }
    
    const cryptos = ['MINT', 'RWK', 'SKH', 'WTFL', 'CULT'];
    
    cryptos.forEach(crypto => {
      const history = marketData.history[crypto];
      if (history && history.length > 0) {
        const chartData = history.slice(-20);
        this.draw(`chart-${crypto}`, chartData);
      } else {
        console.log(`No history data for ${crypto}`);
        this.draw(`chart-${crypto}`, null);
      }
    });
  }
}

// Chart Manager для управления всеми графиками
class ChartManager {
  constructor() {
    this.charts = new Map();
    this.miniChartsInitialized = false;
    this.init();
  }
  
  init() {
    console.log('📈 ChartManager инициализирован');
    this.initMiniCharts();
  }
  
  initMiniCharts() {
    if (this.miniChartsInitialized) return;
    
    const cryptos = ['MINT', 'RWK', 'SKH', 'WTFL', 'CULT'];
    
    cryptos.forEach(crypto => {
      MiniChart.init(`chart-${crypto}`);
    });
    
    this.miniChartsInitialized = true;
    console.log('✅ Мини-графики инициализированы');
  }
  
  createTradingChart(canvasId, crypto) {
    if (this.charts.has(canvasId)) {
      return this.charts.get(canvasId);
    }
    
    const chart = new TradingChart(canvasId, crypto);
    this.charts.set(canvasId, chart);
    console.log(`✅ Торговый график создан: ${canvasId} для ${crypto}`);
    return chart;
  }
  
  updateAllCharts(marketData) {
    if (!marketData) {
      console.error('❌ ChartManager: нет рыночных данных');
      return;
    }
    
    console.log('📈 ChartManager обновляет графики с данными:', marketData);
    
    // Обновляем мини-графики
    MiniChart.updateAll(marketData);
    
    // Обновляем торговые графики
    this.charts.forEach((chart, canvasId) => {
      const crypto = chart.crypto;
      const history = marketData.history?.[crypto];
      if (history && history.length > 0) {
        console.log(`✅ Обновляем график ${crypto} с ${history.length} точками`);
        chart.updateData(history);
      } else {
        console.log(`❌ Нет данных для графика ${crypto}`);
      }
    });
  }
  
  getChart(canvasId) {
    return this.charts.get(canvasId);
  }
  
  destroyChart(canvasId) {
    const chart = this.charts.get(canvasId);
    if (chart) {
      chart.destroy();
      this.charts.delete(canvasId);
    }
  }
  
  destroyAll() {
    this.charts.forEach((chart, canvasId) => {
      chart.destroy();
    });
    this.charts.clear();
  }
}

// Глобальные функции
function initAllMiniCharts(marketData) {
  if (!marketData || !marketData.history) {
    console.error('No market data for mini charts');
    return;
  }
  
  console.log('🎯 initAllMiniCharts вызван с данными:', marketData);
  MiniChart.updateAll(marketData);
}

function updateTradingChart(chartInstance, newData) {
  if (chartInstance && chartInstance.updateData) {
    chartInstance.updateData(newData);
  }
}

function initChartManager() {
  if (!window.chartManager) {
    window.chartManager = new ChartManager();
  }
  return window.chartManager;
}

// Автоматическая инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
  console.log('📈 Загрузка ChartManager...');
  initChartManager();
  
  if (window.preloadedMarketData) {
    setTimeout(() => {
      console.log('📊 Используем предзагруженные рыночные данные');
      initAllMiniCharts(window.preloadedMarketData);
    }, 100);
  }
});

// Экспорты для использования в модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TradingChart,
    MiniChart,
    ChartManager,
    initAllMiniCharts,
    updateTradingChart,
    initChartManager
  };
}
