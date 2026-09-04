export function formatOutput<T>(data: T, json: boolean): string {
  if (json) {
    return JSON.stringify(data, null, 2);
  }
  return formatAsText(data);
}

function formatAsText(data: unknown, indent = 0): string {
  const prefix = '  '.repeat(indent);
  if (typeof data === 'string') return `${prefix}${data}`;
  if (Array.isArray(data)) {
    return data.map((item) => formatAsText(item, indent)).join('\n');
  }
  if (data !== null && typeof data === 'object') {
    return Object.entries(data)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${prefix}${key}:\n${formatAsText(value, indent + 1)}`;
        }
        return `${prefix}${key}: ${String(value)}`;
      })
      .join('\n');
  }
  return `${prefix}${String(data)}`;
}
