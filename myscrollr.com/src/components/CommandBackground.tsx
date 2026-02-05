import { useEffect, useRef } from 'react'

export function CommandBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = window.innerWidth
    let height = window.innerHeight

    const handleResize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
    }

    window.addEventListener('resize', handleResize)
    handleResize()

    // Configuration
    const gridSize = 60
    const particleCount = 50

    class Particle {
      x = 0
      y = 0
      size = 0
      speed = 0
      opacity = 0
      targetX = 0
      targetY = 0
      life = 0
      maxLife = 0

      constructor() {
        this.reset()
        this.life = Math.random() * this.maxLife
      }

      reset() {
        this.x = Math.floor(Math.random() * (width / gridSize)) * gridSize
        this.y = Math.floor(Math.random() * (height / gridSize)) * gridSize
        this.size = Math.random() * 2 + 1
        this.speed = 0.01 + Math.random() * 0.015
        this.opacity = 0
        this.maxLife = 200 + Math.random() * 300
        this.life = 0

        const directions = [
          [gridSize, 0],
          [-gridSize, 0],
          [0, gridSize],
          [0, -gridSize],
        ]
        const dir = directions[Math.floor(Math.random() * directions.length)]
        this.targetX = this.x + dir[0]
        this.targetY = this.y + dir[1]
      }

      update() {
        this.life++

        if (this.life < this.maxLife * 0.2) {
          this.opacity = this.life / (this.maxLife * 0.2)
        } else if (this.life > this.maxLife * 0.8) {
          this.opacity =
            1 - (this.life - this.maxLife * 0.8) / (this.maxLife * 0.2)
        } else {
          this.opacity = 1
        }

        this.x += (this.targetX - this.x) * this.speed
        this.y += (this.targetY - this.y) * this.speed

        if (this.life >= this.maxLife) {
          this.reset()
        }
      }

      draw() {
        if (!ctx) return
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
        // Softened nodes
        ctx.fillStyle = `rgba(191, 255, 0, ${this.opacity * 0.4})`
        ctx.fill()

        ctx.shadowBlur = 10
        ctx.shadowColor = 'rgba(191, 255, 0, 0.6)'
      }
    }

    const particles: Array<Particle> = []
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)

      particles.forEach((p) => {
        p.update()
        p.draw()
      })

      ctx.shadowBlur = 0
      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 opacity-60"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
