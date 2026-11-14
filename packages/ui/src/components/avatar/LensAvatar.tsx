import { useEffect, useId, useRef } from "react"

/** What the employee is doing. The face shows it, so it is read from data and never picked. */
export type LensState = "working" | "approval" | "after-hours" | "paused" | "with-person"

/** Small marks for known jobs, from Lucide. */
export type LensSign = "headset" | "tag" | "repeat" | "chart"

const signPaths: Record<LensSign, ReadonlyArray<string>> = {
  headset: [
    "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"
  ],
  tag: [
    "M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",
    "M7.5 7.5h.01"
  ],
  repeat: [
    "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
    "M21 3v5h-5",
    "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
    "M8 16H3v5"
  ],
  chart: ["M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3"]
}

const personPaths = ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"]

/** Less detail as it gets smaller, so it never turns to mush. */
type Detail = "full" | "standard" | "compact" | "tiny"

const detailFor = (size: number): Detail => {
  if (size >= 80) return "full"
  if (size >= 44) return "standard"
  if (size >= 26) return "compact"
  return "tiny"
}

const MAX_LOOK = 2.4
const FOLLOW_DISTANCE = 240
const SPRING = 0.09
const DAMPING = 0.72
const BLINK_MS = 170

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Springs the eyes toward a target. Parks itself when they settle. */
const springEyes = (svg: SVGSVGElement, group: SVGGElement) => {
  const state = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }
  let frame = 0

  const step = () => {
    state.vx = (state.vx + (state.tx - state.x) * SPRING) * DAMPING
    state.vy = (state.vy + (state.ty - state.y) * SPRING) * DAMPING
    state.x += state.vx
    state.y += state.vy
    group.setAttribute("transform", `translate(${state.x.toFixed(2)} ${state.y.toFixed(2)})`)
    const settled = Math.hypot(state.tx - state.x, state.ty - state.y) < 0.02 && Math.hypot(state.vx, state.vy) < 0.02
    frame = settled ? 0 : requestAnimationFrame(step)
  }

  return {
    /** Looks at a point on screen, or straight ahead with null. */
    lookAt: (point: { readonly clientX: number; readonly clientY: number } | null) => {
      if (point === null) {
        state.tx = 0
        state.ty = 0
      } else {
        const box = svg.getBoundingClientRect()
        const dx = point.clientX - (box.left + box.width / 2)
        const dy = point.clientY - (box.top + box.height / 2)
        const distance = Math.hypot(dx, dy) || 1
        const reach = Math.min(1, distance / FOLLOW_DISTANCE) * MAX_LOOK
        state.tx = (dx / distance) * reach
        state.ty = (dy / distance) * reach
      }
      if (frame === 0) frame = requestAnimationFrame(step)
    },
    stop: () => cancelAnimationFrame(frame)
  }
}

/** Closes and opens the eyes once. A blink already under way is left to finish. */
const blinkOnce = (group: SVGGElement) => {
  if (group.dataset.blinking !== undefined) return
  group.dataset.blinking = ""
  const start = performance.now()
  const lids = Array.from(group.querySelectorAll("ellipse"))
  // The eyes are round, so the width is the open height.
  const heights = lids.map((eye) => Number(eye.getAttribute("rx")))
  const close = (now: number) => {
    const progress = Math.min(1, (now - start) / BLINK_MS)
    const lid = 1 - 0.9 * Math.sin(progress * Math.PI)
    for (const [index, eye] of lids.entries()) eye.setAttribute("ry", ((heights[index] ?? 0) * lid).toFixed(2))
    if (progress < 1) requestAnimationFrame(close)
    else delete group.dataset.blinking
  }
  requestAnimationFrame(close)
}

const isInside = (area: Element, event: PointerEvent) => {
  const bounds = area.getBoundingClientRect()
  return (
    event.clientX >= bounds.left &&
    event.clientX <= bounds.right &&
    event.clientY >= bounds.top &&
    event.clientY <= bounds.bottom
  )
}

/** Moves the eyes toward the cursor and blinks now and then. */
const useLiveEyes = (
  enabled: boolean,
  svg: React.RefObject<SVGSVGElement | null>,
  eyes: React.RefObject<SVGGElement | null>
) => {
  useEffect(() => {
    const element = svg.current
    const group = eyes.current
    if (!enabled || element === null || group === null || reducedMotion()) return

    const spring = springEyes(element, group)
    const area = element.closest<HTMLElement>("[data-watch-area]") ?? element
    const look = (event: PointerEvent) => spring.lookAt(isInside(area, event) ? event : null)

    let blinkTimer = 0
    const blink = () => {
      blinkOnce(group)
      blinkTimer = window.setTimeout(blink, 2600 + Math.random() * 3200)
    }
    blinkTimer = window.setTimeout(blink, 2200)

    window.addEventListener("pointermove", look, { passive: true })
    return () => {
      spring.stop()
      window.clearTimeout(blinkTimer)
      window.removeEventListener("pointermove", look)
    }
  }, [enabled, svg, eyes])
}

