// Which of an item's details are worth showing next to it. "Stored with" /
// "next to" details just repeat the other things in the same place, which the
// house view already lists, so they're left out.

const REDUNDANT = /^(stored[ _]?with|kept[ _]?with|next[ _]?to|alongside|with)$/i

export function shownDetails(details: { key: string; value: string }[] | undefined): string[] {
  return (details ?? []).filter((d) => !REDUNDANT.test(d.key.trim())).map((d) => `${d.key}: ${d.value}`)
}
