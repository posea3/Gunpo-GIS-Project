export function getLocationPhotoUrls(details: Record<string, unknown>) {
  const value = details['사진'];

  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string =>
        typeof item === 'string' && /^https?:\/\/\S+$/i.test(item),
    );
  }

  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value)
    ? [value]
    : [];
}
