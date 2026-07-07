import { type Variants, type Transition } from "framer-motion";

export const slideVariants: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 36 : -36, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -36 : 36, opacity: 0 }),
};

export const slideTx: Transition = { duration: 0.26, ease: "easeOut" };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
