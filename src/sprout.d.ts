export type SproutOptions = {
  /** CSS selector for elements that make the pet curious on hover. */
  reactSelectors?: string
  /** When true, the pet chases `window.__ballsState` (e.g. the error page). */
  playful?: boolean
  /** Starting position. */
  start?: { x: number; y: number }
  /** Fixed bloom shape; omit for a random shape per load. */
  seed?: number
  /** Controlled mode — disables idle roam, drag, hover reactions, tantrum-walk. The host drives her position via `moveTo`. */
  controlled?: boolean
  /** Uniform scale applied to her root transform. e.g. 0.5 for a maze-sized Sprout. */
  scale?: number
}

/** Her per-page activity. `null` = roam freely. Dark mode overrides all to sleep. */
export type SproutActivity =
  | 'singing'
  | 'music'
  | 'painting'
  | 'reading'
  | 'coding'
  | 'fortune'
  | 'blooming'
  | 'sleep'
  | null

export type SproutMood = 'happy' | 'curious' | 'sleepy' | 'idle'

export type SproutHandle = {
  /** Remove all DOM, listeners and the RAF loop. */
  destroy: () => void
  /** Set what she does on the current page (null = roam). */
  setActivity: (name: SproutActivity) => void
  /** Start a transient hover preview of an activity (null = roam). */
  previewActivity: (name: SproutActivity) => void
  /** End the hover preview, reverting to the page's own activity. */
  clearPreview: () => void
  /** Hide + pause her entirely (e.g. the professional Experience pages). */
  setHidden: (hidden: boolean) => void
  /** Move toward (x, y) in viewport pixels — only meaningful in controlled mode. */
  moveTo: (x: number, y: number) => void
  /** Hard-teleport to (x, y) in viewport pixels — no easing. Use across frame
   *  swaps so she doesn't visibly drift between mazes. */
  snap: (x: number, y: number) => void
  /** Change her uniform scale at runtime. Takes effect on the next frame. */
  setScale: (s: number) => void
  /** Trigger a mood emote (happy / curious / sleepy / idle). */
  emote: (mood: SproutMood) => void
}

/** Mount the Sprout pet. Returns a handle with controls + teardown. */
export function mountSprout(opts?: SproutOptions): SproutHandle

declare global {
  interface Window {
    /** Live ball positions for the pet's `playful` chase (set by the error screen). */
    __ballsState?: { x: number; y: number }[]
    /** When true, the pet's RAF loop pauses. */
    __petPause?: boolean
    /** Internal error trace from the pet's tick loop. */
    __petTickErr?: string
  }
}
