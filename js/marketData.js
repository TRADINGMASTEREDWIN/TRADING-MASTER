/* ============================================================
   TRADING MASTER — Sprint MARKET-1A
   Servicio global aislado: catálogo público de instrumentos Spot de
   Binance. NO se conecta a Supabase, NO se integra con ningún selector
   ni formulario todavía — expone únicamente una API en memoria que un
   Sprint futuro podrá consumir. Solo usa el endpoint público de solo
   lectura (sin API Keys, sin credenciales, sin datos privados).
   ============================================================ */

(function(global){
  const BINANCE_EXCHANGE_INFO_URL = 'https://api.binance.com/api/v3/exchangeInfo';

  let catalogo = null;          // array normalizado, en memoria — la caché real
  let cargaEnProgreso = null;   // Promise en curso — evita solicitudes duplicadas simultáneas

  function normalizarInstrumento(s){
    return {
      symbol: s.symbol,
      baseAsset: s.baseAsset,
      quoteAsset: s.quoteAsset
    };
  }

  // Mantiene únicamente instrumentos Spot operables con datos válidos.
  // Sin lista hardcodeada de criptomonedas: todo se deriva de la
  // respuesta real de Binance.
  function esInstrumentoValido(s){
    if(!s || typeof s.symbol !== 'string' || !s.symbol) return false;
    if(typeof s.baseAsset !== 'string' || !s.baseAsset) return false;
    if(typeof s.quoteAsset !== 'string' || !s.quoteAsset) return false;
    if(s.status !== 'TRADING') return false;

    // isSpotTradingAllowed es la señal más directa cuando Binance la
    // incluye; si no viene en la respuesta, se revisa `permissions` como
    // respaldo. Nunca se asume disponible por defecto si ninguna señal
    // lo confirma explícitamente.
    if(typeof s.isSpotTradingAllowed === 'boolean'){
      return s.isSpotTradingAllowed === true;
    }
    if(Array.isArray(s.permissions)){
      return s.permissions.indexOf('SPOT') !== -1;
    }
    return false;
  }

  async function loadCatalog(){
    if(catalogo !== null) return catalogo; // ya cargado -> nunca una segunda consulta
    if(cargaEnProgreso) return cargaEnProgreso; // ya en curso -> reutiliza la MISMA promesa

    cargaEnProgreso = (async () => {
      try{
        const response = await fetch(BINANCE_EXCHANGE_INFO_URL);
        if(!response.ok){
          throw new Error(`Binance respondió con estado ${response.status}`);
        }

        const data = await response.json();
        if(!data || !Array.isArray(data.symbols)){
          throw new Error('Respuesta inesperada de Binance: falta el array symbols.');
        }

        const filtrados = data.symbols.filter(esInstrumentoValido).map(normalizarInstrumento);
        catalogo = filtrados; // [] también es un catálogo válido, no un error
        return catalogo;

      }catch(error){
        console.error('BinanceMarketData: no se pudo cargar el catálogo:', error);
        catalogo = null; // permite reintentar en la próxima llamada a loadCatalog()
        throw error; // controlado — el llamador decide qué hacer, nunca rompe nada por sí solo
      }finally{
        cargaEnProgreso = null;
      }
    })();

    return cargaEnProgreso;
  }

  function getCatalog(){
    return catalogo || [];
  }

  // Búsqueda case-insensitive por símbolo o activo base. Prioriza
  // quoteAsset === 'USDT' cuando existe, sin garantizar que siempre exista
  // (ej. buscar un activo que solo cotiza contra BTC no tendrá resultado USDT).
  function search(query){
    if(!catalogo || !query) return [];
    const q = String(query).trim().toUpperCase();
    if(!q) return [];

    const resultados = catalogo.filter(item =>
      item.symbol.toUpperCase().indexOf(q) !== -1 ||
      item.baseAsset.toUpperCase().indexOf(q) !== -1
    );

    resultados.sort((a, b) => {
      const aEsUsdt = a.quoteAsset === 'USDT' ? 0 : 1;
      const bEsUsdt = b.quoteAsset === 'USDT' ? 0 : 1;
      return aEsUsdt - bEsUsdt; // orden estable dentro de cada grupo
    });

    return resultados;
  }

  global.BinanceMarketData = {
    loadCatalog,
    getCatalog,
    search
  };

})(window);
