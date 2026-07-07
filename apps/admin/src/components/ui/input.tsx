import * as React from "react";
import { cn } from "../../lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded border border-anac-border bg-white px-3 py-2 text-sm text-anac-text",
      "placeholder:text-anac-muted",
      "focus:outline-none focus:ring-2 focus:ring-anac-sky focus:border-transparent",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "transition-shadow",
      className
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
