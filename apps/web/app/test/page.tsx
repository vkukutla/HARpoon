"use client";
import { useState, useEffect, useRef } from "react";
import { initializeStream, sendChunk, finalizeStream, cleanupStream, generateCurl } from "@/lib/api";
import { extractFingerprints, RequestFingerprint } from "@/types/fingerprint";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check, Play, Loader2, X } from "lucide-react";
import Link from "next/link";

type TestCase = {
  id: string;
  name: string;
  harFile: string;
  expectedOutputFile: string;
  description: string;
};

const TEST_CASES: TestCase[] = [
  {
    id: "sfgate",
    name: "SFGate Weather API",
    harFile: "/www.sfgate.com.har",
    expectedOutputFile: "/sfgate_output.txt",
    description: "Return the API that fetches the weather of San Francisco.",
  },
  {
    id: "recipescal",
    name: "RecipeScal Recipe API",
    harFile: "/recipescal.com.har",
    expectedOutputFile: "/recipescal_output.txt",
    description: "Can you reverse engineer the API that gives me recipes for a given portion and calorie count?",
  },
  {
    id: "jokes",
    name: "Jokes API",
    harFile: "/jokes.large.har",
    expectedOutputFile: "/jokes_ouput.txt",
    description: "Can you give me a curl command to get 5 jokes via API?",
  },
];

type TestResult = {
  status: "not_run" | "running" | "success" | "error";
  curlCommand?: string;
  expectedOutput?: string;
  matchesExpected?: boolean;
  error?: string;
  harContent?: string;
};

