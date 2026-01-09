"use client";

import React, { useState, useRef, useCallback } from "react";
import { Upload, FileJson, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface HarFileUploadProps {
  file: File | null;
  setFile: React.Dispatch<React.SetStateAction<File | null>>;
  className?: string;
}

export default function HarUpload({
  file,
  setFile,
  className,
}: HarFileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate file type specifically for .har
  const validateFile = (file: File): boolean => {
    if (!file.name.endsWith(".har")) {
      setError("Invalid file type. Please upload a .har file.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const droppedFile = e.dataTransfer.files[0];
        if (validateFile(droppedFile)) {
          setFile(droppedFile);
        }
      }
    },
    []
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.preventDefault();
      if (e.target.files && e.target.files[0]) {
        const selectedFile = e.target.files[0];
        if (validateFile(selectedFile)) {
          setFile(selectedFile);
        }
      }
    },
    []
  );

  const removeFile = () => {
    setFile(null);
    setError(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const triggerInput = () => {
    inputRef.current?.click();
  };

  // Convert bytes to readable size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Card
      className={cn(
        "w-full max-w-xl mx-auto border-dashed shadow-sm transition-all duration-200",
        dragActive
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-muted-foreground/25",
        error ? "border-destructive/50 bg-destructive/5" : "",
        className
      )}
    >
      <CardContent className="p-0">
        <div
          className={cn(
            "relative flex flex-col items-center text-center cursor-pointer transition-all duration-200",
            !file && "justify-center min-h-[280px] p-10",
            file && "justify-start p-6"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={!file ? triggerInput : undefined}
        >
          <input
            ref={inputRef}
            className="hidden"
            type="file"
            accept=".har"
            onChange={handleChange}
          />
          {!file ? (
            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
              <div
                className={cn(
                  "p-4 rounded-full bg-background shadow-sm ring-1 transition-colors duration-200 inline-block",
                  dragActive
                    ? "ring-primary text-primary"
                    : "ring-muted-foreground/20 text-muted-foreground"
                )}
              >
                <Upload className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold text-lg tracking-tight">
                  Upload your HAR file
                </h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Drag and drop your file here, or click to browse.
                  <br />
                  <span className="text-xs opacity-70">
                    Only .har files allowed
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3 p-3 text-left border rounded-lg bg-background shadow-sm relative group">
                <div className="p-2 rounded-lg bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400 flex-shrink-0">
                  <FileJson className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate pr-4 text-foreground">
                    {file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} • Ready to process
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile();
                    }}
                    className="text-xs"
                  >
                    Change
                  </Button>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute bottom-4 flex items-center gap-2 text-destructive text-sm font-medium animate-in slide-in-from-bottom-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
