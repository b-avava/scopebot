import { useEffect, useRef } from "react"

export type AvatarShape = "circle" | "pebble" | "squircle" | "capsule" | "triangle" | "hexagon" | "cloud" | "droplet"

export type AvatarFace =
  | "neutral"
  | "attentive"
  | "surprised"
  | "excited"
  | "happy"
  | "laughing"
  | "angry"
  | "sad"
  | "scared"
  | "suspicious"
  | "confused"
  | "curious"
  | "proud"
  | "shy"
  | "unimpressed"
  | "sleepy"

type Point = readonly [number, number]

/** A closed polygon whose corners are rounded with the given radius. */
const roundedPolygon = (points: ReadonlyArray<Point>, radius: number) => {
  const corner = (index: number) => {
    const [x, y] = points[index]
    const [px, py] = points[(index + points.length - 1) % points.length]
    const [nx, ny] = points[(index + 1) % points.length]
    const toward = (tx: number, ty: number) => {
      const length = Math.hypot(tx - x, ty - y)
      return [x + ((tx - x) / length) * radius, y + ((ty - y) / length) * radius] as const
    }
    return { from: toward(px, py), control: [x, y] as const, to: toward(nx, ny) }
  }
  const corners = points.map((_, index) => corner(index))
  const path = corners.map(
    (c, index) => `${index === 0 ? "M" : "L"}${c.from.join(" ")}Q${c.control.join(" ")} ${c.to.join(" ")}`
  )
  return `${path.join("")}Z`
}

const outlines: Record<AvatarShape, string> = {
  circle: "M60 8a52 52 0 1 1 0 104a52 52 0 1 1 0-104Z",
  pebble: "M56 16C84 8 110 26 112 56C114 84 92 102 62 104C34 106 8 94 8 66C8 40 30 23 56 16Z",
  squircle: "M60 10C98 10 110 22 110 60C110 98 98 110 60 110C22 110 10 98 10 60C10 22 22 10 60 10Z",
  capsule: "M38 30H82A30 30 0 0 1 82 90H38A30 30 0 0 1 38 30Z",
  triangle: roundedPolygon(
    [
      [60, 10],
      [114, 104],
      [6, 104]
    ],
    20
  ),
  hexagon: roundedPolygon(
    [
      [34, 14],
      [86, 14],
      [112, 60],
      [86, 106],
      [34, 106],
      [8, 60]
    ],
    13
  ),
  cloud:
    "M34 96C18 96 8 84 8 71C8 58 17 49 29 47C30 31 43 20 59 20C72 20 83 28 87 41C102 42 112 54 112 68C112 84 100 96 86 96Z",
  droplet: "M60 6C60 6 102 52 102 76C102 98 83 113 60 113C37 113 18 98 18 76C18 52 60 6 60 6Z"
}

/** Where the face sits, so it stays on the widest part of each shape. */
const faceCentre: Record<AvatarShape, Point> = {
  circle: [60, 56],
  pebble: [62, 56],
  squircle: [60, 56],
  capsule: [60, 58],
  triangle: [60, 72],
  hexagon: [60, 56],
  cloud: [60, 62],
  droplet: [60, 76]
}

interface Eye {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotate?: number
}

const pair = (x: number, y: number, width: number, height: number, rotate = 0, mirror = false) =>
  [
    { x: -x, y, width, height, rotate: mirror ? -rotate : rotate },
    { x, y, width, height, rotate }
  ] as const

const faces: Record<AvatarFace, readonly [Eye, Eye]> = {
  neutral: pair(12, 0, 8.5, 19, -16),
  attentive: pair(11, 0, 7, 16),
  surprised: pair(13, 0, 13, 13),
  excited: pair(14, 0, 13, 20, 8, true),
  happy: pair(14, 0, 13, 4),
  laughing: pair(14, 0, 14, 4, -14, true),
  angry: pair(13, 2, 14, 5, 18, true),
  sad: pair(13, 2, 6, 15, 18, true),
  scared: pair(13, 0, 15, 21),
  suspicious: [
    { x: -13, y: 0, width: 12, height: 3 },
    { x: 13, y: 0, width: 6, height: 6 }
  ],
  confused: [
    { x: -13, y: 0, width: 5, height: 14, rotate: -10 },
    { x: 13, y: 0, width: 13, height: 4, rotate: 15 }
  ],
  curious: [
    { x: -12, y: 2, width: 7, height: 12, rotate: 8 },
    { x: 13, y: -1, width: 9, height: 17, rotate: 8 }
  ],
  proud: pair(14, -6, 13, 4, -6),
  shy: pair(12, 10, 6, 11, 12),
  unimpressed: pair(14, 0, 14, 3),
  sleepy: pair(12, 7, 8, 3)
}

const channels = (hex: string) => {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x9a9a9a
  return [value >> 16, (value >> 8) & 255, value & 255] as const
}

