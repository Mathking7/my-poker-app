import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const myFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let appInstance, authInstance, dbInstance;
let initialized = false;

try {
  appInstance = initializeApp(myFirebaseConfig);
  authInstance = getAuth(appInstance);
  dbInstance = getFirestore(appInstance);
  initialized = true;
} catch (error) {
  console.error("Firebase 初始化失败:", error);
}

// 统一导出所有需要的模块和状态
export const app = appInstance;
export const auth = authInstance;
export const db = dbInstance;
export const isFirebaseInitialized = initialized;
export const globalAppId = 'my-custom-poker-app';