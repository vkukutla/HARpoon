import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AnalyzeController } from './analyze/analyze_controller';
import { AnalyzeService } from './analyze/analyze.service';
import { HarFilter } from './har/har.filter';
import { LlmService } from './llm/llm.service';
import { CurlService } from './analyze/curl.service';

@Module({
  imports: [],
  controllers: [AppController, AnalyzeController],
  providers: [AppService, AnalyzeService, HarFilter, LlmService, CurlService],
})
export class AppModule {}
