import type { ChatImage } from "@scope-bot/domain"

// Models see no more detail than this, and the photo is stored with the chat.
const MAX_SIDE = 1568
const JPEG_QUALITY = 0.85

/** Shrinks a picked file into a JPEG small enough to keep and send. */
export const toChatImage = async (file: File): Promise<ChatImage> => {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const data = canvas.toDataURL("image/jpeg", JPEG_QUALITY).split(",")[1] ?? ""
  return { mediaType: "image/jpeg", data }
}
