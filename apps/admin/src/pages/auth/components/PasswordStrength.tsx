import { CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "../../../lib/utils";

const RULES = [
  { label: "8 caracteres minimum", test: (p: string) => p.length >= 8 },
  { label: "Une majuscule", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Un chiffre", test: (p: string) => /[0-9]/.test(p) },
  { label: "Un caractere special", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const BAR_COLOR = ["", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-anac-success"];
const STRENGTH_LABEL = ["", "Faible", "Moyen", "Bon", "Fort"];
const STRENGTH_COLOR = ["", "text-red-500", "text-amber-600", "text-blue-600", "text-anac-success"];

export function PasswordStrength({ password }: { password: string }) {
  const rules = RULES.map((r) => ({ ...r, ok: r.test(password) }));
  const score = rules.filter((r) => r.ok).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((n) => (
            <motion.div
              key={n}
              className={cn("h-[3px] flex-1 rounded-full", n <= score ? BAR_COLOR[score] : "bg-anac-border")}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.22, delay: n * 0.04 }}
              style={{ originX: 0 }}
            />
          ))}
        </div>
        <span className={cn("text-[10px] font-semibold tabular-nums w-8 text-right", STRENGTH_COLOR[score])}>
          {STRENGTH_LABEL[score]}
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {rules.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5 text-[10px]">
            <motion.span
              initial={false}
              animate={{ scale: r.ok ? [1.4, 1] : 1 }}
              transition={{ type: "spring", stiffness: 380 }}
            >
              {r.ok ? (
                <CheckCircle2 size={10} className="text-anac-success" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full border border-anac-border inline-block" />
              )}
            </motion.span>
            <span className={r.ok ? "text-anac-text" : "text-anac-muted"}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
