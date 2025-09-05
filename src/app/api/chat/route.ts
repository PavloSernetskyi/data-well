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
function calculateBMIStats(rows: Record<string, unknown>[]): { validCount: number; avgBMI: number; categories: string[] } {
  const validBMIs: number[] = [];
  const categoryCounts: { [key: string]: number } = {};
  
  rows.forEach(row => {
    let bmi = 0;
    
    if (row.bmi) {
      // BMI was calculated in SQL
      bmi = parseFloat(String(row.bmi));
    } else if (row.height && row.weight && Number(row.height) > 0 && Number(row.weight) > 0) {
      // Calculate BMI from height and weight
      bmi = calculateBMI(Number(row.height), Number(row.weight));
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

    // DYNAMIC INTENT RECOGNITION: Use AI to classify user intent
    const userIntent = await classifyUserIntent(message, conversationHistory);
    console.log('Detected intent:', userIntent);
    
    // Handle different intents dynamically
    switch (userIntent) {
      case 'greeting':
        return NextResponse.json({ 
          response: "Hello! I'm your DataWell assistant. I can help you explore your data by answering questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average weight of men?\"\n• \"Calculate BMI for all users\"\n• \"Show me users with normal BMI\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?" 
        });
      
      case 'non_data':
        return NextResponse.json({ 
          response: "I understand! I'm here to help you explore your DataWell data whenever you're ready. Feel free to ask me any questions about the users in your database!" 
        });
      
      case 'appreciation':
        return NextResponse.json({ 
          response: "Thank you! I'm glad I could help. Feel free to ask me anything else about your data - I'm here to help you explore and understand your DataWell database!" 
        });
      
      case 'dangerous':
        return NextResponse.json({
          response: "I can only help you explore and analyze data - I cannot modify or delete anything. I can help you with:\n\n• **Count data:** \"How many users are there?\"\n• **Show data:** \"Show me users from California\"\n• **Analyze data:** \"What's the average age?\"\n• **Filter data:** \"Show me male users who smoke\"\n• **Calculate metrics:** \"What's the average BMI?\"\n\nWhat would you like to explore about your data?"
        });
      
      case 'unclear':
        return NextResponse.json({
          response: "I'm not sure what you're looking for. I can help you explore your data by asking questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?"
        });
      
      case 'data_query':
        // Continue with normal data processing
        break;
      
      default:
        // Fallback to data processing
        break;
    }

    // Check for name-related questions and explain what data is available
    const namePatterns = /(first name|last name|name|firstname|lastname)/i;
    if (namePatterns.test(message)) {
      return NextResponse.json({
        response: "I don't have first name or last name data in this database. The available user information includes:\n\n• Age, Gender, Height, Weight\n• Location (City, Country, Zip)\n• Occupation, Education\n• Smoking status, Drinks per week\n\nTry asking about these fields instead, like:\n• \"Show me all users by occupation\"\n• \"What's the average age?\"\n• \"How many people are from California?\""
      });
    }

    // Check for salary/income-related questions and explain what data is available
    const salaryPatterns = /(salary|income|wage|pay|money|earnings|esalary)/i;
    if (salaryPatterns.test(message)) {
      return NextResponse.json({
        response: "I don't have salary or income data in this database. The available user information includes:\n\n• Age, Gender, Height, Weight\n• Location (City, Country, Zip)\n• Occupation, Education\n• Smoking status, Drinks per week\n\nTry asking about these fields instead, like:\n• \"What occupations do we have?\"\n• \"What's the average age?\"\n• \"How many people are from California?\"\n• \"What's the education distribution?\""
      });
    }


    // NEW: Context-aware responses for "Show them" type questions
    const contextPhrases = /^(show them|show me those|display them|display those|show those|show the results|show the data)$/i;
    const followUpPhrases = /(how many of them|how many of those|what about them|what about those|show me the|show the|filter by|sort by)/i;
    const paginationPhrases = /(show me more|show more|next page|next 10|from \d+ to \d+|users \d+-\d+|from \d+-\d+|users with bmi from \d+-\d+)/i;
    
    if ((contextPhrases.test(message.trim()) || followUpPhrases.test(message.trim()) || paginationPhrases.test(message.trim())) && conversationHistory.length > 0) {
      // Find the last query that returned results
      const lastQuery = conversationHistory.findLast((msg: { role: string; content: string }) => 
        msg.role === 'user' && 
        !namePatterns.test(msg.content) &&
        !salaryPatterns.test(msg.content)
      );
      
      if (lastQuery) {
        // Re-run the last query to show the actual results
        console.log('Context detected - re-running last query:', lastQuery.content);
        
        // Handle pagination requests specifically
        if (paginationPhrases.test(message.trim())) {
          console.log('Pagination request detected:', message);
          
          // Extract range from message (e.g., "from 11-20" or "users 11-20")
          const rangeMatch = message.match(/(\d+)-(\d+)/);
          if (rangeMatch) {
            const start = parseInt(rangeMatch[1]);
            const end = parseInt(rangeMatch[2]);
            const limit = end - start + 1;
            const offset = start - 1;
            
            console.log(`Pagination: showing users ${start}-${end} (offset: ${offset}, limit: ${limit})`);
            
            // Generate paginated BMI query
            const paginatedBmiQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL ORDER BY id LIMIT ${limit} OFFSET ${offset}`;
            
            try {
              console.log('Executing paginated BMI query:', paginatedBmiQuery);
              const paginatedResult = await db.execute(paginatedBmiQuery);
              
              if (paginatedResult.rows && paginatedResult.rows.length > 0) {
                const formattedResult = formatQueryResult(paginatedResult.rows, start);
                const paginationInfo = `\n\n📊 **Showing users ${start}-${end} of 33 users with BMI data**\n\n💡 **Want to see more?** Try asking:\n• "Show me users with BMI from ${end + 1}-${end + 10}"\n• "Show me all users with BMI" (for complete list)\n• "What's the average BMI?" (for summary)`;
                
                return NextResponse.json({ 
                  response: formattedResult + paginationInfo,
                  sqlQuery: paginatedBmiQuery
                });
              } else {
                return NextResponse.json({ 
                  response: `No users found in range ${start}-${end}. Try asking for a different range or "Show me all users with BMI".` 
                });
              }
            } catch (paginationError) {
              console.error('Pagination query execution error:', paginationError);
            }
          } else if (/(show me more|show more|next page|next 10)/i.test(message.trim())) {
            // Handle "Show me more users with BMI" without specific range
            console.log('Next page request detected');
            
            // Get the next 10 users (assuming we showed 1-10 before)
            const nextPageQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL ORDER BY id LIMIT 10 OFFSET 10`;
            
            try {
              console.log('Executing next page BMI query:', nextPageQuery);
              const nextPageResult = await db.execute(nextPageQuery);
              
              if (nextPageResult.rows && nextPageResult.rows.length > 0) {
                const formattedResult = formatQueryResult(nextPageResult.rows, 11);
                const paginationInfo = `\n\n📊 **Showing users 11-20 of 33 users with BMI data**\n\n💡 **Want to see more?** Try asking:\n• "Show me users with BMI from 21-30"\n• "Show me all users with BMI" (for complete list)\n• "What's the average BMI?" (for summary)`;
                
                return NextResponse.json({ 
                  response: formattedResult + paginationInfo,
                  sqlQuery: nextPageQuery
                });
              } else {
                return NextResponse.json({ 
                  response: 'No more users found. You\'ve seen all users with BMI data!' 
                });
              }
            } catch (nextPageError) {
              console.error('Next page query execution error:', nextPageError);
            }
          }
        }
        
        // Create a context-aware prompt that handles follow-up questions
        const contextPrompt = `You are a SQL assistant. The user previously asked: "${lastQuery.content}" and got a result. Now they're asking a follow-up question: "${message}"

Convert this into a SQL query based on the following TABLE users (id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week).

CONTEXT UNDERSTANDING:
- If the follow-up asks "How many of them [condition]", apply the condition to the previous query context
- If the follow-up asks "What about [something]", add that condition to the previous query
- If the follow-up asks "Show me the [something]", modify the previous query accordingly
- Build upon the previous query context, don't start from scratch

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
                const formattedResult = formatQueryResult(contextResult.rows);
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
      ? `\n\nCONVERSATION CONTEXT:\n${conversationHistory.map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`).join('\n')}\n`
      : '';

    // Check if this is a BMI-related query
    const bmiPatterns = /(bmi|body mass index|weight.*height|height.*weight|overweight|underweight|obese|normal weight|calculate.*bmi|bmi.*calculate)/i;
    const isBmiQuery = bmiPatterns.test(message);
    
    // Handle BMI calculation requests specifically
    if (isBmiQuery) {
      console.log('BMI query detected:', message);
      
      // If user asks "can you calculate BMI?" or similar, show them BMI data
      if (/(can you calculate|calculate|show.*bmi|bmi.*show)/i.test(message)) {
        console.log('Generating BMI calculation query');
        
        // First, get the total count
        const countQuery = `SELECT COUNT(*) as total FROM users WHERE height IS NOT NULL AND weight IS NOT NULL`;
        const countResult = await db.execute(countQuery);
        const totalUsers = Number(countResult.rows[0]?.total) || 0;
        
        // Then show first 10 users with BMI
        const bmiQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL LIMIT 10`;
        
        try {
          console.log('Executing BMI query:', bmiQuery);
          const bmiResult = await db.execute(bmiQuery);
          
          if (bmiResult.rows && bmiResult.rows.length > 0) {
            const formattedResult = formatQueryResult(bmiResult.rows, 1);
            
            // Add pagination info if there are more users
            let paginationInfo = '';
            if (totalUsers > 10) {
              paginationInfo = `\n\n📊 **Showing 10 of ${totalUsers} users with BMI data**\n\n💡 **Want to see more?** Try asking:\n• "Show me more users with BMI"\n• "Show me users with BMI from 11-20"\n• "Show me all users with BMI" (for complete list)\n• "What's the average BMI?" (for summary)`;
            }
            
            return NextResponse.json({ 
              response: formattedResult + paginationInfo,
              sqlQuery: bmiQuery
            });
          } else {
            return NextResponse.json({ 
              response: 'No users found with valid height and weight data for BMI calculation.' 
            });
          }
        } catch (bmiError) {
          console.error('BMI query execution error:', bmiError);
          return NextResponse.json({ 
            response: 'I can calculate BMI! BMI is calculated using height and weight. Try asking:\n\n• "Show me users with BMI"\n• "What\'s the average BMI?"\n• "Calculate BMI for all users"\n• "Show me users with normal BMI"' 
          });
        }
      }
    }
    
    const prompt = `You are an expert SQL assistant with conversation context. Convert this user request into a valid SQL query based on the following TABLE users (id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week).

IMPORTANT COLUMN MAPPINGS:
- smoking: 'Yes' or 'No' (string values)
- country: 'USA', 'US', 'Usa' (various formats)
- gender: 'Male', 'Female', 'Other'
- drinks_per_week: integer

BMI CALCULATION SUPPORT:
- BMI is NOT a stored column - it must be calculated using: ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi
- For BMI categories, use: CASE 
  WHEN weight / ((height/100.0) * (height/100.0)) < 18.5 THEN 'Underweight'
  WHEN weight / ((height/100.0) * (height/100.0)) < 25 THEN 'Normal weight'
  WHEN weight / ((height/100.0) * (height/100.0)) < 30 THEN 'Overweight'
  ELSE 'Obese' END AS bmi_category
- BMI queries should include both height and weight in the SELECT clause
- NEVER reference 'bmi' as a column - always calculate it

ERROR PREVENTION RULES:
- NEVER use columns that don't exist (first_name, last_name, name, email, phone, etc.)
- ALWAYS use exact column names from the schema
- ALWAYS use single quotes for string values
- ALWAYS use proper SQL syntax
- ALWAYS validate data types (age, height, weight are integers)
- ALWAYS use ILIKE for case-insensitive text searches
- ALWAYS handle NULL values properly

${conversationContext}
User Request: "${message}"

CONTEXT AWARENESS:
- If user says "Show them", "Show me those", "Display them", etc., refer to the previous query results
- If user says "What about [something]", modify the previous query with new criteria
- If user says "More details", show additional fields from the previous query
- If user says "Filter by [something]", add a WHERE clause to the previous query
- If user asks about BMI, include BMI calculation in the SELECT clause
- If user says "How many of them [condition]", apply the condition to the previous result set
- If user says "them" or "those", refer to the previous query results
- If user asks follow-up questions, build upon the previous query context

CONVERSATION CONTEXT EXAMPLES:
- Previous: "How many users in database?" → Current: "How many of them under age 25?" → SELECT COUNT(*) FROM users WHERE age < 25
- Previous: "Show me users from California" → Current: "What about smokers?" → SELECT * FROM users WHERE country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%') AND smoking = 'Yes' LIMIT 10
- Previous: "Show all users" → Current: "Show me the youngest ones" → SELECT * FROM users ORDER BY age ASC LIMIT 10

STRICT RULES:
1. Only use SELECT statements
2. Use EXACT column names: id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week
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
13. DOUBLE-CHECK column names before generating SQL
14. Use proper data types and formatting
15. For aggregation queries (average, count, sum, max, min), return ONLY the aggregated result, not individual records
16. For "average BMI" queries, use: SELECT AVG(ROUND(weight / ((height/100.0) * (height/100.0)), 1)) AS average_bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL
17. For BMI calculations, always use the formula: ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi
18. Never reference non-existent columns like 'bmi' or 'avg_bmi' - always calculate them
19. Example: "What's the average BMI?" → SELECT AVG(ROUND(weight / ((height/100.0) * (height/100.0)), 1)) AS average_bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL
20. CRITICAL: Only include BMI calculations when the user specifically asks about BMI. For general queries like "show all users", "users age 25", "how many records", do NOT include BMI calculations.
21. Example: "how many records in database" → SELECT COUNT(*) FROM users
22. Example: "show all users" → SELECT * FROM users LIMIT 10
23. Example: "show all users age 25" → SELECT * FROM users WHERE age = 25 LIMIT 10
24. NEVER add BMI calculations unless the user specifically asks about BMI, BMI categories, or health metrics.

QUERY TYPE DETECTION:
- If user asks "What's the average [something]" → Use AVG() function
- If user asks "How many [something]" → Use COUNT() function  
- If user asks "Show me [something]" → Use SELECT * to show records
- If user asks "Show users from [location]" → Use SELECT * with WHERE clause
- If user asks "Show all users" → Use SELECT * LIMIT 10
- If user asks "Show users with [condition]" → Use SELECT * with WHERE clause

EXAMPLES:
- "What's the average weight of men?" → SELECT AVG(weight) AS avg FROM users WHERE gender = 'Male'
- "How many users are there?" → SELECT COUNT(*) FROM users
- "Show me users from California" → SELECT * FROM users WHERE country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%') LIMIT 10
- "Show all users" → SELECT * FROM users LIMIT 10
- "Show users who smoke" → SELECT * FROM users WHERE smoking = 'Yes' LIMIT 10
${!isBmiQuery ? '\n\nCRITICAL INSTRUCTION: This query is NOT about BMI. Do NOT include any BMI calculations, BMI categories, or health metrics. Only use the basic columns: id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week.' : ''}

SQL Query:`;

    console.log('Sending prompt to Groq:', prompt);

    // Call Groq API to generate SQL with conversation context
    const messages = [
      ...conversationHistory.map((msg: { role: string; content: string }) => ({
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
      const errorText = await groqRes.text();
      console.error('Groq API error:', errorText);
      console.error('Groq response status:', groqRes.status);
      
      // Try to provide a more helpful error message
      if (groqRes.status === 429) {
        return NextResponse.json({ 
          response: 'I\'m experiencing high demand right now. Please try again in a moment.' 
        });
      } else if (groqRes.status === 401) {
        return NextResponse.json({ 
          response: 'There\'s an issue with my AI service. Please try again later.' 
        });
      } else {
        return NextResponse.json({ 
          response: 'Sorry, I encountered an error with the AI service. Please try again.' 
        });
      }
    }

    const groqData = await groqRes.json();
    console.log('Groq response data:', groqData);
    
    let sqlQuery = groqData.choices?.[0]?.message?.content?.trim();
    console.log('Generated SQL:', sqlQuery);
    console.log('User message:', message);
    console.log('Query type detection - is aggregation?', /(average|avg|count|sum|max|min|total)\s+(bmi|age|height|weight|users|people)/i.test(message));
    console.log('Query type detection - is show query?', /(show|display|list|find)\s+(me|all|users|people)/i.test(message));

    // Smart query optimization: Fix aggregation queries
    const isAggregationQuery = /(average|avg|count|sum|max|min|total)\s+(bmi|age|height|weight|users|people)/i.test(message);
    if (isAggregationQuery) {
      // For average BMI queries, always replace with proper aggregation
      if (message.toLowerCase().includes('average bmi') || message.toLowerCase().includes('avg bmi')) {
        console.log('Fixing average BMI query - replacing with proper aggregation');
        // Always replace with proper aggregation for BMI queries
        sqlQuery = 'SELECT AVG(ROUND(weight / ((height/100.0) * (height/100.0)), 1)) AS average_bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL';
      }
    }

    // Check if the response is not a SQL query
    if (!sqlQuery || sqlQuery.toLowerCase().includes('i can only help') || !sqlQuery.toLowerCase().includes('select')) {
      return NextResponse.json({ 
        response: 'I can only help with data questions. Please ask me something about the users in the database, like "How many users are there?" or "What\'s the average age?"' 
      });
    }

    // Smart query validation before execution
    const validationResult = validateSQLQuery(sqlQuery);
    if (!validationResult.isValid) {
      return NextResponse.json({ 
        response: `🔍 **What went wrong:** ${validationResult.error}

💡 **Why:** ${validationResult.reason}

🔧 **How to fix:** ${validationResult.suggestion}

🚀 **Try asking:**
• "How many users are there?"
• "What's the average age?"
• "Show me users from California"
• "How many people smoke?"

📊 **Related insights:** I can help you explore your data safely and effectively!`
      });
    }

    // Execute the SQL query
    try {
      console.log('Executing SQL:', sqlQuery);
      const result = await db.execute(sqlQuery);
      console.log('Query result:', result);
      
      // Format the response
      if (result.rows && result.rows.length > 0) {
        const formattedResult = formatQueryResult(result.rows);
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
      
      // ENHANCED: AI-powered smart error handling
      const errorMessage = await getSmartErrorMessage(sqlError, sqlQuery, conversationHistory);
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

// DYNAMIC INTENT RECOGNITION: AI-powered intent classification
async function classifyUserIntent(message: string, conversationHistory: Array<{ role: string; content: string }>): Promise<string> {
  const intentPrompt = `You are an expert intent classifier for a data analysis chatbot. Classify the user's message into one of these intents:

INTENTS:
- 'greeting': Hello, hi, hey, good morning, how are you, hi there, hey there, etc.
- 'non_data': Thanks, nothing, nope, no, bye, goodbye, see you, help, what can you do, okay, ok, alright, sure, etc.
- 'appreciation': Nice, cool, great, awesome, good, excellent, perfect, etc.
- 'dangerous': Delete, drop, update, insert, remove, clear, wipe, etc.
- 'unclear': Vague, confusing, or unclear requests
- 'data_query': Questions about data, statistics, analysis, etc.

USER MESSAGE: "${message}"

CONVERSATION CONTEXT:
${conversationHistory.length > 0 ? conversationHistory.map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`).join('\n') : 'No previous context'}

CLASSIFICATION RULES:
1. If it's a greeting or social interaction (hi, hello, hey, good morning, etc.) → 'greeting'
2. If it's a non-data response (thanks, nothing, nope, bye, etc.) → 'non_data'
3. If it's appreciation or positive feedback (nice, cool, great, awesome, etc.) → 'appreciation'
4. If it's a dangerous operation (delete, drop, update, etc.) → 'dangerous'
5. If it's unclear, vague, or random words without clear intent → 'unclear'
6. If it's clearly asking about data, statistics, or analysis with specific questions → 'data_query'

IMPORTANT: Only classify as 'data_query' if the user is clearly asking a specific question about data. Random words, unclear phrases, or vague requests should be classified as 'unclear'.

EXAMPLES:
- "hi there" → 'greeting'
- "hello" → 'greeting'
- "nothing" → 'non_data'
- "nope" → 'non_data'
- "nice" → 'appreciation'
- "cool" → 'appreciation'
- "great" → 'appreciation'
- "delete all" → 'dangerous'
- "hmm" → 'unclear'
- "random words" → 'unclear'
- "asdf" → 'unclear'
- "blah blah" → 'unclear'
- "how many users" → 'data_query'
- "how many users ?" → 'data_query'
- "what's the average age" → 'data_query'
- "show me users" → 'data_query'

Return ONLY the intent name, nothing else.`;

  try {
    const intentRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: intentPrompt }],
        max_tokens: 50,
        temperature: 0.1,
      }),
    });

    if (intentRes.ok) {
      const intentData = await intentRes.json();
      const intent = intentData.choices?.[0]?.message?.content?.trim().toLowerCase();
      
      // Validate intent
      const validIntents = ['greeting', 'non_data', 'appreciation', 'dangerous', 'unclear', 'data_query'];
      if (validIntents.includes(intent)) {
        console.log('AI classified intent:', intent);
        return intent;
          } else {
      console.log('Invalid intent from AI:', intent);
    }
  } else {
    console.error('Intent classification failed:', intentRes.status, await intentRes.text());
  }
  } catch (error) {
    console.error('Intent classification failed:', error);
  }
  
  // Fallback: simple pattern matching (order matters - check specific patterns first)
  const messageLower = message.toLowerCase().trim();
  
  // Check for appreciation responses first (exact matches to avoid conflicts)
  if (['nice', 'cool', 'great', 'awesome', 'good', 'excellent', 'perfect', 'amazing', 'wow', 'fantastic'].includes(messageLower)) {
    return 'appreciation';
  }
  
  // Check for non-data responses (exact matches to avoid conflicts)
  if (['thanks', 'thank you', 'bye', 'goodbye', 'see you', 'help', 'what can you do', 'nothing', 'nope', 'nada', 'okay', 'ok', 'alright', 'sure'].includes(messageLower)) {
    return 'non_data';
  }
  
  // Check for greetings (exact matches to avoid conflicts)
  if (['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'how are you', 'what\'s up', 'sup'].includes(messageLower)) {
    return 'greeting';
  }
  
  // Check for greetings with additional words
  if (['hi there', 'hey there', 'hello there'].some(greeting => messageLower.includes(greeting))) {
    return 'greeting';
  }
  
  if (['delete', 'drop', 'update', 'insert', 'remove', 'clear', 'wipe'].some(word => messageLower.includes(word))) {
    return 'dangerous';
  }
  
  if (messageLower.length < 3) {
    return 'unclear';
  }
  
  // Check for data-related keywords - be more strict
  const dataKeywords = ['users', 'data', 'count', 'average', 'show', 'how many', 'what', 'age', 'height', 'weight', 'smoking', 'drinks', 'bmi', 'california', 'occupation', 'education', 'calculate', 'find', 'get', 'list', 'records', 'database'];
  const hasDataKeywords = dataKeywords.some(keyword => messageLower.includes(keyword));
  
  // Check for question patterns
  const questionPatterns = ['how many', 'what is', 'what are', 'show me', 'tell me', 'give me', 'find me', 'calculate', 'average', 'count', 'total', 'show all', 'list all'];
  const hasQuestionPattern = questionPatterns.some(pattern => messageLower.includes(pattern));
  
  // Check for simple data requests
  const simpleDataRequests = ['show all users', 'list users', 'show users', 'all users', 'users in database', 'records in database'];
  const hasSimpleDataRequest = simpleDataRequests.some(pattern => messageLower.includes(pattern));
  
  // Classify as data_query if it has data keywords AND (question patterns OR simple data requests)
  if (hasDataKeywords && (hasQuestionPattern || hasSimpleDataRequest)) {
    return 'data_query';
  }
  
  // If it's just random words without clear intent, classify as unclear
  return 'unclear';
}

// Smart SQL query validation function
function validateSQLQuery(sqlQuery: string): { isValid: boolean; error?: string; reason?: string; suggestion?: string } {
  const query = sqlQuery.toLowerCase().trim();
  
      // Check for dangerous operations
    if (query.includes('drop') || query.includes('delete') || query.includes('update') || query.includes('insert') || query.includes('truncate') || query.includes('alter')) {
      return {
        isValid: false,
        error: 'Dangerous operation detected',
        reason: 'I can only help with SELECT queries for data exploration',
        suggestion: 'Ask me to show or analyze data instead of modifying it'
      };
    }
    
    // Check for specific dangerous phrases
    if (query.includes('delete all') || query.includes('drop table') || query.includes('truncate table')) {
      return {
        isValid: false,
        error: 'Dangerous operation detected',
        reason: 'I can only help with SELECT queries for data exploration',
        suggestion: 'Ask me to show or analyze data instead of modifying it'
      };
    }
  
        // Check for non-existent columns (but allow BMI calculations)
  const invalidColumns = ['first_name', 'last_name', 'name', 'email', 'phone', 'address', 'salary', 'income', 'esalary'];
  const foundInvalidColumns = invalidColumns.filter(col => query.includes(col));
  
  // Check for BMI column references (not calculations)
  const bmiColumnRefs = query.match(/\bbmi\b(?!\s*[=\(])/gi); // BMI not followed by = or (
  if (bmiColumnRefs && bmiColumnRefs.length > 0) {
    return {
      isValid: false,
      error: `Invalid column reference: ${bmiColumnRefs.join(', ')}`,
      reason: 'BMI is not a stored column - it must be calculated',
      suggestion: 'For BMI calculations, use: ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi'
    };
  }
  
  if (foundInvalidColumns.length > 0) {
    return {
      isValid: false,
      error: `Invalid column(s): ${foundInvalidColumns.join(', ')}`,
      reason: 'These columns don\'t exist in the database',
      suggestion: 'Use available columns: age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week'
    };
  }
  
  // Check for proper SQL structure
  if (!query.startsWith('select')) {
    return {
      isValid: false,
      error: 'Invalid SQL structure',
      reason: 'Query must start with SELECT',
      suggestion: 'Ask me to show or analyze data using proper SELECT statements'
    };
  }
  
  // Check for proper column names (more accurate validation)
  const validColumns = ['id', 'age', 'gender', 'height', 'weight', 'city', 'country', 'zip', 'occupation', 'education', 'smoking', 'drinks_per_week'];
  const sqlKeywords = ['select', 'from', 'where', 'and', 'or', 'count', 'avg', 'sum', 'max', 'min', 'round', 'case', 'when', 'then', 'else', 'end', 'as', 'in', 'like', 'ilike', 'group', 'by', 'order', 'limit', 'offset', 'bmi', 'bmi_category', 'users', 'usa', 'us', 'california', 'ca', 'cali', 'yes', 'no', 'male', 'female', 'other'];
  
  // Extract potential column names from SELECT clause
  const selectMatch = query.match(/select\s+(.*?)\s+from/i);
  if (selectMatch) {
    const selectClause = selectMatch[1];
    const columnMatches = selectClause.match(/\b\w+\b/g) || [];
    const invalidColumnNames = columnMatches.filter(col => 
      !validColumns.includes(col) && 
      !sqlKeywords.includes(col) &&
      !col.match(/^\d+$/) && // numbers
      !col.match(/^'[^']*'$/) // quoted strings
    );
    
    if (invalidColumnNames.length > 0) {
      return {
        isValid: false,
        error: `Unknown column(s): ${invalidColumnNames.join(', ')}`,
        reason: 'These columns don\'t exist in the users table',
        suggestion: 'Use only the available columns: age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week'
      };
    }
  }
  
  return { isValid: true };
}

// ENHANCED: AI-powered smart error analysis
async function getSmartErrorMessage(error: unknown, originalQuery: string, conversationHistory: Array<{ role: string; content: string }>): Promise<string> {
  const errorString = (error as Error)?.message || String(error) || '';
  
  console.log('Analyzing error:', errorString);
  console.log('Original query:', originalQuery);
  
  // Create a smart error analysis prompt for Groq
  const errorAnalysisPrompt = `You are an expert SQL error analyzer. Analyze this error and provide helpful guidance.

ERROR DETAILS:
- Error: ${errorString}
- Original Query: ${originalQuery}
- Available Schema: users (id, age, gender, height, weight, city, country, zip, occupation, education, smoking, drinks_per_week)

CONVERSATION CONTEXT:
${conversationHistory.length > 0 ? conversationHistory.map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`).join('\n') : 'No previous context'}

ANALYZE AND PROVIDE:
1. What went wrong (in simple terms)
2. Why it happened
3. Specific suggestions to fix it
4. Alternative ways to ask the same question
5. Proactive suggestions for related queries

FORMAT YOUR RESPONSE AS:
🔍 **What went wrong:** [Brief explanation]
💡 **Why:** [Technical reason]
🔧 **How to fix:** [Specific suggestions]
🚀 **Try asking:** [Alternative questions]
📊 **Related insights:** [Proactive suggestions]

Be helpful, educational, and encouraging. Use emojis and make it engaging.`;

  try {
    // Call Groq for intelligent error analysis
    const errorAnalysisRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: errorAnalysisPrompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (errorAnalysisRes.ok) {
      const errorAnalysisData = await errorAnalysisRes.json();
      const smartErrorResponse = errorAnalysisData.choices?.[0]?.message?.content?.trim();
      
      if (smartErrorResponse) {
        return smartErrorResponse;
      }
    }
  } catch (analysisError) {
    console.error('Error analysis failed:', analysisError);
  }
  
  // Fallback to enhanced static error handling
  return getEnhancedStaticErrorMessage(errorString);
}

// Enhanced static error handling as fallback
function getEnhancedStaticErrorMessage(errorString: string): string {
  // Column doesn't exist errors
  if (errorString.includes('column') && errorString.includes('does not exist')) {
    const columnMatch = errorString.match(/column "([^"]+)"/);
    const columnName = columnMatch ? columnMatch[1] : 'unknown';
    
    return `🔍 **What went wrong:** I couldn't find the column "${columnName}" in the database.

💡 **Why:** The database doesn't have that field name.

🔧 **How to fix:** Use these available columns instead:
• **Personal:** Age, Gender, Height, Weight
• **Location:** City, Country, Zip  
• **Background:** Occupation, Education
• **Lifestyle:** Smoking, Drinks per week

🚀 **Try asking:**
• "Show me users by age"
• "What's the average height?"
• "How many people are from California?"
• "What occupations do we have?"

📊 **Related insights:** I can help you explore demographics, health metrics, and geographic distribution!`;
  }
  
  // Syntax errors
  if (errorString.includes('syntax error') || errorString.includes('invalid syntax')) {
    return `🔍 **What went wrong:** I had trouble understanding your question structure.

💡 **Why:** The AI generated SQL that doesn't match the database format.

🔧 **How to fix:** Try asking more simply:
• "How many users are there?"
• "What's the average age?"
• "Show me users from California"
• "How many people smoke?"

🚀 **Try asking:**
• "Count all users"
• "Average age of users"
• "Users in California"
• "Smoking statistics"

📊 **Related insights:** I can help with counts, averages, filtering, and data exploration!`;
  }
  
  // Permission errors
  if (errorString.includes('permission') || errorString.includes('access')) {
    return `🔍 **What went wrong:** I don't have permission to access that data.

💡 **Why:** The query tried to access restricted information.

🔧 **How to fix:** Ask about user information instead:
• "How many users are there?"
• "What's the average age?"
• "Show me user demographics"

🚀 **Try asking:**
• "User statistics"
• "Demographic breakdown"
• "Health metrics"
• "Geographic distribution"

📊 **Related insights:** I can help you explore user data safely and effectively!`;
  }
  
  // Connection errors
  if (errorString.includes('connection') || errorString.includes('timeout')) {
    return `🔍 **What went wrong:** I'm having trouble connecting to the database.

💡 **Why:** Network or database connectivity issue.

🔧 **How to fix:** Please try again in a moment.

🚀 **Try asking:** Once connected, try:
• "How many users are there?"
• "What's the average age?"
• "Show me user data"

📊 **Related insights:** I'll be ready to help explore your data once the connection is restored!`;
  }
  
  // Generic fallback with enhanced suggestions
  return `🔍 **What went wrong:** I encountered an unexpected error with your query.

💡 **Why:** Something didn't work as expected in the database query.

🔧 **How to fix:** Try these proven questions:
• "How many users are there?"
• "What's the average age?"
• "Show me users from California"
• "How many people smoke?"
• "What's the average height?"

🚀 **Try asking:**
• "User count"
• "Age statistics" 
• "Location data"
• "Health metrics"
• "Demographic breakdown"

📊 **Related insights:** I can help you discover patterns in your user data!`;
}

// Helper function to format query results with clean, simple format
function formatQueryResult(rows: Record<string, unknown>[], startIndex: number = 1): string {
  if (rows.length === 0) return 'No data found.';
  
  // If it's a count query
  if (rows[0].count !== undefined) {
    return `Found ${rows[0].count} records matching your criteria.`;
  }
  
  // If it's an average query
  if (rows[0].avg !== undefined) {
    return `Average: ${Number(rows[0].avg).toFixed(2)}`;
  }
  
  // If it's an average_bmi query
  if (rows[0].average_bmi !== undefined) {
    return `Average BMI: ${Number(rows[0].average_bmi).toFixed(1)}`;
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
      result += `${startIndex + index}. ${row.gender || 'N/A'}, ${row.age || 'N/A'} years old\n`;
      result += `   Location: ${row.city || 'N/A'}, ${row.country || 'N/A'}\n`;
      result += `   Job: ${row.occupation || 'N/A'} | Education: ${row.education || 'N/A'}\n`;
      result += `   Height: ${row.height || 'N/A'}cm, Weight: ${row.weight || 'N/A'}kg\n`;
      
      // Add BMI if we have height and weight data
      if (row.height && row.weight && Number(row.height) > 0 && Number(row.weight) > 0) {
        const bmi = calculateBMI(Number(row.height), Number(row.weight));
        const bmiCategory = getBMICategory(bmi);
        result += `   BMI: ${bmi.toFixed(1)} (${bmiCategory})\n`;
      } else if (row.bmi) {
        // If BMI was calculated in SQL
        const bmiCategory = getBMICategory(Number(row.bmi));
        result += `   BMI: ${row.bmi} (${bmiCategory})\n`;
      }
      
      result += `   Smoking: ${row.smoking || 'N/A'} | Drinks/week: ${row.drinks_per_week || 'N/A'}\n\n`;
    });
    
    // Add summary stats
    const avgAge = (rows.reduce((sum, row) => sum + (Number(row.age) || 0), 0) / rows.length).toFixed(1);
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
    return `Found ${rows.length} records. Here are the first 10:\n\n${formatQueryResult(rows.slice(0, 10), startIndex)}`;
  }
}