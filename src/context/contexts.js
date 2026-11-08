import { createContext } from 'react'

// The context objects live in their own file so the provider files export
// only components (keeps React Fast Refresh working, bug #9).
export const AuthContext = createContext(null)
export const DataContext = createContext(null)
