/* ============================================================
   TRADING MASTER — Sprint MARKET-3B
   Market Status: Top 10 + Pulso del Mercado. Módulo completamente
   aislado — NO modifica marketData.js, dashboard.js, trades.js, assets.js,
   app.js ni storage.js. Reutiliza exclusivamente:
     BinanceMarketData.subscribeTicker() / unsubscribeTicker() / getTicker()
   ya implementados en MARKET-3A. Sin WebSocket propio, sin Supabase, sin
   polling adicional — cada actualización llega por el callback ya
   suscrito, nunca por una consulta nueva.
   ============================================================ */

(function(global){

  // Orden FIJO, nunca se reordena por precio/variación/rendimiento.
  // PAXGUSDT permanece siempre en la posición 10. Sin stablecoins.
  const ACTIVOS = [
    { symbol:'BTCUSDT',  abrev:'BTC',  nombre:'Bitcoin' },
    { symbol:'ETHUSDT',  abrev:'ETH',  nombre:'Ethereum' },
    { symbol:'BNBUSDT',  abrev:'BNB',  nombre:'BNB' },
    { symbol:'SOLUSDT',  abrev:'SOL',  nombre:'Solana' },
    { symbol:'XRPUSDT',  abrev:'XRP',  nombre:'XRP' },
    { symbol:'DOGEUSDT', abrev:'DOGE', nombre:'Dogecoin' },
    { symbol:'ADAUSDT',  abrev:'ADA',  nombre:'Cardano' },
    { symbol:'TRXUSDT',  abrev:'TRX',  nombre:'TRON' },
    { symbol:'HYPEUSDT', abrev:'HYPE', nombre:'Hyperliquid' },
    { symbol:'PAXGUSDT', abrev:'PAXG', nombre:'PAX Gold' } // posición 10, fija
  ];

  let inicializado = false;              // protección contra doble inicialización
  let callbacksPorSymbol = {};           // symbol -> callback (necesario para unsubscribeTicker en destroy)
  let tickersRecibidos = {};             // symbol -> último ticker completo recibido
  let intervaloEstadoConexion = null;

  function formatearPrecioInteligente(precio){
    if(precio === null || precio === undefined || isNaN(precio)) return null;
    const decimales = precio < 1 ? 4 : 2; // BTC/PAXG: 2 decimales; XRP/DOGE: 4 — sin decimales innecesarios
    return '$' + precio.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  function formatearVolumen(vol){
    if(vol === null || vol === undefined || isNaN(vol)) return '—';
    if(vol >= 1e9) return (vol/1e9).toFixed(1) + 'B';
    if(vol >= 1e6) return (vol/1e6).toFixed(1) + 'M';
    if(vol >= 1e3) return (vol/1e3).toFixed(1) + 'K';
    return vol.toFixed(2);
  }

  function crearTarjetasIniciales(){
    const contenedor = document.getElementById('marketStatusCards');
    if(!contenedor) return;
    contenedor.innerHTML = ACTIVOS.map(a =>
      `<div class="market-status-card" id="marketStatusCard-${a.symbol}" style="background:var(--color-bg); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:var(--space-3);"></div>`
    ).join('');
  }

  // Nunca muestra $0.00 falso: sin ticker todavía -> "Conectando...".
  function renderTarjeta(activo){
    const cardEl = document.getElementById('marketStatusCard-' + activo.symbol);
    if(!cardEl) return;
    const ticker = tickersRecibidos[activo.symbol];

    if(!ticker){
      cardEl.innerHTML = `
        <div style="font-weight:700;">${activo.abrev}</div>
        <div style="font-size:var(--fs-xs); color:var(--color-text-muted);">${activo.nombre}</div>
        <div style="color:var(--color-text-muted); font-size:var(--fs-sm); margin-top:var(--space-2);">Conectando...</div>
      `;
      return;
    }

    const precioTxt = formatearPrecioInteligente(ticker.price) || '—';
    const variacion = ticker.priceChangePercent;
    let variacionHtml = '—', colorVar = 'var(--color-text-muted)';
    if(variacion !== null && variacion !== undefined && !isNaN(variacion)){
      if(variacion > 0){ variacionHtml = `🟢 +${variacion.toFixed(2)}%`; colorVar = 'var(--color-success)'; }
      else if(variacion < 0){ variacionHtml = `🔴 ${variacion.toFixed(2)}%`; colorVar = 'var(--color-danger)'; }
      else{ variacionHtml = `⚪ 0.00%`; }
    }

    cardEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <span style="font-weight:700;">${activo.abrev}</span>
        <span style="font-size:var(--fs-xs); color:var(--color-text-muted);">${activo.nombre}</span>
      </div>
      <div style="font-size:var(--fs-lg); font-weight:700; margin-top:var(--space-1);">${precioTxt}</div>
      <div style="color:${colorVar}; font-size:var(--fs-sm);">${variacionHtml}</div>
      <div style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-top:var(--space-1);">
        H: ${formatearPrecioInteligente(ticker.high) || '—'} · L: ${formatearPrecioInteligente(ticker.low) || '—'} · Vol: ${formatearVolumen(ticker.volume)}
      </div>
    `;
  }

  // Analiza EXCLUSIVAMENTE los 10 activos definidos, solo con datos válidos
  // ya recibidos. priceChangePercent === 0 cuenta como neutral, no positivo
  // ni negativo (regla explícita del brief).
  function calcularPulso(){
    const clasificacionEl = document.getElementById('marketStatusClasificacion');
    if(!clasificacionEl) return;

    let positivos = 0, negativos = 0, neutrales = 0, sumaVariacion = 0, conDatos = 0;
    let ganador = null, perdedor = null;

    ACTIVOS.forEach(a => {
      const t = tickersRecibidos[a.symbol];
      if(!t || t.priceChangePercent === null || t.priceChangePercent === undefined || isNaN(t.priceChangePercent)) return;
      const v = t.priceChangePercent;
      conDatos++;
      sumaVariacion += v;
      if(v > 0) positivos++;
      else if(v < 0) negativos++;
      else neutrales++;

      if(!ganador || v > ganador.variacion) ganador = { abrev: a.abrev, variacion: v };
      if(!perdedor || v < perdedor.variacion) perdedor = { abrev: a.abrev, variacion: v };
    });

    if(conDatos === 0){
      clasificacionEl.textContent = 'Esperando datos...';
      return;
    }

    let clasificacion;
    if(positivos >= 9) clasificacion = '🟢 Fuerte impulso alcista';
    else if(positivos >= 6) clasificacion = '🟢 Mercado mayormente alcista';
    else if(positivos >= 4) clasificacion = '🟡 Mercado mixto';
    else if(positivos >= 2) clasificacion = '🔴 Mercado mayormente bajista';
    else clasificacion = '🔴 Fuerte presión bajista';

    clasificacionEl.textContent = clasificacion;

    const positivosEl = document.getElementById('marketStatusPositivos');
    const negativosEl = document.getElementById('marketStatusNegativos');
    const neutralesEl = document.getElementById('marketStatusNeutrales');
    const promedioEl = document.getElementById('marketStatusPromedio');
    const ganadorEl = document.getElementById('marketStatusGanador');
    const perdedorEl = document.getElementById('marketStatusPerdedor');

    if(positivosEl) positivosEl.textContent = `${positivos} / 10 🟢`;
    if(negativosEl) negativosEl.textContent = `${negativos} / 10 🔴`;
    if(neutralesEl){
      if(neutrales > 0){ neutralesEl.textContent = `${neutrales} / 10 ⚪`; neutralesEl.style.display = ''; }
      else{ neutralesEl.style.display = 'none'; }
    }

    const promedio = sumaVariacion / conDatos;
    if(promedioEl) promedioEl.textContent = (promedio >= 0 ? '🟢 +' : '🔴 ') + promedio.toFixed(2) + '%';
    if(ganadorEl && ganador) ganadorEl.textContent = `${ganador.abrev}  ${ganador.variacion >= 0 ? '+' : ''}${ganador.variacion.toFixed(2)}%`;
    if(perdedorEl && perdedor) perdedorEl.textContent = `${perdedor.abrev}  ${perdedor.variacion >= 0 ? '+' : ''}${perdedor.variacion.toFixed(2)}%`;
  }

  // Reutiliza getConnectionStatus() ya existente (MARKET-1B) — nunca
  // consulta nada nuevo, nunca escribe en Supabase.
  function actualizarEstadoConexion(){
    const el = document.getElementById('marketStatusEstadoConexion');
    if(!el || typeof BinanceMarketData === 'undefined') return;
    const status = BinanceMarketData.getConnectionStatus();
    if(status === 'connected') el.textContent = '🟢 EN VIVO';
    else if(status === 'connecting') el.textContent = 'Conectando con el mercado...';
    else el.textContent = '⚠️ Datos de mercado temporalmente no disponibles'; // reconnecting/disconnected -> mismo mensaje discreto
  }

  function init(){
    if(inicializado) return; // PASO obligatorio — nunca duplica listeners si se llama 2 veces
    if(typeof BinanceMarketData === 'undefined') return; // marketData.js no cargado -> no romper nada
    inicializado = true;

    crearTarjetasIniciales();
    actualizarEstadoConexion();

    ACTIVOS.forEach(activo => {
      renderTarjeta(activo); // estado inicial "Conectando..." — nunca $0.00 falso

      const callback = (ticker) => {
        tickersRecibidos[activo.symbol] = ticker;
        renderTarjeta(activo);
        calcularPulso();
        actualizarEstadoConexion();
      };
      callbacksPorSymbol[activo.symbol] = callback;
      BinanceMarketData.subscribeTicker(activo.symbol, callback);

      const cacheado = BinanceMarketData.getTicker(activo.symbol); // si ya había datos en caché, mostrarlos de inmediato
      if(cacheado){ tickersRecibidos[activo.symbol] = cacheado; renderTarjeta(activo); }
    });

    calcularPulso();

    // El estado de conexión puede cambiar sin que llegue un ticker nuevo
    // (ej. reconectando); se revisa cada pocos segundos, sin polling de datos.
    intervaloEstadoConexion = setInterval(actualizarEstadoConexion, 5000);
  }

  function destroy(){
    if(!inicializado) return;
    ACTIVOS.forEach(activo => {
      const cb = callbacksPorSymbol[activo.symbol];
      if(cb && typeof BinanceMarketData !== 'undefined'){
        BinanceMarketData.unsubscribeTicker(activo.symbol, cb);
      }
    });
    if(intervaloEstadoConexion) clearInterval(intervaloEstadoConexion);
    intervaloEstadoConexion = null;
    callbacksPorSymbol = {};
    tickersRecibidos = {};
    inicializado = false;
  }

  global.MarketStatus = { init, destroy, ACTIVOS };

  init(); // autoinicialización — no requiere que ningún archivo protegido lo llame

})(window);
