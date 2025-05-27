import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@drizzle/schema';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  const data = await req.json();

  try {
    await db.insert(users).values({
      id: uuidv4(),
      age: parseInt(data.age),
      gender: data.gender,
      height: parseInt(data.height),
      weight: parseInt(data.weight),
      city: data.city,
      country: data.country,
      zip: data.zip,
      occupation: data.occupation,
      education: data.education,
      smoking: data.smoking,
      drinksPerWeek: parseInt(data.drinksPerWeek),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DB insert error:', error);
    return NextResponse.json({ success: false, error: 'Insert failed' }, { status: 500 });
  }
}
