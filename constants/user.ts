export function getSingleUserId(): string | null {
  const configuredUserId = process.env.EXPO_PUBLIC_SINGLE_USER_ID?.trim();
  if (!configuredUserId) {
    return null;
  }
  return configuredUserId;
}

