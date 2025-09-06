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
      bmi = typeof row.bmi === 'number' ? row.bmi : parseFloat(String(row.bmi));
    } else if (row.height && row.weight) {
      const height = typeof row.height === 'number' ? row.height : parseFloat(String(row.height));
      const weight = typeof row.weight === 'number' ? row.weight : parseFloat(String(row.weight));
      bmi = calculateBMI(height, weight);
    }
    
    if (bmi > 0) {
      validBMIs.push(bmi);
      const category = getBMICategory(bmi);
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    }
  });
  
  const avgBMI = validBMIs.length > 0 ? validBMIs.reduce((sum, bmi) => sum + bmi, 0) / validBMIs.length : 0;
  const categories = Object.entries(categoryCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([category, count]) => `${category}: ${count}`)
    .join(', ');
  
  return {
    validCount: validBMIs.length,
    avgBMI: Math.round(avgBMI * 10) / 10,
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

    // Conversation history is already available
    console.log('Conversation history received:', conversationHistory.length, 'messages');

    // PHASE 2: Enhanced context awareness with conversation memory
    const followUpPhrases = /(show them|list them|display them|show these|list these|can you show|can you list|show users who|list users who|show the smokers|show the users|show the people|list the people|show the data|list the data|show me those|display those|show those|show the results|show the data)/i;
    const simpleFollowUp = /^(show|list|display)$/i;
    const paginationPhrases = /(show me more|show more|next page|next 10|from \d+ to \d+|users \d+-\d+|from \d+-\d+|users with bmi from \d+-\d+)/i;
    const filterPhrases = /(how many of them|how many of those|what about them|what about those|show me the|show the|filter by|sort by)/i;
    
    // PHASE 2: SIMPLIFIED CONTEXT AWARENESS - Direct conversation analysis
    console.log('=== DEBUGGING CONTEXT AWARENESS ===');
    console.log('Message:', message);
    console.log('Follow-up test result:', followUpPhrases.test(message.trim()));
    console.log('Simple follow-up test result:', simpleFollowUp.test(message.trim()));
    console.log('Conversation history length:', conversationHistory.length);
    console.log('Conversation history:', JSON.stringify(conversationHistory, null, 2));
    console.log('Message trimmed:', message.trim());
    console.log('Regex test for "show them":', /show them/i.test(message.trim()));
    
    if (followUpPhrases.test(message.trim()) || simpleFollowUp.test(message.trim())) {
      console.log('=== FOLLOW-UP DETECTED ===');
      console.log('Message:', message);
      console.log('Conversation history length:', conversationHistory.length);
      
      // SIMPLE APPROACH: Look for the last meaningful query in conversation history
      // Skip the current message (last one) and look for previous meaningful queries
      let lastMeaningfulQuery = '';
      console.log('Searching for meaningful query in conversation history...');
      for (let i = conversationHistory.length - 2; i >= 0; i--) { // Start from -2 to skip current message
        const msg = conversationHistory[i];
        console.log(`Checking message ${i}:`, msg.role, msg.content);
        if (msg.role === 'user' && 
            (msg.content.toLowerCase().includes('smoke') || 
             msg.content.toLowerCase().includes('bmi') || 
             msg.content.toLowerCase().includes('california') ||
             msg.content.toLowerCase().includes('show') ||
             msg.content.toLowerCase().includes('how many'))) {
          lastMeaningfulQuery = msg.content;
          console.log('Found meaningful query:', lastMeaningfulQuery);
          break;
        }
      }
      
      console.log('Last meaningful query found:', lastMeaningfulQuery);
      
      // Handle based on the last meaningful query
      if (lastMeaningfulQuery.toLowerCase().includes('smoke')) {
        console.log('Detected smoking context, showing smokers');
        const smokingQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE smoking = 'Yes' AND height IS NOT NULL AND weight IS NOT NULL`;
        
        try {
          const smokingResult = await db.execute(smokingQuery);
          if (smokingResult.rows && smokingResult.rows.length > 0) {
            const formattedResult = formatQueryResult(smokingResult.rows, 1);
            return NextResponse.json({ 
              response: formattedResult,
              sqlQuery: smokingQuery
            });
          }
        } catch (error) {
          console.error('Smoking query error:', error);
        }
      } else if (lastMeaningfulQuery.toLowerCase().includes('bmi')) {
        console.log('Detected BMI context, showing BMI data');
        const bmiQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL LIMIT 10`;
        
        try {
          const bmiResult = await db.execute(bmiQuery);
          if (bmiResult.rows && bmiResult.rows.length > 0) {
            const formattedResult = formatQueryResult(bmiResult.rows, 1);
            return NextResponse.json({ 
              response: formattedResult,
              sqlQuery: bmiQuery
            });
          }
        } catch (error) {
          console.error('BMI query error:', error);
        }
      } else if (lastMeaningfulQuery.toLowerCase().includes('california')) {
        console.log('Detected California context, showing California users');
        const locationQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%') AND height IS NOT NULL AND weight IS NOT NULL LIMIT 10`;
        
        try {
          const locationResult = await db.execute(locationQuery);
          if (locationResult.rows && locationResult.rows.length > 0) {
            const formattedResult = formatQueryResult(locationResult.rows, 1);
            return NextResponse.json({ 
              response: formattedResult,
              sqlQuery: locationQuery
            });
          }
        } catch (error) {
          console.error('Location query error:', error);
        }
      } else {
        // Default fallback: Show smokers (most common follow-up)
        console.log('No specific context found, showing smokers as default');
        const smokingQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE smoking = 'Yes' AND height IS NOT NULL AND weight IS NOT NULL`;
        
        try {
          const smokingResult = await db.execute(smokingQuery);
          if (smokingResult.rows && smokingResult.rows.length > 0) {
            const formattedResult = formatQueryResult(smokingResult.rows, 1);
            return NextResponse.json({ 
              response: formattedResult,
              sqlQuery: smokingQuery
            });
          }
        } catch (error) {
          console.error('Default smoking query error:', error);
        }
      }
      
      // If we get here, no context was found and no fallback worked
      console.log('No context found and fallback failed, returning generic response');
      return NextResponse.json({
        response: "I'm not sure what you're looking for. I can help you explore your data by asking questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?"
      });
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
          response: "I'm here to help you explore your data! I can answer questions about your users, their demographics, health metrics, and more. Try asking something like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?" 
        });
      
      case 'appreciation':
        return NextResponse.json({ 
          response: "Thank you! I'm glad I could help. Is there anything else you'd like to know about your data?" 
        });
      
      case 'dangerous':
        return NextResponse.json({ 
          response: "I can't help with that type of request. I'm designed to help you explore and analyze your data safely. I can answer questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?" 
        });
      
      case 'unclear':
        return NextResponse.json({ 
          response: "I'm not sure what you're looking for. I can help you explore your data by asking questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?" 
        });
      
      case 'data_query':
        // Continue with normal data processing
        break;
      
      default:
        // Default to data query processing
        break;
    }

    // Handle pagination requests
    if (paginationPhrases.test(message.trim()) && conversationHistory.length > 0) {
      // Find the last query that returned results
      const lastQuery = conversationHistory.findLast((msg: { role: string; content: string }) => 
        msg.role === 'user' && 
        (msg.content.toLowerCase().includes('bmi') || 
         msg.content.toLowerCase().includes('smoke') || 
         msg.content.toLowerCase().includes('california') ||
         msg.content.toLowerCase().includes('show'))
      );
      
      if (lastQuery) {
        console.log('Found last query for pagination:', lastQuery.content);
        
        // Parse pagination request
        const rangeMatch = message.match(/(\d+)-(\d+)/);
        const nextPageMatch = message.match(/next|more/);
        
        let limit = 10;
        let offset = 0;
        
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1]);
          const end = parseInt(rangeMatch[2]);
          limit = end - start + 1;
          offset = start - 1;
        } else if (nextPageMatch) {
          // Assume next page means 11-20, 21-30, etc.
          offset = 10; // Start from 11th record
        }
        
        console.log('Pagination params:', { limit, offset });
        
        // Generate appropriate query based on last query
        let query = '';
        if (lastQuery.content.toLowerCase().includes('bmi')) {
          query = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL LIMIT ${limit} OFFSET ${offset}`;
        } else if (lastQuery.content.toLowerCase().includes('smoke')) {
          query = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE smoking = 'Yes' AND height IS NOT NULL AND weight IS NOT NULL LIMIT ${limit} OFFSET ${offset}`;
        } else if (lastQuery.content.toLowerCase().includes('california')) {
          query = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%') AND height IS NOT NULL AND weight IS NOT NULL LIMIT ${limit} OFFSET ${offset}`;
        }
        
        if (query) {
          try {
            const result = await db.execute(query);
            if (result.rows && result.rows.length > 0) {
              const startIndex = offset + 1;
              const formattedResult = formatQueryResult(result.rows, startIndex);
              
              // Add pagination info
              const paginationInfo = `\n\n📄 **Showing records ${startIndex}-${startIndex + result.rows.length - 1}**\nTo see more, ask: "Show me more" or "Show me users with BMI from ${startIndex + result.rows.length}-${startIndex + result.rows.length + 9}"`;
              
              return NextResponse.json({ 
                response: formattedResult + paginationInfo,
                sqlQuery: query
              });
            }
          } catch (error) {
            console.error('Pagination query error:', error);
          }
        }
      }
    }

    // Handle BMI calculation requests
    const bmiPatterns = /(calculate bmi|bmi calculation|show bmi|bmi for|bmi of|bmi data|bmi results|bmi values)/i;
    if (bmiPatterns.test(message)) {
      console.log('BMI calculation request detected');
      
      // First get total count for pagination info
      const countQuery = `SELECT COUNT(*) as total FROM users WHERE height IS NOT NULL AND weight IS NOT NULL`;
      const countResult = await db.execute(countQuery);
      const totalUsers = Number(countResult.rows[0]?.total) || 0;
      
      const bmiQuery = `SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL LIMIT 10`;
      
      try {
        const bmiResult = await db.execute(bmiQuery);
        if (bmiResult.rows && bmiResult.rows.length > 0) {
          const formattedResult = formatQueryResult(bmiResult.rows, 1);
          
          // Add pagination info if there are more users
          let paginationInfo = '';
          if (totalUsers > 10) {
            paginationInfo = `\n\n📄 **Showing 10 of ${totalUsers} users with BMI data**\nTo see more, ask: "Show me more" or "Show me users with BMI from 11-20"`;
          }
          
          return NextResponse.json({ 
            response: formattedResult + paginationInfo,
            sqlQuery: bmiQuery
          });
        }
      } catch (error) {
        console.error('BMI query error:', error);
      }
    }

    // Handle name-related queries (first name, last name)
    if (message.toLowerCase().includes('first name') || message.toLowerCase().includes('last name') || message.toLowerCase().includes('name')) {
      return NextResponse.json({ 
        response: "I don't have access to first name or last name data in this database. The available user information includes:\n\n• Age, Gender, Height, Weight\n• Location (City, Country, ZIP)\n• Occupation, Education\n• Health data (Smoking, Drinks per week)\n• Calculated BMI\n\nWhat would you like to know about these available fields?" 
      });
    }

    // Handle salary/income queries
    if (message.toLowerCase().includes('salary') || message.toLowerCase().includes('income') || message.toLowerCase().includes('wage') || message.toLowerCase().includes('pay')) {
      return NextResponse.json({ 
        response: "I don't have access to salary or income data in this database. The available user information includes:\n\n• Age, Gender, Height, Weight\n• Location (City, Country, ZIP)\n• Occupation, Education\n• Health data (Smoking, Drinks per week)\n• Calculated BMI\n\nWhat would you like to know about these available fields?" 
      });
    }

    // Handle dangerous operations
    if (message.toLowerCase().includes('delete') || message.toLowerCase().includes('drop') || message.toLowerCase().includes('truncate') || message.toLowerCase().includes('alter')) {
      return NextResponse.json({ 
        response: "I can't help with data modification operations like delete, drop, or alter. I'm designed to help you explore and analyze your data safely. I can answer questions like:\n\n• \"How many users are there?\"\n• \"What's the average age?\"\n• \"Show me users from California\"\n• \"How many people smoke?\"\n• \"What's the average BMI?\"\n\nWhat would you like to know about your data?" 
      });
    }

    // Generate SQL using Groq
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a SQL expert. Generate PostgreSQL queries for a users table with these columns:
            - id (integer, primary key)
            - age (integer)
            - gender (text: 'Male' or 'Female')
            - height (integer, in cm)
            - weight (integer, in kg)
            - city (text)
            - country (text)
            - zip (text)
            - occupation (text)
            - education (text)
            - smoking (text: 'Yes' or 'No')
            - drinksPerWeek (integer)

            CRITICAL INSTRUCTION: BMI is NOT a stored column. Only calculate BMI when explicitly requested using: ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi

            QUERY TYPE DETECTION:
            - Use AVG(), COUNT(), SUM() for aggregation queries (averages, counts, totals)
            - Use SELECT * for showing individual records
            - Use LIMIT 10 for showing records to avoid overwhelming output

            EXAMPLES:
            - "How many users?" → SELECT COUNT(*) FROM users
            - "What's the average age?" → SELECT AVG(age) FROM users
            - "Show me users from California" → SELECT * FROM users WHERE country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%') LIMIT 10
            - "How many people smoke?" → SELECT COUNT(*) FROM users WHERE smoking = 'Yes'
            - "Calculate BMI" → SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL LIMIT 10

            CONTEXT AWARENESS:
            - If user asks follow-up questions like "show them", "list them", "display them", look at conversation history
            - Find the last meaningful query and re-run it to show actual records
            - For "how many of them under age 25?", add WHERE age < 25 to the previous query

            CONVERSATION CONTEXT EXAMPLES:
            - Previous: "How many people smoke?" → Follow-up: "show them" → Show smokers with SELECT * FROM users WHERE smoking = 'Yes'
            - Previous: "Show me users from California" → Follow-up: "how many of them under age 25?" → SELECT COUNT(*) FROM users WHERE country IN ('USA', 'US', 'Usa') AND (city ILIKE '%california%' OR city ILIKE '%ca%' OR city ILIKE '%cali%') AND age < 25

            ERROR PREVENTION RULES:
            - NEVER use columns that don't exist (first_name, last_name, salary, bmi as stored column)
            - ALWAYS use exact column names from the schema
            - ALWAYS use proper SQL syntax
            - ALWAYS include LIMIT for SELECT * queries
            - NEVER use dangerous operations (DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER)

            STRICT RULES:
            - For "show all users age 25" → SELECT * FROM users WHERE age = 25 LIMIT 10
            - For "average BMI" → SELECT AVG(ROUND(weight / ((height/100.0) * (height/100.0)), 1)) AS average_bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL
            - For "show users with BMI" → SELECT *, ROUND(weight / ((height/100.0) * (height/100.0)), 1) AS bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL LIMIT 10

            Generate only the SQL query, nothing else.`
          },
          ...conversationHistory.map((msg: { role: string; content: string }) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content
          })),
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    if (!groqResponse.ok) {
      console.error('Groq API error:', groqResponse.status, groqResponse.statusText);
      return NextResponse.json({ 
        response: "I'm having trouble connecting to the AI service. Please try again in a moment." 
      }, { status: 500 });
    }

    const groqData = await groqResponse.json();
    const sqlQuery = groqData.choices[0]?.message?.content?.trim();

    if (!sqlQuery) {
      return NextResponse.json({ 
        response: "I couldn't generate a query for that request. Please try rephrasing your question." 
      }, { status: 500 });
    }

    console.log('Generated SQL:', sqlQuery);

    // Smart query validation
    const validation = validateSQLQuery(sqlQuery);
    if (!validation.isValid) {
      return NextResponse.json({ 
        response: validation.error 
      }, { status: 400 });
    }

    // Smart query optimization for "average BMI" queries
    if (message.toLowerCase().includes('average bmi') && sqlQuery.toLowerCase().includes('select *')) {
      console.log('Optimizing average BMI query');
      const optimizedQuery = `SELECT AVG(ROUND(weight / ((height/100.0) * (height/100.0)), 1)) AS average_bmi FROM users WHERE height IS NOT NULL AND weight IS NOT NULL`;
      
      try {
        const result = await db.execute(optimizedQuery);
        const avgBMI = Number(result.rows[0]?.average_bmi) || 0;
        return NextResponse.json({ 
          response: `The average BMI is ${Math.round(avgBMI * 10) / 10}`,
          sqlQuery: optimizedQuery
        });
      } catch (error) {
        console.error('Optimized BMI query error:', error);
      }
    }

    // Execute the query
    try {
      const result = await db.execute(sqlQuery);
      console.log('Query executed successfully, rows:', result.rows?.length || 0);

      if (result.rows && result.rows.length > 0) {
        const formattedResult = formatQueryResult(result.rows);
        return NextResponse.json({ 
          response: formattedResult,
          sqlQuery: sqlQuery
        });
      } else {
        return NextResponse.json({ 
          response: "No records found matching your criteria.",
          sqlQuery: sqlQuery
        });
      }
    } catch (sqlError) {
      console.error('SQL execution error:', sqlError);
      
      // Smart error handling with AI analysis
      const smartError = await getSmartErrorMessage(sqlError, sqlQuery, conversationHistory);
      return NextResponse.json({ 
        response: smartError 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ 
      response: "I encountered an error processing your request. Please try again." 
    }, { status: 500 });
  }
}

// DYNAMIC INTENT RECOGNITION: AI-powered intent classification
async function classifyUserIntent(message: string, conversationHistory: Array<{ role: string; content: string }>): Promise<string> {
  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `Classify the user's message into one of these intents:
            - greeting: "hi", "hello", "hey", "good morning", "good afternoon", "good evening"
            - non_data: "nothing", "nope", "no", "nada", "okay", "ok", "alright", "sure", "thanks", "thank you", "bye", "goodbye", "see you", "later"
            - appreciation: "nice", "good", "great", "awesome", "excellent", "perfect", "amazing", "wonderful", "fantastic", "cool"
            - dangerous: "delete", "drop", "truncate", "alter", "remove", "destroy", "wipe", "clear"
            - unclear: Random words, gibberish, or unclear requests
            - data_query: Any question about data, statistics, users, demographics, health, etc.

            Examples:
            - "hi" → greeting
            - "nothing" → non_data
            - "nice" → appreciation
            - "delete all users" → dangerous
            - "asdfgh" → unclear
            - "how many users" → data_query
            - "show me users" → data_query
            - "what's the average age" → data_query

            Return only the intent name, nothing else.`
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.1,
        max_tokens: 50
      })
    });

    if (!groqResponse.ok) {
      console.error('Groq API error for intent classification:', groqResponse.status);
      return 'data_query'; // Default fallback
    }

    const data = await groqResponse.json();
    const intent = data.choices[0]?.message?.content?.trim().toLowerCase();
    
    // Validate intent
    const validIntents = ['greeting', 'non_data', 'appreciation', 'dangerous', 'unclear', 'data_query'];
    if (validIntents.includes(intent)) {
      return intent;
    }

    // Fallback pattern matching
    const greetingPatterns = /^(hi|hello|hey|good morning|good afternoon|good evening)$/i;
    const nonDataPatterns = /^(nothing|nope|no|nada|okay|ok|alright|sure|thanks|thank you|bye|goodbye|see you|later)$/i;
    const appreciationPatterns = /^(nice|good|great|awesome|excellent|perfect|amazing|wonderful|fantastic|cool)$/i;
    const dangerousPatterns = /(delete|drop|truncate|alter|remove|destroy|wipe|clear)/i;
    
    if (greetingPatterns.test(message.trim())) return 'greeting';
    if (nonDataPatterns.test(message.trim())) return 'non_data';
    if (appreciationPatterns.test(message.trim())) return 'appreciation';
    if (dangerousPatterns.test(message.trim())) return 'dangerous';
    
    // If it's just random words without clear intent, classify as unclear
    return 'unclear';
  } catch (error) {
    console.error('Intent classification error:', error);
    return 'data_query'; // Default fallback
  }
}

// Smart SQL query validation function
function validateSQLQuery(sqlQuery: string): { isValid: boolean; error?: string } {
  const dangerousOperations = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER'];
  const upperQuery = sqlQuery.toUpperCase();
  
  // Check for dangerous operations
  for (const operation of dangerousOperations) {
    if (upperQuery.includes(operation)) {
      return {
        isValid: false,
        error: `I can't help with ${operation} operations. I'm designed to help you explore and analyze your data safely. I can answer questions like:\n\n• "How many users are there?"\n• "What's the average age?"\n• "Show me users from California"\n• "How many people smoke?"\n• "What's the average BMI?"\n\nWhat would you like to know about your data?`
      };
    }
  }
  
  // Check for non-existent columns
  const nonExistentColumns = ['first_name', 'last_name', 'salary', 'income', 'wage', 'pay'];
  for (const column of nonExistentColumns) {
    if (upperQuery.includes(column.toUpperCase())) {
      return {
        isValid: false,
        error: `I don't have access to ${column} data in this database. The available user information includes:\n\n• Age, Gender, Height, Weight\n• Location (City, Country, ZIP)\n• Occupation, Education\n• Health data (Smoking, Drinks per week)\n• Calculated BMI\n\nWhat would you like to know about these available fields?`
      };
    }
  }
  
  // Allow BMI calculations but reject direct references to bmi as a stored column
  if (upperQuery.includes('BMI') && !upperQuery.includes('ROUND(WEIGHT / ((HEIGHT/100.0) * (HEIGHT/100.0)), 1)')) {
    return {
      isValid: false,
      error: `BMI is not a stored column in the database. I can calculate it for you using height and weight. Try asking: "Calculate BMI for all users" or "What's the average BMI?"`
    };
  }
  
  return { isValid: true };
}