/** White eyes, except on bodies too pale for them to show. */
const eyeColor = (hex: string) => {
  const [red, green, blue] = channels(hex)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 200 ? "#141414" : "#FFFFFF"
}

/** The face sits low and to the right of each shape's centre. */
const FACE_OFFSET_X = 2
const FACE_OFFSET_Y = 13
const EYE_SCALE = 1.35
const EYE_SPREAD = 1.15

const MAX_LOOK = 6
const FOLLOW_DISTANCE = 240
const SPRING = 0.09
const DAMPING = 0.72
const BLINK_MS = 170

/** Moves the face toward the cursor and blinks. Parks itself when nothing moves. */
const useLiveFace = (
  enabled: boolean,
  svg: React.RefObject<SVGSVGElement | null>,
  face: React.RefObject<SVGGElement | null>
) => {
  useEffect(() => {
    const element = svg.current
    const group = face.current
    if (!enabled || element === null || group === null) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const state = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
    let frame = 0
    let blinkTimer = 0

    const step = () => {
      state.vx = (state.vx + (state.tx - state.x) * SPRING) * DAMPING
      state.vy = (state.vy + (state.ty - state.y) * SPRING) * DAMPING
      state.x += state.vx
      state.y += state.vy
      group.setAttribute("transform", `translate(${state.x.toFixed(2)} ${state.y.toFixed(2)})`)
      const settled = Math.hypot(state.tx - state.x, state.ty - state.y) < 0.02 && Math.hypot(state.vx, state.vy) < 0.02
      frame = settled ? 0 : requestAnimationFrame(step)
    }
    const wake = () => {
      if (frame === 0) frame = requestAnimationFrame(step)
    }

    const area = element.closest<HTMLElement>("[data-watch-area]") ?? element
    const look = (event: PointerEvent) => {
      const bounds = area.getBoundingClientRect()
      const inside =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom
      if (inside) {
        const box = element.getBoundingClientRect()
        const dx = event.clientX - (box.left + box.width / 2)
        const dy = event.clientY - (box.top + box.height / 2)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(1, distance / FOLLOW_DISTANCE) * MAX_LOOK
        state.tx = (dx / distance) * reach
        state.ty = (dy / distance) * reach
      } else {
        state.tx = 0
        state.ty = 0
      }
      wake()
    }

    const blink = () => {
      const start = performance.now()
      const eyes = Array.from(group.querySelectorAll("rect"))
      const heights = eyes.map((eye) => Number(eye.getAttribute("height")))
      const close = (now: number) => {
        const progress = Math.min(1, (now - start) / BLINK_MS)
        const lid = 1 - 0.9 * Math.sin(progress * Math.PI)
        eyes.forEach((eye, index) => {
          const height = heights[index] * lid
          eye.setAttribute("height", height.toFixed(2))
          eye.setAttribute("y", (-height / 2).toFixed(2))
        })
        if (progress < 1) requestAnimationFrame(close)
      }
      requestAnimationFrame(close)
      blinkTimer = window.setTimeout(blink, 2600 + Math.random() * 3200)
    }
    blinkTimer = window.setTimeout(blink, 2200)

    window.addEventListener("pointermove", look, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(blinkTimer)
      window.removeEventListener("pointermove", look)
    }
  }, [enabled, svg, face])
}

export interface BotAvatarProps {
  shape?: AvatarShape
  face?: AvatarFace
  /** A #rrggbb colour. */
  color?: string
  size?: number
  /** Follows the cursor inside the nearest `[data-watch-area]` and blinks. */
  live?: boolean
  className?: string
}

/** A flat figure with a face, drawn entirely with SVG. */
export function BotAvatar({
  shape = "circle",
  face = "neutral",
  color = "#3B8BEB",
  size = 28,
  live = false,
  className
}: BotAvatarProps) {
  const svg = useRef<SVGSVGElement>(null)
  const faceGroup = useRef<SVGGElement>(null)
  useLiveFace(live, svg, faceGroup)

  const [centreX, centreY] = faceCentre[shape]
  const outline = outlines[shape]
  const eyes = eyeColor(color)

  return (
    <svg
      ref={svg}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, overflow: "visible" }}
    >
      <path d={outline} fill={color} />

      <g ref={faceGroup}>
        {faces[face].map((eye) => {
          const width = eye.width * EYE_SCALE
          const height = eye.height * EYE_SCALE
          const x = centreX + FACE_OFFSET_X + eye.x * EYE_SPREAD
          const y = centreY + FACE_OFFSET_Y + eye.y
          return (
            <g key={eye.x} transform={`translate(${x} ${y}) rotate(${eye.rotate ?? 0})`}>
              <rect
                x={-width / 2}
                y={-height / 2}
                width={width}
                height={height}
                rx={Math.min(width, height) / 2}
                fill={eyes}
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
