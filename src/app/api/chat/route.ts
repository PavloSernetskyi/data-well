import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// BMI calculation function
function calculateBMI(heightCm: number, weightKg: number): number {
  if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) {
    return 0;
  }
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// BMI category classification
function getBMICategory(bmi: number): string {
  if (bmi === 0) return 'N/A';
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25) return 'Normal weight';
  if (bmi < 30) return 'Overweight';
  return 'Obese';
}

// Calculate BMI statistics for a group of users
function calculateBMIStats(rows: any[]): { validCount: number; avgBMI: number; categories: string[] } {
  const validBMIs: number[] = [];
  const categoryCounts: { [key: string]: number } = {};
  
  rows.forEach(row => {
    let bmi = 0;
    
    if (row.bmi) {
      // BMI was calculated in SQL
      bmi = parseFloat(row.bmi);
    } else if (row.height && row.weight && row.height > 0 && row.weight > 0) {
      // Calculate BMI from height and weight
      bmi = calculateBMI(row.height, row.weight);
    }
    
    if (bmi > 0) {
      validBMIs.push(bmi);
      const category = getBMICategory(bmi);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  });
  
  const avgBMI = validBMIs.length > 0 ? validBMIs.reduce((sum, bmi) => sum + bmi, 0) / validBMIs.length : 0;
  const categories = Object.entries(categoryCounts)
    .map(([category, count]) => `${category}: ${count}`)
    .join(', ');
  
  return {
    validCount: validBMIs.length,
    avgBMI,
    categories: categories ? [categories] : []
  };
}

export async function POST(request: Request) {
  try {
    const { message, conversationHistory = [] } = await request.json();
    console.log('Received message:', message);
    console.log('Conversation history:', conversationHistory);

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // First, check if the message is a greeting or non-data question
    const greetingPatterns = /^(hi|hello|hey|good morning|good afternoon|good evening|how are you|what's up|sup)$/i;
    const nonDataPatterns = /^(thanks|thank you|bye|goodbye|see you|help|what can you do)$/i;
    
    if (greetingPatterns.test(message.trim())) {
      return NextResponse.json({ 
        response: "Hello! I'm your DataWell assistant. I can help you explore your data by answering questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average weight of men?\"\n• \"Calculate BMI for all users\"\n• \"Show me users with normal BMI\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?" 
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

    // NEW: Context-aware responses for "Show them" type questions
    const contextPhrases = /^(show them|show me those|display them|display those|show those|show the results|show the data)$/i;
    if (contextPhrases.test(message.trim()) && conversationHistory.length > 0) {
      // Find the last query that returned results
      const lastQuery = conversationHistory.findLast((msg: any) => 
        msg.role === 'user' && 
        !greetingPatterns.test(msg.content.trim()) && 
        !nonDataPatterns.test(msg.content.trim()) &&
        !namePatterns.test(msg.content)
      );
      
      if (lastQuery) {
        // Re-run the last query to show the actual results
        console.log('Context detected - re-running last query:', lastQuery.content);
        
        // Create a context-aware prompt that shows the actual data
        const contextPrompt = `You are a SQL assistant. The user previously asked: "${lastQuery.content}" and got a count result. Now they want to see the actual data records.

Convert this into a SQL query to show the actual records (not just count) based on the following TABLE users (id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week).

IMPORTANT COLUMN MAPPINGS:
- smoking: 'Yes' or 'No' (string values)
- country: 'USA', 'US', 'Usa' (various formats)
- gender: 'Male', 'Female', 'Other'
- drinks_per_week: integer

BMI CALCULATION SUPPORT:
- For BMI queries, use: ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi
- For BMI categories, use: CASE 
  WHEN weight / ((height/100.0) * (height/100.0)) < 18.5 THEN 'Underweight'
  WHEN weight / ((height/100.0) * (height/100.0)) < 25 THEN 'Normal weight'
  WHEN weight / ((height/100.0) * (height/100.0)) < 30 THEN 'Overweight'
  ELSE 'Obese' END AS bmi_category

Previous query context: "${lastQuery.content}"
Current request: "${message}"

Rules:
1. Use SELECT * to show all fields, or include specific fields with BMI if relevant
2. Use proper column names
3. Use single quotes for string values
4. For smoking queries, use: smoking = 'Yes' or smoking = 'No'
5. For location queries, check both 'country' and 'city' columns
6. For California, check: country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%')
7. If BMI is relevant, include BMI calculation
8. Return ONLY the SQL query, no explanations

SQL Query:`;

        // Call Groq API with the context-aware prompt
        const contextGroqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: contextPrompt }],
            max_tokens: 200,
            temperature: 0.1,
          }),
        });

        if (contextGroqRes.ok) {
          const contextGroqData = await contextGroqRes.json();
          const contextSqlQuery = contextGroqData.choices?.[0]?.message?.content?.trim();
          
          if (contextSqlQuery && contextSqlQuery.toLowerCase().includes('select')) {
            try {
              console.log('Executing context SQL:', contextSqlQuery);
              const contextResult = await db.execute(contextSqlQuery);
              
              if (contextResult.rows && contextResult.rows.length > 0) {
                const formattedResult = formatQueryResult(contextResult.rows, lastQuery.content);
                return NextResponse.json({ 
                  response: formattedResult,
                  sqlQuery: contextSqlQuery
                });
              }
            } catch (contextError) {
              console.error('Context SQL execution error:', contextError);
            }
          }
        }
      }
    }

    // Create a much better prompt for the LLM to generate SQL
    const conversationContext = conversationHistory.length > 0 
      ? `\n\nCONVERSATION CONTEXT:\n${conversationHistory.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n')}\n`
      : '';

    const prompt = `You are a SQL assistant with conversation context. Convert this user request into a valid SQL query based on the following TABLE users (id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week).

IMPORTANT COLUMN MAPPINGS:
- smoking: 'Yes' or 'No' (string values)
- country: 'USA', 'US', 'Usa' (various formats)
- gender: 'Male', 'Female', 'Other'
- drinks_per_week: integer

BMI CALCULATION SUPPORT:
- For BMI queries, use: ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi
- For BMI categories, use: CASE 
  WHEN weight / ((height/100.0) * (height/100.0)) < 18.5 THEN 'Underweight'
  WHEN weight / ((height/100.0) * (height/100.0)) < 25 THEN 'Normal weight'
  WHEN weight / ((height/100.0) * (height/100.0)) < 30 THEN 'Overweight'
  ELSE 'Obese' END AS bmi_category
- BMI queries should include both height and weight in the SELECT clause
${conversationContext}
User Request: "${message}"

CONTEXT AWARENESS:
- If user says "Show them", "Show me those", "Display them", etc., refer to the previous query results
- If user says "What about [something]", modify the previous query with new criteria
- If user says "More details", show additional fields from the previous query
- If user says "Filter by [something]", add a WHERE clause to the previous query
- If user asks about BMI, include BMI calculation in the SELECT clause

Rules:
1. Only use SELECT statements
2. Use proper column names: id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week
3. Use single quotes for string values
4. For smoking queries, use: smoking = 'Yes' or smoking = 'No'
5. For location queries, check both 'country' and 'city' columns
6. For California, check: country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%')
7. For averages, use AVG() function
8. For counts, use COUNT() function
9. For BMI queries, include the BMI calculation formula
10. Be specific and accurate
11. If the request is unclear, respond with "I can only help with data questions. Please ask me something about the users in the database."
12. Return ONLY the SQL query, no explanations

SQL Query:`;

    console.log('Sending prompt to Groq:', prompt);

    // Call Groq API to generate SQL with conversation context
    const messages = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: messages,
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
      
      // Add BMI if we have height and weight data
      if (row.height && row.weight && row.height > 0 && row.weight > 0) {
        const bmi = calculateBMI(row.height, row.weight);
        const bmiCategory = getBMICategory(bmi);
        result += `   BMI: ${bmi.toFixed(1)} (${bmiCategory})\n`;
      } else if (row.bmi) {
        // If BMI was calculated in SQL
        const bmiCategory = getBMICategory(row.bmi);
        result += `   BMI: ${row.bmi} (${bmiCategory})\n`;
      }
      
      result += `   Smoking: ${row.smoking || 'N/A'} | Drinks/week: ${row.drinks_per_week || 'N/A'}\n\n`;
    });
    
    // Add summary stats
    const avgAge = (rows.reduce((sum, row) => sum + (row.age || 0), 0) / rows.length).toFixed(1);
    const maleCount = rows.filter(row => row.gender === 'Male').length;
    const femaleCount = rows.filter(row => row.gender === 'Female').length;
    const smokers = rows.filter(row => row.smoking === 'Yes').length;
    
    // Calculate BMI stats if we have height/weight data
    const bmiStats = calculateBMIStats(rows);
    
    result += `Quick Stats:\n`;
    result += `• Average Age: ${avgAge}\n`;
    result += `• Male: ${maleCount}, Female: ${femaleCount}\n`;
    result += `• Smokers: ${smokers}/${rows.length} (${((smokers/rows.length)*100).toFixed(0)}%)\n`;
    
    if (bmiStats.validCount > 0) {
      result += `• Average BMI: ${bmiStats.avgBMI.toFixed(1)}\n`;
      result += `• BMI Categories: ${bmiStats.categories.join(', ')}\n`;
    }
    
    return result;
  } else {
    return `Found ${rows.length} records. Here are the first 10:\n\n${formatQueryResult(rows.slice(0, 10), originalQuery)}`;
  }
}