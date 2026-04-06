import { useEffect } from 'react'

export default function useDynamicFavicon(nq: number | null) {
  useEffect(() => {
    if (!nq) return
    const canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    const ctx = canvas.getContext('2d')!
    // Background circle
    ctx.fillStyle = '#00a0df'
    ctx.beginPath()
    ctx.arc(16, 16, 15, 0, Math.PI * 2)
    ctx.fill()
    // Text
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(nq.toFixed(0), 16, 17)
    // Set favicon
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = canvas.toDataURL()
  }, [nq])
}
