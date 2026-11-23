import { BOOKMARKS } from './ex9/bookmarks.js';
export type Story = {
  experiment: 'ex9' | 'ex13';
  title: string;
  initialRound: number;
  bookmarks: typeof BOOKMARKS;
};
export function presentationExperiment(search: string): Story['experiment'] {
  return new URLSearchParams(search).get('experiment') === 'ex13'
    ? 'ex13'
    : 'ex9';
}
export function parseStory(value: unknown): Story {
  if (!value || typeof value !== 'object')
    throw new Error('Missing recorded story metadata.');
  const story = value as Story;
  if (
    story.experiment !== 'ex13' ||
    typeof story.title !== 'string' ||
    !Number.isSafeInteger(story.initialRound) ||
    story.initialRound < 0 ||
    !Array.isArray(story.bookmarks) ||
    story.bookmarks.length > 12 ||
    story.bookmarks.some(
      (b) =>
        !Number.isSafeInteger(b.tick) ||
        b.tick < 0 ||
        !['lin', 'moss', 'sol'].includes(b.actor) ||
        !['lin', 'moss', 'sol'].includes(b.sourceActor) ||
        [b.title, b.text, b.type].some((s) => typeof s !== 'string'),
    )
  )
    throw new Error('Invalid recorded story metadata.');
  return story;
}
export async function presentationStory(
  experiment: Story['experiment'],
): Promise<Story> {
  if (experiment === 'ex9')
    return {
      experiment,
      title: 'EX9 · Real experiment replay · Visual enhancement',
      initialRound: 79,
      bookmarks: BOOKMARKS,
    };
  const response = await fetch(`./presentation/${experiment}/story.json`);
  if (!response.ok)
    throw new Error(
      'This observation has no published presentation evidence yet.',
    );
  return parseStory((await response.json()) as unknown);
}
