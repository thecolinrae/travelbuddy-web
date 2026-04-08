import { withTripAuth } from '@/lib/api';
import { fetchDestinationPhotos } from '@/services/photos';

export const GET = withTripAuth(async ({ trip }) => {
  const photos = await fetchDestinationPhotos(trip.destination, 4);
  return Response.json({ photos });
});
