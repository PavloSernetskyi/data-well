import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { message } = await request.json();
    console.log('Received message:', message);

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // First, check if the message is a greeting or non-data question
    const greetingPatterns = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what's up|sup)$/i;
    const nonDataPatterns = /^(thanks|thank you|bye|goodbye|see you|help|what can you do)$/i;
    
    if (greetingPatterns.test(message.trim())) {
      return NextResponse.json({ 
        response: "Hello! I'm your DataWell assistant. I can help you explore your data by answering questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average weight of men?\"\n\nWhat would you like to know about your data?" 
      });
    }
    
    if (nonDataPatterns.test(message.trim())) {
      return NextResponse.json({ 
        response: "You're welcome! I'm here to help you explore your DataWell data. Feel free to ask me any questions about the users in your database!" 
      });
    }

    // Check for name-related questions and explain what data is available
    const namePatterns = /(first name|last name|name|firstname|lastname)/i;
    if (namePatterns.test(message)) {
      return NextResponse.json({
        response: "I don't have first name or last name data in this database. The available user information includes:\n\n• Age, Gender, Height, Weight\n• Location (City, Country, Zip)\n• Occupation, Education\n• Smoking status, Drinks per week\n\nTry asking about these fields instead, like:\n• \"Show me all users by occupation\"\n• \"What's the average age?\"\n• \"How many people are from California?\""
      });
    }

    // Create a much better prompt for the LLM to generate SQL
    const prompt = `You are a SQL assistant. Convert this user request into a valid SQL query based on the following TABLE users (id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week).

IMPORTANT COLUMN MAPPINGS:
- smoking: 'Yes' or 'No' (string values)
- country: 'USA', 'US', 'Usa' (various formats)
- gender: 'Male', 'Female', 'Other'
- drinks_per_week: integer

User Request: "${message}"

Rules:
1. Only use SELECT statements
2. Use proper column names: id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week
3. Use single quotes for string values
4. For smoking queries, use: smoking = 'Yes' or smoking = 'No'
5. For location queries, check both 'country' and 'city' columns
6. For California, check: country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%')
7. For averages, use AVG() function
8. For counts, use COUNT() function
9. Be specific and accurate
10. If the request is unclear, respond with "I can only help with data questions. Please ask me something about the users in the database."
11. Return ONLY the SQL query, no explanations

SQL Query:`;

    console.log('Sending prompt to Groq:', prompt);

    // Call Groq API to generate SQL
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    console.log('Groq response status:', groqRes.status);

    if (!groqRes.ok) {
      console.error('Groq API error:', await groqRes.text());
      return NextResponse.json({ 
        response: 'Sorry, I encountered an error with the AI service. Please try again.' 
      });
    }

    const groqData = await groqRes.json();
    console.log('Groq response data:', groqData);
    
    const sqlQuery = groqData.choices?.[0]?.message?.content?.trim();
    console.log('Generated SQL:', sqlQuery);

    // Check if the response is not a SQL query
    if (!sqlQuery || sqlQuery.toLowerCase().includes('i can only help') || !sqlQuery.toLowerCase().includes('select')) {
      return NextResponse.json({ 
        response: 'I can only help with data questions. Please ask me something about the users in the database, like "How many users are there?" or "What\'s the average age?"' 
      });
    }

    // Execute the SQL query
    try {
      console.log('Executing SQL:', sqlQuery);
      const result = await db.execute(sqlQuery);
      console.log('Query result:', result);
      
      // Format the response
      if (result.rows && result.rows.length > 0) {
        const formattedResult = formatQueryResult(result.rows, message);
        return NextResponse.json({ 
          response: formattedResult,
          sqlQuery: sqlQuery
        });
      } else {
        return NextResponse.json({ 
          response: 'No data found matching your criteria. Try asking something like:\n\n• "How many users are there?"\n• "Show me all users"\n• "What\'s the average age?"' 
        });
      }
    } catch (sqlError) {
      console.error('SQL execution error:', sqlError);
      
      // NEW: Smart error handling with specific messages
      const errorMessage = getSmartErrorMessage(sqlError, message);
      return NextResponse.json({ 
        response: errorMessage
      });
    }

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json({ 
      response: 'Sorry, I encountered an error. Please try again.' 
    }, { status: 500 });
  }
}

