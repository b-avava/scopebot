import type { ComponentProps } from "react"
import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * What an employee may use in a chat with the team (ADR 0024). Raw HTML is
 * dropped, and anything else, like images or code, shows as its plain text.
 */
const ALLOWED = [
  "p",
  "br",
  "hr",
  "strong",
  "em",
  "del",
  "h1",
  "h2",
  "h3",
  "h4",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td"
]

const heading = ({ children }: ComponentProps<"h3">) => (
  <h3 className="mt-1 text-base leading-6 font-semibold">{children}</h3>
)

const components: Components = {
  // Models break lines with one newline and mean it, so a paragraph keeps them.
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-muted-foreground">{children}</ul>,
  ol: ({ children }) => (
    <ol className="flex list-decimal flex-col gap-1 pl-5 marker:text-muted-foreground">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 pl-3 text-muted-foreground [&>p]:inline">{children}</blockquote>
  ),
  hr: () => <hr className="border-border" />,
  // Links leave the app only through the main process, which asks first.
  a: ({ href, children }) => (
    <button
      type="button"
      title={href}
      onClick={() => {
        if (href !== undefined) void window.scopeBot.openLink(href)
      }}
      className="cursor-pointer underline decoration-muted-foreground underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  ),
  table: ({ children }) => (
    <div className="max-w-full overflow-x-auto rounded-card border">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="border-b text-[13px] text-muted-foreground">{children}</thead>,
  tr: ({ children }) => <tr className="border-b last:border-b-0">{children}</tr>,
  th: ({ children, style }) => (
    <th style={style} className="px-3.5 py-2.5 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="px-3.5 py-2.5">
      {children}
    </td>
  )
}

/** An employee's answer, formatted as it wrote it. */
export const MarkdownText = ({ text }: { readonly text: string }) => (
  <div className="flex max-w-[760px] flex-col gap-3 text-[15px] leading-6 [overflow-wrap:anywhere]">
    <Markdown remarkPlugins={[remarkGfm]} allowedElements={ALLOWED} unwrapDisallowed skipHtml components={components}>
      {text}
    </Markdown>
  </div>
)
