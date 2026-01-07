import { NextRequest, NextResponse } from 'next/server';

const OLLAMA_SERVER = process.env.OLLAMA_SERVER || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';

export async function GET(req: NextRequest) {
  try {
    // Test 1: Check if Ollama server is reachable
    const healthResponse = await fetch(`${OLLAMA_SERVER}/api/tags`, {
      signal: AbortSignal.timeout(5000)
    });

    if (!healthResponse.ok) {
      return NextResponse.json({
        status: 'unreachable',
        server: OLLAMA_SERVER,
        error: `Server returned ${healthResponse.status}`,
        message: 'Ollama server is not accessible. Fallback to Groq/Gemini will be used.'
      }, { status: 503 });
    }

    const data = await healthResponse.json();
    
    return NextResponse.json({
      status: 'healthy',
      server: OLLAMA_SERVER,
      model: OLLAMA_MODEL,
      availableModels: data.models?.map((m: any) => m.name) || [],
      message: 'Ollama server is ready!'
    });

  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      server: OLLAMA_SERVER,
      model: OLLAMA_MODEL,
      error: error.message,
      message: 'Cannot connect to Ollama server. Fallback to Groq/Gemini will be used automatically.'
    }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    console.log(`🧪 [Test] Testing Ollama with prompt: "${prompt.substring(0, 50)}..."`);

    const response = await fetch(`${OLLAMA_SERVER}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 500
        }
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      response: data.response,
      model: OLLAMA_MODEL,
      server: OLLAMA_SERVER
    });

  } catch (error: any) {
    console.error('❌ [Test] Ollama test failed:', error.message);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Ollama test failed. The main search will automatically use Groq/Gemini fallback.'
    }, { status: 500 });
  }
}
