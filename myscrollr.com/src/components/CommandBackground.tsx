import { useEffect, useRef } from 'react'

/**
 * Pre-render a glow sprite to an offscreen canvas.
 * Returns the canvas so it can be stamped via drawImage.
 */
function createGlowSprite(radius: number, glowRadius: number): HTMLCanvasElement {
  const size = (radius + glowRadius) * 2
  const sprite = document.createElement('canvas')
  sprite.width = size
  sprite.height = size
  const sCtx = sprite.getContext('2d')
  if (!sCtx) return sprite

  const center = size / 2
  const gradient = sCtx.createRadialGradient(center, center, 0, center, center, center)
  gradient.addColorStop(0, 'rgba(191, 255, 0, 0.6)')
  gradient.addColorStop(radius / center, 'rgba(191, 255, 0, 0.4)')
  gradient.addColorStop(1, 'rgba(191, 255, 0, 0)')

  sCtx.fillStyle = gradient
  sCtx.fillRect(0, 0, size, size)

  return sprite
}

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

    // Pre-render glow sprite once — replaces per-particle shadowBlur
    const maxParticleRadius = 3
    const glowRadius = 10
    const glowSprite = createGlowSprite(maxParticleRadius, glowRadius)
    const spriteHalf = glowSprite.width / 2

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
        // Stamp pre-rendered glow sprite (no per-particle shadowBlur)
        ctx.globalAlpha = this.opacity
        ctx.drawImage(glowSprite, this.x - spriteHalf, this.y - spriteHalf)
      }
    }

    const particles: Array<Particle> = []
    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle())
    }

    const render = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = 1

      particles.forEach((p) => {
        p.update()
        p.draw()
      })

      ctx.globalAlpha = 1
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
