"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Github, Container, Loader2, CheckCircle, AlertCircle, Copy, Download, GitCommit } from "lucide-react";
import { apiClient, GenerationStatus } from "@/lib/api";

interface GenerationResult {
  dockerfile: string;
  techStack: string[];
  buildStatus: 'pending' | 'building' | 'success' | 'error';
  error?: string;
}


export default function Home() {
  const [githubUrl, setGithubUrl] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState("");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [isPushing, setIsPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [pollTimeout, setPollTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isStopping, setIsStopping] = useState(false);

  const handleGenerate = async () => {
    if (!githubUrl || !githubToken) {
      setError("Please provide both GitHub URL and Personal Access Token");
      return;
    }

    // Clear any existing polling
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      setPollTimeout(null);
    }
    
    setIsGenerating(true);
    setIsStopping(false);
    setError("");
    setResult(null);

    try {
      // Check if backend is running
      // const isHealthy = await apiClient.checkHealth();
      // if (!isHealthy) {
      //   setError("Backend server is not running. Please start the backend server on http://localhost:3001");
      //   setIsGenerating(false);
      //   return;
      // }

      // Start the generation process
      const response = await apiClient.generateDockerfile({
        githubUrl,
        githubToken
      });

      // Ensure we have a valid generation ID
      const fullGenerationId = response.generationId?.toString() || '';
      if (!fullGenerationId || fullGenerationId.length < 20) {
        console.error('Invalid generation ID received:', response.generationId);
        setError('Invalid generation ID received from server');
        setIsGenerating(false);
        return;
      }
      
      setGenerationId(fullGenerationId);
      console.log('Full generation ID received:', fullGenerationId);
      console.log('Generation ID length:', fullGenerationId.length);
      console.log('Generation ID type:', typeof fullGenerationId);
      console.log('Generation ID JSON:', JSON.stringify(fullGenerationId));
      console.log('Generation ID hex:', fullGenerationId.split('').map(c => c.charCodeAt(0).toString(16)).join(''));

      // Poll for status updates
      let pollCount = 0;
      const startTime = Date.now();
      const pollStatus = async () => {
        try {
          pollCount++;
          const currentGenerationId = fullGenerationId;
          console.log('Polling with generation ID:', currentGenerationId);
          console.log('Polling ID length:', currentGenerationId.length);
          console.log('Polling ID type:', typeof currentGenerationId);
          console.log('Polling ID JSON:', JSON.stringify(currentGenerationId));
          console.log('Polling ID starts with:', currentGenerationId.substring(0, 10));
          console.log('Polling ID hex:', currentGenerationId.split('').map(c => c.charCodeAt(0).toString(16)).join(''));
          console.log('Polling ID ends with:', currentGenerationId.substring(currentGenerationId.length - 10));
          const statusResponse = await apiClient.getGenerationStatus(currentGenerationId);
          const generation = statusResponse.generation;
          console.log('Polling status:', generation.buildStatus, 'Poll count:', pollCount, 'Has dockerfile:', !!generation.dockerfile, 'Has error:', !!generation.error);


          // Update result
          if (generation.dockerfile || generation.techStack.length > 0) {
            setResult({
              dockerfile: generation.dockerfile,
              techStack: generation.techStack,
              buildStatus: generation.buildStatus,
              error: generation.error
            });
          }

          // Check for timeout (5 minutes max)
          const elapsedTime = Date.now() - startTime;
          const maxTime = 5 * 60 * 1000; // 5 minutes
          
          // Stop immediately when Dockerfile is generated (success) or on error
          const hasDockerfile = !!generation.dockerfile;
          const hasCompleteResult = (generation.buildStatus === 'success') || 
                                   (generation.buildStatus === 'error' && generation.error);
          
          // Stop as soon as we have a Dockerfile or complete result
          const shouldStopOnDockerfile = hasDockerfile || hasCompleteResult;
          
          // Force stop if we've been polling for more than 2 minutes regardless of status
          const shouldForceStopByTime = elapsedTime > 120000; // 2 minutes
          
          // Continue polling only if we don't have a Dockerfile yet and still building
          if (!shouldStopOnDockerfile && !shouldForceStopByTime && (generation.buildStatus === 'building' || generation.buildStatus === 'pending') && pollCount < 150 && elapsedTime < maxTime) {
            const timeout = setTimeout(pollStatus, 2000); // Poll every 2 seconds
            setPollTimeout(timeout);
          } else {
            // Stop polling and reset generating state
            setIsGenerating(false);
            setPollTimeout(null);
            console.log('Generation completed with status:', generation.buildStatus);
            
            
            if (pollCount >= 150) {
              console.warn('Polling timeout reached, stopping polling');
            }
            if (elapsedTime >= maxTime) {
              console.warn('Maximum time reached, stopping polling');
            }
            if (hasCompleteResult) {
              console.log('Complete result received, stopping polling immediately');
            }
            if (shouldStopOnDockerfile) {
              console.log('Stopping polling - Dockerfile generation completed');
            }
            if (shouldForceStopByTime) {
              console.log('Force stopping polling - Maximum time reached (2 minutes)');
            }
          }

        } catch (pollError) {
          console.error('Error polling status:', pollError);
          const errorMessage = pollError instanceof Error ? pollError.message : String(pollError);
          console.error('Poll error details:', {
            name: pollError instanceof Error ? pollError.name : 'Unknown',
            message: errorMessage,
            type: pollError instanceof Error ? pollError.constructor.name : typeof pollError
          });
          
          // Check if it's a connection error
          if (errorMessage.includes('Failed to fetch') || errorMessage.includes('ERR_CONNECTION_REFUSED')) {
            console.error('Connection error detected, stopping polling');
            setIsGenerating(false);
            setPollTimeout(null);
            setError('Connection to server lost. Please try again.');
            return;
          }
          
          // Retry polling after a delay (with timeout protection)
          const elapsedTime = Date.now() - startTime;
          const maxTime = 5 * 60 * 1000; // 5 minutes
          
          if (pollCount < 150 && elapsedTime < maxTime) {
            const timeout = setTimeout(pollStatus, 2000);
            setPollTimeout(timeout);
          } else {
            console.warn('Polling timeout reached due to errors, stopping polling');
            setIsGenerating(false);
            setPollTimeout(null);
          }
        }
      };

      // Start polling
      const initialTimeout = setTimeout(pollStatus, 1000);
      setPollTimeout(initialTimeout);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate Dockerfile. Please try again.");
      setIsGenerating(false);
    }
  };

  const handleStopGeneration = () => {
    console.log('Manually stopping generation...');
    setIsStopping(true);
    setIsGenerating(false);
    if (pollTimeout) {
      clearTimeout(pollTimeout);
      setPollTimeout(null);
    }
    console.log('Generation stopped manually');
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const downloadDockerfile = () => {
    if (!result?.dockerfile) return;
    
    const blob = new Blob([result.dockerfile], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Dockerfile';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const pushDockerfileToRepository = async () => {
    if (!generationId || !result?.dockerfile) return;

    setIsPushing(true);
    setPushSuccess(false);
    setError("");

    try {
      await apiClient.pushDockerfileToRepository(generationId, 'Add Dockerfile generated by DockGen AI');
      setPushSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to push Dockerfile to repository");
    } finally {
      setIsPushing(false);
    }
  };


  // Cleanup polling timeout on unmount
  useEffect(() => {
    return () => {
      if (pollTimeout) {
        clearTimeout(pollTimeout);
      }
    };
  }, [pollTimeout]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Container className="h-8 w-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              DockGen AI
            </h1>
          </div>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            AI-Powered Dockerfile Generator & Image Builder
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Input Form */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="h-5 w-5" />
                GitHub Repository
              </CardTitle>
              <CardDescription>
                Enter your GitHub repository URL and Personal Access Token to generate a Dockerfile
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  GitHub Repository URL
                </label>
                <Input
                  type="url"
                  placeholder="https://github.com/username/repository"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  disabled={isGenerating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Personal Access Token
                </label>
                <Input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  disabled={isGenerating}
                />
              </div>
              <div className="space-y-2">
                <Button 
                  onClick={handleGenerate} 
                  disabled={isGenerating || !githubUrl || !githubToken}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Dockerfile...
                    </>
                  ) : (
                    <>
                      <Container className="mr-2 h-4 w-4" />
                      Generate Dockerfile
                    </>
                  )}
                </Button>
                {isGenerating && (
                  <Button 
                    onClick={handleStopGeneration}
                    variant="destructive"
                    className="w-full"
                    size="sm"
                  >
                    Stop Dockerfile Generation
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>



          {/* Error Alert */}
          {error && (
            <Alert className="mb-8" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-6">
              {/* Tech Stack Detection */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Detected Tech Stack
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {result.techStack.map((tech) => (
                      <Badge key={tech} variant="secondary">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Generated Dockerfile */}
              <Card>
                <CardHeader>
                  <CardTitle>Generated Dockerfile</CardTitle>
                  <CardDescription>
                    AI-generated Dockerfile optimized for your project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={result.dockerfile}
                    readOnly
                    className="min-h-[300px] font-mono text-sm"
                  />
                  <div className="mt-4 flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => copyToClipboard(result.dockerfile)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy to Clipboard
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={downloadDockerfile}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Dockerfile
                    </Button>
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={pushDockerfileToRepository}
                      disabled={isPushing || !generationId}
                    >
                      {isPushing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <GitCommit className="mr-2 h-4 w-4" />
                      )}
                      {isPushing ? 'Pushing...' : 'Push to Repository'}
                    </Button>
                  </div>
                  {pushSuccess && (
                    <div className="mt-2 text-sm text-green-600">
                      ✅ Dockerfile successfully pushed to repository!
                    </div>
                  )}
                </CardContent>
              </Card>


            </div>
          )}
        </div>
      </div>
    </div>
  );
}
