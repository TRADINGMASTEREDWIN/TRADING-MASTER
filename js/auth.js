/* ============================================================
   AUTENTICACIÓN — Trading Master

   Login / Logout con Supabase Auth. Mantiene la misma arquitectura
   del resto de la app: sin frameworks, sin ES Modules, todo en
   ámbito global, ejecución inmediata (igual que trades.js, accounts.js...).

   Depende de:
   - js/supabase.js -> objeto global `supabaseClient`
   - index.html      -> #loginScreen, #app, #loginEmail, #loginPassword,
                         #loginError, #loginBtn, #logoutBtn
   - app.js           -> initApp() se llama aquí tras un login exitoso.
                          A su vez, initApp() llama a
                          verificarSesionYMostrarUI() al inicio — es la
                          ÚNICA línea que se agregó en app.js.

   La sesión persiste entre recargas de forma automática: el SDK de
   Supabase (v2) guarda la sesión en localStorage por defecto
   (persistSession: true), así que getSession() la recupera sola sin
   código adicional de nuestra parte.
   ============================================================ */

  function mostrarPantallaApp(){
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
  }

  function mostrarPantallaLogin(){
    document.getElementById('app').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'flex';
  }

  // Se llama al inicio de initApp() (app.js). Decide, según haya o no
  // una sesión válida, qué pantalla mostrar. Devuelve true si initApp()
  // debe continuar cargando la aplicación, o false si debe detenerse
  // (el usuario se queda en la pantalla de Login).
  async function verificarSesionYMostrarUI(){
    const { data, error } = await supabaseClient.auth.getSession();

    if(error){
      console.error('Error verificando la sesión:', error);
      mostrarPantallaLogin();
      return false;
    }

    if(data.session){
      mostrarPantallaApp();
      return true;
    }

    mostrarPantallaLogin();
    return false;
  }

  async function iniciarSesion(){
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';

    if(!email || !password){
      errorEl.textContent = 'Ingresa tu correo y tu contraseña.';
      errorEl.style.display = 'block';
      return;
    }

    const loginBtn = document.getElementById('loginBtn');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando…';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    loginBtn.disabled = false;
    loginBtn.textContent = 'Iniciar sesión';

    if(error){
      errorEl.textContent = error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : error.message;
      errorEl.style.display = 'block';
      return;
    }

    mostrarPantallaApp();
    initApp().catch((err) => {
      console.error('Error al iniciar Trading Master tras el login:', err);
    });
  }

  async function cerrarSesion(){
    await supabaseClient.auth.signOut();
    // Recarga completa: la forma más simple y segura de limpiar todo el
    // estado en memoria (operaciones, cuentas, plan...) sin tener que
    // resetear manualmente cada módulo uno por uno.
    window.location.reload();
  }

  function attachAuthListeners(){
    document.getElementById('loginBtn').addEventListener('click', iniciarSesion);
    document.getElementById('loginPassword').addEventListener('keydown', (e) => {
      if(e.key === 'Enter') iniciarSesion();
    });
    document.getElementById('logoutBtn').addEventListener('click', cerrarSesion);
  }

  attachAuthListeners();
