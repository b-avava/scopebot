import type { AgentFace, AgentShape } from "@scope-bot/domain"

export const jobs = ["Front desk", "Sales", "Follow-ups", "Reports"] as const

export const timeZones = [
  "Asia/Tbilisi",
  "Asia/Yerevan",
  "Asia/Baku",
  "Europe/Moscow",
  "Asia/Almaty",
  "Asia/Tashkent",
  "Europe/Kyiv",
  "UTC"
] as const

/** A character is a shape with its own face, picked as one thing. */
export const avatarCharacters: ReadonlyArray<{ readonly shape: AgentShape; readonly face: AgentFace }> = [
  { shape: "circle", face: "neutral" },
  { shape: "squircle", face: "attentive" },
  { shape: "triangle", face: "curious" },
  { shape: "hexagon", face: "surprised" },
  { shape: "pebble", face: "excited" },
  { shape: "capsule", face: "happy" },
  { shape: "cloud", face: "shy" },
  { shape: "droplet", face: "proud" },
  { shape: "circle", face: "sleepy" },
  { shape: "squircle", face: "laughing" },
  { shape: "hexagon", face: "confused" },
  { shape: "pebble", face: "unimpressed" }
]

export const avatarColors = [
  { value: "#8C5A3C", label: "Brown" },
  { value: "#E8404A", label: "Red" },
  { value: "#F2772E", label: "Orange" },
  { value: "#F5A623", label: "Amber" },
  { value: "#3CBF6E", label: "Green" },
  { value: "#2FB5A0", label: "Teal" },
  { value: "#3B8BEB", label: "Blue" },
  { value: "#8A5CF0", label: "Purple" },
  { value: "#EC3F97", label: "Pink" },
  { value: "#7A7A7A", label: "Gray" }
] as const

export const defaultLook = {
  shape: "circle",
  face: "neutral",
  color: "#3B8BEB"
} as const

// Used by the Suggestions block, which is commented out in HireScreen for now.
export const suggestions = [
  {
    title: "No-show rescue",
    description: "Reminds patients and refills empty slots",
    name: "Lasha",
    job: "Follow-ups",
    look: { shape: "circle", face: "attentive", color: "#E34F4F" }
  },
  {
    title: "Morning report",
    description: "Yesterday's bookings and misses by 9:00",
    name: "Tako",
    job: "Reports",
    look: { shape: "capsule", face: "neutral", color: "#8B6CEB" }
  },
  {
    title: "Review follow-up",
    description: "Checks in with patients after a visit",
    name: "Giorgi",
    job: "Follow-ups",
    look: { shape: "squircle", face: "happy", color: "#4A93E8" }
  }
] as const
