

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
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f1f1f_1px,transparent_1px),linear-gradient(to_bottom,#1f1f1f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

      <div className="relative">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <header className="mb-20">
            <div className="flex items-baseline gap-4 mb-4">
              <Container className="h-10 w-10 text-orange-500" strokeWidth={2.5} />
              <h1 className="text-6xl font-black tracking-tight text-white">
                DockGen AI
              </h1>
            </div>
            <p className="text-lg text-neutral-400 ml-14 max-w-2xl">
              Intelligent Dockerfile generation powered by AI technology
            </p>
          </header>

          <div className="space-y-12">
            <section className="bg-neutral-900 border border-neutral-800 p-8">
              <div className="flex items-center gap-3 mb-8">
                <Github className="h-5 w-5 text-orange-500" />
                <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-300">
                  Repository Configuration
                </h2>
              </div>

              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                    Repository URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://github.com/username/repository"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    disabled={isGenerating}
                    className="bg-neutral-950 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 h-12 font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                    Access Token
                  </label>
                  <Input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    disabled={isGenerating}
                    className="bg-neutral-950 border-neutral-700 text-neutral-100 placeholder-neutral-600 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 h-12 font-mono text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !githubUrl || !githubToken}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold uppercase text-xs tracking-widest h-11 px-8 transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing
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
                    variant="outline"
                    className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase text-xs tracking-widest h-11 px-6"
                  >
                    Terminate
                  </Button>
                )}
              </div>
            </section>

            {error && (
              <Alert variant="destructive" className="bg-red-950 border-red-900 text-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isGenerating && !result && (
              <section className="border border-neutral-800 bg-neutral-900/50 p-16 flex flex-col items-center justify-center">
                <Loader2 className="h-16 w-16 text-orange-500 animate-spin mb-6" strokeWidth={2} />
                <h3 className="text-xl font-bold text-white mb-2 uppercase tracking-wide">Repository Analysis in Progress</h3>
                <p className="text-neutral-400 text-sm">
                  Examining codebase structure and dependencies
                </p>
              </section>
            )}

            {result && (
              <div className="space-y-8">
                {result.techStack.length > 0 && (
                  <section className="bg-neutral-900 border border-neutral-800 p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <CheckCircle className="h-5 w-5 text-orange-500" />
                      <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-300">
                        Detected Technologies
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {result.techStack.map((tech) => (
                        <Badge key={tech} className="bg-neutral-950 text-orange-400 border border-orange-900/50 text-xs px-4 py-2 font-mono uppercase tracking-wider">
                          {tech}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {result.dockerfile && (
                  <section className="bg-neutral-900 border border-neutral-800 p-8">
                    <div className="mb-6">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-300 mb-2">
                        Generated Dockerfile
                      </h2>
                      <p className="text-neutral-500 text-xs uppercase tracking-wide">
                        Production-ready configuration
                      </p>
                    </div>
                    <Textarea
                      value={result.dockerfile}
                      readOnly
                      className="min-h-[400px] font-mono text-xs bg-neutral-950 border border-neutral-700 text-neutral-200 p-6 focus:ring-1 focus:ring-orange-500 focus:border-orange-500 leading-relaxed"
                    />
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(result.dockerfile)}
                        className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase text-xs tracking-wider h-10 px-5"
                      >
                        <Copy className="mr-2 h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadDockerfile}
                        className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 hover:text-white uppercase text-xs tracking-wider h-10 px-5"
                      >
                        <Download className="mr-2 h-3.5 w-3.5" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        onClick={pushDockerfileToRepository}
                        disabled={isPushing || !generationId}
                        className="bg-orange-600 hover:bg-orange-700 text-white uppercase text-xs tracking-wider h-10 px-5"
                      >
                        {isPushing ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <GitCommit className="mr-2 h-3.5 w-3.5" />
                        )}
                        {isPushing ? 'Pushing' : 'Commit to Repo'}
                      </Button>
                    </div>
                    {pushSuccess && (
                      <div className="mt-6 px-5 py-4 bg-green-950 border border-green-900 text-green-200 flex items-center gap-3 text-xs uppercase tracking-wide">
                        <CheckCircle className="h-4 w-4" />
                        Dockerfile committed successfully
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}

            {!isGenerating && !result && !error && (
              <section className="border-2 border-dashed border-neutral-800 bg-neutral-950/30 p-20 flex flex-col items-center justify-center">
                <Container className="h-16 w-16 text-neutral-700 mb-6" strokeWidth={1.5} />
                <h3 className="text-lg font-bold text-neutral-400 mb-2 uppercase tracking-wide">Awaiting Input</h3>
                <p className="text-neutral-600 text-sm uppercase tracking-wider">
                  Configure repository details above
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}