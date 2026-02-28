import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const myFirebaseConfig = {
  apiKey: "AIzaSyDY7KY1Vr6Yjpt7zfGZUI8dtZ0LQSnqZ1k",
  authDomain: "mypoker-e6f9c.firebaseapp.com",
  projectId: "mypoker-e6f9c",
  storageBucket: "mypoker-e6f9c.firebasestorage.app",
  messagingSenderId: "1055829737763",
  appId: "1:1055829737763:web:59009bebb4331e3a550c96"
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