// NEW: Smart error message function
function getSmartErrorMessage(error: any, originalQuery: string): string {
  const errorString = error?.message || error?.toString() || '';
  
  // Column doesn't exist errors
  if (errorString.includes('column') && errorString.includes('does not exist')) {
    const columnMatch = errorString.match(/column "([^"]+)"/);
    const columnName = columnMatch ? columnMatch[1] : 'unknown';
    
    return `I couldn't find the column "${columnName}" in the database. Available columns are:\n\n• Age, Gender, Height, Weight\n• City, Country, Zip\n• Occupation, Education\n• Smoking, Drinks per week\n\nTry rephrasing your question using these available fields.`;
  }
  
  // Syntax errors
  if (errorString.includes('syntax error') || errorString.includes('invalid syntax')) {
    return `I had trouble understanding your question. Try asking something simpler like:\n\n• "How many users are there?"\n• "What's the average age?"\n• "Show me all users from California"`;
  }
  
  // Permission errors
  if (errorString.includes('permission') || errorString.includes('access')) {
    return `I don't have permission to access that data. Try asking about user information instead.`;
  }
  
  // Connection errors
  if (errorString.includes('connection') || errorString.includes('timeout')) {
    return `I'm having trouble connecting to the database. Please try again in a moment.`;
  }
  
  // Generic fallback with helpful suggestions
  return `I encountered an error with your query. Try asking something like:\n\n• "How many users are there?"\n• "What's the average age?"\n• "Show me users from California"\n• "How many people smoke?"\n\nOr be more specific about what data you're looking for.`;
}

// Helper function to format query results with clean, simple format
function formatQueryResult(rows: any[], originalQuery: string): string {
  if (rows.length === 0) return 'No data found.';
  
  // If it's a count query
  if (rows[0].count !== undefined) {
    return `Found ${rows[0].count} records matching your criteria.`;
  }
  
  // If it's an average query
  if (rows[0].avg !== undefined) {
    return `Average: ${rows[0].avg.toFixed(2)}`;
  }
  
  // If it's a sum query
  if (rows[0].sum !== undefined) {
    return `Total: ${rows[0].sum}`;
  }
  
  // If it's a max query
  if (rows[0].max !== undefined) {
    return `Maximum: ${rows[0].max}`;
  }
  
  // If it's a min query
  if (rows[0].min !== undefined) {
    return `Minimum: ${rows[0].min}`;
  }
  
  // For regular data rows - create a clean, simple format
  if (rows.length <= 10) {
    let result = `Found ${rows.length} records:\n\n`;
    
    // Add each record in a clean format
    rows.forEach((row, index) => {
      result += `${index + 1}. ${row.gender || 'N/A'}, ${row.age || 'N/A'} years old\n`;
      result += `   Location: ${row.city || 'N/A'}, ${row.country || 'N/A'}\n`;
      result += `   Job: ${row.occupation || 'N/A'} | Education: ${row.education || 'N/A'}\n`;
      result += `   Height: ${row.height || 'N/A'}cm, Weight: ${row.weight || 'N/A'}kg\n`;
      result += `   Smoking: ${row.smoking || 'N/A'} | Drinks/week: ${row.drinks_per_week || 'N/A'}\n\n`;
    });
    
    // Add summary stats
    const avgAge = (rows.reduce((sum, row) => sum + (row.age || 0), 0) / rows.length).toFixed(1);
    const maleCount = rows.filter(row => row.gender === 'Male').length;
    const femaleCount = rows.filter(row => row.gender === 'Female').length;
    const smokers = rows.filter(row => row.smoking === 'Yes').length;
    
    result += `Quick Stats:\n`;
    result += `• Average Age: ${avgAge}\n`;
    result += `• Male: ${maleCount}, Female: ${femaleCount}\n`;
    result += `• Smokers: ${smokers}/${rows.length} (${((smokers/rows.length)*100).toFixed(0)}%)\n`;
    
    return result;
  } else {
    return `Found ${rows.length} records. Here are the first 10:\n\n${formatQueryResult(rows.slice(0, 10), originalQuery)}`;
  }
}