/**
 * A message as one line for a list, without the Markdown an employee may use
 * in chats with the team (ADR 0024). Only marks that are clearly formatting go.
 */
export const plainPreview = (text: string) =>
  text
    .split("\n")
    // A table's line under its header says nothing.
    .filter((line) => !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, "")
        .replace(/^\s*\||\|\s*$/g, "")
        .replace(/\s*\|\s*/g, " · ")
    )
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
    .replace(/(\*\*|__|~~)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/(^|[^\w*])\*(\S(?:[^*]*?\S)?)\*(?!\w)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
