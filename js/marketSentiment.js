/* ============================================================
   TRADING MASTER — Sprint MARKET-4 (base) + MARKET-UI (rediseño visual)
   Sentimiento del Mercado: Fear & Greed Index. Módulo completamente
   aislado — sin Supabase, sin WebSockets, sin dependencia de
   BinanceMarketData ni de cálculos de Trades. Fuente pública, sin
   API Key: https://api.alternative.me/fng/?limit=1

   MARKET-UI — cambio respecto a MARKET-4: solo de PRESENTACIÓN (gauge
   tipo velocímetro con SVG en vez de la barra lineal anterior). La
   lógica de fetch/caché/clasificación/manejo de errores es idéntica.
   ============================================================ */

(function(global){
  const API_URL = 'https://api.alternative.me/fng/?limit=1';
  const CACHE_KEY = 'tradingMasterFearGreedCache';
  const CACHE_TTL_MS = 30 * 60 * 1000; // ~30 minutos

  let inicializado = false;
  let ultimoDatoValido = null;
  let intervaloRefresh = null;

  function clasificarEspanol(valor){
    if(valor <= 24) return { texto: 'Miedo Extremo', color: '#EF4444' };
    if(valor <= 44) return { texto: 'Miedo', color: '#F97316' };
    if(valor <= 55) return { texto: 'Neutral', color: '#EAB308' };
    if(valor <= 74) return { texto: 'Codicia', color: '#22C55E' };
    return { texto: 'Codicia Extrema', color: '#16A34A' };
  }

  function leerCache(){
    try{
      if(typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed.value !== 'number' || typeof parsed.timestamp !== 'number') return null;
      return parsed;
    }catch(e){ return null; }
  }

  function guardarCache(dato){
    try{
      if(typeof localStorage === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify(dato));
    }catch(e){ /* el caché es una optimización, no un requisito duro */ }
  }

  function cacheVigente(dato){
    return !!dato && (Date.now() - dato.timestamp) < CACHE_TTL_MS;
  }

  // Posición del indicador sobre el arco semicircular (centro 100,100 radio 82).
  function calcularPosicionIndicador(valor){
    const anguloGrados = 180 - (Math.max(0, Math.min(100, valor)) / 100) * 180;
    const anguloRad = anguloGrados * Math.PI / 180;
    return { cx: 100 + 82 * Math.cos(anguloRad), cy: 100 - 82 * Math.sin(anguloRad) };
  }

  function construirGaugeSVG(valor){
    const { cx, cy } = calcularPosicionIndicador(valor);
    return `
      <svg viewBox="0 0 200 115" style="width:100%; max-width:220px; display:block; margin:0 auto;">
        <defs>
          <linearGradient id="msGaugeGradiente" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#EF4444"/>
            <stop offset="25%" stop-color="#F97316"/>
            <stop offset="50%" stop-color="#EAB308"/>
            <stop offset="75%" stop-color="#22C55E"/>
            <stop offset="100%" stop-color="#16A34A"/>
          </linearGradient>
        </defs>
        <path d="M 18 100 A 82 82 0 0 1 182 100" fill="none" stroke="url(#msGaugeGradiente)" stroke-width="14" stroke-linecap="round"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="7" fill="#fff" stroke="#111827" stroke-width="2.5"/>
      </svg>
    `;
  }

  function renderEstadoNoDisponible(){
    const gaugeEl = document.getElementById('marketSentimentGauge');
    const valorEl = document.getElementById('marketSentimentValor');
    const clasifEl = document.getElementById('marketSentimentClasificacion');
    const fuenteEl = document.getElementById('marketSentimentFuente');
    if(gaugeEl) gaugeEl.innerHTML = construirGaugeSVG(0);
    if(valorEl) valorEl.textContent = '—';
    if(clasifEl){ clasifEl.textContent = 'Sentimiento no disponible'; clasifEl.style.background = 'transparent'; clasifEl.style.color = 'var(--color-text-muted)'; }
    if(fuenteEl) fuenteEl.textContent = '';
  }

  function render(dato, esUltimoDatoTrasError){
    const gaugeEl = document.getElementById('marketSentimentGauge');
    const valorEl = document.getElementById('marketSentimentValor');
    const clasifEl = document.getElementById('marketSentimentClasificacion');
    const fuenteEl = document.getElementById('marketSentimentFuente');
    const actualizacionEl = document.getElementById('marketSentimentActualizacion');
    if(!valorEl) return;

    const clasif = clasificarEspanol(dato.value);
    if(gaugeEl) gaugeEl.innerHTML = construirGaugeSVG(dato.value);
    valorEl.textContent = dato.value;
    if(clasifEl){
      clasifEl.textContent = clasif.texto;
      clasifEl.style.background = clasif.color + '26';
      clasifEl.style.color = clasif.color;
    }
    if(fuenteEl) fuenteEl.innerHTML = esUltimoDatoTrasError
      ? 'Último dato disponible · Fuente: <a href="https://alternative.me" target="_blank" rel="noopener" style="color:inherit;">Alternative.me</a>'
      : 'Fuente: <a href="https://alternative.me" target="_blank" rel="noopener" style="color:inherit;">Alternative.me</a>';
    if(actualizacionEl){
      const fecha = new Date(dato.timestamp);
      actualizacionEl.textContent = 'Última actualización: ' + fecha.toLocaleString('es', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' });
    }
  }

  async function refresh(forzar){
    if(!forzar){
      const cacheado = leerCache();
      if(cacheVigente(cacheado)){
        ultimoDatoValido = cacheado;
        render(cacheado, false);
        return cacheado;
      }
    }

    try{
      const response = await fetch(API_URL);
      if(!response.ok) throw new Error(`Alternative.me respondió con estado ${response.status}`);

      const json = await response.json();
      const item = json && Array.isArray(json.data) ? json.data[0] : null;
      if(!item || item.value === undefined) throw new Error('Respuesta inesperada de Alternative.me: falta data[0].value.');

      const valor = parseInt(item.value, 10);
      if(isNaN(valor)) throw new Error('Valor de Fear & Greed no numérico.');

      const dato = { value: valor, timestamp: Date.now() };
      ultimoDatoValido = dato;
      guardarCache(dato);
      render(dato, false);
      return dato;

    }catch(error){
      console.error('MarketSentiment: no se pudo obtener el Fear & Greed Index:', error);
      if(ultimoDatoValido){
        render(ultimoDatoValido, true);
      }else{
        renderEstadoNoDisponible();
      }
      return null;
    }
  }

  function init(){
    if(inicializado) return;
    inicializado = true;

    const cacheado = leerCache();
    if(cacheado){ ultimoDatoValido = cacheado; render(cacheado, false); }

    refresh(false);

    intervaloRefresh = setInterval(() => refresh(false), CACHE_TTL_MS);
  }

  function destroy(){
    if(intervaloRefresh) clearInterval(intervaloRefresh);
    intervaloRefresh = null;
    inicializado = false;
  }

  function getCurrent(){
    return ultimoDatoValido ? Object.assign({}, ultimoDatoValido) : null;
  }

  global.MarketSentiment = {
    init,
    refresh: () => refresh(true),
    getCurrent,
    destroy
  };

  init();

})(window);
