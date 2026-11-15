// The bridge goes in first: modules run in import order, and the interface asks it right away.
import "./install.ts"
import "../renderer/src/main.tsx"
