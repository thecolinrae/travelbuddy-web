export const tripKeys = {
  all: ['trips'] as const,
  list: () => ['trips', 'list'] as const,
  detail: (id: string) => ['trips', id] as const,
  timeline: (id: string) => ['trips', id, 'timeline'] as const,
  activities: (id: string) => ['trips', id, 'activities'] as const,
  legs: (id: string) => ['trips', id, 'legs'] as const,
  notifications: ['notifications'] as const,
};
