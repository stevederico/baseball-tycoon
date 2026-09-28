/** Bar chart of recent per-game values; bars below zero are drawn in red. */
export function drawSparkline(canvas: HTMLCanvasElement, history: number[]): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#e8e4d6'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#8a8676'
  ctx.strokeRect(0.5, 0.5, w - 1, h - 1)

  if (history.length === 0) {
    ctx.fillStyle = '#4a4636'
    ctx.font = '11px Verdana, Tahoma, sans-serif'
    ctx.fillText('No home games yet.', 8, h / 2 + 4)
    return
  }

  const values = history.slice(-36)
  const max = Math.max(1, ...values)
  const min = Math.min(0, ...values)
  const range = max - min
  const pad = 5
  const zeroY = pad + ((max - 0) / range) * (h - pad * 2)
  const slot = Math.min(16, (w - pad * 2) / values.length)

  values.forEach((value, i) => {
    const y = pad + ((max - value) / range) * (h - pad * 2)
    ctx.fillStyle = value >= 0 ? '#2f7d34' : '#b3402f'
    ctx.fillRect(pad + i * slot + 1, Math.min(y, zeroY), Math.max(1, slot - 2), Math.max(1, Math.abs(zeroY - y)))
  })
  ctx.strokeStyle = '#4a4636'
  ctx.beginPath()
  ctx.moveTo(pad, Math.round(zeroY) + 0.5)
  ctx.lineTo(w - pad, Math.round(zeroY) + 0.5)
  ctx.stroke()
}
