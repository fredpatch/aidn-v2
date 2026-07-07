import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all outline-none select-none focus-visible:ring-2 focus-visible:ring-anac-sky disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-anac-navy text-white hover:bg-anac-blue",
        secondary: "bg-white text-anac-navy border border-anac-border hover:bg-anac-gray",
        ghost: "text-anac-muted hover:bg-anac-gray hover:text-anac-text",
        destructive: "bg-anac-danger/10 text-anac-danger hover:bg-anac-danger/20",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-8 px-3 text-[13px]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
