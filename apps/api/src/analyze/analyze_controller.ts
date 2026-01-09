import { Controller, Post, Body, Delete, Param } from '@nestjs/common';
import { AnalyzeService } from './analyze.service';
import { RequestFingerprint } from './fingerprint.types';

@Controller("/analyze")
export class AnalyzeController {
  constructor(private analyze: AnalyzeService) {}

  @Post()
  async analyzeHar(@Body() dto: { fingerprints: RequestFingerprint[]; description: string }) {
    return this.analyze.run(dto);
  }

  @Post("/stream/init")
  async initializeStream(@Body() dto: { sessionId: string; description: string }) {
    this.analyze.initializeSession(dto.sessionId, dto.description);
    return { success: true };
  }

  @Post("/stream/chunk")
  async processChunk(@Body() dto: { sessionId: string; chunk: RequestFingerprint[] }) {
    return this.analyze.processChunk(dto.sessionId, dto.chunk);
  }

  @Post("/stream/finalize")
  async finalizeStream(@Body() dto: { sessionId: string }) {
    return this.analyze.finalizeSession(dto.sessionId);
  }

  @Delete("/stream/:sessionId")
  async cleanupStream(@Param("sessionId") sessionId: string) {
    this.analyze.cleanupSession(sessionId);
    return { success: true };
  }

  @Post("/request")
  async generateCurl(@Body() dto: { entry: any }) {
    return this.analyze.generateCurl(dto.entry);
  }

  @Post("/execute")
  async executeRequest(@Body() dto: { method: string; url: string; headers: Record<string, string>; body?: string }) {
    return this.analyze.executeRequest(dto);
  }
}

