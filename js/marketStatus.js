/* ============================================================
   TRADING MASTER — Sprint MARKET-3B (base) + MARKET-UI (rediseño visual)
   Market Status: Top 10 + Pulso del Mercado + Resumen 24h. Módulo
   completamente aislado — reutiliza exclusivamente:
     BinanceMarketData.subscribeTicker() / unsubscribeTicker() / getTicker()
   Sin WebSocket propio, sin Supabase, sin polling adicional.

   MARKET-UI — cambios respecto a MARKET-3B: solo de PRESENTACIÓN.
   - "Cap. Mercado" se omite (no es un dato real disponible desde Binance
     @ticker) — se muestra Máximo/Mínimo 24h en su lugar (dato real ya
     recibido).
   - Mini-gráfica (sparkline): se construye ÚNICAMENTE con ticks reales
     recibidos durante la sesión actual, acumulados en memoria — nunca
     historial inventado ni datos simulados. Se reinicia en destroy().
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
    { symbol:'HYPEUSDT', abrev:'HYPE', nombre:'Hyperliquid', marketType:'FUTURES' }, // MARKET-HYPE-1 — no existe como Spot en Binance global
    { symbol:'PAXGUSDT', abrev:'PAXG', nombre:'PAX Gold' } // posición 10, fija
  ];

  // Colores decorativos por símbolo — distinción visual únicamente, no son
  // logos oficiales ni ningún dato obtenido de Binance.
  const COLOR_POR_SYMBOL = {
    BTCUSDT:'#F7931A', ETHUSDT:'#627EEA', BNBUSDT:'#F0B90B', SOLUSDT:'#14F195',
    XRPUSDT:'#25A9E0', DOGEUSDT:'#C2A633', ADAUSDT:'#3468D1', TRXUSDT:'#EF0027',
    HYPEUSDT:'#4C6FFF', PAXGUSDT:'#D4AF37'
  };

  const MAX_PUNTOS_SPARKLINE = 30; // tope de memoria — nunca crece sin límite

  let inicializado = false;
  let callbacksPorSymbol = {};
  let tickersRecibidos = {};
  let historialPrecios = {};  // symbol -> array de precios REALES recibidos esta sesión (nunca inventados)
  let intervaloEstadoConexion = null;

  function formatearPrecioInteligente(precio){
    if(precio === null || precio === undefined || isNaN(precio)) return null;
    const decimales = precio < 1 ? 4 : 2;
    return '$' + precio.toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
  }

  function formatearVolumen(vol){
    if(vol === null || vol === undefined || isNaN(vol)) return '—';
    if(vol >= 1e9) return '$' + (vol/1e9).toFixed(1) + 'B';
    if(vol >= 1e6) return '$' + (vol/1e6).toFixed(1) + 'M';
    if(vol >= 1e3) return '$' + (vol/1e3).toFixed(1) + 'K';
    return '$' + vol.toFixed(2);
  }

  function agregarPuntoSparkline(symbol, precio){
    if(precio === null || precio === undefined || isNaN(precio)) return;
    if(!historialPrecios[symbol]) historialPrecios[symbol] = [];
    historialPrecios[symbol].push(precio);
    if(historialPrecios[symbol].length > MAX_PUNTOS_SPARKLINE){
      historialPrecios[symbol].shift();
    }
  }

  // Sparkline construida ÚNICAMENTE con puntos reales ya acumulados. Con
  // menos de 2 puntos no hay línea que trazar -> SVG vacío, nunca una
  // línea plana inventada.
  function renderSparklineSVG(symbol, colorLinea){
    const puntos = historialPrecios[symbol];
    if(!puntos || puntos.length < 2){
      return `<svg viewBox="0 0 100 28" style="width:100%; height:28px; display:block;"></svg>`;
    }
    const min = Math.min(...puntos);
    const max = Math.max(...puntos);
    const rango = (max - min) || 1;
    const anchoPorPunto = 100 / (puntos.length - 1);
    const coords = puntos.map((p, i) => {
      const x = i * anchoPorPunto;
      const y = 26 - ((p - min) / rango) * 24;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg viewBox="0 0 100 28" style="width:100%; height:28px; display:block;" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${colorLinea}" stroke-width="2"/></svg>`;
  }

  function crearTarjetasIniciales(){
    const contenedor = document.getElementById('marketStatusCards');
    if(!contenedor) return;
    contenedor.innerHTML = ACTIVOS.map(a =>
      `<div class="market-status-card" id="marketStatusCard-${a.symbol}" style="background:var(--color-bg); border:1px solid var(--color-border); border-radius:var(--radius-md); padding:var(--space-3); min-width:0;"></div>`
    ).join('');
  }

  // Nunca muestra $0.00 falso: sin ticker todavía -> "Conectando...".
  function renderTarjeta(activo, posicion){
    const cardEl = document.getElementById('marketStatusCard-' + activo.symbol);
    if(!cardEl) return;
    const ticker = tickersRecibidos[activo.symbol];
    const color = COLOR_POR_SYMBOL[activo.symbol] || 'var(--color-text-muted)';
    const badgePosicion = `<span style="background:var(--color-bg); border:1px solid var(--color-border); border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--color-text-muted); flex-shrink:0;">${posicion}</span>`;
    const iconoCirculo = `<div style="width:32px; height:32px; border-radius:50%; background:${color}26; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><span style="font-size:10px; font-weight:700; color:${color};">${activo.abrev.slice(0,2)}</span></div>`;

    if(!ticker){
      cardEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">${badgePosicion}${iconoCirculo}</div>
        <div style="margin-top:var(--space-2); font-weight:700;">${activo.abrev}</div>
        <div style="font-size:var(--fs-xs); color:var(--color-text-muted);">${activo.nombre}</div>
        <div style="color:var(--color-text-muted); font-size:var(--fs-sm); margin-top:var(--space-2);">Conectando...</div>
      `;
      return;
    }

    const precioTxt = formatearPrecioInteligente(ticker.price) || '—';
    const variacion = ticker.priceChangePercent;
    let variacionHtml = '—', colorVar = 'var(--color-text-muted)', colorLinea = 'var(--color-text-muted)';
    if(variacion !== null && variacion !== undefined && !isNaN(variacion)){
      if(variacion > 0){ variacionHtml = `▲ +${variacion.toFixed(2)}%`; colorVar = 'var(--color-success)'; colorLinea = 'var(--color-success)'; }
      else if(variacion < 0){ variacionHtml = `▼ ${variacion.toFixed(2)}%`; colorVar = 'var(--color-danger)'; colorLinea = 'var(--color-danger)'; }
      else{ variacionHtml = `● 0.00%`; }
    }

    const sparkline = renderSparklineSVG(activo.symbol, colorLinea);

    cardEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">${badgePosicion}${iconoCirculo}</div>
      <div style="margin-top:var(--space-2); font-weight:700;">${activo.abrev}</div>
      <div style="font-size:var(--fs-xs); color:var(--color-text-muted); margin-bottom:var(--space-1);">${activo.nombre}</div>
      <div style="font-size:var(--fs-lg); font-weight:700;">${precioTxt}</div>
      <div style="color:${colorVar}; font-size:var(--fs-sm); font-weight:600;">${variacionHtml}</div>
      <div style="margin: var(--space-1) 0;">${sparkline}</div>
      <div style="color:var(--color-text-muted); font-size:var(--fs-xs); display:flex; justify-content:space-between; gap:var(--space-1);">
        <span>H: ${formatearPrecioInteligente(ticker.high) || '—'}</span>
        <span>L: ${formatearPrecioInteligente(ticker.low) || '—'}</span>
      </div>
      <div style="color:var(--color-text-muted); font-size:var(--fs-xs); margin-top:2px;">Vol 24h: ${formatearVolumen(ticker.quoteVolume)}</div>
    `;
  }

  function obtenerTituloYExplicacion(positivos){
    if(positivos >= 9) return { titulo:'Fuerte impulso alcista', explicacion:'El mercado muestra un impulso alcista generalizado entre los principales activos monitoreados.' };
    if(positivos >= 6) return { titulo:'Mercado mayormente alcista', explicacion:'El mercado muestra una tendencia positiva con la mayoría de los activos principales en terreno alcista.' };
    if(positivos >= 4) return { titulo:'Mercado mixto', explicacion:'El mercado muestra señales mixtas, sin una tendencia clara entre los activos principales.' };
    if(positivos >= 2) return { titulo:'Mercado mayormente bajista', explicacion:'El mercado muestra una tendencia negativa con la mayoría de los activos principales en terreno bajista.' };
    return { titulo:'Fuerte presión bajista', explicacion:'El mercado muestra una presión bajista generalizada entre los principales activos monitoreados.' };
  }

  // Analiza EXCLUSIVAMENTE los 10 activos definidos, solo con datos válidos
  // ya recibidos. priceChangePercent === 0 cuenta como neutral.
  function calcularPulso(){
    const tituloEl = document.getElementById('marketStatusPulsoTitulo');
    if(!tituloEl) return;

    let positivos = 0, negativos = 0, neutrales = 0, sumaVariacion = 0, sumaVolumen = 0, conDatos = 0, conVolumen = 0;
    let ganador = null, perdedor = null;

    ACTIVOS.forEach(a => {
      const t = tickersRecibidos[a.symbol];
      if(!t) return;
      if(t.quoteVolume !== null && t.quoteVolume !== undefined && !isNaN(t.quoteVolume)){ sumaVolumen += t.quoteVolume; conVolumen++; }
      if(t.priceChangePercent === null || t.priceChangePercent === undefined || isNaN(t.priceChangePercent)) return;
      const v = t.priceChangePercent;
      conDatos++;
      sumaVariacion += v;
      if(v > 0) positivos++;
      else if(v < 0) negativos++;
      else neutrales++;
      if(!ganador || v > ganador.variacion) ganador = { abrev: a.abrev, variacion: v };
      if(!perdedor || v < perdedor.variacion) perdedor = { abrev: a.abrev, variacion: v };
    });

    const volumenEl = document.getElementById('marketStatusResumenVolumen');
    if(volumenEl) volumenEl.textContent = conVolumen > 0 ? formatearVolumen(sumaVolumen) : '—';

    if(conDatos === 0){
      tituloEl.textContent = 'Esperando datos...';
      return;
    }

    const { titulo, explicacion } = obtenerTituloYExplicacion(positivos);
    const pctPositivo = Math.round((positivos / conDatos) * 100);
    const pctNegativo = Math.round((negativos / conDatos) * 100);
    const promedio = sumaVariacion / conDatos;

    tituloEl.textContent = titulo;
    const subtituloEl = document.getElementById('marketStatusPulsoSubtitulo');
    if(subtituloEl) subtituloEl.textContent = `${positivos} de ${conDatos} activos en positivo`;

    const barraPosEl = document.getElementById('marketStatusBarraPositiva');
    const barraNegEl = document.getElementById('marketStatusBarraNegativa');
    if(barraPosEl) barraPosEl.style.width = pctPositivo + '%';
    if(barraNegEl) barraNegEl.style.width = pctNegativo + '%';

    const pctPosEl = document.getElementById('marketStatusPctPositivo');
    const pctNegEl = document.getElementById('marketStatusPctNegativo');
    if(pctPosEl) pctPosEl.textContent = pctPositivo + '%';
    if(pctNegEl) pctNegEl.textContent = pctNegativo + '%';

    const explicacionEl = document.getElementById('marketStatusExplicacion');
    if(explicacionEl) explicacionEl.textContent = explicacion;

    const promedioEl = document.getElementById('marketStatusResumenPromedio');
    if(promedioEl) promedioEl.textContent = (promedio >= 0 ? '+' : '') + promedio.toFixed(2) + '%';
    const positivosResEl = document.getElementById('marketStatusResumenPositivos');
    const negativosResEl = document.getElementById('marketStatusResumenNegativos');
    if(positivosResEl) positivosResEl.textContent = positivos;
    if(negativosResEl) negativosResEl.textContent = negativos;

    const ganadorEl = document.getElementById('marketStatusGanador');
    const perdedorEl = document.getElementById('marketStatusPerdedor');
    if(ganadorEl && ganador) ganadorEl.textContent = `${ganador.abrev}  ${ganador.variacion >= 0 ? '+' : ''}${ganador.variacion.toFixed(2)}%`;
    if(perdedorEl && perdedor) perdedorEl.textContent = `${perdedor.abrev}  ${perdedor.variacion >= 0 ? '+' : ''}${perdedor.variacion.toFixed(2)}%`;
  }

  function actualizarEstadoConexion(){
    const el = document.getElementById('marketStatusEstadoConexion');
    if(!el || typeof BinanceMarketData === 'undefined') return;
    const status = BinanceMarketData.getConnectionStatus();
    if(status === 'connected') el.innerHTML = '<span style="color:var(--color-success);">●</span> EN VIVO';
    else if(status === 'connecting') el.textContent = 'Conectando con el mercado...';
    else el.textContent = '⚠️ Datos de mercado temporalmente no disponibles';
  }

  function actualizarFechaHora(){
    const el = document.getElementById('marketStatusFechaHora');
    if(!el) return;
    const ahora = new Date();
    el.textContent = ahora.toLocaleString('es', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' });
  }

  function init(){
    if(inicializado) return;
    if(typeof BinanceMarketData === 'undefined') return;
    inicializado = true;

    crearTarjetasIniciales();
    actualizarEstadoConexion();
    actualizarFechaHora();

    ACTIVOS.forEach((activo, indice) => {
      const posicion = indice + 1;
      renderTarjeta(activo, posicion);

      // MARKET-HYPE-1 — opciones.marketType: 'FUTURES' solo para HYPE
      // (los demás activos, sin esta propiedad, siguen usando SPOT por
      // defecto — comportamiento 100% igual al de antes de este Sprint).
      const opcionesMercado = activo.marketType === 'FUTURES' ? { marketType: 'FUTURES' } : undefined;

      const callback = (ticker) => {
        tickersRecibidos[activo.symbol] = ticker;
        agregarPuntoSparkline(activo.symbol, ticker.price); // solo ticks reales
        renderTarjeta(activo, posicion);
        calcularPulso();
        actualizarEstadoConexion();
        actualizarFechaHora();
      };
      callbacksPorSymbol[activo.symbol] = callback;
      BinanceMarketData.subscribeTicker(activo.symbol, callback, opcionesMercado);

      const cacheado = BinanceMarketData.getTicker(activo.symbol, opcionesMercado);
      if(cacheado){
        tickersRecibidos[activo.symbol] = cacheado;
        agregarPuntoSparkline(activo.symbol, cacheado.price);
        renderTarjeta(activo, posicion);
      }
    });

    calcularPulso();
    intervaloEstadoConexion = setInterval(actualizarEstadoConexion, 5000);
  }

  function destroy(){
    if(!inicializado) return;
    ACTIVOS.forEach(activo => {
      const cb = callbacksPorSymbol[activo.symbol];
      if(cb && typeof BinanceMarketData !== 'undefined'){
        const opcionesMercado = activo.marketType === 'FUTURES' ? { marketType: 'FUTURES' } : undefined;
        BinanceMarketData.unsubscribeTicker(activo.symbol, cb, opcionesMercado);
      }
    });
    if(intervaloEstadoConexion) clearInterval(intervaloEstadoConexion);
    intervaloEstadoConexion = null;
    callbacksPorSymbol = {};
    tickersRecibidos = {};
    historialPrecios = {}; // reinicia la mini-gráfica — nunca conserva "historial" entre sesiones
    inicializado = false;
  }

  global.MarketStatus = { init, destroy, ACTIVOS };

  init();

})(window);
