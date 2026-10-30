// The one class-name joiner for component *variants*.
//
// Deliberately a plain join, not `clsx` + `tailwind-merge`: this repo carries no
// merging dependency, so a component must express a variant through a prop
// (Card's `density`, DatasetCard's `variant`) rather than by handing it a
// utility that is expected to beat the variant's own class. Page code keeps
// writing template strings, as everywhere else here.
export type ClassPart = string | false | null | undefined;

export function cn(...parts: ClassPart[]): string {
    return parts.filter(Boolean).join(' ');
}
