"use client";
import HarUpload from "@/components/HARUpload";
import { FileViewer } from "@/components/FileViewer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect, useRef } from "react";
import { analyze, generateCurl, initializeStream, sendChunk, finalizeStream, cleanupStream } from "@/lib/api";
import { extractFingerprints, RequestFingerprint } from "@/types/fingerprint";
import { executeCurl } from "@/lib/curl-executor";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState<string>("");
  const [jsonContent, setJsonContent] = useState<string | null>(null);
  const [harContent, setHarContent] = useState<string | null>(null); // Store full HAR for later
  const [curlResult, setCurlResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [curlResponse, setCurlResponse] = useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    error?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    if (file) {
      setIsProcessing(true);
      setJsonContent(null);

      // Terminate existing worker if it exists to cancel any pending work
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      // Create a new worker for this file
      const worker = new Worker("/har-processor.worker.js");
      workerRef.current = worker;

      // Track the current file to ensure we only process this specific file
      const currentFile = file;
      let isCancelled = false;

      // Handle worker errors
      const handleError = (error: ErrorEvent) => {
        if (isCancelled) return;

        console.error("Worker error:", error);
        setIsProcessing(false);
        setJsonContent(null);
      };

      // Handle worker messages
      const handleMessage = (e: MessageEvent) => {
        // Ignore if cancelled (file has changed or component unmounted)
        if (isCancelled) return;

        if (e.data.success) {
          setJsonContent(e.data.jsonString);
          setHarContent(e.data.jsonString); // Store full HAR content
        } else {
          console.error("Error processing HAR file:", e.data.error);
          setJsonContent(null);
          setHarContent(null);
        }
        setIsProcessing(false);
      };

      // Read file as text first (File objects can't be transferred to workers)
      const processFile = async () => {
        try {
          const fileText = await currentFile.text();

          // Check if cancelled (file changed while reading)
          if (isCancelled) return;

          worker.addEventListener("message", handleMessage);
          worker.addEventListener("error", handleError);

          // Send file text to worker
          worker.postMessage({ fileText });
        } catch (error) {
          if (isCancelled) return;

          console.error("Error reading file:", error);
          setIsProcessing(false);
          setJsonContent(null);
        }
      };

      processFile();

      // Cleanup function - terminates worker when file changes or component unmounts
      return () => {
        isCancelled = true;
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        worker.terminate();
        if (workerRef.current === worker) {
          workerRef.current = null;
        }
      };
    } else {
      // Reset when file is removed (but keep description, curlResult, curlResponse for persistence)
      setJsonContent(null);
      setHarContent(null);
      setIsProcessing(false);

      // Terminate worker when file is removed
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    }
  }, [file]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="h-screen flex flex-col overflow-hidden p-12">
      <div className="flex-shrink-0 pt-2 pb-4 border-b flex items-center justify-between">
        <HarUpload file={file} setFile={setFile} />
        {/* <Link 
          href="/test"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Test Harness →
        </Link> */}
      </div>
      
      <div className="flex-1 flex gap-6 pt-4 pb-2 overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">
          {file ? (
            <>
              {isProcessing ? (
                <div className="border rounded-md flex-1 flex items-center justify-center text-muted-foreground">
                  Preparing preview...
                </div>
              ) : jsonContent ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <FileViewer fileContent={jsonContent} />
                </div>
              ) : (
                <div className="border rounded-md flex-1 flex items-center justify-center text-destructive">
                  Failed to process file. Please try again.
                </div>
              )}
              
              <div className="flex-shrink-0 space-y-2">
                <textarea
                  required={true}
                  placeholder="Describe the API that you want to reverse engineer..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={1}
                  className="w-full px-4 py-3 text-base border border-border/50 rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring/30 focus:border-border resize-none"
                />
                {jsonContent && (
                  <button
                    className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:text-muted-foreground disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    disabled={isAnalyzing || !description.trim()}
                    onClick={async () => {
                      if (!harContent || !description.trim()) return;
                      
                      setIsAnalyzing(true);
                      setCurlResult(null);
                      setCurlResponse(null);
                      
                      // Generate a unique session ID
                      const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                      
                      try {
                        // Extract fingerprints from HAR
                        const harObj = JSON.parse(harContent);
                        const fingerprints = extractFingerprints(harObj);
                        console.log('Total fingerprints:', fingerprints.length);
                        
                        // Initialize streaming session
                        await initializeStream(sessionId, description);
                        
                        // Split fingerprints into chunks of 100
                        const CHUNK_SIZE = 100;
                        const chunks: RequestFingerprint[][] = [];
                        for (let i = 0; i < fingerprints.length; i += CHUNK_SIZE) {
                          chunks.push(fingerprints.slice(i, i + CHUNK_SIZE));
                        }
                        
                        console.log(`Sending ${chunks.length} chunks...`);
                        
                        // Send each chunk
                        for (let i = 0; i < chunks.length; i++) {
                          const chunkResult = await sendChunk(sessionId, chunks[i]);
                          if (!chunkResult.success) {
                            throw new Error(chunkResult.error || 'Failed to process chunk');
                          }
                          console.log(`Processed chunk ${i + 1}/${chunks.length}`);
                        }
                        
                        // Finalize and get the selected fingerprint ID
                        const result = await finalizeStream(sessionId);
                        
                        // Backend returns selected fingerprint ID
                        if (result.requestId && harContent) {
                          // Extract the specific entry from HAR on client side
                          const harObj = JSON.parse(harContent);
                          const entries = harObj?.log?.entries || [];
                          const index = parseInt(result.requestId, 10);
                          
                          if (index >= 0 && index < entries.length) {
                            const selectedEntry = entries[index];
                            
                            // Send only the single entry to backend for curl generation
                            const fullRequest = await generateCurl(selectedEntry);
                            
                            // Display curl command
                            if (fullRequest.curl) {
                              setCurlResult(fullRequest.curl);
                            } else if (fullRequest.error) {
                              setCurlResult(`Error: ${fullRequest.error}`);
                            } else {
                              setCurlResult("Error: Could not generate curl command");
                            }
                          } else {
                            setCurlResult("Error: Invalid request ID");
                          }
                        } else if (result.error) {
                          setCurlResult(`Error: ${result.error}`);
                        } else {
                          setCurlResult("Error: No request selected");
                        }
                      } catch (error) {
                        console.error("Analysis error:", error);
                        setCurlResult(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
                        
                        // Clean up session on error
                        try {
                          await cleanupStream(sessionId);
                        } catch (cleanupError) {
                          console.error("Failed to cleanup session:", cleanupError);
                        }
                      } finally {
                        setIsAnalyzing(false);
                      }
                    }}
                  >
                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Upload a HAR file to get started
            </div>
          )}
        </div>

        {curlResult && (
          <div className="w-[500px] flex-shrink-0 flex flex-col gap-4 overflow-hidden min-h-0">
            <div className="flex-shrink-0 space-y-2 min-h-0 flex flex-col">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Generated cURL Command:</label>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(curlResult);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch (error) {
                      console.error("Failed to copy:", error);
                    }
                  }}
                  className="p-1.5 rounded-md hover:bg-muted transition-colors flex-shrink-0"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              <ScrollArea className="h-[120px] w-full rounded-md border p-2 bg-slate-950 text-slate-50 font-mono text-xs">
                <pre 
                  className="whitespace-pre-wrap break-words cursor-text select-text"
                  onClick={(e) => {
                    const range = document.createRange();
                    range.selectNodeContents(e.currentTarget);
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }}
                >
                  {curlResult}
                </pre>
              </ScrollArea>
            </div>
            
            <Button
              onClick={async () => {
                if (!curlResult) return;
                
                setIsExecuting(true);
                setCurlResponse(null);
                
                try {
                  const response = await executeCurl(curlResult);
                  setCurlResponse(response);
                } catch (error) {
                  setCurlResponse({
                    status: 0,
                    statusText: 'Error',
                    headers: {},
                    body: '',
                    error: error instanceof Error ? error.message : 'Unknown error',
                  });
                } finally {
                  setIsExecuting(false);
                }
              }}
              disabled={isExecuting || !curlResult}
              className="w-full flex-shrink-0"
            >
              {isExecuting ? "Executing..." : "Execute cURL"}
            </Button>
            
            {curlResponse && (
              <div className="flex-1 flex flex-col gap-2 border rounded-md p-3 overflow-hidden min-h-0">
                <div className="flex items-center justify-between flex-shrink-0">
                  <h3 className="font-semibold text-sm">Response</h3>
                  <span className={`text-xs font-medium ${
                    curlResponse.status >= 200 && curlResponse.status < 300
                      ? "text-green-600"
                      : "text-red-600"
                  }`}>
                    {curlResponse.status} {curlResponse.statusText}
                  </span>
                </div>
                
                <div className="flex-1 overflow-auto min-h-0">
                  {curlResponse.error ? (
                    <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {curlResponse.error}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.keys(curlResponse.headers).length > 0 && (
                        <div className="flex-shrink-0">
                          <h4 className="text-xs font-medium mb-1">Headers:</h4>
                          <div className="text-xs font-mono bg-muted p-2 rounded max-h-[100px] overflow-auto">
                            {Object.entries(curlResponse.headers).map(([key, value]) => (
                              <div key={key} className="mb-0.5">
                                <span className="font-semibold">{key}:</span> {value}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <h4 className="text-xs font-medium mb-1">Body:</h4>
                        <ScrollArea className="flex-1 w-full rounded-md border p-2 bg-slate-950 text-slate-50 font-mono text-xs">
                          <pre className="whitespace-pre-wrap break-words">{curlResponse.body}</pre>
                        </ScrollArea>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
