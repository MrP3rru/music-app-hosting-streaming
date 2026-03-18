import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'

const firebaseConfig = {
  apiKey: "AIzaSyCEmyAffOLhRqxiCv6JkqntE9bT6UF9Rm4",
  authDomain: "music-app-together.firebaseapp.com",
  projectId: "music-app-together",
  storageBucket: "music-app-together.firebasestorage.app",
  messagingSenderId: "347474657478",
  appId: "1:347474657478:web:7f55eb4e9abdebb99817c7",
  databaseURL: "https://music-app-together-default-rtdb.europe-west1.firebasedatabase.app",
  measurementId: "G-KSL6QBBVLX"
}

const app = initializeApp(firebaseConfig)
export const db = getDatabase(app)