export default function TestPage() {
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    TEST_CASES.reduce((acc, testCase) => {
      acc[testCase.id] = { status: "not_run" };
      return acc;
    }, {} as Record<string, TestResult>)
  );
  const [runningTestId, setRunningTestId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const workerRefs = useRef<Record<string, Worker>>({});

  // Cleanup workers on unmount
  useEffect(() => {
    return () => {
      Object.values(workerRefs.current).forEach((worker) => {
        worker.terminate();
      });
    };
  }, []);

  // Normalize curl command for comparison (remove extra whitespace, normalize line endings)
  // This handles differences in formatting while preserving the actual command content
  const normalizeCurl = (curl: string): string => {
    if (!curl) return '';
    
    // Normalize line endings and trim (handles blank lines at start/end)
    let normalized = curl
      .trim()
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    
    // Remove any leading/trailing blank lines
    normalized = normalized.replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
    
    // Handle line continuations - merge lines that end with backslash and following whitespace
    normalized = normalized.replace(/\\\s*\n\s*/g, ' ');
    
    // Split into lines, trim each, and filter empty lines
    const lines = normalized.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Join with single space and normalize multiple spaces
    normalized = lines.join(' ').replace(/\s+/g, ' ').trim();
    
    return normalized;
  };

  // Compare two curl commands (normalized)
  // Returns true if they match, false otherwise
  // Also handles cases where headers might be in different order
  const compareCurl = (actual: string, expected: string): boolean => {
    const normalizedActual = normalizeCurl(actual);
    const normalizedExpected = normalizeCurl(expected);
    
    // First try exact match
    if (normalizedActual === normalizedExpected) {
      return true;
    }
    
    // If not exact match, try comparing URL and extracting/sorting headers separately
    // This handles cases where headers are in different order (curl doesn't care)
    try {
      const extractParts = (curlStr: string) => {
        // Extract URL
        const urlMatch = curlStr.match(/curl\s+(?:-X\s+\w+\s+)?'([^']+)'/);
        const url = urlMatch ? urlMatch[1] : '';
        
        // Extract all headers
        const headerMatches = curlStr.matchAll(/-H\s+'([^']+)'/g);
        const headers = Array.from(headerMatches, m => m[1]).sort();
        
        // Extract body
        const bodyMatch = curlStr.match(/--data-raw\s+'([^']+)'/);
        const body = bodyMatch ? bodyMatch[1] : '';
        
        return { url, headers: headers.join('|'), body };
      };
      
      const actualParts = extractParts(normalizedActual);
      const expectedParts = extractParts(normalizedExpected);
      
      // Compare URL, sorted headers, and body
      const matches = actualParts.url === expectedParts.url &&
                     actualParts.headers === expectedParts.headers &&
                     actualParts.body === expectedParts.body;
      
      if (!matches) {
        console.log('Comparison failed for jokes test:');
        console.log('Actual URL:', actualParts.url);
        console.log('Expected URL:', expectedParts.url);
        console.log('Actual headers:', actualParts.headers);
        console.log('Expected headers:', expectedParts.headers);
        console.log('Body match:', actualParts.body === expectedParts.body);
        console.log('Full actual:', normalizedActual);
        console.log('Full expected:', normalizedExpected);
      }
      
      return matches;
    } catch (error) {
      // Fallback to exact match if parsing fails
      console.error('Error comparing curl commands:', error);
      return normalizedActual === normalizedExpected;
    }
  };

  const runTest = async (testCase: TestCase) => {
    if (runningTestId) return; // Prevent running multiple tests simultaneously

    setRunningTestId(testCase.id);
    setTestResults((prev) => ({
      ...prev,
      [testCase.id]: { status: "running" },
    }));

    try {
      // Step 1: Load expected output and HAR file in parallel
      const [expectedResponse, harResponse] = await Promise.all([
        fetch(testCase.expectedOutputFile),
        fetch(testCase.harFile),
      ]);

      if (!expectedResponse.ok) {
        throw new Error(`Failed to load expected output: ${expectedResponse.statusText}`);
      }
      if (!harResponse.ok) {
        throw new Error(`Failed to load HAR file: ${harResponse.statusText}`);
      }

      const expectedOutput = await expectedResponse.text();
      const harText = await harResponse.text();

      // Step 2: Process HAR file using worker
      const harContent = await new Promise<string>((resolve, reject) => {
        const worker = new Worker("/har-processor.worker.js");
        workerRefs.current[testCase.id] = worker;

        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error("Worker timeout"));
        }, 30000); // 30 second timeout

        worker.addEventListener("message", (e: MessageEvent) => {
          clearTimeout(timeout);
          worker.terminate();
          delete workerRefs.current[testCase.id];

          if (e.data.success) {
            resolve(e.data.jsonString);
          } else {
            reject(new Error(e.data.error || "Failed to process HAR file"));
          }
        });

        worker.addEventListener("error", (error) => {
          clearTimeout(timeout);
          worker.terminate();
          delete workerRefs.current[testCase.id];
          reject(error);
        });

        worker.postMessage({ fileText: harText });
      });

      // Step 3: Extract fingerprints
      const harObj = JSON.parse(harContent);
      const fingerprints = extractFingerprints(harObj);
      console.log(`[${testCase.id}] Total fingerprints:`, fingerprints.length);

      // Step 4: Initialize streaming session
      const sessionId = `test-${testCase.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await initializeStream(sessionId, testCase.description);

      // Step 5: Split fingerprints into chunks and send
      const CHUNK_SIZE = 100;
      const chunks: RequestFingerprint[][] = [];
      for (let i = 0; i < fingerprints.length; i += CHUNK_SIZE) {
        chunks.push(fingerprints.slice(i, i + CHUNK_SIZE));
      }

      console.log(`[${testCase.id}] Sending ${chunks.length} chunks...`);

      for (let i = 0; i < chunks.length; i++) {
        const chunkResult = await sendChunk(sessionId, chunks[i]);
        if (!chunkResult.success) {
          throw new Error(chunkResult.error || `Failed to process chunk ${i + 1}`);
        }
        console.log(`[${testCase.id}] Processed chunk ${i + 1}/${chunks.length}`);
      }

      // Step 6: Finalize and get selected fingerprint ID
      const result = await finalizeStream(sessionId);

      // Step 7: Extract the specific entry and generate curl
      if (result.requestId && harContent) {
        const harObj = JSON.parse(harContent);
        const entries = harObj?.log?.entries || [];
        const index = parseInt(result.requestId, 10);

        if (index >= 0 && index < entries.length) {
          const selectedEntry = entries[index];
          const fullRequest = await generateCurl(selectedEntry);

          if (fullRequest.curl) {
            // Compare with expected output
            const matchesExpected = compareCurl(fullRequest.curl, expectedOutput);
            
            setTestResults((prev) => ({
              ...prev,
              [testCase.id]: {
                status: "success",
                curlCommand: fullRequest.curl,
                expectedOutput,
                matchesExpected,
                harContent,
              },
            }));
          } else if (fullRequest.error) {
            throw new Error(fullRequest.error);
          } else {
            throw new Error("Could not generate curl command");
          }
        } else {
          throw new Error(`Invalid request ID: ${result.requestId}`);
        }
      } else if (result.error) {
        throw new Error(result.error);
      } else {
        throw new Error("No request selected");
      }
    } catch (error) {
      console.error(`[${testCase.id}] Test error:`, error);
      setTestResults((prev) => ({
        ...prev,
        [testCase.id]: {
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      }));
    } finally {
      setRunningTestId(null);
    }
  };

  const runAllTests = async () => {
    for (const testCase of TEST_CASES) {
      await runTest(testCase);
      // Small delay between tests to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="min-h-screen p-12 bg-background">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold">Test Harness</h1>
              <Link 
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Main Page
              </Link>
            </div>
            <p className="text-muted-foreground mt-2">
              Run test cases to validate HAR file analysis and compare with expected outputs
            </p>
          </div>
          <Button
            onClick={runAllTests}
            disabled={!!runningTestId}
            className="flex items-center gap-2"
          >
            {runningTestId ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run All Tests
              </>
            )}
          </Button>
        </div>

        {/* Test Summary */}
        {Object.values(testResults).some(r => r.status === "success" || r.status === "error") && (
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div className="text-sm font-medium">Test Summary:</div>
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-600" />
                  <span>
                    Passed: {
                      Object.values(testResults).filter(
                        r => r.status === "success" && r.matchesExpected === true
                      ).length
                    }
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <X className="w-4 h-4 text-destructive" />
                  <span>
                    Failed: {
                      Object.values(testResults).filter(
                        r => r.status === "success" && r.matchesExpected === false
                      ).length + 
                      Object.values(testResults).filter(r => r.status === "error").length
                    }
                  </span>
                </div>
                <div className="text-muted-foreground">
                  Total: {
                    Object.values(testResults).filter(
                      r => r.status === "success" || r.status === "error"
                    ).length
                  } / {TEST_CASES.length}
                </div>
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-4">
          {TEST_CASES.map((testCase) => {
            const result = testResults[testCase.id];
            const isRunning = runningTestId === testCase.id;

            return (
              <Card key={testCase.id} className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold mb-2">{testCase.name}</h2>
                    <p className="text-sm text-muted-foreground mb-3">
                      {testCase.description}
                    </p>
                    <div className="text-xs text-muted-foreground font-mono">
                      File: {testCase.harFile}
                    </div>
                  </div>
                  <Button
                    onClick={() => runTest(testCase)}
                    disabled={isRunning || !!runningTestId}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Run Test
                      </>
                    )}
                  </Button>
                </div>

                {result.status !== "not_run" && (
                  <div className="border-t pt-4">
                    {result.status === "running" && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Analyzing HAR file and generating curl command...</span>
                      </div>
                    )}

                    {result.status === "success" && result.curlCommand && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {result.matchesExpected === true ? (
                              <>
                                <Check className="w-5 h-5 text-green-600" />
                                <span className="text-sm font-medium text-green-600">
                                  ✓ Test Passed - Matches Expected Output
                                </span>
                              </>
                            ) : result.matchesExpected === false ? (
                              <>
                                <X className="w-5 h-5 text-destructive" />
                                <span className="text-sm font-medium text-destructive">
                                  ✗ Test Failed - Does Not Match Expected Output
                                </span>
                              </>
                            ) : (
                              <>
                                <Check className="w-5 h-5 text-green-600" />
                                <span className="text-sm font-medium text-green-600">
                                  ✓ Test Completed
                                </span>
                              </>
                            )}
                          </div>
                          <button
                            onClick={() => copyToClipboard(result.curlCommand!, testCase.id)}
                            className="p-1.5 rounded-md hover:bg-muted transition-colors flex-shrink-0"
                            title="Copy to clipboard"
                          >
                            {copiedId === testCase.id ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4 text-muted-foreground" />
                            )}
                          </button>
                        </div>
                        
                        {result.matchesExpected === false && result.expectedOutput && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-destructive">Generated Output:</h4>
                              <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-slate-950 text-slate-50 font-mono text-xs">
                                <pre className="whitespace-pre-wrap break-words">
                                  {result.curlCommand}
                                </pre>
                              </ScrollArea>
                            </div>
                            <div className="space-y-2">
                              <h4 className="text-xs font-semibold text-green-600">Expected Output:</h4>
                              <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-slate-950 text-slate-50 font-mono text-xs">
                                <pre className="whitespace-pre-wrap break-words">
                                  {result.expectedOutput}
                                </pre>
                              </ScrollArea>
                            </div>
                          </div>
                        )}
                        
                        {result.matchesExpected !== false && (
                          <ScrollArea className="h-[200px] w-full rounded-md border p-3 bg-slate-950 text-slate-50 font-mono text-xs">
                            <pre className="whitespace-pre-wrap break-words">
                              {result.curlCommand}
                            </pre>
                          </ScrollArea>
                        )}
                      </div>
                    )}

                    {result.status === "error" && (
                      <div className="space-y-2">
                        <span className="text-sm font-medium text-destructive">
                          ✗ Test Failed
                        </span>
                        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                          {result.error}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

