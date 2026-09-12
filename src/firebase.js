import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Замени значения ниже на свои — их ты получишь в консоли Firebase.
// Смотри пошаговую инструкцию в README.md, раздел "Шаг 1".
const firebaseConfig = {
  apiKey: "AIzaSyCKTQljn8Zc2gEW3b1FbLr4jM2i8ipQnIQ",
  authDomain: "kaluga-shef.firebaseapp.com",
  projectId: "kaluga-shef",
  storageBucket: "kaluga-shef.firebasestorage.app",
  messagingSenderId: "729147326188",
  appId: "1:729147326188:web:b2cf0c6659a0597b50efc9",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
