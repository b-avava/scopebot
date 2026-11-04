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

export const avatarShapes: ReadonlyArray<AgentShape> = [
  "circle",
  "pebble",
  "squircle",
  "capsule",
  "triangle",
  "hexagon",
  "cloud",
  "droplet"
]

export const avatarFaces: ReadonlyArray<AgentFace> = [
  "neutral",
  "attentive",
  "surprised",
  "excited",
  "happy",
  "laughing",
  "angry",
  "sad",
  "scared",
  "suspicious",
  "confused",
  "curious",
  "proud",
  "shy",
  "unimpressed",
  "sleepy"
]

export const avatarColors = [
  { value: "#EE8B3A", label: "Orange" },
  { value: "#EFB53C", label: "Yellow" },
  { value: "#E34F4F", label: "Red" },
  { value: "#E05AA8", label: "Pink" },
  { value: "#8B6CEB", label: "Purple" },
  { value: "#4A93E8", label: "Blue" },
  { value: "#3FBFA3", label: "Teal" },
  { value: "#4FC98B", label: "Green" },
  { value: "#8C5E3C", label: "Brown" },
  { value: "#9A9A9A", label: "Gray" },
  { value: "#F2F0EA", label: "White" },
  { value: "#2B2B2B", label: "Black" }
] as const

export const defaultLook = {
  shape: "circle",
  face: "neutral",
  color: "#EE8B3A"
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
