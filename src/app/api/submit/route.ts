import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@drizzle/schema';
import { v4 as uuidv4 } from 'uuid';
import { desc } from 'drizzle-orm';

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

    // Fetch latest 10 users for summarization
    const recentUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.id))
      .limit(5);

    // Prepare prompt for Groq
    const prompt = `Summarize and provide insights for the following user data:\n${JSON.stringify(recentUsers, null, 2)}`;

    // Call Groq API
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
      }),
    });

    const groqData = await groqRes.json();
    const summary = groqData.choices?.[0]?.message?.content || 'No summary available.';

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('DB insert or summarization error:', error);
    return NextResponse.json({ success: false, error: 'Insert or summarization failed' }, { status: 500 });
  }
}
