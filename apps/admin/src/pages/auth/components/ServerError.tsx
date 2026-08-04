import { AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function ServerError({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.16 }}
          className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3.5 py-2.5 text-[11px]"
          role="alert"
          aria-live="polite"
        >
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
