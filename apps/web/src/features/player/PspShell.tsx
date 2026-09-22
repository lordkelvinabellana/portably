import type { MouseEvent, PointerEvent, ReactNode } from 'react'

/**
 * PSP-style on-screen controls around the game: D-pad and analog nub on the left,
 * face buttons on the right, shoulders on top, Select/Start below. Works with mouse
 * and touch through pointer events and injects RetroPad inputs into the core.
 */
type InputFn = (id: number, value: number) => void

interface Props {
  input: InputFn
  children: ReactNode
}

// RetroPad ids as EmulatorJS uses them for the PSP scheme.
const ID = {
  cross: 0,
  square: 1,
  select: 2,
  start: 3,
  up: 4,
  down: 5,
  left: 6,
  right: 7,
  circle: 8,
  triangle: 9,
  l: 10,
  r: 11,
  stickRight: 16,
  stickLeft: 17,
  stickDown: 18,
  stickUp: 19,
} as const

const ANALOG_MAX = 0x7fff

interface BtnProps {
  input: InputFn
  id: number
  label: string
  aria: string
  className?: string
  analog?: boolean
}

function PadButton({ input, id, label, aria, className = '', analog = false }: BtnProps) {
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault() // keep keyboard focus on the game
    e.currentTarget.setPointerCapture(e.pointerId)
    input(id, analog ? ANALOG_MAX : 1)
  }
  const up = () => input(id, 0)
  return (
    <button
      type="button"
      aria-label={aria}
      className={`psp-btn ${className}`}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e: MouseEvent) => e.preventDefault()}
    >
      {label}
    </button>
  )
}

export function PspShell({ input, children }: Props) {
  return (
    <div className="psp-shell">
      <div className="psp-side">
        <PadButton input={input} id={ID.l} label="L" aria="L trigger" className="psp-shoulder" />
        <div className="psp-dpad" role="group" aria-label="D-pad">
          <PadButton input={input} id={ID.up} label="▲" aria="D-pad up" className="psp-dpad-up" />
          <PadButton input={input} id={ID.left} label="◀" aria="D-pad left" className="psp-dpad-left" />
          <PadButton input={input} id={ID.right} label="▶" aria="D-pad right" className="psp-dpad-right" />
          <PadButton input={input} id={ID.down} label="▼" aria="D-pad down" className="psp-dpad-down" />
        </div>
        <div className="psp-dpad psp-nub" role="group" aria-label="Analog stick">
          <PadButton input={input} id={ID.stickUp} label="▲" aria="Stick up" className="psp-dpad-up" analog />
          <PadButton input={input} id={ID.stickLeft} label="◀" aria="Stick left" className="psp-dpad-left" analog />
          <PadButton input={input} id={ID.stickRight} label="▶" aria="Stick right" className="psp-dpad-right" analog />
          <PadButton input={input} id={ID.stickDown} label="▼" aria="Stick down" className="psp-dpad-down" analog />
        </div>
        <PadButton input={input} id={ID.select} label="SELECT" aria="Select" className="psp-small" />
      </div>

      <div className="psp-screen">{children}</div>

      <div className="psp-side">
        <PadButton input={input} id={ID.r} label="R" aria="R trigger" className="psp-shoulder" />
        <div className="psp-dpad" role="group" aria-label="Face buttons">
          <PadButton input={input} id={ID.triangle} label="△" aria="Triangle" className="psp-dpad-up psp-face" />
          <PadButton input={input} id={ID.square} label="□" aria="Square" className="psp-dpad-left psp-face" />
          <PadButton input={input} id={ID.circle} label="○" aria="Circle" className="psp-dpad-right psp-face" />
          <PadButton input={input} id={ID.cross} label="✕" aria="Cross" className="psp-dpad-down psp-face" />
        </div>
        <div className="psp-dpad psp-nub" aria-hidden="true" />
        <PadButton input={input} id={ID.start} label="START" aria="Start" className="psp-small" />
      </div>
    </div>
  )
}
