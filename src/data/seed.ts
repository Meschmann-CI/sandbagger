import type { AppData } from '../types'

// Fictional demo data. It's what local mode shows and what the optional
// "load sample data" checkbox copies into a brand new group, so it ships
// in the JS bundle — keep real names, addresses, door codes, and booking
// confirmations out of here. Real history belongs in the database.

export const seedData: AppData = {
  currentUserId: 'p-alex',
  players: [
    { id: 'p-alex', name: 'Alex', initials: 'AM', handicap: 11.2, homeCourse: 'Cobbs Creek', color: '#1c7c4a', venmo: 'Alex-Demo' },
    { id: 'p-ravi', name: 'Ravi', initials: 'RS', handicap: 14.8, homeCourse: 'Rancho Park', color: '#2f6fa8', venmo: 'Ravi-Demo' },
    { id: 'p-danny', name: 'Danny', initials: 'DC', handicap: 17.5, homeCourse: 'Cobbs Creek', color: '#b8702f', venmo: 'Danny-Demo' },
    { id: 'p-kim', name: 'Kim', initials: 'KR', handicap: 21.0, homeCourse: 'Sandy Hollow', color: '#7a5195' },
  ],
  group: {
    id: 'g-1',
    name: 'Sunday Foursome',
    inviteCode: 'FORE24',
    adminId: 'p-alex',
    memberIds: ['p-alex', 'p-ravi', 'p-danny', 'p-kim'],
  },

  // Only the home course has its card filled in, so the demo shows both
  // sides: scores against par where it's known, and the prompt to add it
  // where it isn't.
  courses: [
    {
      id: 'c-cobbs',
      groupId: 'g-1',
      name: 'Cobbs Creek',
      slug: 'cobbs creek',
      //     1  2  3  4  5  6  7  8  9 | 10 11 12 13 14 15 16 17 18
      pars: [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4],
      // Odd rankings on the front, even on the back, so strokes fall
      // evenly over both nines. That's how a real card is laid out.
      strokeIndex: [5, 1, 17, 7, 11, 15, 3, 9, 13, 6, 16, 8, 2, 10, 12, 18, 4, 14],
    },
  ],

  // A spread of opinions so the ratings screen has something to sort:
  // one course everyone loves, one that splits the group, and the home
  // course rated by everyone with sub-scores on a couple.
  courseRatings: [
    {
      id: 'cr-1', groupId: 'g-1', courseSlug: 'mid pines', courseName: 'Mid Pines', playerId: 'p-alex',
      overall: 5, aspects: { conditions: 5, clubhouse: 5, food: 4, service: 5 }, note: 'Ross at his best. Play it every trip.', date: '2025-10-12',
    },
    { id: 'cr-2', groupId: 'g-1', courseSlug: 'mid pines', courseName: 'Mid Pines', playerId: 'p-ravi', overall: 5, date: '2025-10-12' },
    { id: 'cr-3', groupId: 'g-1', courseSlug: 'mid pines', courseName: 'Mid Pines', playerId: 'p-danny', overall: 4, aspects: { food: 3 }, date: '2025-10-13' },
    {
      id: 'cr-4', groupId: 'g-1', courseSlug: 'pine needles', courseName: 'Pine Needles', playerId: 'p-alex',
      overall: 4, aspects: { conditions: 5, practice: 5 }, date: '2025-10-13',
    },
    { id: 'cr-5', groupId: 'g-1', courseSlug: 'pine needles', courseName: 'Pine Needles', playerId: 'p-kim', overall: 5, note: 'Best greens of the trip.', date: '2025-10-13' },
    {
      id: 'cr-6', groupId: 'g-1', courseSlug: 'pine barrens course', courseName: 'Pine Barrens Course', playerId: 'p-ravi',
      overall: 3, aspects: { conditions: 3, service: 2 }, note: 'Slow. Five hours.', date: '2025-10-11',
    },
    { id: 'cr-7', groupId: 'g-1', courseSlug: 'pine barrens course', courseName: 'Pine Barrens Course', playerId: 'p-danny', overall: 4, date: '2025-10-11' },
    { id: 'cr-8', groupId: 'g-1', courseSlug: 'cobbs creek', courseName: 'Cobbs Creek', playerId: 'p-alex', overall: 4, aspects: { conditions: 3, practice: 2, food: 3 }, date: '2026-04-19' },
    { id: 'cr-9', groupId: 'g-1', courseSlug: 'cobbs creek', courseName: 'Cobbs Creek', playerId: 'p-ravi', overall: 3, date: '2026-04-19' },
    { id: 'cr-10', groupId: 'g-1', courseSlug: 'cobbs creek', courseName: 'Cobbs Creek', playerId: 'p-danny', overall: 4, note: 'Home. Bias admitted.', date: '2026-05-03' },
    { id: 'cr-11', groupId: 'g-1', courseSlug: 'cobbs creek', courseName: 'Cobbs Creek', playerId: 'p-kim', overall: 3, date: '2026-05-03' },
    { id: 'cr-12', groupId: 'g-1', courseSlug: 'rancho park', courseName: 'Rancho Park', playerId: 'p-ravi', overall: 4, date: '2026-06-01' },
  ],
  // Personal orders. Nobody has ranked everything, and the lists
  // disagree — that's the point of deriving the group's order from them
  // rather than from the stars.
  courseRankings: [
    { playerId: 'p-alex', groupId: 'g-1', slugs: ['mid pines', 'pine needles', 'cobbs creek', 'pine barrens course'] },
    { playerId: 'p-ravi', groupId: 'g-1', slugs: ['mid pines', 'rancho park', 'pine barrens course', 'cobbs creek'] },
    { playerId: 'p-danny', groupId: 'g-1', slugs: ['pine barrens course', 'mid pines', 'cobbs creek'] },
    { playerId: 'p-kim', groupId: 'g-1', slugs: ['pine needles', 'cobbs creek'] },
  ],

  rounds: [
    // ---- Sandhills trip ----
    {
      id: 'r-t1', groupId: 'g-1', date: '2025-10-10', courseName: 'Pine Barrens Course', tripId: 't-sandhills',
      players: [
        { playerId: 'p-alex', gross: 90, handicapSnapshot: 11.8 },
        { playerId: 'p-ravi', gross: 95, handicapSnapshot: 15.2 },
        { playerId: 'p-danny', gross: 99, handicapSnapshot: 17.9 },
        { playerId: 'p-kim', gross: 104, handicapSnapshot: 21.4 },
      ],
    },
    {
      id: 'r-t2', groupId: 'g-1', date: '2025-10-11', courseName: 'Mid Pines', tripId: 't-sandhills',
      players: [
        { playerId: 'p-alex', gross: 87, handicapSnapshot: 11.8 },
        { playerId: 'p-ravi', gross: 92, handicapSnapshot: 15.2 },
        { playerId: 'p-danny', gross: 94, handicapSnapshot: 17.9 },
        { playerId: 'p-kim', gross: 106, handicapSnapshot: 21.4 },
      ],
    },
    {
      id: 'r-t3', groupId: 'g-1', date: '2025-10-12', courseName: 'Pine Needles', tripId: 't-sandhills',
      players: [
        { playerId: 'p-alex', gross: 93, handicapSnapshot: 11.8 },
        { playerId: 'p-ravi', gross: 91, handicapSnapshot: 15.2 },
        { playerId: 'p-danny', gross: 97, handicapSnapshot: 17.9 },
        { playerId: 'p-kim', gross: 101, handicapSnapshot: 21.4 },
      ],
    },

    // ---- Rounds back home ----
    {
      id: 'r-h1', groupId: 'g-1', date: '2026-04-18', courseName: 'Cobbs Creek', tee: 'White',
      players: [
        { playerId: 'p-alex', gross: 88, handicapSnapshot: 11.2 },
        { playerId: 'p-ravi', gross: 93, handicapSnapshot: 14.8 },
        { playerId: 'p-danny', gross: 97, handicapSnapshot: 17.5 },
      ],
    },
    {
      id: 'r-s1', groupId: 'g-1', date: '2026-05-16', courseName: 'Rancho Park', tee: 'Blue',
      players: [{ playerId: 'p-ravi', gross: 90, handicapSnapshot: 14.8 }],
    },
    {
      id: 'r-h2', groupId: 'g-1', date: '2026-06-06', courseName: 'Sandy Hollow', tee: 'White',
      players: [
        { playerId: 'p-alex', gross: 91, handicapSnapshot: 11.2 },
        { playerId: 'p-kim', gross: 101, handicapSnapshot: 21.0 },
      ],
    },
    {
      id: 'r-h3', groupId: 'g-1', date: '2026-07-04', courseName: 'Cobbs Creek', tee: 'White',
      players: [
        { playerId: 'p-alex', gross: 86, handicapSnapshot: 11.2 },
        { playerId: 'p-ravi', gross: 91, handicapSnapshot: 14.8 },
        { playerId: 'p-danny', gross: 95, handicapSnapshot: 17.5 },
        { playerId: 'p-kim', gross: 99, handicapSnapshot: 21.0 },
      ],
    },
    {
      id: 'r-s2', groupId: 'g-1', date: '2026-07-25', courseName: 'Cobbs Creek', tee: 'White',
      players: [{ playerId: 'p-alex', gross: 89, handicapSnapshot: 11.2 }],
    },
    {
      id: 'r-h4', groupId: 'g-1', date: '2026-08-15', courseName: 'Rancho Park', tee: 'Blue',
      players: [
        { playerId: 'p-alex', gross: 92, handicapSnapshot: 11.2 },
        { playerId: 'p-ravi', gross: 89, handicapSnapshot: 14.8 },
        { playerId: 'p-danny', gross: 96, handicapSnapshot: 17.5 },
      ],
    },
  ],

  trips: [
    {
      id: 't-sandhills', groupId: 'g-1', name: 'Sandhills 2025', status: 'booked',
      location: 'Southern Pines, NC', startDate: '2025-10-09', endDate: '2025-10-12',
      note: '54 holes in three days. Nobody walked on day three.',
      attendeeIds: ['p-alex', 'p-ravi', 'p-danny', 'p-kim'], createdById: 'p-alex',
      options: [],
      itinerary: [
        {
          id: 'i-fly', date: '2025-10-09', endDate: '2025-10-12', time: '7:40 AM', kind: 'flight',
          title: 'Flight down to RDU', cost: 296,
          note: 'Two hours from the airport to the first tee. Clubs fly free on this fare.',
        },
        {
          id: 'i-house', date: '2025-10-09', endDate: '2025-10-12', time: '4:00 PM check-in', kind: 'lodging',
          title: 'Rental house near the village', cost: 1680,
          note: 'Four bedrooms, ten minutes from every course. Kitchen big enough to actually cook.',
          reviews: [
            { playerId: 'p-alex', rating: 5, comment: 'Book it again. The porch alone was worth it.' },
            { playerId: 'p-danny', rating: 3, comment: 'Thin walls. Somebody snores.' },
          ],
        },
        {
          id: 'i-g1', date: '2025-10-10', time: '9:20 AM', kind: 'tee', title: 'Pine Barrens Course', cost: 420,
          reviews: [{ playerId: 'p-alex', rating: 4, comment: 'Sandy waste areas everywhere. Bring extra balls.' }],
        },
        {
          id: 'i-e1', date: '2025-10-10', time: '7:30 PM', kind: 'meal', title: 'Dinner in the village',
          reviews: [
            { playerId: 'p-ravi', rating: 5, comment: 'Get the short rib. Skip the wedge salad.' },
            { playerId: 'p-kim', rating: 4 },
          ],
        },
        {
          id: 'i-g2', date: '2025-10-11', time: '8:10 AM', kind: 'tee', title: 'Mid Pines', cost: 460,
          note: 'Walkable. Caddies worth it if anyone wants one.',
          reviews: [{ playerId: 'p-ravi', rating: 5, comment: 'Best course of the trip and it was not close.' }],
        },
        { id: 'i-o1', date: '2025-10-11', time: '9:00 PM', kind: 'other', title: 'Poker at the house', note: 'Danny brings chips. Both kinds.' },
        {
          id: 'i-g3', date: '2025-10-12', time: '10:00 AM', kind: 'tee', title: 'Pine Needles', cost: 360,
          note: 'Check out first, clubs in the car.',
        },
      ],
    },

    {
      id: 't-spring27', groupId: 'g-1', name: 'Spring Trip 2027', status: 'planning',
      note: "Danny's out this one — his kid's travel season.",
      attendeeIds: ['p-alex', 'p-ravi', 'p-kim'], createdById: 'p-alex',
      options: [
        {
          id: 'o-scott', title: 'Scottsdale, AZ',
          pros: ['Weather is a lock in March', 'More courses than we could play', 'Direct flights'],
          cons: ['Peak season pricing', 'Long way for a long weekend'],
          votes: ['p-alex'],
        },
        {
          id: 'o-stream', title: 'Streamsong, FL',
          pros: ['Three courses on one property', 'No car needed once you arrive', 'Nothing else to distract us'],
          cons: ['Middle of nowhere', 'Lodging is the only option and it is not cheap'],
          votes: ['p-ravi'],
        },
        {
          id: 'o-bandon', title: 'Bandon Dunes, OR',
          pros: ['Bucket list for all of us', 'Walking only, proper golf', 'Kim has points for the flights'],
          cons: ['Hardest to get to', 'Could rain for four straight days'],
          votes: [],
        },
      ],
      itinerary: [],
    },
  ],

  bets: [
    {
      id: 'b-1', roundId: 'r-t2', type: 'skins', name: 'Skins', stake: 5,
      results: [
        { playerId: 'p-alex', amount: 30 },
        { playerId: 'p-ravi', amount: -5 },
        { playerId: 'p-danny', amount: -10 },
        { playerId: 'p-kim', amount: -15 },
      ],
    },
    {
      id: 'b-2', roundId: 'r-h3', type: 'nassau', name: 'Nassau', stake: 10,
      results: [
        { playerId: 'p-alex', amount: 20 },
        { playerId: 'p-ravi', amount: 10 },
        { playerId: 'p-danny', amount: -10 },
        { playerId: 'p-kim', amount: -20 },
      ],
    },
    {
      id: 'b-3', roundId: 'r-h4', type: 'custom', name: 'Closest to pin #14', stake: 5,
      results: [
        { playerId: 'p-alex', amount: -5 },
        { playerId: 'p-ravi', amount: 10 },
        { playerId: 'p-danny', amount: -5 },
      ],
    },
  ],

  expenses: [
    {
      id: 'e-house', tripId: 't-sandhills', description: 'Rental house', amount: 1680,
      category: 'lodging', paidById: 'p-alex', sharedByIds: ['p-alex', 'p-ravi', 'p-danny', 'p-kim'], date: '2025-10-09',
    },
    {
      id: 'e-fees', tripId: 't-sandhills', description: 'Green fees, all three rounds', amount: 1240,
      category: 'golf', paidById: 'p-alex', sharedByIds: ['p-alex', 'p-ravi', 'p-danny', 'p-kim'], date: '2025-10-10',
    },
    {
      id: 'e-car', tripId: 't-sandhills', description: 'Rental car', amount: 340,
      category: 'travel', paidById: 'p-ravi', sharedByIds: ['p-alex', 'p-ravi', 'p-danny', 'p-kim'], date: '2025-10-09',
    },
    {
      id: 'e-groc', tripId: 't-sandhills', description: 'Groceries and beer run', amount: 180,
      category: 'food', paidById: 'p-danny', sharedByIds: ['p-alex', 'p-ravi', 'p-danny', 'p-kim'], date: '2025-10-09',
    },
  ],

  payments: [{ id: 'pay-1', tripId: 't-sandhills', fromId: 'p-kim', toId: 'p-alex', amount: 860, date: '2025-10-20' }],
}
