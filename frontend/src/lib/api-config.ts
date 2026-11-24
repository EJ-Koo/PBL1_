// Keep the production API shared by login, diary, and shop requests.
// Both environment variable names are supported for existing local/build setups.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  'https://api.star2day.com';
