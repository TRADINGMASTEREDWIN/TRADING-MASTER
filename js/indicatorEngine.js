/* ============================================================
   TRADING MASTER — MARKET CONTEXT FOUNDATION (Sprint 0)
   Paso 3: Indicator Engine.

   Módulo PURO de cálculo de indicadores técnicos. Recibe velas OHLCV
   ya obtenidas (por ejemplo, desde marketData.js -> getHistoricalCandles())
   y devuelve valores calculados con fórmulas estándar.

   REGLAS DE DISEÑO (por Sprint):
   - NO hace fetch ni ninguna llamada de red.
   - NO consulta Supabase.
   - NO conoce Trades, Storage, Variables ni ninguna tabla de la app.
   - NO maneja UI ni DOM.
   - NO modifica ni conoce datos históricos/Snapshots.
   - Nunca inventa valores: si faltan velas suficientes, devuelve
     { value: null, status: 'INSUFFICIENT_DATA' } en vez de un número
     estimado o parcial.

   FORMATO DE VELA ESPERADO (mismo que devuelve marketData.js):
   { time, open, high, low, price (precio de cierre), quoteVolume }

   ARQUITECTURA — registro de métodos (extensible):
   marketContext.js (Paso 4) NUNCA debe tener "if (method === 'RSI')...".
   En su lugar llama a:

       IndicatorEngine.calculate(method, candles, config)

   y este módulo decide internamente qué función usar, buscando en un
   registro interno (MÉTODOS). Si el método no existe en el registro,
   se devuelve { value: null, status: 'NO_METHOD' } — nunca un error
   silencioso ni un valor fabricado.

   Resultado siempre estructurado así (pensado para ser reutilizado
   después por Snapshots/Analytics/IA sin cambios):
     {
       method: 'RSI',
       value: 54.2 | { ...campos... } | null,
       status: 'OK' | 'INSUFFICIENT_DATA' | 'NO_METHOD' | 'ERROR',
       config: { ...parámetros efectivamente usados... }
     }
   ============================================================ */

