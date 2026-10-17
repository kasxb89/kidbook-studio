export function isValidInspirationDate(value: string, today: string) {
  if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) || value > today) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function inspirationArchivePage(value?: string) {
  return value && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1;
}
