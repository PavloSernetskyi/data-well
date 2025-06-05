import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users } from '@drizzle/schema';
import { desc } from 'drizzle-orm';

export async function GET() {
  try {
    const recentUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.id))
      .limit(10);

    const prompt = `Summarize and provide insights for the following user data:\n${JSON.stringify(recentUsers, null, 2)}`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
      }),
    });

    const groqData = await groqRes.json();
    const summary = groqData.choices?.[0]?.message?.content || 'No summary available.';

    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('Summarization error:', error);
    return NextResponse.json({ success: false, error: 'Summarization failed' }, { status: 500 });
  }
}