/* ============================================================
   TRADING MASTER — Sprint MARKET-4
   Sentimiento del Mercado: Fear & Greed Index. Módulo completamente
   aislado — NO se conecta a Supabase, NO abre WebSockets, NO depende de
   BinanceMarketData ni de ningún cálculo de Trades. Fuente pública, sin
   API Key: https://api.alternative.me/fng/?limit=1
   ============================================================ */

(function(global){
  const API_URL = 'https://api.alternative.me/fng/?limit=1';
  const CACHE_KEY = 'tradingMasterFearGreedCache';
  const CACHE_TTL_MS = 30 * 60 * 1000; // ~30 minutos

  let inicializado = false;
  let ultimoDatoValido = null; // { value, timestamp } — se conserva aunque falle una consulta posterior
  let intervaloRefresh = null;

  function clasificarEspanol(valor){
    if(valor <= 24) return { texto: 'Miedo Extremo', emoji: '🔴' };
    if(valor <= 44) return { texto: 'Miedo', emoji: '🟠' };
    if(valor <= 55) return { texto: 'Neutral', emoji: '🟡' };
    if(valor <= 74) return { texto: 'Codicia', emoji: '🟢' };
    return { texto: 'Codicia Extrema', emoji: '🟢' };
  }

  function leerCache(){
    try{
      if(typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(CACHE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || typeof parsed.value !== 'number' || typeof parsed.timestamp !== 'number') return null;
      return parsed;
    }catch(e){ return null; } // caché corrupto/no disponible -> se ignora, nunca rompe nada
  }

  function guardarCache(dato){
    try{
      if(typeof localStorage === 'undefined') return;
      localStorage.setItem(CACHE_KEY, JSON.stringify(dato));
    }catch(e){ /* el caché es una optimización, no un requisito duro — fallo silencioso */ }
  }

  function cacheVigente(dato){
    return !!dato && (Date.now() - dato.timestamp) < CACHE_TTL_MS;
  }

  function renderEstadoNoDisponible(){
    const valorEl = document.getElementById('marketSentimentValor');
    const clasifEl = document.getElementById('marketSentimentClasificacion');
    const fuenteEl = document.getElementById('marketSentimentFuente');
    if(valorEl) valorEl.textContent = '—';
    if(clasifEl) clasifEl.textContent = 'Sentimiento no disponible';
    if(fuenteEl) fuenteEl.textContent = '';
  }

  function render(dato, esUltimoDatoTrasError){
    const valorEl = document.getElementById('marketSentimentValor');
    const clasifEl = document.getElementById('marketSentimentClasificacion');
    const indicadorEl = document.getElementById('marketSentimentIndicador');
    const fuenteEl = document.getElementById('marketSentimentFuente');
    if(!valorEl) return;

    const clasif = clasificarEspanol(dato.value);
    valorEl.textContent = dato.value + ' / 100';
    if(clasifEl) clasifEl.textContent = `${clasif.emoji} ${clasif.texto}`;
    if(indicadorEl) indicadorEl.style.left = Math.max(0, Math.min(100, dato.value)) + '%';
    if(fuenteEl) fuenteEl.textContent = esUltimoDatoTrasError ? 'Último dato disponible · Fuente: Alternative.me' : 'Fuente: Alternative.me';
  }

  async function refresh(forzar){
    if(!forzar){
      const cacheado = leerCache();
      if(cacheVigente(cacheado)){
        ultimoDatoValido = cacheado;
        render(cacheado, false);
        return cacheado; // PASO caché — reutiliza sin consultar la API de nuevo
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
        render(ultimoDatoValido, true); // conserva el último valor válido, nunca inventa uno nuevo
      }else{
        renderEstadoNoDisponible(); // nunca muestra 0 falso
      }
      return null;
    }
  }

  function init(){
    if(inicializado) return; // evita doble inicialización y consultas duplicadas
    inicializado = true;

    const cacheado = leerCache();
    if(cacheado){ ultimoDatoValido = cacheado; render(cacheado, false); }

    refresh(false); // respeta el caché de ~30 min si sigue vigente

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
    refresh: () => refresh(true), // refresco manual: siempre fuerza una consulta nueva
    getCurrent,
    destroy
  };

  init(); // autoinicialización — no requiere que ningún archivo protegido lo llame

})(window);
