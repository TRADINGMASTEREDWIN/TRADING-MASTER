/* ============================================================
   AUTH - Autenticación con Supabase
   ============================================================ */

import { supabase } from './supabase.js';

// --- Funciones de autenticación ---
export async function signUp(email, password) {
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  errorEl.classList.remove('visible');
  successEl.classList.remove('visible');

  try {
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.add('visible');
      return false;
    }

    successEl.textContent = '✅ Usuario registrado. Revisa tu email para confirmar.';
    successEl.classList.add('visible');
    return true;
  } catch (error) {
    errorEl.textContent = 'Error al registrar: ' + error.message;
    errorEl.classList.add('visible');
    return false;
  }
}

export async function signIn(email, password) {
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  errorEl.classList.remove('visible');
  successEl.classList.remove('visible');

  try {
    const rememberMe = document.getElementById('rememberMe').checked;

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.add('visible');
      return false;
    }

    if (data.user) {
      // Forzar persistencia de sesión si "Recordarme" está marcado
      if (rememberMe && data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });
      }
      
      showApp();
      document.getElementById('userEmailDisplay').textContent = data.user.email;
      document.getElementById('userAvatar').textContent = data.user.email.charAt(0).toUpperCase();
      return true;
    }
    return false;
  } catch (error) {
    errorEl.textContent = 'Error al iniciar sesión: ' + error.message;
    errorEl.classList.add('visible');
    return false;
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error al cerrar sesión:', error);
      return;
    }
    showLoginPage();
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    console.log('👋 Sesión cerrada');
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }
}

export async function resetPassword(email) {
  const errorEl = document.getElementById('authError');
  const successEl = document.getElementById('authSuccess');
  errorEl.classList.remove('visible');
  successEl.classList.remove('visible');

  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });

    if (error) {
      errorEl.textContent = error.message;
      errorEl.classList.add('visible');
      return false;
    }

    successEl.textContent = '📧 Email de recuperación enviado. Revisa tu bandeja de entrada.';
    successEl.classList.add('visible');
    return true;
  } catch (error) {
    errorEl.textContent = 'Error al enviar recuperación: ' + error.message;
    errorEl.classList.add('visible');
    return false;
  }
}

export async function getCurrentUser() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch (error) {
    return null;
  }
}

export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}

// --- Funciones de UI ---
export function showLoginPage() {
  document.getElementById('vistaLogin').classList.add('visible');
  document.getElementById('app').classList.remove('visible');
}

export function showApp() {
  document.getElementById('vistaLogin').classList.remove('visible');
  document.getElementById('app').classList.add('visible');
}

// --- Inicializar autenticación ---
export async function initAuth() {
  // Verificar si hay sesión activa
  const user = await getCurrentUser();
  if (user) {
    showApp();
    document.getElementById('userEmailDisplay').textContent = user.email;
    document.getElementById('userAvatar').textContent = user.email.charAt(0).toUpperCase();
  } else {
    showLoginPage();
  }

  // Listeners
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
      document.getElementById('authError').textContent = 'Por favor, completa todos los campos.';
      document.getElementById('authError').classList.add('visible');
      return;
    }
    await signIn(email, password);
  });

  document.getElementById('registerBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) {
      document.getElementById('authError').textContent = 'Por favor, completa todos los campos.';
      document.getElementById('authError').classList.add('visible');
      return;
    }
    if (password.length < 6) {
      document.getElementById('authError').textContent = 'La contraseña debe tener al menos 6 caracteres.';
      document.getElementById('authError').classList.add('visible');
      return;
    }
    await signUp(email, password);
  });

  document.getElementById('forgotPasswordLink').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    if (!email) {
      document.getElementById('authError').textContent = 'Ingresa tu email para recuperar la contraseña.';
      document.getElementById('authError').classList.add('visible');
      return;
    }
    await resetPassword(email);
  });

  document.getElementById('logoutBtn').addEventListener('click', signOut);

  // Enter key support
  document.getElementById('loginPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('loginBtn').click();
    }
  });
  document.getElementById('loginEmail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('loginPassword').focus();
    }
  });

  // Auto-login por recuperación de contraseña
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  if (hashParams.get('type') === 'recovery') {
    const accessToken = hashParams.get('access_token');
    if (accessToken) {
      try {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: hashParams.get('refresh_token') || ''
        });
        console.log('✅ Sesión restaurada desde recuperación');
        window.location.hash = '';
        window.location.reload();
      } catch (error) {
        console.error('Error al restaurar sesión:', error);
      }
    }
  }
}
