import { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "../../../components/ui/label";

interface FormFieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ id, label, error, hint, required, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {required && (
          <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold bg-red-50 text-red-500 border border-red-100 leading-none select-none">
            Requis
          </span>
        )}
      </div>
      {children}
      <AnimatePresence>
        {error ? (
          <motion.p
            key="error"
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.14 }}
            className="text-[11px] text-anac-danger flex items-center gap-1"
            role="alert"
          >
            <AlertCircle size={12} className="shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <p key="hint" className="text-[10px] text-anac-muted">
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
