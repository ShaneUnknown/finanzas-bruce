import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  projectId: 'limonex-f5d52',
  appId: '1:939453775556:web:5ce8b0600a914afa9a1391',
  storageBucket: 'limonex-f5d52.firebasestorage.app',
  apiKey: 'AIzaSyB-A2Ifn-iQhjAoA1wILLaNk1nTBlpDh8A',
  authDomain: 'limonex-f5d52.firebaseapp.com',
  messagingSenderId: '939453775556',
  measurementId: 'G-9F9YL1DQMW',
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)

export const storage = getStorage(firebaseApp)
