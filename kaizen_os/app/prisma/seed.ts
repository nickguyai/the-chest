import { PrismaClient } from '@prisma/client'
import { DEFAULT_USER_SETTINGS } from '../lib/settings'

const prisma = new PrismaClient()

async function main() {
  // Create default development user
  const user = await prisma.user.upsert({
    where: { email: 'dev@kaizen.local' },
    update: {},
    create: {
      email: 'dev@kaizen.local',
      name: 'Developer',
      settings: DEFAULT_USER_SETTINGS,
    },
  })

  console.log('Created user:', user)

  // Create a sample season with theme allocations
  const season = await prisma.season.upsert({
    where: { id: 1 },
    update: {},
    create: {
      userId: user.id,
      name: 'Q1 2025',
      startDate: new Date('2025-01-01'),
      durationWeeks: 12,
      utilityRate: 40.0,
      themeAllocations: { '1': 0.25, '2': 0.25, '3': 0.25, '4': 0.25 },
      isActive: true,
    },
  })

  console.log('Created season:', season)

  // Create sample themes
  const themes = await Promise.all([
    prisma.card.upsert({
      where: { id: 1 },
      update: {},
      create: {
        userId: user.id,
        title: 'Health & Self Mastery',
        description: 'Physical and mental well-being',
        unitType: 'THEME',
        status: 'in_progress',
      },
    }),
    prisma.card.upsert({
      where: { id: 2 },
      update: {},
      create: {
        userId: user.id,
        title: 'Mastery & Impact',
        description: 'AI + Startups - Building and shipping products',
        unitType: 'THEME',
        status: 'in_progress',
      },
    }),
    prisma.card.upsert({
      where: { id: 3 },
      update: {},
      create: {
        userId: user.id,
        title: 'Love & Presence',
        description: 'Relationships and mindfulness',
        unitType: 'THEME',
        status: 'in_progress',
      },
    }),
    prisma.card.upsert({
      where: { id: 4 },
      update: {},
      create: {
        userId: user.id,
        title: 'Wisdom & Humility',
        description: 'Learning and growth',
        unitType: 'THEME',
        status: 'in_progress',
      },
    }),
  ])

  console.log('Created themes:', themes.map(t => t.title))

  // Create sample gate under first theme
  const gate = await prisma.card.upsert({
    where: { id: 5 },
    update: {},
    create: {
      userId: user.id,
      parentId: themes[0].id,
      title: 'Complete school tours',
      description: 'Visit and evaluate 3 schools',
      unitType: 'ACTION_GATE',
      status: 'in_progress',
      seasonId: season.id,
      targetDate: new Date('2025-01-20'),
      criteria: ['3 school tours completed'],
    },
  })

  console.log('Created gate:', gate.title)

  // Create sample experiment under second theme
  const experiment = await prisma.card.upsert({
    where: { id: 6 },
    update: {},
    create: {
      userId: user.id,
      parentId: themes[1].id,
      title: 'Kaizen MVP experiment',
      description: 'Build and test the Kaizen OS MVP',
      unitType: 'ACTION_EXPERIMENT',
      status: 'in_progress',
      seasonId: season.id,
      startDate: new Date('2025-01-06'),
      targetDate: new Date('2025-03-15'),
      lagWeeks: 6,
      criteria: ['MVP live + used 14 consecutive days', 'Weekly review completed 4 weeks in a row'],
    },
  })

  console.log('Created experiment:', experiment.title)

  // Create task under experiment
  const task = await prisma.card.create({
    data: {
      userId: user.id,
      parentId: experiment.id,
      title: 'Build card CRUD API',
      unitType: 'TASK',
      status: 'not_started',
      seasonId: season.id,
    },
  })

  console.log('Created task:', task.title)

  // Create sample routine under first theme
  const routine = await prisma.card.upsert({
    where: { id: 7 },
    update: {},
    create: {
      userId: user.id,
      parentId: themes[0].id,
      title: 'Morning workout 3x/week',
      description: 'Strength training or cardio',
      unitType: 'ACTION_ROUTINE',
      status: 'in_progress',
      seasonId: season.id,
    },
  })

  console.log('Created routine:', routine.title)

  // Create sample ops under third theme
  const ops = await prisma.card.upsert({
    where: { id: 8 },
    update: {},
    create: {
      userId: user.id,
      parentId: themes[2].id,
      title: 'File taxes',
      description: 'Complete 2024 tax filing',
      unitType: 'ACTION_OPS',
      status: 'not_started',
      seasonId: season.id,
      targetDate: new Date('2025-04-15'),
    },
  })

  console.log('Created ops:', ops.title)

  // Create global veto (don't-do list)
  const veto = await prisma.card.create({
    data: {
      userId: user.id,
      title: 'No all-nighters',
      description: 'Sleep is non-negotiable',
      unitType: 'VETO',
      status: 'in_progress',
    },
  })

  console.log('Created veto:', veto.title)

  console.log('\n✅ Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
