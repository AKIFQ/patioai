import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-muted-foreground/60 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 flex field-sizing-content min-h-16 w-full rounded-xl border-0 bg-gradient-to-br from-[var(--elevation-1)] to-[var(--elevation-2)] px-3 py-2 text-base shadow-elevation-1 transition-smooth outline-none focus-visible:shadow-elevation-3 hover:shadow-elevation-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm backdrop-blur-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
