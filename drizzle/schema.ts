import { pgTable, varchar, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  age: integer('age'),
  gender: varchar('gender', { length: 10 }),
  height: integer('height'),
  weight: integer('weight'),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 100 }),
  zip: varchar('zip', { length: 20 }),
  occupation: varchar('occupation', { length: 100 }),
  education: varchar('education', { length: 100 }),
  smoking: varchar('smoking', { length: 10 }),
  drinksPerWeek: integer('drinks_per_week'),
});
