import * as React from "react";
import { cn } from "../../lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn("block text-[11.5px] font-medium text-anac-text mb-1.5 leading-none", className)}
    {...props}
  />
));
Label.displayName = "Label";

export { Label };
