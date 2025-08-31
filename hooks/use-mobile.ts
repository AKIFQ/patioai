import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // CRITICAL: Start with false to prevent hydration mismatch and layout shifts
  // This assumes desktop by default and switches to mobile after hydration
  // This prevents the flash/shift on mobile during refresh
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
