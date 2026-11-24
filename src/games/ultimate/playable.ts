import type { RoomState } from '../../types'

export function ultimateBoardIsPlayable(room: RoomState, boardIndex: number) {
  const ultimate = room.ultimate

  return Boolean(
    ultimate &&
      ultimate.claims[boardIndex] === null &&
      ultimate.boards[boardIndex]?.some((cell) => cell === null),
  )
}
