import { createContext } from 'react'
import type { Streak } from '../lib/delight'

/** Each golfer's hot or cold run, worked out once in the Shell for every avatar to read. */
export const StreakContext = createContext<Map<string, Streak>>(new Map())
