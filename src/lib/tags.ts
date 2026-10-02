export const parseTags = (value: string): string[] => [
  ...new Set(
    value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  )
];

export const mergeTags = (...groups: string[][]): string[] =>
  [...new Set(groups.flat())].sort((a, b) => a.localeCompare(b, 'zh-CN'));
