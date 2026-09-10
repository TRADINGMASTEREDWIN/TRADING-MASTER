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
  // Sprint MARKET-8 — WATCHLIST_INICIAL: valores por defecto, inmutables,
  // usados solo si el usuario nunca guardó una configuración propia (o si
  // el localStorage está corrupto/vacío). `watchlist` (más abajo) es la
  // lista REAL en uso, mutable, persistida en localStorage.
  const WATCHLIST_INICIAL = [
    { symbol:'BTCUSDT',  abrev:'BTC',  nombre:'Bitcoin' },
    { symbol:'ETHUSDT',  abrev:'ETH',  nombre:'Ethereum' },
    { symbol:'BNBUSDT',  abrev:'BNB',  nombre:'BNB' },
    { symbol:'SOLUSDT',  abrev:'SOL',  nombre:'Solana' },
    { symbol:'XRPUSDT',  abrev:'XRP',  nombre:'XRP' },
    { symbol:'DOGEUSDT', abrev:'DOGE', nombre:'Dogecoin' },
    { symbol:'ADAUSDT',  abrev:'ADA',  nombre:'Cardano' },
    { symbol:'TRXUSDT',  abrev:'TRX',  nombre:'TRON' },
    { symbol:'HYPEUSDT', abrev:'HYPE', nombre:'Hyperliquid', marketType:'FUTURES' }, // MARKET-HYPE-1 — no existe como Spot en Binance global
    { symbol:'PAXGUSDT', abrev:'PAXG', nombre:'PAX Gold' } // posición 10, fija (valor inicial — el usuario puede reordenar)
  ];
  const WATCHLIST_STORAGE_KEY = 'tradingMasterWatchlist';
  const WATCHLIST_MAX = 10;

  let watchlist = WATCHLIST_INICIAL.slice(); // lista REAL en uso — mutable

  // Colores decorativos por símbolo — distinción visual únicamente, no son
  // logos oficiales ni ningún dato obtenido de Binance.
  const COLOR_POR_SYMBOL = {
    BTCUSDT:'#F7931A', ETHUSDT:'#627EEA', BNBUSDT:'#F0B90B', SOLUSDT:'#14F195',
    XRPUSDT:'#25A9E0', DOGEUSDT:'#C2A633', ADAUSDT:'#3468D1', TRXUSDT:'#EF0027',
    HYPEUSDT:'#4C6FFF', PAXGUSDT:'#D4AF37'
  };

  // Sprint NAV-MARKET — logos reales, no inventados: repositorio público
  // spothq/cryptocurrency-icons (ampliamente usado, licencia permisiva),
  // servido vía CDN jsDelivr. HYPE (Hyperliquid, listado reciente) puede
  // no existir todavía en ese repositorio — su <img> simplemente fallará
  // y caerá al fallback de iniciales, sin romper nada.
  const LOGO_POR_SYMBOL = {
    BTCUSDT:'btc', ETHUSDT:'eth', BNBUSDT:'bnb', SOLUSDT:'sol',
    XRPUSDT:'xrp', DOGEUSDT:'doge', ADAUSDT:'ada', TRXUSDT:'trx',
    HYPEUSDT:'hype', PAXGUSDT:'paxg'
  };
  function urlLogo(symbol){
    // Sprint MARKET-7 — el Analizador permite buscar CUALQUIER activo, no
    // solo los 10 del Top 10; si el símbolo no está en el mapa curado, se
    // deriva el nombre de archivo directamente del activo base (minúsculas).
    // El <img onerror> ya existente cubre el caso de que ese logo no exista.
    const codigo = LOGO_POR_SYMBOL[symbol] || symbol.replace(/USDT$/i, '').toLowerCase();
    return codigo ? `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${codigo}.png` : null;
  }

  // Sprint MARKET-5 — temporalidad -> { intervalo de Binance, cantidad de velas }.
  // Debe coincidir exactamente con CONFIG_TIMEFRAME de marketData.js.
  // Sprint MARKET-8 — tabla oficial de 7 "períodos de análisis" (valor =
  // solo para confirmar existencia; el detalle real vive en
  // marketData.js:CONFIG_TIMEFRAME). Debe coincidir EXACTAMENTE con esa lista.
  const CONFIG_TIMEFRAME = { '1M': 1, '5M': 1, '15M': 1, '1H': 60, '4H': 48, '24H': 96, '7D': 168 };
  const TIMEFRAME_POR_DEFECTO = '1H';

  let inicializado = false;
  let callbacksPorSymbol = {};
  let tickersRecibidos = {};
  let historialPrecios = {};     // symbol -> array de precios (histórico real inicial + último punto actualizado en vivo)
  let historicoCompleto = {};    // symbol -> [{time, price, quoteVolume}] — Sprint MARKET-6: se reutiliza para Pulso/Resumen, cero consultas nuevas
  let cargandoHistorico = {};    // symbol -> boolean, evita solicitudes duplicadas simultáneas
  let historicoConError = {};    // symbol -> boolean
  let timeframeActual = TIMEFRAME_POR_DEFECTO; // período de mercado: Watchlist/Pulso/Resumen
  const TIMEFRAME_GRAFICO_POR_DEFECTO = '5m';
  const CONFIG_TIMEFRAME_GRAFICO = {
    '1m':  { etiqueta:'1m', descripcion:'velas de 1 minuto' },
    '5m':  { etiqueta:'5m', descripcion:'velas de 5 minutos' },
    '15m': { etiqueta:'15m', descripcion:'velas de 15 minutos' },
    '30m': { etiqueta:'30m', descripcion:'velas de 30 minutos' },
    '1H':  { etiqueta:'1H', descripcion:'velas de 1 hora' },
    '4H':  { etiqueta:'4H', descripcion:'velas de 4 horas' },
    '1D':  { etiqueta:'1D', descripcion:'velas de 1 día' },
    '1W':  { etiqueta:'1W', descripcion:'velas de 1 semana' }
  };
  let analizadorTimeframeActual = TIMEFRAME_GRAFICO_POR_DEFECTO;
  let intervaloEstadoConexion = null;
  let intervaloSesiones = null;

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

  // El precio en vivo actualiza ÚNICAMENTE el extremo derecho (último
  // punto) — no agrega puntos nuevos indefinidamente, para que la ventana
  // siga representando exactamente la temporalidad seleccionada hasta el
  // próximo refresco de historial (cambio de temporalidad).
  function actualizarUltimoPuntoSparkline(symbol, precio){
    if(precio === null || precio === undefined || isNaN(precio)) return;
    if(!historialPrecios[symbol] || historialPrecios[symbol].length === 0){
      historialPrecios[symbol] = [precio]; // sin histórico todavía -> al menos un punto real
      return;
    }
    historialPrecios[symbol][historialPrecios[symbol].length - 1] = precio;
  }

  // Color del rendimiento DENTRO de la temporalidad seleccionada
  // (inicio vs. fin de historialPrecios) — nunca la variación 24h del
  // ticker, que es un dato distinto y se sigue mostrando aparte.
  function calcularColorPeriodo(symbol){
    const puntos = historialPrecios[symbol];
    if(!puntos || puntos.length < 2) return 'var(--color-text-muted)';
    const inicio = puntos[0];
    const fin = puntos[puntos.length - 1];
    if(fin > inicio) return 'var(--color-success)';
    if(fin < inicio) return 'var(--color-danger)';
    return 'var(--color-text-muted)';
  }

  // Sparkline construida ÚNICAMENTE con puntos reales (histórico real de
  // Binance + último punto en vivo). Con menos de 2 puntos, SVG vacío.
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

  function opcionesMercadoDe(activo){
    return activo.marketType === 'FUTURES' ? { marketType: 'FUTURES' } : undefined;
  }

  // Sprint MARKET-5 — carga el historial real (REST, vía BinanceMarketData.
  // getHistoricalPrices, sin WebSockets nuevos) para UN activo, en la
  // temporalidad actual. Nunca solicitudes duplicadas simultáneas para el
  // mismo símbolo. Un fallo aquí NUNCA rompe otras tarjetas ni los precios
  // en vivo — solo esa mini-gráfica muestra "Historial no disponible".
  // Sprint MARKET-5/6 — carga el historial real (REST, sin WebSockets
  // nuevos) para UN activo. MARKET-6: ya NO borra ni oculta la sparkline
  // anterior mientras carga (PARTE 10 — "mantener información anterior
  // mientras carga") — solo se reemplaza cuando el nuevo historial llega
  // con éxito. historicoCompleto guarda {time, price, quoteVolume} para
  // que Pulso/Resumen lo reutilicen SIN ninguna consulta adicional.
  async function cargarHistoricoActivo(activo, posicion){
    if(typeof BinanceMarketData === 'undefined' || typeof BinanceMarketData.getHistoricalPrices !== 'function') return;
    if(cargandoHistorico[activo.symbol]) return;

    cargandoHistorico[activo.symbol] = true;
    actualizarIndicadorActualizando();

    try{
      const datos = await BinanceMarketData.getHistoricalPrices(activo.symbol, timeframeActual, opcionesMercadoDe(activo));
      historicoCompleto[activo.symbol] = datos;
      historialPrecios[activo.symbol] = datos.map(d => d.price);
      historicoConError[activo.symbol] = false;
    }catch(error){
      console.error(`MarketStatus: no se pudo cargar el histórico de ${activo.symbol} (${timeframeActual}):`, error);
      historicoConError[activo.symbol] = true;
      // PARTE 11 — no se borra historialPrecios/historicoCompleto existente: los datos válidos previos permanecen visibles
    }finally{
      cargandoHistorico[activo.symbol] = false;
      renderTarjeta(activo, posicion);
      calcularPulso(); // recálculo progresivo — cada activo actualiza Pulso/Resumen apenas llega, sin esperar a los 10
      actualizarIndicadorActualizando();
    }
  }

  function crearTarjetasIniciales(){
    const contenedor = document.getElementById('marketStatusCards');
    if(!contenedor) return;
    contenedor.innerHTML = watchlist.map(a =>
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
    // Sprint NAV-MARKET — logo real con fallback seguro: las iniciales
    // quedan SIEMPRE en el DOM debajo; el <img> se superpone solo si carga
    // con éxito. Si falla (onerror), se oculta y las iniciales quedan
    // visibles — nunca un ícono de imagen rota, nunca se rompe el layout.
    const logoUrl = urlLogo(activo.symbol);
    const imgLogo = logoUrl
      ? `<img src="${logoUrl}" alt="${activo.abrev}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none';">`
      : '';
    const iconoCirculo = `<div style="width:32px; height:32px; border-radius:50%; background:${color}26; display:flex; align-items:center; justify-content:center; flex-shrink:0; position:relative; overflow:hidden;"><span style="font-size:10px; font-weight:700; color:${color};">${activo.abrev.slice(0,2)}</span>${imgLogo}</div>`;

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
    const variacion = ticker.priceChangePercent; // variación 24h del ticker — se sigue mostrando tal cual, independiente del color de la sparkline
    let variacionHtml = '—', colorVar = 'var(--color-text-muted)';
    if(variacion !== null && variacion !== undefined && !isNaN(variacion)){
      if(variacion > 0){ variacionHtml = `▲ +${variacion.toFixed(2)}%`; colorVar = 'var(--color-success)'; }
      else if(variacion < 0){ variacionHtml = `▼ ${variacion.toFixed(2)}%`; colorVar = 'var(--color-danger)'; }
      else{ variacionHtml = `● 0.00%`; }
    }

    // Sprint MARKET-5/6 — la sparkline usa el color del RENDIMIENTO DENTRO
    // DE LA TEMPORALIDAD SELECCIONADA (inicio vs. fin del historial), nunca
    // la variación 24h de arriba. MARKET-6: ya no se oculta con "Cargando..."
    // durante una recarga — el historial anterior permanece visible hasta
    // que el nuevo llegue (indicador global discreto cerca del selector).
    let sparklineHtml;
    if(historicoConError[activo.symbol] && (!historialPrecios[activo.symbol] || historialPrecios[activo.symbol].length < 2)){
      sparklineHtml = `<div style="height:28px; display:flex; align-items:center; font-size:var(--fs-xs); color:var(--color-text-muted);">Historial no disponible</div>`;
    }else if(!historialPrecios[activo.symbol] || historialPrecios[activo.symbol].length < 2){
      sparklineHtml = `<div style="height:28px; display:flex; align-items:center; font-size:var(--fs-xs); color:var(--color-text-muted);">Cargando...</div>`;
    }else{
      sparklineHtml = renderSparklineSVG(activo.symbol, calcularColorPeriodo(activo.symbol));
    }

    cardEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">${badgePosicion}${iconoCirculo}</div>
      <div style="margin-top:var(--space-2); font-weight:700;">${activo.abrev}</div>
      <div style="font-size:var(--fs-xs); color:var(--color-text-muted); margin-bottom:var(--space-1);">${activo.nombre}</div>
      <div style="font-size:var(--fs-lg); font-weight:700;">${precioTxt}</div>
      <div style="color:${colorVar}; font-size:var(--fs-sm); font-weight:600;">${variacionHtml}</div>
      <div style="margin: var(--space-1) 0;">${sparklineHtml}</div>
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

  // Sprint MARKET-6 — variación DENTRO del período seleccionado: primer
  // precio del historial vs. el último disponible (que ya se actualiza en
  // vivo mediante actualizarUltimoPuntoSparkline). Reutiliza exactamente
  // el mismo array que ya usa la sparkline — cero cálculos redundantes.
  function calcularVariacionPeriodo(symbol){
    const puntos = historialPrecios[symbol];
    if(!puntos || puntos.length < 2) return null;
    const inicio = puntos[0];
    const fin = puntos[puntos.length - 1];
    if(!inicio) return null; // evita división por cero
    return ((fin - inicio) / inicio) * 100;
  }

  // Analiza EXCLUSIVAMENTE los 10 activos definidos. Sprint MARKET-6: TODO
  // el cálculo (positivos/negativos/promedio/ganador/perdedor/volumen) usa
  // ahora la temporalidad seleccionada, reutilizando historicoCompleto ya
  // descargado para las sparklines — nunca priceChangePercent (24h) del
  // ticker, y nunca una consulta nueva.
  // Sprint MARKET-8 — estado de 3 niveles basado EXCLUSIVAMENTE en amplitud
  // (cuántos suben/bajan), nunca en el promedio — así se evita el caso del
  // brief: 8 bajan y 2 suben nunca puede leerse como "alcista" aunque el
  // promedio diera positivo por la magnitud de esos 2.
  function clasificarEstadoPulso(positivos, conDatos){
    if(conDatos === 0) return { estado: 'Esperando datos...', color: 'var(--color-text-muted)' };
    const pct = positivos / conDatos;
    if(pct >= 0.6) return { estado: '🟢 Presión alcista', color: 'var(--color-success)' };
    if(pct <= 0.4) return { estado: '🔴 Presión bajista', color: 'var(--color-danger)' };
    return { estado: '🟡 Mercado mixto / neutral', color: '#EAB308' };
  }

  function calcularPulso(){
    const tituloEl = document.getElementById('marketStatusPulsoTitulo');
    if(!tituloEl) return;

    let positivos = 0, negativos = 0, neutrales = 0, sumaVariacion = 0, sumaVolumen = 0, conDatos = 0, conVolumen = 0;
    let ganador = null, perdedor = null;

    watchlist.forEach(a => {
      const completo = historicoCompleto[a.symbol];
      if(completo && completo.length > 0){
        const volPeriodo = completo.reduce((acc, punto) => acc + (punto.quoteVolume || 0), 0);
        if(volPeriodo > 0){ sumaVolumen += volPeriodo; conVolumen++; }
      }

      const variacion = calcularVariacionPeriodo(a.symbol);
      if(variacion === null || isNaN(variacion)) return;
      conDatos++;
      sumaVariacion += variacion;
      if(variacion > 0) positivos++;
      else if(variacion < 0) negativos++;
      else neutrales++;
      if(!ganador || variacion > ganador.variacion) ganador = { abrev: a.abrev, variacion };
      if(!perdedor || variacion < perdedor.variacion) perdedor = { abrev: a.abrev, variacion };
    });

    const volumenEl = document.getElementById('marketStatusResumenVolumen');
    if(volumenEl) volumenEl.textContent = conVolumen > 0 ? formatearVolumen(sumaVolumen) : '—';

    if(conDatos === 0){
      tituloEl.textContent = 'Esperando datos...';
      return;
    }

    const { titulo, explicacion } = obtenerTituloYExplicacion(positivos);
    const { estado, color } = clasificarEstadoPulso(positivos, conDatos); // PARTE 19/20 — dos dimensiones: amplitud decide el estado
    const pctPositivo = Math.round((positivos / conDatos) * 100);
    const pctNegativo = Math.round((negativos / conDatos) * 100);
    const promedio = sumaVariacion / conDatos;

    tituloEl.textContent = titulo;
    const estadoEl = document.getElementById('marketStatusPulsoEstado');
    if(estadoEl){ estadoEl.textContent = estado; estadoEl.style.color = color; }
    const subtituloEl = document.getElementById('marketStatusPulsoSubtitulo');
    if(subtituloEl) subtituloEl.textContent = `${positivos} de ${conDatos} activos en positivo · ${timeframeActual}`;

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

    // Sprint MARKET-8 — PARTE 21: etiquetas correctas según el caso.
    // Nunca "Mayor ganador: TRX -0.06%" cuando en realidad TODOS bajaron.
    const ganadorLabelEl = document.getElementById('marketStatusGanadorLabel');
    const perdedorLabelEl = document.getElementById('marketStatusPerdedorLabel');
    const ganadorEl = document.getElementById('marketStatusGanador');
    const perdedorEl = document.getElementById('marketStatusPerdedor');

    if(negativos === 0 && positivos > 0){
      // Todos positivos (o positivos+neutrales): "Mayor ganador" / "Menor subida"
      if(ganadorLabelEl) ganadorLabelEl.textContent = '🏆 Mayor ganador';
      if(perdedorLabelEl) perdedorLabelEl.textContent = '📉 Menor subida';
    }else if(positivos === 0 && negativos > 0){
      // Todos negativos (o negativos+neutrales): "Menor caída" / "Mayor caída"
      if(ganadorLabelEl) ganadorLabelEl.textContent = '📉 Menor caída';
      if(perdedorLabelEl) perdedorLabelEl.textContent = '📉 Mayor caída';
    }else{
      if(ganadorLabelEl) ganadorLabelEl.textContent = '🏆 Mayor ganador';
      if(perdedorLabelEl) perdedorLabelEl.textContent = '📉 Mayor perdedor';
    }
    if(ganadorEl && ganador) ganadorEl.textContent = `${ganador.abrev}  ${ganador.variacion >= 0 ? '+' : ''}${ganador.variacion.toFixed(2)}%`;
    if(perdedorEl && perdedor) perdedorEl.textContent = `${perdedor.abrev}  ${perdedor.variacion >= 0 ? '+' : ''}${perdedor.variacion.toFixed(2)}%`;

    // PARTE 23 — Resumen: "Mejor/peor comportamiento" reutiliza exactamente
    // ganador/perdedor ya calculados — cero cálculos redundantes.
    const mejorEl = document.getElementById('marketStatusResumenMejor');
    const peorEl = document.getElementById('marketStatusResumenPeor');
    if(mejorEl && ganador) mejorEl.textContent = `${ganador.abrev} ${ganador.variacion >= 0 ? '+' : ''}${ganador.variacion.toFixed(2)}%`;
    if(peorEl && perdedor) peorEl.textContent = `${perdedor.abrev} ${perdedor.variacion >= 0 ? '+' : ''}${perdedor.variacion.toFixed(2)}%`;
  }

  // Sprint MARKET-8 — PARTE 22: fila histórica 1M/5M/.../7D del Pulso.
  // Se calcula UNA VEZ (al iniciar o al guardar una watchlist nueva), NUNCA
  // en cada tick — reutiliza el mismo caché de getHistoricalPrices() (TTL
  // ~1 min) ya usado por las tarjetas/gráfico, sin peticiones adicionales
  // más allá de las que ese caché ya necesita.
  async function calcularPulsoHistoricoMultitemporal(){
    if(typeof BinanceMarketData === 'undefined' || typeof BinanceMarketData.getHistoricalPrices !== 'function') return;
    const timeframes = Object.keys(CONFIG_TIMEFRAME);
    for(const tf of timeframes){
      let suma = 0, cuenta = 0;
      for(const activo of watchlist){
        try{
          const datos = await BinanceMarketData.getHistoricalPrices(activo.symbol, tf, opcionesMercadoDe(activo));
          if(datos && datos.length >= 2 && datos[0].price){
            suma += ((datos[datos.length-1].price - datos[0].price) / datos[0].price) * 100;
            cuenta++;
          }
        }catch(e){ /* un fallo puntual de un activo/timeframe no detiene el resto */ }
      }
      const promedio = cuenta > 0 ? (suma / cuenta) : null;
      const el = document.getElementById('marketStatusPulsoHist-' + tf);
      if(el) el.textContent = (promedio === null) ? '—' : (promedio >= 0 ? '+' : '') + promedio.toFixed(2) + '%';
    }
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

  function posicionDeSymbol(symbol){
    const idx = watchlist.findIndex(a => a.symbol === symbol);
    return idx === -1 ? null : idx + 1;
  }

  // Sprint MARKET-5 — cambia la temporalidad global: recarga historial
  // real para los 10 activos (REST) sin tocar ninguna suscripción de
  // WebSocket — los precios en vivo siguen exactamente igual.
  function cambiarTimeframe(nuevoTf){
    // Selector de PERÍODO DE MERCADO. Deliberadamente NO modifica el
    // timeframe de velas del Analizador. Ambos controles son independientes.
    const periodosPermitidos = new Set(['1H','4H','24H','7D']);
    if(!periodosPermitidos.has(nuevoTf) || nuevoTf === timeframeActual) return;
    timeframeActual = nuevoTf;
    actualizarBotonesTimeframe();
    actualizarLineaVelas();
    actualizarTituloResumen();
    watchlist.forEach(activo => {
      cargarHistoricoActivo(activo, posicionDeSymbol(activo.symbol));
    });
  }

  function actualizarBotonesTimeframe(){
    ['1H','4H','24H','7D'].forEach(tf => {
      const btn = document.getElementById('marketStatusTf-' + tf);
      if(!btn) return;
      const activo = tf === timeframeActual;
      btn.style.background = activo ? 'var(--color-primary)' : 'transparent';
      btn.style.color = activo ? '#fff' : 'var(--color-text-muted)';
    });
  }

  // Sprint MARKET-6 — PARTE 4/9: línea discreta que aclara qué velas usa
  // la temporalidad activa. Opción visual preferida del brief.
  const DESCRIPCION_TIMEFRAME = {
    '1H':  'Última 1 hora · cálculo del Pulso/Resumen',
    '4H':  'Últimas 4 horas · cálculo del Pulso/Resumen',
    '24H': 'Últimas 24 horas · cálculo del Pulso/Resumen',
    '7D':  'Últimos 7 días · cálculo del Pulso/Resumen'
  };

  function actualizarLineaVelas(){
    const el = document.getElementById('marketStatusVelasInfo');
    if(el) el.textContent = '🕯 ' + (DESCRIPCION_TIMEFRAME[timeframeActual] || '');
  }

  // Sprint MARKET-6 — PARTE 2C: el panel "Resumen" refleja explícitamente
  // la temporalidad activa en su título y en las etiquetas de variación/
  // volumen, para nunca mostrar una etiqueta "24h" incorrecta.
  function actualizarTituloResumen(){
    const tituloEl = document.getElementById('marketStatusResumenTitulo');
    if(tituloEl) tituloEl.textContent = `📈 Resumen ${timeframeActual} (Top 10)`;
    const varLabelEl = document.getElementById('marketStatusVarPromLabel');
    if(varLabelEl) varLabelEl.textContent = `Variación promedio ${timeframeActual}`;
    const volLabelEl = document.getElementById('marketStatusVolLabel');
    if(volLabelEl) volLabelEl.textContent = `Volumen ${timeframeActual}`;
  }

  // Sprint MARKET-6 — PARTE 10: indicador discreto global (no oculta datos
  // válidos existentes) mientras se recarga historial de al menos 1 activo.
  function actualizarIndicadorActualizando(){
    const el = document.getElementById('marketStatusActualizando');
    if(!el) return;
    const hayCargaEnCurso = Object.values(cargandoHistorico).some(v => v === true);
    el.textContent = hayCargaEnCurso ? `Actualizando ${timeframeActual}...` : '';
  }

  function attachSelectorTimeframe(){
    Object.keys(CONFIG_TIMEFRAME).forEach(tf => {
      const btn = document.getElementById('marketStatusTf-' + tf);
      if(btn) btn.addEventListener('click', () => cambiarTimeframe(tf));
    });
    actualizarBotonesTimeframe();
  }

  /* ============================================================
     MARKET-10 — Sesiones de mercado
     Referencia visual de liquidez global. Usa zonas horarias reales,
     incluyendo DST para Nueva York, y actualiza la cuenta regresiva cada segundo.
     ============================================================ */
  const SESIONES_MERCADO = [
    { id:'nyse', icono:'🇺🇸', nombre:'Wall Street', mercado:'NYSE · sesión principal', timezone:'America/New_York', horario:'09:30–16:00', sesiones:[{apertura:[9,30],cierre:[16,0]}] },
    { id:'tokio', icono:'🇯🇵', nombre:'Tokio', mercado:'Tokyo Stock Exchange · sesión principal', timezone:'Asia/Tokyo', horario:'09:00–11:30 · 12:30–15:30', sesiones:[{apertura:[9,0],cierre:[11,30]},{apertura:[12,30],cierre:[15,30]}] }
  ];

  function partesZona(fecha, timezone){
    const partes=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(fecha);
    const out={}; partes.forEach(p=>{if(p.type!=='literal') out[p.type]=p.value;});
    return {year:Number(out.year),month:Number(out.month),day:Number(out.day),hour:Number(out.hour),minute:Number(out.minute),second:Number(out.second),weekday:out.weekday};
  }

  function utcDesdeZona(year,month,day,hour,minute,second,timezone){
    let guess=new Date(Date.UTC(year,month-1,day,hour,minute,second||0));
    for(let i=0;i<4;i++){
      const p=partesZona(guess,timezone);
      const representado=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
      const objetivo=Date.UTC(year,month-1,day,hour,minute,second||0);
      guess=new Date(guess.getTime()+(objetivo-representado));
    }
    return guess;
  }

  function sumarDiasCalendario(year,month,day,dias){
    const d=new Date(Date.UTC(year,month-1,day+dias));
    return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
  }

  function esFinDeSemana(year,month,day){
    const dow=new Date(Date.UTC(year,month-1,day)).getUTCDay();
    return dow===0||dow===6;
  }

  function fechaPascua(year){
    const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
    return {year,month,day};
  }
  function sumarDiasFecha(fecha,dias){ const d=new Date(Date.UTC(fecha.year,fecha.month-1,fecha.day+dias)); return {year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()}; }
  function claveFecha(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

  function esFeriadoNYSE(year,month,day){
    const k=claveFecha(year,month,day), p=fechaPascua(year), viernes=sumarDiasFecha(p,-2);
    const lunesDeMes=(mes)=>{ const d=new Date(Date.UTC(year,mes,1)); while(d.getUTCDay()!==1) d.setUTCDate(d.getUTCDate()+1); return d; };
    const ultimoLunes=(mes)=>{ const d=new Date(Date.UTC(year,mes+1,0)); while(d.getUTCDay()!==1) d.setUTCDate(d.getUTCDate()-1); return d; };
    const cuartoJueves=(()=>{const d=new Date(Date.UTC(year,10,1)); while(d.getUTCDay()!==4) d.setUTCDate(d.getUTCDate()+1); d.setUTCDate(d.getUTCDate()+21); return d;})();
    const observado=(mes,dia)=>{ const d=new Date(Date.UTC(year,mes,dia)); if(d.getUTCDay()===6)d.setUTCDate(d.getUTCDate()-1); if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1); return claveFecha(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()); };
    const lista=new Set([
      observado(0,1), observado(11,25),
      observado(6,4),
      ...(year>=2022?[observado(5,19)]:[]),
      claveFecha(year,viernes.year===year?viernes.month:2,viernes.day),
      claveFecha(year,ultimoLunes(4).getUTCMonth()+1,ultimoLunes(4).getUTCDate()),
      claveFecha(year,cuartoJueves.getUTCMonth()+1,cuartoJueves.getUTCDate()),
      claveFecha(year,lunesDeMes(0).getUTCMonth()+1,lunesDeMes(0).getUTCDate()+14),
      claveFecha(year,lunesDeMes(1).getUTCMonth()+1,lunesDeMes(1).getUTCDate()+14),
      claveFecha(year,ultimoLunes(8).getUTCMonth()+1,ultimoLunes(8).getUTCDate())
    ]);
    return lista.has(k);
  }

  function obtenerEstadoSesion(sesion,ahora){
    const p=partesZona(ahora,sesion.timezone), candidatos=[];
    for(let delta=0;delta<=7;delta++){
      const fecha=sumarDiasCalendario(p.year,p.month,p.day,delta);
      if(esFinDeSemana(fecha.year,fecha.month,fecha.day)) continue;
      if(sesion.id==='nyse' && esFeriadoNYSE(fecha.year,fecha.month,fecha.day)) continue;
      for(const bloque of sesion.sesiones){
        const inicio=utcDesdeZona(fecha.year,fecha.month,fecha.day,bloque.apertura[0],bloque.apertura[1],0,sesion.timezone);
        const fin=utcDesdeZona(fecha.year,fecha.month,fecha.day,bloque.cierre[0],bloque.cierre[1],0,sesion.timezone);
        candidatos.push({inicio,fin,fecha});
      }
    }
    const actual=candidatos.find(x=>ahora>=x.inicio&&ahora<x.fin);
    if(actual) return {abierto:true,etiqueta:'ABIERTO',color:'var(--color-success)',fondo:'var(--color-success-soft)',objetivo:actual.fin,accion:'Cierra en'};
    const siguiente=candidatos.find(x=>x.inicio>ahora);
    return {abierto:false,etiqueta:'CERRADO',color:'var(--color-text-muted)',fondo:'var(--color-bg)',objetivo:siguiente?siguiente.inicio:null,accion:'Abre en'};
  }

  function formatoCuentaRegresiva(ms){
    if(ms<=0)return '00:00:00';
    const total=Math.floor(ms/1000),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
  function formatoHoraZona(fecha,timezone){ return new Intl.DateTimeFormat('es-PA',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(fecha); }

  function actualizarSesionesMercado(){
    const contenedor=document.getElementById('marketSessionsCards'); if(!contenedor)return;
    const ahora=new Date(), localEl=document.getElementById('marketSessionsLocalTime');
    if(localEl) localEl.textContent=`Hora Panamá · ${new Intl.DateTimeFormat('es-PA',{timeZone:'America/Panama',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(ahora)}`;
    contenedor.innerHTML=SESIONES_MERCADO.map(sesion=>{
      const estado=obtenerEstadoSesion(sesion,ahora), countdown=estado.objetivo?formatoCuentaRegresiva(estado.objetivo-ahora):'—', hora=estado.objetivo?formatoHoraZona(estado.objetivo,sesion.timezone):'—';
      return `<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);border:1px solid var(--color-border);border-radius:var(--radius-md);background:var(--color-surface, var(--color-bg));">
        <div style="font-size:1.8rem;line-height:1;">${sesion.icono}</div>
        <div style="min-width:0;flex:1;">
          <div style="display:flex;align-items:center;gap:var(--space-2);flex-wrap:wrap;"><strong>${sesion.nombre}</strong><span style="font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:${estado.fondo};color:${estado.color};border:1px solid var(--color-border);">${estado.etiqueta}</span></div>
          <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:2px;">${sesion.mercado}</div>
          <div style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-top:5px;">Horario: ${sesion.horario} · Próximo evento: ${hora}</div>
        </div>
        <div style="text-align:right;min-width:108px;"><div style="font-size:10px;color:var(--color-text-muted);">${estado.accion}</div><div style="font-size:1.25rem;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:.02em;">${countdown}</div></div>
      </div>`;
    }).join('');
  }

  function init(){
    if(inicializado) return;
    if(typeof BinanceMarketData === 'undefined') return;
    inicializado = true;
    timeframeActual = TIMEFRAME_POR_DEFECTO; // PASO — la temporalidad inicial siempre es 1H

    // Sprint MARKET-8 — carga la watchlist guardada; si no existe o está
    // corrupta, usa WATCHLIST_INICIAL (los 10 valores por defecto de siempre).
    const guardada = cargarWatchlistLocalStorage();
    watchlist = guardada || WATCHLIST_INICIAL.slice();

    crearTarjetasIniciales();
    actualizarEstadoConexion();
    actualizarFechaHora();
    actualizarSesionesMercado();
    attachSelectorTimeframe();
    attachEditorWatchlistListeners();
    actualizarLineaVelas();
    actualizarTituloResumen();

    watchlist.forEach((activo, indice) => {
      const posicion = indice + 1;
      renderTarjeta(activo, posicion);

      // MARKET-HYPE-1 — opciones.marketType: 'FUTURES' solo para HYPE
      // (los demás activos, sin esta propiedad, siguen usando SPOT por
      // defecto — comportamiento 100% igual al de antes de este Sprint).
      const opcionesMercado = opcionesMercadoDe(activo);

      const callback = (ticker) => {
        tickersRecibidos[activo.symbol] = ticker;
        actualizarUltimoPuntoSparkline(activo.symbol, ticker.price); // solo actualiza el extremo derecho, con datos reales
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
        renderTarjeta(activo, posicion);
      }

      cargarHistoricoActivo(activo, posicion); // Sprint MARKET-5 — historial real inmediato, en paralelo al ticker en vivo
    });

    calcularPulso();
    intervaloEstadoConexion = setInterval(actualizarEstadoConexion, 5000);
    intervaloSesiones = setInterval(actualizarSesionesMercado, 1000);
    iniciarAnalizador(); // Sprint MARKET-7 — independiente del Top 10, inicializado en paralelo
    calcularPulsoHistoricoMultitemporal(); // Sprint MARKET-8 — una sola vez, no en cada tick
  }

  function destroy(){
    if(!inicializado) return;
    destruirAnalizador(); // Sprint MARKET-7 — limpia su propio listener/gráfico antes de lo demás
    watchlist.forEach(activo => {
      const cb = callbacksPorSymbol[activo.symbol];
      if(cb && typeof BinanceMarketData !== 'undefined'){
        const opcionesMercado = activo.marketType === 'FUTURES' ? { marketType: 'FUTURES' } : undefined;
        BinanceMarketData.unsubscribeTicker(activo.symbol, cb, opcionesMercado);
      }
    });
    if(intervaloEstadoConexion) clearInterval(intervaloEstadoConexion);
    if(intervaloSesiones) clearInterval(intervaloSesiones);
    intervaloEstadoConexion = null;
    intervaloSesiones = null;
    callbacksPorSymbol = {};
    tickersRecibidos = {};
    historialPrecios = {}; // reinicia la mini-gráfica — nunca conserva "historial" entre sesiones
    historicoCompleto = {};
    cargandoHistorico = {};
    historicoConError = {};
    timeframeActual = TIMEFRAME_POR_DEFECTO;
    inicializado = false;
  }

  /* ============================================================
     Sprint MARKET-7 — Analizador de Activos. Independiente del Top 10/
     Pulso/Resumen (nunca los modifica). Reutiliza exclusivamente:
       BinanceMarketData.search()/loadCatalog()   -> buscador
       BinanceMarketData.getHistoricalPrices()    -> gráfico + datos del período
       BinanceMarketData.subscribeTicker()        -> precio en vivo
     Ningún WebSocket nuevo, ningún catálogo nuevo. El gráfico (Lightweight
     Charts) solo DIBUJA — los datos son siempre de Binance.
     ============================================================ */
  let analizadorSymbolActual = null;
  let analizadorMarketType = 'SPOT';
  let analizadorCallbackTicker = null;
  let analizadorChart = null;
  let analizadorSerie = null;
  let analizadorSerieVolumen = null; // Sprint MARKET-8
  let analizadorUltimaVela = null;
  let analizadorCargando = false;
  let analizadorConError = false;

  function opcionesAnalizador(){
    return analizadorMarketType === 'FUTURES' ? { marketType: 'FUTURES' } : undefined;
  }

  function manejarBusquedaAnalizador(){
    const inputEl = document.getElementById('analizadorBuscador');
    const resultadosEl = document.getElementById('analizadorResultados');
    if(!inputEl || !resultadosEl) return;

    const query = inputEl.value.trim();
    if(!query || typeof BinanceMarketData === 'undefined'){
      resultadosEl.style.display = 'none';
      resultadosEl.innerHTML = '';
      return;
    }

    if(BinanceMarketData.getCatalog().length === 0){
      BinanceMarketData.loadCatalog().then(() => manejarBusquedaAnalizador()).catch(() => {});
      return;
    }

    const resultados = BinanceMarketData.search(query).slice(0, 15); // ya prioriza USDT — reutilizado tal cual, sin reordenar de nuevo
    if(resultados.length === 0){
      resultadosEl.style.display = '';
      resultadosEl.innerHTML = `<div style="padding:var(--space-2); color:var(--color-text-muted); font-size:var(--fs-sm);">Sin resultados para "${escapeHtml(query)}".</div>`;
      return;
    }

    resultadosEl.style.display = '';
    resultadosEl.innerHTML = resultados.map(r =>
      `<div class="analizador-resultado-item" data-symbol="${escapeHtml(r.symbol)}" data-nombre="${escapeHtml(r.baseAsset)}" style="padding:var(--space-2); cursor:pointer; border-bottom:1px solid var(--color-border); display:flex; justify-content:space-between;">
        <strong>${escapeHtml(r.symbol)}</strong><span style="color:var(--color-text-muted); font-size:var(--fs-sm);">${escapeHtml(r.baseAsset)}/${escapeHtml(r.quoteAsset)}</span>
      </div>`
    ).join('');
  }

  function actualizarCabeceraAnalizador(symbol, nombreBase){
    const abrev = symbol.replace(/USDT$/, '');
    const simboloEl = document.getElementById('analizadorSimbolo');
    const nombreEl = document.getElementById('analizadorNombre');
    const parEl = document.getElementById('analizadorPar');
    if(simboloEl) simboloEl.textContent = abrev;
    if(nombreEl) nombreEl.textContent = nombreBase || abrev;
    if(parEl) parEl.textContent = `${abrev}/USDT`;

    // Sprint MARKET-7 — PARTE 14: mismo sistema de logos ya existente
    // (urlLogo/COLOR_POR_SYMBOL), nunca un segundo sistema.
    const logoWrapEl = document.getElementById('analizadorLogo');
    if(logoWrapEl){
      const color = COLOR_POR_SYMBOL[symbol] || 'var(--color-text-muted)';
      const logoUrl = urlLogo(symbol);
      const imgLogo = logoUrl
        ? `<img src="${logoUrl}" alt="${abrev}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:50%;" onerror="this.style.display='none';">`
        : '';
      logoWrapEl.innerHTML = `<div style="width:40px; height:40px; border-radius:50%; background:${color}26; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden; flex-shrink:0;"><span style="font-size:12px; font-weight:700; color:${color};">${abrev.slice(0,2)}</span>${imgLogo}</div>`;
    }
  }

  function actualizarPrecioVivoAnalizador(ticker){
    const precioEl = document.getElementById('analizadorPrecio');
    const estadoEl = document.getElementById('analizadorEstado');
    if(precioEl) precioEl.textContent = formatearPrecioInteligente(ticker.price) || '—';
    if(estadoEl) estadoEl.innerHTML = '<span style="color:var(--color-success);">●</span> EN VIVO';

    // PARTE 10 — actualiza el ÚLTIMO candle existente, nunca agrega uno nuevo.
    if(analizadorSerie && analizadorUltimaVela && ticker.price !== null && !isNaN(ticker.price)){
      analizadorUltimaVela = {
        time: analizadorUltimaVela.time,
        open: analizadorUltimaVela.open,
        high: Math.max(analizadorUltimaVela.high, ticker.price),
        low: Math.min(analizadorUltimaVela.low, ticker.price),
        close: ticker.price
      };
      analizadorSerie.update(analizadorUltimaVela);
    }
  }

  function actualizarBotonesTimeframeAnalizador(){
    Object.keys(CONFIG_TIMEFRAME_GRAFICO).forEach(tf => {
      const btn = document.getElementById('analizadorTf-' + tf);
      if(!btn) return;
      const activo = tf === analizadorTimeframeActual;
      btn.style.background = activo ? 'var(--color-primary)' : 'transparent';
      btn.style.color = activo ? '#fff' : 'var(--color-text-muted)';
      btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
  }

  async function cambiarTimeframeAnalizador(nuevoTf){
    if(!CONFIG_TIMEFRAME_GRAFICO[nuevoTf] || nuevoTf === analizadorTimeframeActual) return;
    analizadorTimeframeActual = nuevoTf;
    actualizarBotonesTimeframeAnalizador();
    actualizarLineaVelasAnalizador();
    await cargarGraficoAnalizador();
  }

  function actualizarLineaVelasAnalizador(){
    const el = document.getElementById('analizadorVelasInfo');
    const config = CONFIG_TIMEFRAME_GRAFICO[analizadorTimeframeActual];
    if(el) el.textContent = `🕯 Gráfico: ${analizadorTimeframeActual} · ${config ? config.descripcion : ''} · 200 velas históricas`;
  }

  function actualizarEstadoCargaAnalizador(){
    const el = document.getElementById('analizadorEstadoCarga');
    if(!el) return;
    if(analizadorCargando){
      el.style.display = 'flex';
      el.innerHTML = 'Cargando gráfico...';
    }else if(analizadorConError){
      el.style.display = 'flex';
      el.innerHTML = 'No se pudo cargar el historial <button type="button" id="analizadorReintentarBtn" class="btn-secondary" style="margin-left:8px;">Reintentar</button>';
    }else{
      el.style.display = 'none';
      el.innerHTML = '';
    }
  }

  function calcularDatosPeriodoAnalizador(datos){
    if(!datos || datos.length < 2) return;
    const inicio = datos[0].price;
    const fin = datos[datos.length - 1].price;
    const variacion = inicio ? ((fin - inicio) / inicio) * 100 : null;

    const maximos = datos.map(d => d.high).filter(h => h !== null && h !== undefined && !isNaN(h));
    const minimos = datos.map(d => d.low).filter(l => l !== null && l !== undefined && !isNaN(l));
    const volumen = datos.reduce((acc, d) => acc + (d.quoteVolume || 0), 0);

    const variacionEl = document.getElementById('analizadorVariacion');
    if(variacionEl && variacion !== null && !isNaN(variacion)){
      if(variacion > 0){ variacionEl.textContent = `▲ +${variacion.toFixed(2)}%`; variacionEl.style.color = 'var(--color-success)'; }
      else if(variacion < 0){ variacionEl.textContent = `▼ ${variacion.toFixed(2)}%`; variacionEl.style.color = 'var(--color-danger)'; }
      else{ variacionEl.textContent = '● 0.00%'; variacionEl.style.color = 'var(--color-text-muted)'; }
    }

    const maxEl = document.getElementById('analizadorMaximo');
    const minEl = document.getElementById('analizadorMinimo');
    const volEl = document.getElementById('analizadorVolumen');
    if(maxEl) maxEl.textContent = maximos.length ? (formatearPrecioInteligente(Math.max(...maximos)) || '—') : '—';
    if(minEl) minEl.textContent = minimos.length ? (formatearPrecioInteligente(Math.min(...minimos)) || '—') : '—';
    if(volEl) volEl.textContent = formatearVolumen(volumen);
  }

  function renderGraficoAnalizador(datos){
    const contenedor = document.getElementById('analizadorGraficoContenedor');
    if(!contenedor || typeof LightweightCharts === 'undefined') return;

    if(!analizadorChart){
      analizadorChart = LightweightCharts.createChart(contenedor, {
        width: contenedor.clientWidth,
        height: Math.max(440, Math.min(600, contenedor.clientHeight || 520)), // MARKET-10 — más altura sin desbordar la pantalla
        layout: { background: { color: 'transparent' }, textColor: '#9CA3AF' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: 7,
          minBarSpacing: 2,
          fixLeftEdge: false,
          fixRightEdge: false
        },
        rightPriceScale: { autoScale: true, borderVisible: false },
        crosshair: { mode: 0 }
      });
      analizadorSerie = analizadorChart.addCandlestickSeries({
        upColor: '#22C55E', downColor: '#EF4444', borderVisible: false,
        wickUpColor: '#22C55E', wickDownColor: '#EF4444',
        priceLineVisible: true // línea de precio actual — nativa de la librería
      });
      // PARTE 11 — volumen como histograma en un panel inferior propio,
      // usando quoteVolume real (mismo dato ya extendido en marketData.js).
      analizadorSerieVolumen = analizadorChart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volumen'
      });
      analizadorChart.priceScale('volumen').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

      window.addEventListener('resize', () => {
        if(analizadorChart && contenedor) analizadorChart.applyOptions({ width: contenedor.clientWidth });
      });
    }

    // PARTE 6 — únicamente datos reales de Binance, nunca interpolados ni inventados.
    const velas = datos
      .map(d => ({ time: Math.floor(d.time / 1000), open: d.open, high: d.high, low: d.low, close: d.price }))
      .filter(v => !isNaN(v.open) && !isNaN(v.high) && !isNaN(v.low) && !isNaN(v.close));

    analizadorSerie.setData(velas);
    analizadorUltimaVela = velas.length ? velas[velas.length - 1] : null;
    // Fundamental para evitar que las velas queden comprimidas a la derecha:
    // la escala temporal se ajusta al contenido completo recién cargado.
    if(analizadorChart && velas.length){
      analizadorChart.timeScale().fitContent();
    }

    if(analizadorSerieVolumen){
      const volumenes = datos
        .map(d => ({ time: Math.floor(d.time / 1000), value: d.quoteVolume || 0, color: d.price >= d.open ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)' }))
        .filter(v => !isNaN(v.value));
      analizadorSerieVolumen.setData(volumenes);
    }
  }

  // Sprint MARKET-7 — carga (o recarga, en cambio de temporalidad) el
  // gráfico del activo actualmente seleccionado en el Analizador. Reutiliza
  // exactamente el mismo caché de getHistoricalPrices() ya existente.
  async function cargarGraficoAnalizador(){
    if(!analizadorSymbolActual) return;
    if(typeof BinanceMarketData === 'undefined' || typeof BinanceMarketData.getHistoricalPrices !== 'function') return;
    if(analizadorCargando) return;

    analizadorCargando = true;
    analizadorConError = false;
    actualizarEstadoCargaAnalizador();
    actualizarLineaVelasAnalizador();

    try{
      if(typeof BinanceMarketData.getHistoricalCandles !== 'function') throw new Error('API de velas del Analizador no disponible.');
      const datos = await BinanceMarketData.getHistoricalCandles(analizadorSymbolActual, analizadorTimeframeActual, opcionesAnalizador());
      renderGraficoAnalizador(datos);
      calcularDatosPeriodoAnalizador(datos);
      analizadorConError = false;
    }catch(error){
      console.error(`MarketStatus/Analizador: no se pudo cargar el histórico de ${analizadorSymbolActual} (${analizadorTimeframeActual}):`, error);
      analizadorConError = true;
    }finally{
      analizadorCargando = false;
      actualizarEstadoCargaAnalizador();
    }
  }

  // Sprint MARKET-7 — PARTE 16: cambio de activo. Desuscribe el listener
  // anterior ANTES de suscribir el nuevo — nunca deja listeners huérfanos.
  async function seleccionarActivoAnalizador(symbol, nombreBase, marketType){
    if(analizadorSymbolActual && analizadorCallbackTicker && typeof BinanceMarketData !== 'undefined'){
      BinanceMarketData.unsubscribeTicker(analizadorSymbolActual, analizadorCallbackTicker, opcionesAnalizador());
    }

    analizadorSymbolActual = symbol;
    analizadorMarketType = (marketType === 'FUTURES') ? 'FUTURES' : 'SPOT'; // PARTE 4 — HYPE=FUTURES, todo lo demás SPOT

    const inputEl = document.getElementById('analizadorBuscador');
    const resultadosEl = document.getElementById('analizadorResultados');
    if(inputEl) inputEl.value = '';
    if(resultadosEl){ resultadosEl.innerHTML = ''; resultadosEl.style.display = 'none'; }

    actualizarCabeceraAnalizador(symbol, nombreBase);

    if(typeof BinanceMarketData !== 'undefined'){
      analizadorCallbackTicker = (ticker) => actualizarPrecioVivoAnalizador(ticker);
      BinanceMarketData.subscribeTicker(symbol, analizadorCallbackTicker, opcionesAnalizador());

      const cacheado = BinanceMarketData.getTicker(symbol, opcionesAnalizador());
      if(cacheado) actualizarPrecioVivoAnalizador(cacheado);
    }

    await cargarGraficoAnalizador();
  }

  function attachAnalizadorListeners(){
    const inputEl = document.getElementById('analizadorBuscador');
    if(inputEl) inputEl.addEventListener('input', manejarBusquedaAnalizador);

    Object.keys(CONFIG_TIMEFRAME_GRAFICO).forEach(tf => {
      const btn = document.getElementById('analizadorTf-' + tf);
      if(btn) btn.addEventListener('click', () => cambiarTimeframeAnalizador(tf));
    });
    actualizarBotonesTimeframeAnalizador();

    const resultadosEl = document.getElementById('analizadorResultados');
    if(resultadosEl){
      resultadosEl.addEventListener('click', (e) => {
        const item = e.target.closest('.analizador-resultado-item');
        if(item) seleccionarActivoAnalizador(item.dataset.symbol, item.dataset.nombre, 'SPOT'); // search() es siempre catálogo Spot
      });
    }

    // Las 10 tarjetas del Top 10 también cargan su activo en el Analizador —
    // es la única forma de llegar a HYPE (Futures, no aparece en el
    // catálogo Spot de search()) sin crear un segundo catálogo.
    const cardsEl = document.getElementById('marketStatusCards');
    if(cardsEl){
      cardsEl.style.cursor = 'pointer';
      cardsEl.addEventListener('click', (e) => {
        const card = e.target.closest('.market-status-card');
        if(!card) return;
        const symbol = card.id.replace('marketStatusCard-', '');
        const activo = watchlist.find(a => a.symbol === symbol);
        if(activo) seleccionarActivoAnalizador(activo.symbol, activo.nombre, activo.marketType || 'SPOT');
      });
    }

    const estadoCargaEl = document.getElementById('analizadorEstadoCarga');
    if(estadoCargaEl){
      estadoCargaEl.addEventListener('click', (e) => {
        if(e.target.id === 'analizadorReintentarBtn') cargarGraficoAnalizador();
      });
    }
  }

  function iniciarAnalizador(){
    attachAnalizadorListeners();
    seleccionarActivoAnalizador('BTCUSDT', 'Bitcoin', 'SPOT'); // PARTE 1 — BTCUSDT por defecto
  }

  function destruirAnalizador(){
    if(analizadorSymbolActual && analizadorCallbackTicker && typeof BinanceMarketData !== 'undefined'){
      BinanceMarketData.unsubscribeTicker(analizadorSymbolActual, analizadorCallbackTicker, opcionesAnalizador());
    }
    if(analizadorChart){
      analizadorChart.remove();
      analizadorChart = null;
      analizadorSerie = null;
      analizadorSerieVolumen = null;
    }
    analizadorSymbolActual = null;
    analizadorCallbackTicker = null;
    analizadorUltimaVela = null;
    analizadorCargando = false;
    analizadorConError = false;
    analizadorTimeframeActual = TIMEFRAME_GRAFICO_POR_DEFECTO;
  }

  /* ============================================================
     Sprint MARKET-8 — Watchlist configurable. Persistencia local
     (localStorage) — NO Supabase. Reutiliza exclusivamente
     BinanceMarketData.search()/loadCatalog() para agregar activos —
     nunca un catálogo manual paralelo.
     ============================================================ */
  function guardarWatchlistLocalStorage(){
    try{
      if(typeof localStorage === 'undefined') return;
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
    }catch(e){ /* optimización, no requisito duro */ }
  }

  function cargarWatchlistLocalStorage(){
    try{
      if(typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!Array.isArray(parsed) || parsed.length === 0 || parsed.length > WATCHLIST_MAX) return null;
      if(!parsed.every(a => a && typeof a.symbol === 'string' && typeof a.abrev === 'string')) return null;
      return parsed;
    }catch(e){ return null; } // localStorage corrupto/no disponible -> usar WATCHLIST_INICIAL, nunca romper
  }

  // Reemplaza la watchlist completa: desuscribe TODOS los tickers de la
  // lista anterior antes de suscribir los nuevos — nunca deja listeners
  // huérfanos. Recarga tarjetas + historial + Pulso/Resumen.
  async function aplicarNuevaWatchlist(nuevaLista){
    if(!Array.isArray(nuevaLista) || nuevaLista.length === 0 || nuevaLista.length > WATCHLIST_MAX) return false;
    const symbolsVistos = new Set();
    for(const a of nuevaLista){
      if(!a || typeof a.symbol !== 'string') return false;
      if(symbolsVistos.has(a.symbol)) return false; // sin duplicados
      symbolsVistos.add(a.symbol);
    }

    watchlist.forEach(activo => {
      const cb = callbacksPorSymbol[activo.symbol];
      if(cb && typeof BinanceMarketData !== 'undefined'){
        BinanceMarketData.unsubscribeTicker(activo.symbol, cb, opcionesMercadoDe(activo));
      }
    });

    watchlist = nuevaLista;
    guardarWatchlistLocalStorage();

    callbacksPorSymbol = {};
    tickersRecibidos = {};
    historialPrecios = {};
    historicoCompleto = {};
    cargandoHistorico = {};
    historicoConError = {};

    crearTarjetasIniciales();

    watchlist.forEach((activo, indice) => {
      const posicion = indice + 1;
      renderTarjeta(activo, posicion);
      const opciones = opcionesMercadoDe(activo);
      const callback = (ticker) => {
        tickersRecibidos[activo.symbol] = ticker;
        actualizarUltimoPuntoSparkline(activo.symbol, ticker.price);
        renderTarjeta(activo, posicion);
        calcularPulso();
      };
      callbacksPorSymbol[activo.symbol] = callback;
      if(typeof BinanceMarketData !== 'undefined'){
        BinanceMarketData.subscribeTicker(activo.symbol, callback, opciones);
        const cacheado = BinanceMarketData.getTicker(activo.symbol, opciones);
        if(cacheado){ tickersRecibidos[activo.symbol] = cacheado; renderTarjeta(activo, posicion); }
      }
      cargarHistoricoActivo(activo, posicion);
    });

    calcularPulso();
    calcularPulsoHistoricoMultitemporal(); // Sprint MARKET-8 — recalcula la fila histórica para la nueva watchlist
    return true;
  }

  // ---- Editor de Watchlist (UI mínima funcional: reemplazar/quitar/reordenar/agregar) ----
  function renderEditorWatchlist(){
    const contenedor = document.getElementById('watchlistEditorLista');
    if(!contenedor) return;
    contenedor.innerHTML = watchlist.map((a, i) => `
      <div style="display:flex; align-items:center; gap:var(--space-2); padding:var(--space-1) 0; border-bottom:1px solid var(--color-border);">
        <span style="width:20px; color:var(--color-text-muted); font-size:var(--fs-xs);">${i+1}</span>
        <strong style="flex:1;">${escapeHtml(a.symbol)}</strong>
        <button type="button" class="btn-secondary watchlist-mover" data-idx="${i}" data-dir="-1" ${i===0?'disabled':''} style="padding:2px 8px;">▲</button>
        <button type="button" class="btn-secondary watchlist-mover" data-idx="${i}" data-dir="1" ${i===watchlist.length-1?'disabled':''} style="padding:2px 8px;">▼</button>
        <button type="button" class="btn-secondary watchlist-quitar" data-idx="${i}" style="padding:2px 8px;">✕</button>
      </div>
    `).join('');
    const agregarBtn = document.getElementById('watchlistAgregarBtn');
    if(agregarBtn) agregarBtn.disabled = watchlist.length >= WATCHLIST_MAX;
  }

  function moverEnWatchlist(idx, dir){
    const nueva = watchlist.slice();
    const destino = idx + dir;
    if(destino < 0 || destino >= nueva.length) return;
    [nueva[idx], nueva[destino]] = [nueva[destino], nueva[idx]];
    watchlist = nueva; // edición en memoria — se persiste solo al pulsar Guardar
    renderEditorWatchlist();
  }

  function quitarDeWatchlist(idx){
    if(watchlist.length <= 1) return; // conservar al menos 1 activo
    watchlist = watchlist.slice(0, idx).concat(watchlist.slice(idx+1));
    renderEditorWatchlist();
  }

  function manejarBusquedaAgregarWatchlist(){
    const inputEl = document.getElementById('watchlistAgregarBuscador');
    const resultadosEl = document.getElementById('watchlistAgregarResultados');
    if(!inputEl || !resultadosEl) return;
    const query = inputEl.value.trim();
    if(!query || typeof BinanceMarketData === 'undefined' || BinanceMarketData.getCatalog().length === 0){
      resultadosEl.style.display = 'none'; resultadosEl.innerHTML = ''; return;
    }
    const yaEnLista = new Set(watchlist.map(a => a.symbol));
    const resultados = BinanceMarketData.search(query).filter(r => !yaEnLista.has(r.symbol)).slice(0, 10);
    resultadosEl.style.display = '';
    resultadosEl.innerHTML = resultados.length === 0
      ? `<div style="padding:var(--space-2); color:var(--color-text-muted); font-size:var(--fs-sm);">Sin resultados nuevos para "${escapeHtml(query)}".</div>`
      : resultados.map(r => `<div class="watchlist-agregar-item" data-symbol="${escapeHtml(r.symbol)}" data-base="${escapeHtml(r.baseAsset)}" style="padding:var(--space-2); cursor:pointer; border-bottom:1px solid var(--color-border);"><strong>${escapeHtml(r.symbol)}</strong></div>`).join('');
  }

  function agregarAWatchlist(symbol, baseAsset){
    if(watchlist.length >= WATCHLIST_MAX) return; // máximo 10
    if(watchlist.some(a => a.symbol === symbol)) return; // sin duplicados
    watchlist = watchlist.concat([{ symbol, abrev: baseAsset, nombre: baseAsset }]);
    renderEditorWatchlist();
    const inputEl = document.getElementById('watchlistAgregarBuscador');
    const resultadosEl = document.getElementById('watchlistAgregarResultados');
    if(inputEl) inputEl.value = '';
    if(resultadosEl){ resultadosEl.innerHTML=''; resultadosEl.style.display='none'; }
  }

  function attachEditorWatchlistListeners(){
    const abrirBtn = document.getElementById('watchlistEditarBtn');
    const panelEl = document.getElementById('watchlistEditorPanel');
    const guardarBtn = document.getElementById('watchlistGuardarBtn');
    const cancelarBtn = document.getElementById('watchlistCancelarBtn');
    let watchlistAntesDeEditar = null;

    if(abrirBtn && panelEl){
      abrirBtn.addEventListener('click', () => {
        watchlistAntesDeEditar = watchlist.slice();
        if(typeof BinanceMarketData !== 'undefined' && BinanceMarketData.getCatalog().length === 0){
          BinanceMarketData.loadCatalog().catch(() => {});
        }
        renderEditorWatchlist();
        panelEl.style.display = '';
      });
    }
    if(guardarBtn && panelEl){
      guardarBtn.addEventListener('click', async () => {
        await aplicarNuevaWatchlist(watchlist); // ya está en memoria; esto la persiste y resuscribe correctamente
        panelEl.style.display = 'none';
      });
    }
    if(cancelarBtn && panelEl){
      cancelarBtn.addEventListener('click', () => {
        if(watchlistAntesDeEditar) watchlist = watchlistAntesDeEditar; // descarta cambios no guardados
        panelEl.style.display = 'none';
      });
    }

    const listaEl = document.getElementById('watchlistEditorLista');
    if(listaEl){
      listaEl.addEventListener('click', (e) => {
        const moverBtn = e.target.closest('.watchlist-mover');
        if(moverBtn){ moverEnWatchlist(parseInt(moverBtn.dataset.idx,10), parseInt(moverBtn.dataset.dir,10)); return; }
        const quitarBtn = e.target.closest('.watchlist-quitar');
        if(quitarBtn){ quitarDeWatchlist(parseInt(quitarBtn.dataset.idx,10)); return; }
      });
    }

    const buscadorAgregarEl = document.getElementById('watchlistAgregarBuscador');
    if(buscadorAgregarEl) buscadorAgregarEl.addEventListener('input', manejarBusquedaAgregarWatchlist);

    const resultadosAgregarEl = document.getElementById('watchlistAgregarResultados');
    if(resultadosAgregarEl){
      resultadosAgregarEl.addEventListener('click', (e) => {
        const item = e.target.closest('.watchlist-agregar-item');
        if(item) agregarAWatchlist(item.dataset.symbol, item.dataset.base);
      });
    }
  }

  global.MarketStatus = {
    init, destroy,
    get ACTIVOS(){ return watchlist; }, // compatibilidad — siempre refleja la watchlist actual, ya no una lista fija
    getWatchlist: () => watchlist.slice(),
    setWatchlist: aplicarNuevaWatchlist
  };

  init();

})(window);
