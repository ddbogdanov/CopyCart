/**
 * Plural-aware count label for user-facing messages: "1 order line" /
 * "3 order lines". Pass the plural form for words like "copy" → "copies".
 */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : pluralForm}`
}
