'use client'
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { navigateTo as fallbackNavigateTo } from './utils.js'
import type { NavigationOptions } from './types.js'

type NavigateFunction = (url: string, options?: NavigationOptions) => void

const NavigationContext = createContext<NavigateFunction | null>(null)

interface NavigationProviderProps {
  children: React.ReactNode
  customNavigate?: NavigateFunction
}

export const NavigationProvider = ({ children, customNavigate }: NavigationProviderProps) => {
  const customNavigateRef = useRef<NavigateFunction | undefined>(customNavigate)

  useEffect(() => {
    customNavigateRef.current = customNavigate
  }, [customNavigate])

  const navigate = useCallback<NavigateFunction>((url, options) => {
    const navigateFn = customNavigateRef.current
    if (navigateFn) {
      navigateFn(url, options)
      return
    }

    fallbackNavigateTo(url, options)
  }, [])

  return <NavigationContext.Provider value={navigate}>{children}</NavigationContext.Provider>
}

export const useNavigation = (): NavigateFunction => {
  const navigate = useContext(NavigationContext)

  return navigate ?? fallbackNavigateTo
}
