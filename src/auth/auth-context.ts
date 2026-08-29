import { createContext } from 'react'
import type { User } from 'firebase/auth'
export interface AuthContextValue { user: User | null; loading: boolean; signingIn: boolean; error: string | null; signInWithGoogle: () => Promise<void>; logOut: () => Promise<void> }
export const AuthContext = createContext<AuthContextValue | null>(null)
