import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-smooth disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none border-0 shadow-elevation-1 hover:shadow-elevation-2 focus-visible:shadow-elevation-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary to-primary/90 hover:from-primary/90 hover:to-primary/80 text-primary-foreground hover:scale-105 active:scale-95",
        destructive:
          "bg-gradient-to-br from-destructive to-destructive/90 hover:from-destructive/90 hover:to-destructive/80 text-white hover:scale-105 active:scale-95",
        outline:
          "bg-gradient-to-br from-[var(--elevation-1)] to-[var(--elevation-2)] hover:from-[var(--elevation-2)] hover:to-[var(--elevation-3)] backdrop-blur-sm text-foreground hover:scale-105 active:scale-95",
        secondary:
          "bg-gradient-to-br from-[var(--elevation-2)] to-[var(--elevation-3)] hover:from-[var(--elevation-3)] hover:to-[var(--elevation-4)] text-foreground hover:scale-105 active:scale-95",
        ghost:
          "hover:bg-[var(--elevation-2)] hover:text-foreground transition-smooth",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
