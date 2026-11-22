/* The anatomy of a katana: what each part is, what it is made of, what it does.
   `dx` is how far the part slides along the blade when the sword comes apart (in sword units).
   `ax` / `ay` is the point the callout and the zoom aim at, in the sword's own coordinates.
   `zoom` is how far the camera pushes in while this part is the subject. */
export const PARTS = [
  {
    id: 'kashira', num: '01', name: 'Kashira', jp: '柄頭', title: 'Pommel cap',
    ax: 23, ay: 0, dx: -210, zoom: 3.4, side: 'up', groups: ['kashira'],
    role: 'Caps the end of the handle and locks the braid in place. A small ring carries the silk cord.',
    material: 'Shakudō, a dark copper and gold alloy. Horn on plainer swords.',
    spec: [['Fits', 'End of the tsuka'], ['Ring', 'Kashira-kan, for the cord'], ['Finish', 'Dark patina, hand polished']]
  },
  {
    id: 'tsuka', num: '02', name: 'Tsuka', jp: '柄', title: 'Handle',
    ax: 209, ay: 0, dx: -140, zoom: 1.45, side: 'down', groups: ['tsuka'],
    role: 'A magnolia wood core wrapped in ray skin, then in silk braid pulled tight in a diamond lattice. Two small menuki hide under the braid and shape the grip.',
    material: 'Magnolia wood, ray skin (same-gawa), silk braid (tsuka-ito), menuki ornaments.',
    spec: [['Wrap', 'Hishi-maki, diamond lattice'], ['Core', 'Hōnoki magnolia, two halves'], ['Grip', 'Menuki sit under the palm']]
  },
  {
    id: 'fuchi', num: '03', name: 'Fuchi', jp: '縁', title: 'Collar',
    ax: 382, ay: 0, dx: -70, zoom: 4.4, side: 'up', groups: ['fuchi'],
    role: 'A snug metal collar at the guard end of the handle. It stops the wood splitting under the shock of a cut.',
    material: 'Shakudō or iron, often inlaid with fine ivory-toned lines.',
    spec: [['Fits', 'Between handle and guard'], ['Job', 'Reinforces the wood'], ['Weight', 'A few grams, all of it load bearing']]
  },
  {
    id: 'tsuba', num: '04', name: 'Tsuba', jp: '鍔', title: 'Guard',
    ax: 403, ay: 0, dx: 0, zoom: 3.1, side: 'down', groups: ['tsuba', 'seppa'],
    role: 'The guard. It keeps the hand from sliding onto the blade and balances the sword. Seen edge-on it is a sliver; face-on it is a small work of art.',
    material: 'Hand-forged iron, pierced with a cherry-blossom pattern (sukashi). Copper washers (seppa) either side.',
    spec: [['Diameter', 'About 7 to 8 cm'], ['Thickness', 'About 4 to 6 mm'], ['Pierced', 'Four blossom openings']]
  },
  {
    id: 'habaki', num: '05', name: 'Habaki', jp: '鎺', title: 'Blade collar',
    ax: 447, ay: 0, dx: 120, zoom: 3.8, side: 'up', groups: ['habaki'],
    role: 'A tapered wedge that grips the blade at its base and wedges it into the scabbard, so the sword never rattles and never rests on the edge.',
    material: 'Copper, wrapped in gold or silver foil.',
    spec: [['Shape', 'Tapered wedge'], ['Fits', 'Base of the blade'], ['Job', 'Holds the blade in the scabbard']]
  },
  {
    id: 'blade', num: '06', name: 'Tōshin', jp: '刀身', title: 'Blade',
    ax: 845, ay: 0, dx: 240, zoom: 1.15, side: 'down', groups: ['blade'],
    role: 'Folded and forged until the steel is clean. A soft core is wrapped in a hard skin, then the whole blade is curved in the quench.',
    material: 'Tamahagane steel, folded and welded, hand ground and polished.',
    spec: [['Length', 'Over 60 cm (typically about 70)'], ['Curve', 'Sori, a gentle sweep'], ['Structure', 'Soft core, hard skin']]
  },
  {
    id: 'hamon', num: '07', name: 'Hamon', jp: '刃文', title: 'Temper line',
    ax: 960, ay: -3, dx: 240, zoom: 3.9, side: 'up', groups: ['blade'],
    role: 'The bright wave along the edge. Clay is painted on the spine before the quench, so the edge cools fast and goes hard while the spine stays tough.',
    material: 'Formed by the heat treatment itself. It is not painted or etched on.',
    spec: [['Edge', 'Hardened, martensite'], ['Spine', 'Tough, pearlite'], ['Look', 'Each one is unique']]
  }
];

export const HERO = {
  kicker: 'Katana · 刀',
  word: 'DISCIPLINE',
  line: 'Sharp is not a gift. It is a habit.',
  hint: 'Scroll to take it apart'
};

export const OUTRO = { quote: 'Bleed quietly. Cut clean.', note: 'More of the story soon.' };
