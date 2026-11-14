import QRCode from "qrcode"

/** A QR code as rows of `0` and `1`, so the app can draw it without an image. */
export const qrRows = (text: string): ReadonlyArray<string> => {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "L" })
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) => (modules.get(row, column) ? "1" : "0")).join("")
  )
}