const HOP_MS = 420

/**
 * Notices the pointer coming into the button or link the avatar sits in: a
 * small hop, one blink, and the eyes follow the pointer until it leaves.
 */
const useHoverGreeting = (
  state: LensState,
  enabled: boolean,
  svg: React.RefObject<SVGSVGElement | null>,
  eyes: React.RefObject<SVGGElement | null>
) => {
  useEffect(() => {
    const element = svg.current
    const group = eyes.current
    // A paused employee is off, so it does not react.
    if (!enabled || state === "paused" || element === null || group === null || reducedMotion()) return

    const area = element.closest<HTMLElement>("button, a")
    if (area === null) return
    // Closed eyes after hours stay closed; only the hop shows it noticed.
    const awake = state !== "after-hours"
    const spring = springEyes(element, group)
    let hop: Animation | null = null

    const enter = (event: PointerEvent) => {
      hop?.cancel()
      hop = element.animate(
        [
          { transform: "translateY(0) scale(1)" },
          { transform: "translateY(-2px) scale(1.07)", offset: 0.35 },
          { transform: "translateY(0) scale(1)" }
        ],
        { duration: HOP_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
      )
      if (!awake) return
      blinkOnce(group)
      spring.lookAt(event)
    }
    const move = (event: PointerEvent) => {
      if (awake) spring.lookAt(event)
    }
    const leave = () => {
      if (awake) spring.lookAt(null)
    }

    area.addEventListener("pointerenter", enter)
    area.addEventListener("pointermove", move, { passive: true })
    area.addEventListener("pointerleave", leave)
    return () => {
      hop?.cancel()
      spring.stop()
      group.removeAttribute("transform")
      area.removeEventListener("pointerenter", enter)
      area.removeEventListener("pointermove", move)
      area.removeEventListener("pointerleave", leave)
    }
  }, [state, enabled, svg, eyes])
}

const Eyes = ({ state, detail }: { readonly state: LensState; readonly detail: Detail }) => {
  const radius = { full: 3.6, standard: 3.6, compact: 4.2, tiny: 5 }[detail]
  const stroke = detail === "tiny" ? 4 : detail === "compact" ? 3 : 2.5

  if (state === "after-hours") {
    return (
      <path
        d="M22.5 33q3.5 3.5 7 0 M34.5 33q3.5 3.5 7 0"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
    )
  }
  if (state === "paused") {
    return <path d="M23 33h6 M35 33h6" fill="none" stroke="#FFFFFF" strokeWidth={stroke} strokeLinecap="round" />
  }

  const spread = detail === "tiny" ? 7 : 6
  const [x, y] = { working: [32, 33], approval: [34, 30], "with-person": [29, 34] }[state]
  return (
    <>
      {detail === "full" &&
        [-spread, spread].map((offset) => (
          <circle key={offset} cx={x + offset} cy={y + 1.3} r={radius} fill="#000000" fillOpacity={0.18} />
        ))}
      {[-spread, spread].map((offset) => (
        <ellipse key={offset} cx={x + offset} cy={y} rx={radius} ry={radius} fill="#FFFFFF" />
      ))}
    </>
  )
}

const badgeCentre = { top: [51, 13], bottom: [52, 52] } as const

/** A round mark in a corner. The lens has a hole around it, so it reads on any background. */
const Badge = ({
  at,
  paths,
  fill,
  ink
}: {
  readonly at: "top" | "bottom"
  readonly paths: ReadonlyArray<string>
  readonly fill: string
  readonly ink: string
}) => {
  const [cx, cy] = badgeCentre[at]
  return (
    <>
      <circle cx={cx} cy={cy} r={11} fill={fill} />
      <g
        transform={`translate(${cx - 5.75} ${cy - 5.75}) scale(0.48)`}
        fill="none"
        stroke={ink}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((path) => (
          <path key={path} d={path} />
        ))}
      </g>
    </>
  )
}

