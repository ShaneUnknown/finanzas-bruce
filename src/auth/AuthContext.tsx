import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth } from '../firebase'
import { AuthContext } from './auth-context'
const ALLOWED_EMAILS = new Set(['shanejalma@gmail.com', 'johanesbruce2017@gmail.com'])
const isAllowed = (user: User) => Boolean(user.emailVerified && user.email && ALLOWED_EMAILS.has(user.email.toLowerCase()))
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true); const [signingIn, setSigningIn] = useState(false); const [error, setError] = useState<string | null>(null)
  useEffect(() => onAuthStateChanged(auth, async currentUser => { if (currentUser && !isAllowed(currentUser)) { await signOut(auth); setUser(null); setError('Esta cuenta no tiene autorización para acceder a Finanzas Bruce.') } else setUser(currentUser); setLoading(false) }), [])
  const signInWithGoogle = async () => { setSigningIn(true); setError(null); try { const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' }); const result = await signInWithPopup(auth, provider); if (!isAllowed(result.user)) { await signOut(auth); setError('Esta cuenta no tiene autorización para acceder a Finanzas Bruce.') } } catch (signInError) { const code = typeof signInError === 'object' && signInError && 'code' in signInError ? String(signInError.code) : ''; if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setError(code === 'auth/operation-not-allowed' ? 'El acceso con Google todavía no está habilitado en Firebase.' : 'No se pudo iniciar sesión con Google. Inténtalo nuevamente.') } finally { setSigningIn(false) } }
  const value = useMemo(() => ({ user, loading, signingIn, error, signInWithGoogle, logOut: () => signOut(auth) }), [user, loading, signingIn, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