// ENHANCED: AI-powered smart error analysis
async function getSmartErrorMessage(error: unknown, originalQuery: string, conversationHistory: Array<{ role: string; content: string }>): Promise<string> {
  try {
    const errorString = error instanceof Error ? error.message : String(error);
    
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are a SQL expert helping users understand database errors. Analyze the error and provide:
            1. What went wrong (in simple terms)
            2. Why it happened
            3. How to fix it
            4. A corrected query if possible
            5. Related insights about the data
            
            Be helpful, educational, and encouraging. Use emojis sparingly and focus on being clear and actionable.`
          },
          {
            role: 'user',
            content: `Error: ${errorString}\n\nOriginal Query: ${originalQuery}\n\nConversation History: ${JSON.stringify(conversationHistory, null, 2)}\n\nPlease analyze this error and provide a helpful explanation.`
          }
        ],
        temperature: 0.3,
        max_tokens: 300
      })
    });

    if (groqResponse.ok) {
      const data = await groqResponse.json();
      const smartError = data.choices[0]?.message?.content?.trim();
      if (smartError) {
        return smartError;
      }
    }
  } catch (aiError) {
    console.error('AI error analysis failed:', aiError);
  }

  // Fallback to enhanced static error handling
  return getEnhancedStaticErrorMessage(String(error));
}

// Enhanced static error handling as fallback
function getEnhancedStaticErrorMessage(errorString: string): string {
  const error = errorString.toLowerCase();
  
  if (error.includes('column') && error.includes('does not exist')) {
    return `🔍 **What went wrong:** The query references a column that doesn't exist in the database.

💡 **Why it happened:** The column name might be misspelled or the data might not be available.

🛠️ **How to fix it:** Check the available columns and use the correct names. Available user data includes:
• Age, Gender, Height, Weight
• Location (City, Country, ZIP)  
• Occupation, Education
• Health data (Smoking, Drinks per week)
• Calculated BMI

📊 **Related insights:** I can help you discover patterns in your user data!`;
  }
  
  if (error.includes('syntax error')) {
    return `🔍 **What went wrong:** There's a syntax error in the SQL query.

💡 **Why it happened:** The query structure might be incorrect or missing required elements.

🛠️ **How to fix it:** Try rephrasing your question more simply. For example:
• "How many users are there?"
• "What's the average age?"
• "Show me users from California"

📊 **Related insights:** I can help you explore your data with the right questions!`;
  }
  
  if (error.includes('permission') || error.includes('access')) {
    return `🔍 **What went wrong:** There's a permission issue with the database.

💡 **Why it happened:** The query might be trying to access restricted data or operations.

🛠️ **How to fix it:** Try asking simpler questions about the available data. I can help you explore:
• User demographics and statistics
• Health metrics and patterns
• Location-based insights
• BMI calculations

📊 **Related insights:** Let's focus on what we can discover together!`;
  }
  
  return `🔍 **What went wrong:** An unexpected error occurred while processing your query.

💡 **Why it happened:** There might be an issue with the query structure or data access.

🛠️ **How to fix it:** Try rephrasing your question or asking something simpler like:
• "How many users are there?"
• "What's the average age?"
• "Show me users from California"

📊 **Related insights:** I'm here to help you explore your data!`;
}

