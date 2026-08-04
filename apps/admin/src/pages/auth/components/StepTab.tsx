import { CheckCircle2 } from "lucide-react";
import { cn } from "../../../lib/utils";

export function StepTab({
  active,
  completed,
  step,
  label,
}: {
  active: boolean;
  completed: boolean;
  step: number;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex-1 flex items-center gap-2 px-5 py-3 text-[11px] font-medium transition-colors select-none",
        active && "bg-anac-gray text-anac-navy",
        completed && "text-anac-success",
        !active && !completed && "text-anac-muted"
      )}
    >
      <span
        className={cn(
          "w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 transition-colors",
          active && "bg-anac-navy text-white",
          completed && "bg-anac-success text-white",
          !active && !completed && "bg-anac-border text-anac-muted"
        )}
      >
        {completed ? <CheckCircle2 size={12} /> : step}
      </span>
      {label}
    </div>
  );
}
