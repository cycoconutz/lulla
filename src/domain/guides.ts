export interface GuideSection {
  title: string
  body: string
}

export interface Guide {
  id: string
  topic: 'sleep' | 'feeding' | 'development'
  ageMinMonths: number
  ageMaxMonths: number
  title: string
  summary: string
  sections: GuideSection[]
}

// Original prose written from public AAP / CDC guidance. Not medical advice.
export const GUIDES: Guide[] = [
  {
    id: 'sleep-0-3',
    topic: 'sleep',
    ageMinMonths: 0,
    ageMaxMonths: 3,
    title: 'Sleep in the newborn weeks',
    summary: 'Newborns sleep 14–17 hours a day in short stretches and don’t yet know night from day.',
    sections: [
      {
        title: 'What to expect',
        body: 'In the first weeks, babies sleep in 2–4 hour stretches around the clock. Waking to feed is normal and important. Day/night confusion is very common — expose your baby to daylight and normal household sounds during the day, and keep nighttime feeds dim and quiet.',
      },
      {
        title: 'Sleep position',
        body: 'Always place your baby on their back for every sleep, on a firm, flat surface with no loose blankets, pillows, or toys. This is the AAP’s safest-sleep guidance.',
      },
      {
        title: 'Safe co-sleeping alternatives',
        body: 'Keep your baby in a crib or bassinet in your room for at least the first 6 months. Bring your baby into bed only for feeding, and return them to their own sleep surface when done.',
      },
    ],
  },
  {
    id: 'sleep-3-12',
    topic: 'sleep',
    ageMinMonths: 3,
    ageMaxMonths: 12,
    title: 'Naps and longer stretches',
    summary: 'Around 3–5 months, sleep starts consolidating; most babies nap 2–3 times and may sleep longer stretches at night.',
    sections: [
      {
        title: 'Wake windows',
        body: 'A wake window is how long your baby can stay alert between sleeps. It grows from roughly 90 minutes at 3 months to about 2–3 hours by 6–9 months. Watch for early tired cues — rubbing eyes, pulling ears, zoning out.',
      },
      {
        title: 'Building a routine',
        body: 'A short, predictable bedtime routine (bath, book, lullaby, tuck-in) can help signal that sleep is coming. Try to put your baby down drowsy but awake so they learn to settle.',
      },
      {
        title: 'Sleeping through the night',
        body: '"Through the night" is usually defined as a 5–6 hour stretch. Many babies reach it between 3–6 months, but it varies. Not every feeding at night needs to stop right away.',
      },
    ],
  },
  {
    id: 'feeding-0-6',
    topic: 'feeding',
    ageMinMonths: 0,
    ageMaxMonths: 6,
    title: 'Feeding in the first half year',
    summary: 'Breast milk or formula is the complete diet until around 6 months — no water or other food is needed.',
    sections: [
      {
        title: 'How often',
        body: 'Newborns typically nurse 8–12 times in 24 hours. Formula-fed babies often take 2–3 ounces every 3–4 hours, growing to 4–6 ounces per feed over the first months. Watch your baby, not the clock: hunger cues beat a strict schedule.',
      },
      {
        title: 'Is baby getting enough?',
        body: 'Good signs include steady weight gain, at least 6–8 wet diapers a day, and alertness when awake. Your pediatrician tracks the growth curve at well-child visits.',
      },
      {
        title: 'Pumped milk basics',
        body: 'Freshly pumped breast milk lasts about 4 hours at room temperature, 4 days in the fridge, and 6 months in the freezer. Label with the date and use the oldest first.',
      },
    ],
  },
  {
    id: 'feeding-6-12',
    topic: 'feeding',
    ageMinMonths: 6,
    ageMaxMonths: 12,
    title: 'Introducing solids',
    summary: 'Around 6 months, when baby can sit with support and shows interest, begin complementary foods while keeping milk feeds.',
    sections: [
      {
        title: 'Getting started',
        body: 'Start with iron-rich foods like iron-fortified cereal or pureed meat, then add single-ingredient fruits, vegetables, and grains. Introduce one new food at a time and watch for reactions.',
      },
      {
        title: 'Texture and choking safety',
        body: 'Move from smooth purees to mashed and soft finger-sized pieces as your baby develops. Stay present at every meal and learn to recognize what causes choking vs. gagging.',
      },
      {
        title: 'Allergens',
        body: 'Guidance now recommends introducing common allergens like peanut and egg early and regularly (around 6 months), unless your pediatrician advises otherwise.',
      },
    ],
  },
  {
    id: 'dev-0-12',
    topic: 'development',
    ageMinMonths: 0,
    ageMaxMonths: 12,
    title: 'Milestones to watch for',
    summary: 'Babies develop at their own pace. These are common windows, not deadlines — check in with your pediatrician at each well-child visit.',
    sections: [
      {
        title: '0–3 months',
        body: 'Lifting their head, following faces with their eyes, smiling, cooing, and reacting to sounds.',
      },
      {
        title: '4–6 months',
        body: 'Rolling over, reaching and grabbing toys, babbling, laughing, and starting to sit with support.',
      },
      {
        title: '6–9 months',
        body: 'Sitting without support, responding to their name, babbling with speech-like sounds, and starting to explore foods.',
      },
      {
        title: '9–12 months',
        body: 'Crawling, pulling to stand, cruising along furniture, first words like "mama" or "dada", and using gestures like pointing and waving.',
      },
    ],
  },
]

export function guidesForAge(months: number): Guide[] {
  return GUIDES.filter((g) => months >= g.ageMinMonths && months <= g.ageMaxMonths)
}

export function guideForId(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id)
}