const Body = ({
  color,
  state,
  detail,
  gradient
}: {
  readonly color: string
  readonly state: LensState
  readonly detail: Detail
  readonly gradient: string
}) => {
  const paused = state === "paused"
  const waiting = state === "approval"
  // A ring outside a smaller lens, so the size of the avatar stays the same.
  const body = waiting ? 26 : detail === "tiny" ? 29 : 28
  const shiny = detail !== "compact" && detail !== "tiny" && !paused && !waiting

  return (
    <>
      {waiting && (
        <circle
          cx={32}
          cy={32}
          r={30.5}
          fill="none"
          strokeWidth={detail === "tiny" ? 5 : 3.5}
          className="stroke-amber-500 dark:stroke-amber-400"
        />
      )}
      <circle
        cx={32}
        cy={32}
        r={body}
        fill={paused ? undefined : color}
        className={paused ? "fill-[#C9C9C9] dark:fill-[#4A4A4A]" : undefined}
      />
      {detail === "full" && (
        <>
          <defs>
            <radialGradient id={gradient} cx="0.5" cy="0.25" r="0.8">
              <stop offset="0" stopColor="#000000" stopOpacity={0.02} />
              <stop offset="1" stopColor="#000000" stopOpacity={0.32} />
            </radialGradient>
          </defs>
          <circle cx={32} cy={32} r={body - 0.8} fill="none" stroke="#FFFFFF" strokeOpacity={0.14} strokeWidth={1} />
        </>
      )}
      {detail !== "tiny" && <Lens paused={paused} waiting={waiting} detail={detail} gradient={gradient} />}
      {shiny && (
        <path
          d="M11.5 25A22 22 0 0 1 25 11.5"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.78}
          strokeWidth={detail === "full" ? 2.6 : 3}
          strokeLinecap="round"
        />
      )}
      {shiny && detail === "full" && <circle cx={10.6} cy={30.6} r={1.4} fill="#FFFFFF" fillOpacity={0.6} />}
      {state === "after-hours" && detail !== "tiny" && (
        <path
          d="M40 20h5l-5 6h5"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={0.85}
          strokeWidth={detail === "compact" ? 2.5 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </>
  )
}

const Lens = ({
  paused,
  waiting,
  detail,
  gradient
}: {
  readonly paused: boolean
  readonly waiting: boolean
  readonly detail: Detail
  readonly gradient: string
}) => {
  const full = detail === "full"
  return (
    <circle
      cx={32}
      cy={33}
      r={waiting ? 17.5 : 19}
      fill={full ? `url(#${gradient})` : "#000000"}
      fillOpacity={full ? 1 : paused ? 0.08 : 0.16}
      stroke="#FFFFFF"
      strokeOpacity={paused ? 0.3 : 0.42}
      strokeWidth={detail === "compact" ? 3 : 2.4}
    />
  )
}

export interface LensAvatarProps {
  /** A #rrggbb colour. Ignored while paused. */
  readonly color: string
  readonly size?: number
  readonly state?: LensState
  readonly sign?: LensSign | null
  /** Follows the cursor inside the nearest `[data-watch-area]` and blinks. */
  readonly live?: boolean
  /** Hops, blinks and watches the pointer while it is over the button or link around the avatar. */
  readonly greet?: boolean
  readonly className?: string
}

/**
 * An employee: a lens with eyes. The colour is chosen, the face follows the
 * state, and the sign follows the job.
 */
export function LensAvatar({
  color,
  size = 32,
  state = "working",
  sign = null,
  live = false,
  greet = false,
  className
}: LensAvatarProps) {
  const svg = useRef<SVGSVGElement>(null)
  const eyes = useRef<SVGGElement>(null)
  const id = useId()
  const gradient = `${id}-lens`
  const hole = `${id}-hole`
  const detail = detailFor(size)
  const badges = detail !== "tiny"
  const corners = badges
    ? [...(state === "with-person" ? ["top" as const] : []), ...(sign === null ? [] : ["bottom" as const])]
    : []
  useLiveEyes(live && state === "working", svg, eyes)
  useHoverGreeting(state, greet && !live, svg, eyes)

  return (
    <svg
      ref={svg}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, overflow: "visible" }}
    >
      {corners.length > 0 && (
        <mask id={hole}>
          <rect x={-4} y={-4} width={72} height={72} fill="#FFFFFF" />
          {corners.map((corner) => (
            <circle key={corner} cx={badgeCentre[corner][0]} cy={badgeCentre[corner][1]} r={13.5} fill="#000000" />
          ))}
        </mask>
      )}
      <g mask={corners.length > 0 ? `url(#${hole})` : undefined}>
        <Body color={color} state={state} detail={detail} gradient={gradient} />
        <g ref={eyes}>
          <Eyes state={state} detail={detail} />
        </g>
      </g>
      {badges && state === "with-person" && (
        <Badge at="top" paths={personPaths} fill="var(--foreground)" ink="var(--background)" />
      )}
      {badges && sign !== null && <Badge at="bottom" paths={signPaths[sign]} fill="#3A3A3A" ink="#FFFFFF" />}
    </svg>
  )
}
