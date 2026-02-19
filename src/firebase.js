import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD8r9bLhLIjmRAvILEScz2BNNrGvFaknVA",
  authDomain: "qr-shop-728f1.firebaseapp.com",
  projectId: "qr-shop-728f1",
  storageBucket: "qr-shop-728f1.firebasestorage.app",
  messagingSenderId: "945880430221",
  appId: "1:945880430221:web:7da82043a184fbe00e54c4",
  measurementId: "G-EMWZBSTMWE",
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