// Helper function to format query results with clean, simple format
function formatQueryResult(rows: Record<string, unknown>[], startIndex: number = 1): string {
  if (!rows || rows.length === 0) {
    return "No records found matching your criteria.";
  }

  // Check if this is an aggregation query (single row with aggregate values)
  if (rows.length === 1 && (rows[0].count || rows[0].avg || rows[0].sum || rows[0].average_bmi)) {
    const row = rows[0];
    let result = "Found ";
    
    if (row.count) {
      result += `${row.count} records matching your criteria.`;
    } else if (row.avg || row.average_bmi) {
      const value = row.avg || row.average_bmi;
      result += `Average: ${Math.round(Number(value) * 100) / 100}`;
    } else if (row.sum) {
      result += `Total: ${row.sum}`;
    }
    
    return result;
  }

  // Format individual records
  let result = `Found ${rows.length} records:\n\n`;
  
  rows.forEach((row, index) => {
    const bmi = row.bmi ? Number(row.bmi) : 0;
    const bmiCategory = bmi > 0 ? getBMICategory(bmi) : 'N/A';
    
    result += `${startIndex + index}. ${row.gender || 'Unknown'}, ${row.age || 'Unknown'} years old\n`;
    result += `   Location: ${row.city || 'Unknown'}, ${row.country || 'Unknown'}\n`;
    result += `   Job: ${row.occupation || 'Unknown'} | Education: ${row.education || 'Unknown'}\n`;
    result += `   Height: ${row.height || 'Unknown'}cm, Weight: ${row.weight || 'Unknown'}kg\n`;
    if (bmi > 0) {
      result += `   BMI: ${bmi} (${bmiCategory})\n`;
    }
    result += `   Smoking: ${row.smoking || 'Unknown'} | Drinks/week: ${row.drinksPerWeek || 'N/A'}\n\n`;
  });

  // Add quick stats for multiple records
  if (rows.length > 1) {
    const ages = rows.map(r => Number(r.age)).filter(a => !isNaN(a));
    const genders = rows.map(r => r.gender).filter(g => g);
    const smokers = rows.filter(r => r.smoking === 'Yes').length;
    const bmis = rows.map(r => Number(r.bmi)).filter(b => !isNaN(b) && b > 0);
    
    result += "Quick Stats:\n";
    if (ages.length > 0) {
      result += `• Average Age: ${Math.round(ages.reduce((sum, age) => sum + age, 0) / ages.length * 10) / 10}\n`;
    }
    if (genders.length > 0) {
      const maleCount = genders.filter(g => g === 'Male').length;
      const femaleCount = genders.filter(g => g === 'Female').length;
      result += `• Male: ${maleCount}, Female: ${femaleCount}\n`;
    }
    result += `• Smokers: ${smokers}/${rows.length} (${Math.round(smokers/rows.length*100)}%)\n`;
    if (bmis.length > 0) {
      const avgBMI = bmis.reduce((sum, bmi) => sum + bmi, 0) / bmis.length;
      result += `• Average BMI: ${Math.round(avgBMI * 10) / 10}\n`;
    }
  }

  return result.trim();
}
