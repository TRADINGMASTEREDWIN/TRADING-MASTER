/* ============================================================
   UTILIDADES — Trading Master
   Etapa 2 de modularización: funciones reutilizables sin
   dependencias del DOM de la aplicación ni del estado global.
   El código es idéntico al que estaba en index.html.
   ============================================================ */

  function generarId(){
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // --- Helpers de formato (reutilizables desde Dashboard/Gráficos) ---
  function formatMoney(valor){
    if(valor === null || valor === undefined || isNaN(valor)) return '—';
    const signo = valor > 0 ? '+' : '';
    return `${signo}$${valor.toFixed(2)}`;
  }

  function formatPct(valor){
    if(valor === null || valor === undefined || isNaN(valor)) return '—';
    const signo = valor > 0 ? '+' : '';
    return `${signo}${valor.toFixed(2)}%`;
  }

  function formatR(valor){
    if(valor === null || valor === undefined || isNaN(valor)) return '—';
    const signo = valor > 0 ? '+' : '';
    return `${signo}${valor.toFixed(2)}R`;
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
