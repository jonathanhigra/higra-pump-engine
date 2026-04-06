import React, { useState, useEffect, useRef } from 'react'

export default function AnimatedNumber({ value, format = (v: number) => v.toFixed(1), duration = 600 }: {
  value: number; format?: (v: number) => string; duration?: number
}) {
  const [display, setDisplay] = useState(value)
  const prevRef = useRef(value)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const from = prevRef.current
    const to = value
    prevRef.current = value
    if (Math.abs(from - to) < 0.001) { setDisplay(to); return }

    const start = performance.now()
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setDisplay(from + (to - from) * eased)
      if (t < 1) frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration])

  return <>{format(display)}</>
}
