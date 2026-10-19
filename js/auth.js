// js/auth.js - Firebase Authentication Module

import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-session.js';
import { t } from './localization.js';
import { setSignInPending, clearSignInError, showSignInError } from './sign-in-ui.js';
import { isAuthorizedUser } from './auth-policy.js?v=2026.10.19';

function createAuthError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function showLoginError(errorCode) {
    showSignInError(getErrorMessage(errorCode));
}

let loginPending = false;

/**
 * Sign in with Google popup
 */
export async function loginWithGoogle() {
    if (loginPending) return;
    loginPending = true;

    try {
        setSignInPending(true);
        clearSignInError();

        const result = await signInWithPopup(auth, googleProvider);
        if (!isAuthorizedUser(result.user)) {
            await signOut(auth);
            throw createAuthError('auth/unauthorized-user');
        }
        console.log("✅ Logged in as:", result.user.email);
        return result.user;
    } catch (error) {
        const informational = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code);
        if (!informational) console.error("❌ Login failed:", error);
        showSignInError(getErrorMessage(error.code), { informational });
        throw error;
    } finally {
        loginPending = false;
        setSignInPending(false);
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
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            if (!isAuthorizedUser(user)) {
                showLoginError('auth/unauthorized-user');
                await signOut(auth);
                return;
            }
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
        case 'auth/unauthorized-user':
            return t('auth-unauthorized-user');
        default:
            return t('auth-generic-error');
    }
}
