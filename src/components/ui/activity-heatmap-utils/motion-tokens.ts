export const motionTokens = {
  ease: {
    enter: [0.16, 1, 0.3, 1] as const,
    standard: [0.22, 1, 0.36, 1] as const,
  },
  blur: {
    soft: 4,
    subtle: 2,
  },
  spring: {
    morph: { type: "spring", stiffness: 400, damping: 30 } as const,
    snappy: { type: "spring", stiffness: 500, damping: 28 } as const,
  },
  duration: {
    fast: 0.16,
    spring: 0.58,
  },
};
