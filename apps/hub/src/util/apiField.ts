/**
 * Reads a field from an API resource by its camelCase name.
 *
 * The hub types resources with the Prisma models (camelCase), but the HTTP API serializes the sqlc
 * rows with snake_case JSON keys (e.g. `published_at`, `connection_category`). This reads either form
 * so table cells show the real value instead of silently rendering `undefined`.
 */
const apiField = <T = unknown>(
  resource: object | null | undefined,
  camelKey: string,
): T | undefined => {
  if (!resource) return undefined
  const record = resource as Record<string, unknown>
  if (record[camelKey] !== undefined) return record[camelKey] as T

  const snakeKey = camelKey.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
  return record[snakeKey] as T | undefined
}

export default apiField