(function(global){

  /* ------------------------------------------------------------
     Helpers internos — extracción de series y validación de datos.
     Ninguno de estos asume nada sobre Trades/Supabase/UI.
     ------------------------------------------------------------ */

  // Forma BÁSICA esperada de una vela: que las propiedades existan, sin
  // importar todavía si son numéricamente utilizables. Si esto falla, la
  // entrada está mal formada (INVALID_INPUT) — no es un tema de "faltan
  // velas", es un tema de "esto no es lo que se esperaba recibir".
  function tieneFormaDeVela(v){
    return !!v && typeof v === 'object' &&
           ('open' in v) && ('high' in v) && ('low' in v) && ('price' in v);
  }

  // Vela con forma correcta Y valores numéricos utilizables.
  function esVelaValida(v){
    return v && Number.isFinite(v.open) && Number.isFinite(v.high) &&
           Number.isFinite(v.low) && Number.isFinite(v.price);
  }

  function closesOf(candles){ return candles.map(v => v.price); }
  function highsOf(candles){ return candles.map(v => v.high); }
  function lowsOf(candles){ return candles.map(v => v.low); }

  function redondear(n, decimales){
    if(n === null || n === undefined || !Number.isFinite(n)) return null;
    const factor = Math.pow(10, decimales === undefined ? 4 : decimales);
    return Math.round(n * factor) / factor;
  }

  /* ------------------------------------------------------------
     Los 3 estados de "no hay valor" que puede devolver este motor,
     además de 'OK':
       - INVALID_INPUT     -> lo que se recibió no es OHLCV/config
                              utilizable (no es array, viene vacío,
                              faltan campos, config no es un objeto).
       - INSUFFICIENT_DATA -> la entrada SÍ es OHLCV válido, pero no
                              hay suficientes velas (o hay valores
                              numéricos corruptos) para ese indicador.
       - ERROR             -> algo inesperado explotó durante el
                              cálculo (red de seguridad, nunca debería
                              pasar si INVALID_INPUT/INSUFFICIENT_DATA
                              ya filtraron bien).
     Nunca se inventa un valor en ninguno de los 3 casos.
     ------------------------------------------------------------ */
  function resultadoInvalido(method, config, motivo){
    return { method, value: null, status: 'INVALID_INPUT', config: config || {}, reason: motivo };
  }

  function resultadoInsuficiente(method, config){
    return { method, value: null, status: 'INSUFFICIENT_DATA', config: config || {} };
  }

  function resultadoError(method, config, error){
    return { method, value: null, status: 'ERROR', config: config || {}, error: String(error && error.message || error) };
  }

  // Valida la entrada de velas antes de que cualquier función de indicador
  // intente calcular. Devuelve null si todo está bien, o el resultado ya
  // armado (INVALID_INPUT o INSUFFICIENT_DATA) si algo no sirve.
  function validarEntrada(method, candles, config, minimoVelas){
    if(!Array.isArray(candles)){
      return resultadoInvalido(method, config, 'candles debe ser un array de velas OHLCV');
    }
    if(candles.length === 0){
      return resultadoInvalido(method, config, 'candles no puede ser un array vacío');
    }
    if(candles.some(v => !tieneFormaDeVela(v))){
      return resultadoInvalido(method, config, 'una o más velas no tienen la forma esperada {open, high, low, price}');
    }
    // A partir de aquí la forma es correcta — si los NÚMEROS están
    // corruptos (NaN, etc.) o simplemente no alcanzan para el período
    // pedido, eso ya es "dato insuficiente", no "entrada inválida".
    const validas = candles.filter(esVelaValida);
    if(validas.length !== candles.length || candles.length < minimoVelas){
      return resultadoInsuficiente(method, config);
    }
    return null;
  }

  // Media móvil simple, serie completa (alineada al final): sma[i]
  // corresponde al promedio de values[i-period+1 .. i]. Antes de eso, null.
  function smaSerie(values, period){
    const serie = new Array(values.length).fill(null);
    let suma = 0;
    for(let i = 0; i < values.length; i++){
      suma += values[i];
      if(i >= period) suma -= values[i - period];
      if(i >= period - 1) serie[i] = suma / period;
    }
    return serie;
  }

  // EMA estándar: semilla = SMA de los primeros `period` valores, luego
  // multiplicador 2/(period+1). Serie completa alineada (null antes de
  // tener suficientes datos para la semilla).
  function emaSerie(values, period){
    if(values.length < period) return new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    const serie = new Array(values.length).fill(null);
    let suma = 0;
    for(let i = 0; i < period; i++) suma += values[i];
    let prev = suma / period;
    serie[period - 1] = prev;
    for(let i = period; i < values.length; i++){
      prev = values[i] * k + prev * (1 - k);
      serie[i] = prev;
    }
    return serie;
  }

  /* ------------------------------------------------------------
     1. EMA — Media Móvil Exponencial
     config: { period } (default 50)
     ------------------------------------------------------------ */
  function calculateEMA(candles, config){
    const period = (config && (config.period || config.periodo)) || 50;
    const cfgEfectivo = { period };
    const err = validarEntrada('EMA', candles, cfgEfectivo, period);
    if(err) return err;

    const serie = emaSerie(closesOf(candles), period);
    const ultimo = serie[serie.length - 1];
    if(ultimo === null) return resultadoInsuficiente('EMA', cfgEfectivo);

    return { method: 'EMA', value: redondear(ultimo, 2), status: 'OK', config: cfgEfectivo };
  }

  /* ------------------------------------------------------------
     2. RSI — Índice de Fuerza Relativa (suavizado de Wilder)
     config: { period } (default 14)
     ------------------------------------------------------------ */
  function calculateRSI(candles, config){
    const period = (config && (config.period || config.periodo)) || 14;
    const cfgEfectivo = { period };
    const err = validarEntrada('RSI', candles, cfgEfectivo, period + 1);
    if(err) return err;

    const closes = closesOf(candles);
    let gananciaTotal = 0, perdidaTotal = 0;
    for(let i = 1; i <= period; i++){
      const diff = closes[i] - closes[i - 1];
      if(diff >= 0) gananciaTotal += diff; else perdidaTotal -= diff;
    }
    let avgGain = gananciaTotal / period;
    let avgLoss = perdidaTotal / period;

    for(let i = period + 1; i < closes.length; i++){
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if(avgLoss === 0){
      return { method: 'RSI', value: 100, status: 'OK', config: cfgEfectivo };
    }
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    return { method: 'RSI', value: redondear(rsi, 2), status: 'OK', config: cfgEfectivo };
  }

  /* ------------------------------------------------------------
     3. MACD — 12/26/9 por defecto
     config: { fastPeriod, slowPeriod, signalPeriod }
     ------------------------------------------------------------ */
  function calculateMACD(candles, config){
    const fastPeriod = (config && config.fastPeriod) || 12;
    const slowPeriod = (config && config.slowPeriod) || 26;
    const signalPeriod = (config && config.signalPeriod) || 9;
    const cfgEfectivo = { fastPeriod, slowPeriod, signalPeriod };
    // Mínimo razonable para que la señal (EMA del MACD) sea real y no una
    // semilla recién nacida: velas suficientes para la EMA lenta + la señal.
    const minimo = slowPeriod + signalPeriod;
    const err = validarEntrada('MACD', candles, cfgEfectivo, minimo);
    if(err) return err;

    const closes = closesOf(candles);
    const emaRapida = emaSerie(closes, fastPeriod);
    const emaLenta = emaSerie(closes, slowPeriod);

    const macdLine = [];
    for(let i = 0; i < closes.length; i++){
      if(emaRapida[i] !== null && emaLenta[i] !== null){
        macdLine.push(emaRapida[i] - emaLenta[i]);
      }
    }
    if(macdLine.length < signalPeriod) return resultadoInsuficiente('MACD', cfgEfectivo);

    const signalSerie = emaSerie(macdLine, signalPeriod);
    const ultimaSignal = signalSerie[signalSerie.length - 1];
    if(ultimaSignal === null) return resultadoInsuficiente('MACD', cfgEfectivo);

    const ultimoMacd = macdLine[macdLine.length - 1];
    const histograma = ultimoMacd - ultimaSignal;

    return {
      method: 'MACD',
      value: { macd: redondear(ultimoMacd, 2), signal: redondear(ultimaSignal, 2), histogram: redondear(histograma, 2) },
      status: 'OK',
      config: cfgEfectivo
    };
  }

  /* ------------------------------------------------------------
     4. ADX — Average Directional Index, suavizado de Wilder
     config: { period } (default 14)
     ------------------------------------------------------------ */
  function calculateADX(candles, config){
    const period = (config && (config.period || config.periodo)) || 14;
    const cfgEfectivo = { period };
    // Wilder necesita ~2*period velas para una ADX estable (period para
    // suavizar +DI/-DI, otro period para promediar el DX resultante).
    const minimo = period * 2 + 1;
    const err = validarEntrada('ADX', candles, cfgEfectivo, minimo);
    if(err) return err;

    const highs = highsOf(candles);
    const lows = lowsOf(candles);
    const closes = closesOf(candles);
    const n = candles.length;

    const plusDM = [0], minusDM = [0], tr = [0]; // índice 0 sin movimiento previo
    for(let i = 1; i < n; i++){
      const upMove = highs[i] - highs[i - 1];
      const downMove = lows[i - 1] - lows[i];
      plusDM.push((upMove > downMove && upMove > 0) ? upMove : 0);
      minusDM.push((downMove > upMove && downMove > 0) ? downMove : 0);
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }

    // Suavizado de Wilder: semilla = suma de los primeros `period` valores
    // (arrancando en índice 1, el índice 0 no tiene movimiento previo),
    // luego cada paso siguiente: prev - prev/period + actual.
    function suavizarWilder(valores, period){
      const serie = new Array(valores.length).fill(null);
      let suma = 0;
      for(let i = 1; i <= period; i++) suma += valores[i];
      serie[period] = suma;
      for(let i = period + 1; i < valores.length; i++){
        serie[i] = serie[i - 1] - (serie[i - 1] / period) + valores[i];
      }
      return serie;
    }

    const trSuavizado = suavizarWilder(tr, period);
    const plusDMSuavizado = suavizarWilder(plusDM, period);
    const minusDMSuavizado = suavizarWilder(minusDM, period);

    const dx = new Array(n).fill(null);
    for(let i = period; i < n; i++){
      if(trSuavizado[i] === null || trSuavizado[i] === 0) continue;
      const plusDI = 100 * (plusDMSuavizado[i] / trSuavizado[i]);
      const minusDI = 100 * (minusDMSuavizado[i] / trSuavizado[i]);
      const suma = plusDI + minusDI;
      dx[i] = suma === 0 ? 0 : 100 * (Math.abs(plusDI - minusDI) / suma);
    }

    // ADX = promedio de Wilder sobre los DX ya calculados (misma técnica
    // de suavizado, aplicada esta vez sobre la serie DX).
    const dxValidos = dx.filter(v => v !== null);
    if(dxValidos.length < period) return resultadoInsuficiente('ADX', cfgEfectivo);

    let adx = dxValidos.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for(let i = period; i < dxValidos.length; i++){
      adx = (adx * (period - 1) + dxValidos[i]) / period;
    }

    return { method: 'ADX', value: redondear(adx, 2), status: 'OK', config: cfgEfectivo };
  }

  /* ------------------------------------------------------------
     5. Stochastic — 14/3/3 por defecto
     config: { kPeriod, kSmoothing, dPeriod }
     ------------------------------------------------------------ */
  function calculateStochastic(candles, config){
    const kPeriod = (config && config.kPeriod) || 14;
    const kSmoothing = (config && config.kSmoothing) || 3;
    const dPeriod = (config && config.dPeriod) || 3;
    const cfgEfectivo = { kPeriod, kSmoothing, dPeriod };
    const minimo = kPeriod + kSmoothing + dPeriod - 2;
    const err = validarEntrada('STOCHASTIC', candles, cfgEfectivo, minimo);
    if(err) return err;

    const closes = closesOf(candles);
    const highs = highsOf(candles);
    const lows = lowsOf(candles);

    const rawK = [];
    for(let i = kPeriod - 1; i < closes.length; i++){
      const ventanaHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
      const ventanaLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
      const rango = ventanaHigh - ventanaLow;
      rawK.push(rango === 0 ? 0 : ((closes[i] - ventanaLow) / rango) * 100);
    }
    if(rawK.length < kSmoothing) return resultadoInsuficiente('STOCHASTIC', cfgEfectivo);

    const kSuavizadaSerie = smaSerie(rawK, kSmoothing).filter(v => v !== null);
    if(kSuavizadaSerie.length < dPeriod) return resultadoInsuficiente('STOCHASTIC', cfgEfectivo);

    const dSerie = smaSerie(kSuavizadaSerie, dPeriod).filter(v => v !== null);
    if(dSerie.length === 0) return resultadoInsuficiente('STOCHASTIC', cfgEfectivo);

    const ultimaK = kSuavizadaSerie[kSuavizadaSerie.length - 1];
    const ultimaD = dSerie[dSerie.length - 1];

    return {
      method: 'STOCHASTIC',
      value: { k: redondear(ultimaK, 2), d: redondear(ultimaD, 2) },
      status: 'OK',
      config: cfgEfectivo
    };
  }

  /* ------------------------------------------------------------
     6. Volume — volumen real de la última vela disponible.
     Usa quoteVolume porque es el único dato de volumen que exponen
     hoy getHistoricalPrices()/getHistoricalCandles() de marketData.js
     (no viene el volumen base por separado). Sin config.
     ------------------------------------------------------------ */
  function calculateVolume(candles){
    const cfgEfectivo = {};
    const err = validarEntrada('VOLUME', candles, cfgEfectivo, 1);
    if(err) return err;

    const ultimaVela = candles[candles.length - 1];
    if(!Number.isFinite(ultimaVela.quoteVolume)) return resultadoInsuficiente('VOLUME', cfgEfectivo);

    return { method: 'VOLUME', value: redondear(ultimaVela.quoteVolume, 2), status: 'OK', config: cfgEfectivo };
  }

  /* ------------------------------------------------------------
     REGISTRO DE MÉTODOS — única fuente de verdad de qué se puede
     calcular. marketContext.js (Paso 4) NUNCA debe tener
     "if (method === 'RSI')..."; siempre pasa por calculate().
     Agregar un indicador futuro (ATR, EMA200, VWAP...) = agregar una
     entrada aquí, nunca tocar al que lo consume.
     ------------------------------------------------------------ */
  const METODOS = {
    EMA: calculateEMA,
    RSI: calculateRSI,
    MACD: calculateMACD,
    ADX: calculateADX,
    STOCHASTIC: calculateStochastic,
    VOLUME: calculateVolume
  };

  function hasMethod(method){
    return typeof METODOS[String(method || '').toUpperCase()] === 'function';
  }

  // Punto de entrada único.
  // - method no es un string no-vacío, o config viene con un tipo que no
  //   es un objeto -> INVALID_INPUT (la llamada en sí está mal formada).
  // - method es un string válido pero no está en el registro -> NO_METHOD
  //   (regla del Sprint: una Variable marcada CALCULATED/AUTOMATIC sin
  //   método real no puede fabricar un número).
  // - candles inválido/insuficiente -> lo decide validarEntrada() dentro
  //   de cada función de indicador (INVALID_INPUT / INSUFFICIENT_DATA).
  // - cualquier excepción no anticipada -> ERROR, nunca sin capturar.
  function calculate(method, candles, config){
    if(typeof method !== 'string' || method.trim() === ''){
      return { method: (typeof method === 'string' ? method : null), value: null, status: 'INVALID_INPUT', config: config || {}, reason: 'method debe ser un string no vacío' };
    }
    if(config !== undefined && config !== null && typeof config !== 'object'){
      return { method: method.toUpperCase(), value: null, status: 'INVALID_INPUT', config: {}, reason: 'config debe ser un objeto (o undefined/null)' };
    }

    const nombreMetodo = method.toUpperCase();
    const fn = METODOS[nombreMetodo];
    if(!fn){
      return { method: nombreMetodo, value: null, status: 'NO_METHOD', config: config || {} };
    }
    try{
      return fn(candles, config || {});
    }catch(error){
      return resultadoError(nombreMetodo, config, error);
    }
  }

  // Permite registrar métodos nuevos desde afuera sin tocar este archivo
  // en el futuro (ej. ATR, EMA200) — no se usa todavía en este Sprint,
  // queda disponible para no tener que reabrir este módulo cada vez.
  function registerMethod(method, fn){
    if(typeof fn !== 'function') return false;
    METODOS[String(method || '').toUpperCase()] = fn;
    return true;
  }

  global.IndicatorEngine = {
    calculate,
    hasMethod,
    registerMethod
  };

})(typeof window !== 'undefined' ? window : globalThis);
