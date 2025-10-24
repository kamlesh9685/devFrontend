

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-emerald-50">
      <div className="container mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-xl shadow-lg">
              <Container className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-teal-600 to-emerald-600">
              DockGen AI
            </h1>
          </div>
          <p className="text-xl text-slate-600 font-medium">
            AI-Powered Dockerfile Generator & Image Builder
          </p>
        </div>

        {/* Two-column grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">

          {/* --- LEFT COLUMN (Controls & Status) --- */}
          <div className="lg:col-span-1 space-y-6">

            {/* Input Panel */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50">
              <div className="p-7">
                <h3 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                  <Github className="h-6 w-6 text-blue-600" />
                  GitHub Repository
                </h3>
                <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                  Enter your repo URL and a Personal Access Token
                </p>
              </div>
              <div className="p-7 border-t border-slate-200 space-y-5">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-700">
                    GitHub Repository URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://github.com/username/repository"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    disabled={isGenerating}
                    className="bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl h-11"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-slate-700">
                    Personal Access Token
                  </label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    disabled={isGenerating}
                    className="bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 rounded-xl h-11"
                  />
                </div>
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !githubUrl || !githubToken}
                    className="w-full h-12 text-base font-bold bg-gradient-to-r from-blue-600 to-emerald-600 text-white hover:from-blue-700 hover:to-emerald-700 shadow-lg shadow-blue-500/30 rounded-xl transition-all duration-200"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Container className="mr-2 h-5 w-5" />
                        Generate
                      </>
                    )}
                  </Button>
                  {isGenerating && (
                    <Button
                      onClick={handleStopGeneration}
                      variant="destructive"
                      className="w-full h-10 rounded-xl"
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
              <Alert variant="destructive" className="rounded-xl border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          {/* --- RIGHT COLUMN (Results & Status) --- */}
          <div className="lg:col-span-2 space-y-6">

            {/* 1. Loading State */}
            {isGenerating && !result && (
              <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 flex flex-col items-center justify-center min-h-[450px]">
                <div className="text-center p-8">
                  <div className="inline-flex p-4 bg-gradient-to-br from-blue-100 to-emerald-100 rounded-full mb-5">
                    <Loader2 className="h-14 w-14 text-blue-600 animate-spin" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-800 mb-2">Analyzing Repository...</h3>
                  <p className="text-slate-500 text-base">
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
                  <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50">
                    <div className="p-7">
                      <h3 className="text-2xl font-bold flex items-center gap-2 text-slate-800">
                        <CheckCircle className="h-6 w-6 text-emerald-600" />
                         Tech Stack
                      </h3>
                    </div>
                    <div className="p-7 border-t border-slate-200">
                      <div className="flex flex-wrap gap-3">
                        {result.techStack.map((tech) => (
                          <Badge key={tech} className="bg-gradient-to-r from-blue-100 to-emerald-100 text-blue-800 border border-blue-200 text-sm px-4 py-2 rounded-lg font-semibold shadow-sm">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Generated Dockerfile Panel */}
                {result.dockerfile && (
                  <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50">
                    <div className="p-7">
                      <h3 className="text-2xl font-bold text-slate-800">Generated Dockerfile</h3>
                      <p className="text-slate-500 mt-2 text-sm">
                        AI-generated Dockerfile optimized for your project
                      </p>
                    </div>
                    <div className="p-7 border-t border-slate-200">
                      <Textarea
                        value={result.dockerfile}
                        readOnly
                        className="min-h-[350px] font-mono text-sm bg-slate-50 border-2 border-slate-300 rounded-xl text-slate-800 p-4 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <div className="mt-5 flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(result.dockerfile)}
                          className="border-2 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-xl h-10 font-semibold"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy to Clipboard
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={downloadDockerfile}
                          className="border-2 border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-xl h-10 font-semibold"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Download Dockerfile
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={pushDockerfileToRepository}
                          disabled={isPushing || !generationId}
                          className="bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-bold hover:from-blue-700 hover:to-emerald-700 shadow-lg shadow-blue-500/30 rounded-xl h-10"
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
                        <div className="mt-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2 font-semibold">
                          <CheckCircle className="h-5 w-5" />
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
               <div className="bg-white/60 backdrop-blur-md border-2 border-dashed border-slate-300 rounded-2xl shadow-lg flex flex-col items-center justify-center min-h-[450px]">
                <div className="text-center p-8">
                  <div className="inline-flex p-4 bg-slate-100 rounded-full mb-5">
                    <Container className="h-14 w-14 text-slate-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-slate-600 mb-2">Waiting for Repository</h3>
                  <p className="text-slate-500 text-base">
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