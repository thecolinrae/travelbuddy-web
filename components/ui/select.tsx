import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<"select">
>(({ className, children, ...props }, ref) => {
  return (
    <div className="relative">
      <select
        className={cn(
          // Layout & shape — matches Input exactly
          "flex h-10 w-full appearance-none rounded-md border border-input bg-background",
          // Text
          "px-3 py-2 pr-9 text-sm text-text-base",
          // Focus ring — uses brand yellow
          "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary",
          // Hover
          "hover:border-border/80 hover:bg-surface/40",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Transition
          "transition-colors duration-150",
          // Dark mode
          "dark:bg-background dark:text-text-base dark:border-border",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
    </div>
  )
})
Select.displayName = "Select"

export { Select }
