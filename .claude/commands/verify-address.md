Verify and correct the address for the activity or event the user is referring to using Google Maps.

## How to use this skill

The user has invoked `/verify-address`, likely pointing at a specific activity or event. Your job is:

1. **Identify the target** — look at the user's message for a name, activity, hotel, or event. Use the trip context (Activities Bank and Itinerary) to find the matching `activityId` or `eventId`.

2. **Call `verify_address`** with the correct id:
   - Use `activityId` for anything from the Activities Bank
   - Use `eventId` for hotels or activity events from the Itinerary

3. **Report the result clearly**:
   - If address was updated: show the old address (if known) and the new verified one
   - If the place is permanently closed: tell the user and offer to remove it or find a replacement
   - If the place wasn't found on Google Maps: say so and offer to manually update the address
   - If no API key is configured: explain verification isn't available

4. **Offer next steps** based on the outcome:
   - Updated address → "The map pin will now be accurate. Want me to verify any other activities?"
   - Permanently closed → "Want me to remove this and suggest an alternative?"
   - Not found → "You can tell me the correct address and I'll update it manually."

## Examples

User: `/verify-address the Sagrada Familia hotel booking`
→ Find the hotel check-in event for Sagrada Familia area, call `verify_address` with its eventId

User: `/verify-address`
→ Ask: "Which activity or event should I verify? I can check any hotel, restaurant, or attraction in your trip."

User: `/verify-address check all activities for Day 3`
→ Call `verify_address` for each activity scheduled on that day, one at a time, and summarize results

## Notes

- `verify_address` works on **hotel events** and **activity events** in the itinerary, and on any **activity** in the Activities Bank
- It does NOT work on flights or transport legs (those have airport codes, not street addresses)
- Verification also stores latitude/longitude, which improves map pin accuracy going forward
- If the user says an address "looks wrong" or asks to "fix" it, use this tool rather than manually guessing an address
