export type Player = {
  id: string
  key: string
  name: string
  firstName?: string
  lastName?: string
  teamAbbr?: string
  teamFullName?: string
  position?: string
  selectedPosition?: string
  eligiblePositions: Array<string>
  uniformNumber?: string
  imageUrl?: string
  headshot?: string
  isUndroppable?: boolean
  positionType?: 'B' | 'P' | string
  hits?: number
  runs?: number
  rbis?: number
  homeRuns?: number
  avg?: number
  ops?: number
  sb?: number
  ip?: number
  wins?: number
  losses?: number
  saves?: number
  strikeouts?: number
  era?: number
  whip?: number
  totalPoints?: number
  weekPoints?: number
  week?: string
  allStats?: Record<
    string,
    {
      value: number | string
      name: string
      category: string
      raw_stat_id: string
    }
  >
}
