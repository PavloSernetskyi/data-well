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

    const prompt = `Please provide a comprehensive summary and analysis of the following user data. Structure your response with clear sections and ensure you complete all thoughts. Include:

1. **Summary and Insights** - Key demographic and lifestyle findings
2. **Geographic Insights** - Location-based patterns
3. **Correlation Analysis** - Relationships between different variables
4. **Key Takeaways** - Most important findings and conclusions

User data:
${JSON.stringify(recentUsers, null, 2)}

Please ensure your response is complete and ends with a proper conclusion.`;

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.3,
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