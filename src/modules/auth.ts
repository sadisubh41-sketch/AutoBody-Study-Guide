// src/modules/auth.ts
import { stateManager } from './state';
import { uiManager } from './ui'; // Import the uiManager
import { navigation } from './navigation';
import type { User } from './types';

export const authManager = (() => {
  let loginForm: HTMLFormElement | null = null;
  let logoutBtn: HTMLButtonElement | null = null;
  let appContainer: HTMLElement | null = null;
  let loginPage: HTMLElement | null = null;

  function cacheElements(): void {
    loginForm = document.getElementById('login-form') as HTMLFormElement;
    logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
    appContainer = document.getElementById('app-container');
    loginPage = document.getElementById('login-page');
  }

  function handleLogin(e: SubmitEvent): void {
    e.preventDefault();
    if (!loginForm) return;

    const username = (loginForm.querySelector('#username') as HTMLInputElement)?.value.trim();
    const password = (loginForm.querySelector('#password') as HTMLInputElement)?.value.trim();

    if (!username || !password) {
      // Use the new custom alert
      uiManager.showAlert('Please enter username and password.');
      return;
    }

    // --- Simple Mock Auth ---
    // In a real app, this would be an API call.
    // For now, any username/password works.
    // 'admin' (case-insensitive) gets admin role.
    
    const user: User = {
      username,
      role: username.toLowerCase() === 'admin' ? 'admin' : 'user',
      token: btoa(`${username}:${password}`) // Mock token
    };

    stateManager.setUser(user);
    stateManager.updateSettings({ username });
    showApp();
  }

  function showApp(): void {
    if (loginPage) loginPage.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');

    uiManager.refresh();
    navigation.showPage('dashboard');
  }

  function handleLogout(): void {
    stateManager.reset();
    if (loginPage) loginPage.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
  }

  return {
    initialize(): void {
      cacheElements();

      if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
      }
      if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
      }

      console.log('Auth Manager initialized');
    },
    showApp
  };
})();
