import { motion } from 'framer-motion'
import { AlgorithmId } from '../lib/algorithms'

const loop = (duration: number, delay = 0) => ({ duration, delay, repeat: Infinity, ease: 'easeInOut' as const })

/** Tiny looping illustration of how each algorithm works (decorative). */
export function AlgorithmGlyph({ id, color, size = 56 }: { id: AlgorithmId; color: string; size?: number }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size} aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="55" height="55" rx="12" fill="none" stroke="rgba(255,255,255,0.10)" />
      {id === 'token_bucket' && (
        <>
          <path d="M14 18 L17 44 H39 L42 18" fill="none" stroke="#c3c2b7" strokeWidth="1.5" strokeLinejoin="round" />
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.circle
              key={i}
              cx={20 + (i % 3) * 8}
              cy={38 - Math.floor(i / 3) * 8}
              r="3"
              fill={color}
              animate={{ opacity: [1, 1, 0.15, 0.15, 1], scale: [1, 1, 0.6, 0.6, 1] }}
              transition={loop(3.2, i * 0.25)}
            />
          ))}
        </>
      )}
      {id === 'leaky_bucket' && (
        <>
          <path d="M14 14 L17 40 H39 L42 14" fill="none" stroke="#c3c2b7" strokeWidth="1.5" strokeLinejoin="round" />
          <motion.rect
            x="17" width="22" fill={color} fillOpacity="0.85" rx="1"
            animate={{ y: [24, 30, 24], height: [16, 10, 16] }}
            transition={loop(2.4)}
          />
          {[0, 1].map((i) => (
            <motion.circle key={i} cx="28" r="2" fill={color}
              animate={{ cy: [42, 52], opacity: [1, 0] }}
              transition={{ duration: 0.9, delay: i * 0.6, repeat: Infinity, ease: 'easeIn' }} />
          ))}
        </>
      )}
      {id === 'fixed_window' && (
        <>
          {[0, 1, 2].map((w) => (
            <rect key={w} x={9 + w * 13} y="16" width="11" height="24" rx="2" fill="none" stroke="#383835" />
          ))}
          {[0, 1, 2].map((w) => (
            <motion.rect key={`f${w}`} x={9 + w * 13} width="11" rx="2" fill={color}
              animate={{ height: [0, 24, 24, 0], y: [40, 16, 16, 40] }}
              transition={loop(3, w * 1)} />
          ))}
        </>
      )}
      {id === 'sliding_window' && (
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={8 + i * 5.2} y={34 - ((i * 7) % 12)} width="2.5" height={6 + ((i * 7) % 12)} rx="1" fill="#383835" />
          ))}
          <motion.rect y="14" width="22" height="30" rx="4" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.5"
            animate={{ x: [6, 28, 6] }} transition={loop(4)} />
        </>
      )}
    </svg>
  )
}
