

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// We no longer use Card components, but keep the imports for other UI elements
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

    if (pollTimeout) {
      clearTimeout(pollTimeout);
      setPollTimeout(null);
    }
    
    setIsGenerating(true);
    setIsStopping(false);
    setError("");
    setResult(null);

    try {
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
    // NEW: Dark gradient background
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-gray-200">
      <div className="container mx-auto px-4 py-8">
        
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Container className="h-8 w-8 text-cyan-400" />
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500">
              DockGen AI
            </h1>
          </div>
          <p className="text-lg text-gray-400">
            AI-Powered Dockerfile Generator & Image Builder
          </p>
        </div>

        {/* Two-column grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          
          {/* --- LEFT COLUMN (Controls & Status) --- */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* NEW: "Glassmorphism" Input Panel */}
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg">
              <div className="p-6">
                <h3 className="text-2xl font-semibold flex items-center gap-2 text-white">
                  <Github className="h-5 w-5" />
                  GitHub Repository
                </h3>
                <p className="text-gray-400 mt-2">
                  Enter your repo URL and a Personal Access Token
                </p>
              </div>
              <div className="p-6 border-t border-gray-700 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    GitHub Repository URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://github.com/username/repository"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    disabled={isGenerating}
                    className="bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-gray-300">
                    Personal Access Token
                  </label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    disabled={isGenerating}
                    className="bg-gray-900 border-gray-700 text-white placeholder-gray-500 focus:ring-cyan-500 focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-2 pt-2">
                  <Button 
                    onClick={handleGenerate} 
                    disabled={isGenerating || !githubUrl || !githubToken}
                    className="w-full text-lg font-bold bg-cyan-500 text-black hover:bg-cyan-600 shadow-lg shadow-cyan-500/20"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Container className="mr-2 h-4 w-4" />
                        Generate 
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
                      Stop  Generation
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* --- RIGHT COLUMN (Results & Status) --- */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 1. Loading State */}
            {isGenerating && !result && (
              <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg flex flex-col items-center justify-center min-h-[400px]">
                <div className="text-center p-6">
                  <Loader2 className="h-12 w-12 text-cyan-400 animate-spin mb-4" />
                  <h3 className="text-xl font-semibold text-white">Analyzing Repository...</h3>
                  <p className="text-gray-400 mt-2">
                    Cloning repo and detecting tech stack...
                  </p>
                </div>
              </div>
            )}

            {/* 2. Results State */}
            {result && (
              <div className="space-y-6">
                
                {/* Tech Stack Panel */}
                {result.techStack.length > 0 && (
                  <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg">
                    <div className="p-6">
                      <h3 className="text-xl font-semibold flex items-center gap-2 text-white">
                        <CheckCircle className="h-5 w-5 text-green-400" />
                         Tech Stack
                      </h3>
                    </div>
                    <div className="p-6 border-t border-gray-700">
                      <div className="flex flex-wrap gap-2">
                        {result.techStack.map((tech) => (
                          <Badge key={tech} className="bg-cyan-900 text-cyan-200 text-sm px-3 py-1">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Generated Dockerfile Panel */}
                {result.dockerfile && (
                  <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-lg shadow-lg">
                    <div className="p-6">
                      <h3 className="text-xl font-semibold text-white">Generated Dockerfile</h3>
                      <p className="text-gray-400 mt-1">
                        AI-generated Dockerfile optimized for your project
                      </p>
                    </div>
                    <div className="p-6 border-t border-gray-700">
                      <Textarea
                        value={result.dockerfile}
                        readOnly
                        className="min-h-[300px] font-mono text-sm bg-gray-900/70 border border-gray-700 rounded-md text-gray-200 p-4 focus:ring-cyan-500 focus:border-cyan-500"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => copyToClipboard(result.dockerfile)}
                          className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy to Clipboard
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={downloadDockerfile}
                          className="border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-white"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Dockerfile
                        </Button>
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={pushDockerfileToRepository}
                          disabled={isPushing || !generationId}
                          className="bg-cyan-500 text-black font-semibold hover:bg-cyan-600 shadow-lg shadow-cyan-500/20"
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
                        <div className="mt-3 text-sm text-green-400 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          Dockerfile successfully pushed to repository!
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Empty State */}
            {!isGenerating && !result && !error && (
               <div className="bg-gray-800/50 backdrop-blur-sm border border-dashed border-gray-700 rounded-lg shadow-lg flex flex-col items-center justify-center min-h-[400px]">
                <div className="text-center p-6">
                  <Container className="h-12 w-12 text-gray-600 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-400">Waiting for Repository</h3>
                  <p className="text-gray-500 mt-2">
                    Enter your GitHub details on the left to start.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}