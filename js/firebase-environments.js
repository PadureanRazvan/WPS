const DEFAULT_FIREBASE_ENVIRONMENT = 'production';

const FIREBASE_ENVIRONMENTS = {
  production: {
    apiKey: 'AIzaSyCZqJeajOlCekhzXgHAhf4ZIpCMKJxW8qs',
    authDomain: 'wps-sherpa-database.firebaseapp.com',
    projectId: 'wps-sherpa-database',
    storageBucket: 'wps-sherpa-database.appspot.com',
    messagingSenderId: '897978989234',
    appId: '1:897978989234:web:f2869963eb261af70ce7ab',
    measurementId: 'G-NBPVK629X4'
  },
  development: null
};

export function getFirebaseEnvironmentName(source = globalThis) {
  const requestedEnvironment = source?.WPS_FIREBASE_ENV;
  if (!requestedEnvironment) return DEFAULT_FIREBASE_ENVIRONMENT;

  const environmentName = String(requestedEnvironment).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(FIREBASE_ENVIRONMENTS, environmentName)) {
    throw new Error(`Unknown Firebase environment: ${requestedEnvironment}`);
  }

  return environmentName;
}

export function isFirebaseEnvironmentConfigured(environmentName = DEFAULT_FIREBASE_ENVIRONMENT) {
  return Boolean(FIREBASE_ENVIRONMENTS[environmentName]);
}

export function getFirebaseConfig(environmentName = getFirebaseEnvironmentName()) {
  if (!Object.prototype.hasOwnProperty.call(FIREBASE_ENVIRONMENTS, environmentName)) {
    throw new Error(`Unknown Firebase environment: ${environmentName}`);
  }

  const config = FIREBASE_ENVIRONMENTS[environmentName];
  if (!config) {
    throw new Error(`Firebase environment "${environmentName}" is not configured yet.`);
  }

  return { ...config };
}
