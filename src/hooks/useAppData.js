import { useContext } from 'react'
import { DataContext } from '../context/contexts.js'

export function useAppData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useAppData must be used inside DataProvider')
  return ctx
}
