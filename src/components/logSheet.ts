import { createContext, useContext } from 'react'

/**
 * Logging a round is a sheet over whatever screen you're on, opened from
 * the center tab and from any "Log a round" button. The Shell owns it.
 */
export const LogSheetContext = createContext<{ open: () => void }>({ open: () => {} })

export const useLogSheet = () => useContext(LogSheetContext)
