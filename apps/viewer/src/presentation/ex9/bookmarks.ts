import type { Person } from './model.js';
/** Presentation pointers only. Every source is checked against retained events. */
export const BOOKMARKS: {
  tick: number;
  actor: Person;
  title: string;
  text: string;
  type: string;
  sourceActor: Person;
}[] = [
  {
    tick: 71,
    actor: 'lin',
    sourceActor: 'moss',
    title: 'Material changes hands',
    type: 'given',
    text: 'Moss hands eight units of dry grass to Lin. Materials move between real inventories; the shelter does not exist yet.',
  },
  {
    tick: 76,
    actor: 'lin',
    sourceActor: 'lin',
    title: 'A shelter takes work',
    type: 'shelter-build-progress',
    text: 'Lin has paid three of six construction rounds. Reserved materials and an unfinished structure are shown as work in progress.',
  },
  {
    tick: 79,
    actor: 'lin',
    sourceActor: 'lin',
    title: 'A shared shelter',
    type: 'shelter-build-completed',
    text: 'Six paid rounds produce a real shelter with an entrance and 160 service units. Completion alone gives no construction reward.',
  },
  {
    tick: 448,
    actor: 'moss',
    sourceActor: 'moss',
    title: 'Cold becomes a request',
    type: 'learning',
    text: 'After the cold-weather need recorded at decision 444, portable insulation is reviewed and Moss begins personal study. No garment has been produced.',
  },
  {
    tick: 469,
    actor: 'lin',
    sourceActor: 'lin',
    title: 'From willow to material',
    type: 'willow-work-completed',
    text: 'Four paid rounds turn one harvested willow bundle into two bark units, one bast and one offcut. Later capabilities use these physical materials.',
  },
  {
    tick: 518,
    actor: 'lin',
    sourceActor: 'lin',
    title: 'A garment, not a reward',
    type: 'insulation-completed',
    text: 'Lin finishes a mantle after five paid rounds. It is in inventory and is not yet worn; equipment changes at round 519.',
  },
  {
    tick: 519,
    actor: 'lin',
    sourceActor: 'lin',
    title: 'Protection is equipped',
    type: 'insulation-equipped',
    text: 'Lin equips the mantle made at round 518. The visible outer layer follows the actual equipped flag, condition and moisture.',
  },
  {
    tick: 721,
    actor: 'sol',
    sourceActor: 'sol',
    title: 'Through the cave entrance',
    type: 'moved',
    text: 'Sol passes through the existing cave entrance. A cutaway reveals the recorded position; no new room or facility is added.',
  },
  {
    tick: 927,
    actor: 'sol',
    sourceActor: 'sol',
    title: 'Maintain an earlier result',
    type: 'insulation-completed',
    text: 'Two paid repair rounds restore Sol’s original round-489 mantle to condition 160, using bark and vine. It remains unequipped here.',
  },
  {
    tick: 930,
    actor: 'sol',
    sourceActor: 'sol',
    title: 'The remaining material',
    type: 'willow-work-completed',
    text: 'After repairing the mantle, Sol finishes three rounds of twisting bast into cord. Both activities use the willow processed at round 919.',
  },
];
