// js/auth.js - Firebase Authentication Module

import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-config.js';
import { t } from './ui.js';

/**
 * Sign in with Google popup
 */
export async function loginWithGoogle() {
    const loginBtn = document.getElementById('googleLoginBtn');
    const loginError = document.getElementById('loginError');

    try {
        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerHTML = `
                <div class="login-spinner"></div>
                <span>${t('connecting')}</span>
            `;
        }
        if (loginError) loginError.style.display = 'none';

        const result = await signInWithPopup(auth, googleProvider);
        console.log("✅ Logged in as:", result.user.email);
        return result.user;
    } catch (error) {
        console.error("❌ Login failed:", error);
        if (loginError) {
            loginError.textContent = getErrorMessage(error.code);
            loginError.style.display = 'block';
        }
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerHTML = `
                <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>${t('login-google')}</span>
            `;
        }
        throw error;
    }
}

/**
 * Sign out the current user
 */
export async function logout() {
    try {
        await signOut(auth);
        console.log("✅ Logged out successfully");
    } catch (error) {
        console.error("❌ Logout failed:", error);
    }
}

/**
 * Listen for auth state changes and call appropriate callbacks
 */
export function onAuthChange(onLogin, onLogout) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("🔐 Auth state: Logged in as", user.email);
            onLogin(user);
        } else {
            console.log("🔓 Auth state: Not logged in");
            onLogout();
        }
    });
}

/**
 * Get the currently logged-in user
 */
export function getCurrentUser() {
    return auth.currentUser;
}

/**
 * Get friendly error messages in Romanian
 */
function getErrorMessage(errorCode) {
    switch (errorCode) {
        case 'auth/popup-closed-by-user':
            return t('auth-popup-closed');
        case 'auth/popup-blocked':
            return t('auth-popup-blocked');
        case 'auth/cancelled-popup-request':
            return t('auth-cancelled');
        case 'auth/network-request-failed':
            return t('auth-network-error');
        case 'auth/unauthorized-domain':
            return t('auth-unauthorized-domain');
        default:
            return t('auth-generic-error');
    }
}
