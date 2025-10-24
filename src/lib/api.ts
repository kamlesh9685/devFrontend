const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Add connection retry logic
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`Fetch attempt ${i + 1} for URL:`, url);
      const response = await fetch(url, options);
      console.log(`Fetch attempt ${i + 1} succeeded with status:`, response.status);
      return response;
    } catch (error) {
      console.log(`Fetch attempt ${i + 1} failed:`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
    }
  }
  throw new Error('All fetch attempts failed');
};

export interface GenerationRequest {
  githubUrl: string;
  githubToken: string;
}

export interface GenerationResponse {
  success: boolean;
  generationId: string;
  message: string;
}

export interface GenerationStatus {
  success: boolean;
  generation: {
    id: string;
    githubUrl: string;
    techStack: string[];
    dockerfile: string;
    buildStatus: 'pending' | 'building' | 'success' | 'error';
    imageId?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
  };
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
    console.log('ApiClient initialized with baseUrl:', this.baseUrl);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl.replace('/api', '')}/health`);
      return response.ok;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  async generateDockerfile(request: GenerationRequest): Promise<GenerationResponse> {
    const response = await fetch(`${this.baseUrl}/generation/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to start generation');
    }

    const result = await response.json();
    console.log('API response received:', result);
    return result;
  }

  async getGenerationStatus(generationId: string): Promise<GenerationStatus> {
    const url = `${this.baseUrl}/generation/status/${generationId}`;
    console.log('Fetching generation status from:', url);
    console.log('Generation ID length:', generationId.length);
    console.log('Full Generation ID:', generationId);
    console.log('Generation ID hex:', generationId.split('').map(c => c.charCodeAt(0).toString(16)).join(''));
    console.log('URL length:', url.length);
    console.log('URL ends with:', url.substring(url.length - 20));
    
    try {
      const response = await fetchWithRetry(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout and retry logic
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const error = await response.json();
        console.error('API Error:', error);
        throw new Error(error.error || 'Failed to fetch generation status');
      }

      const result = await response.json();
      console.log('Status response received:', result);
      return result;
    } catch (error) {
      console.error('Fetch error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Check if it's a connection refused error
      if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_CONNECTION_REFUSED')) {
        console.error('Backend server appears to be down. Please ensure the backend is running on http://localhost:3001');
        throw new Error('Backend server is not running. Please start the backend server.');
      }
      
      throw error;
    }
  }

  async getGenerationHistory(page: number = 1, limit: number = 10) {
    const response = await fetch(`${this.baseUrl}/generation/history?page=${page}&limit=${limit}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch generation history');
    }

    return response.json();
  }

  async pushDockerfileToRepository(generationId: string, commitMessage?: string) {
    const response = await fetch(`${this.baseUrl}/generation/push-dockerfile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationId,
        commitMessage
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to push Dockerfile to repository');
    }

    return response.json();
  }

}

export const apiClient = new ApiClient();
