const CLOUDFRONT_URL = process.env.CLOUDFRONT_URL?.replace(/\/$/, "") ?? "";

export const resolveImageUrls = (
  data: any,
  visited = new WeakSet<object>()
): any => {
  if (data === null || data === undefined) {
    return data;
  }

  // Primitive values
  if (typeof data !== "object") {
    return data;
  }

  // Prevent circular recursion
  if (visited.has(data)) {
    return data;
  }

  visited.add(data);

  // Arrays
  if (Array.isArray(data)) {
    return data.map((item) => resolveImageUrls(item, visited));
  }

  // Image object
  if (
    Object.prototype.hasOwnProperty.call(data, "key") &&
    Object.prototype.hasOwnProperty.call(data, "url")
  ) {
    return {
      ...data,
      // Uploaded images keep their CDN URL; direct image URLs have no S3 key.
      url:
        data.key && CLOUDFRONT_URL
          ? `${CLOUDFRONT_URL}/${data.key}`
          : data.url,
    };
  }

  // Only recursively process normal object properties
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    result[key] = resolveImageUrls(value, visited);
  }

  return result;
};
