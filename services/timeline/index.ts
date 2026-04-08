// Re-export everything for zero-change backwards compatibility with
// any existing `import ... from '@/services/timeline'` consumers.
export { airportsMatch } from './utils';
export { eventSortKey } from './normalize';
export {
  buildTimeline,
  deduplicateTimeline,
  mergeTimelines,
  migrateTimeline,
} from './build';
export {
  getTimelineExpenses,
  normalizeBudgetCategory,
  extractDestinationsFromTimeline,
  formatTimeline,
} from './format';
// makeCost has moved to @/services/currency — re-export here for any legacy imports
export { makeCost } from '../currency';
