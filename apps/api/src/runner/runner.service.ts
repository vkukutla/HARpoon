import { Injectable } from "@nestjs/common";

@Injectable()
export class RunnerService {
  async run(curl: string) {
    // spawn with timeout, ip blocking, etc.
  }
}
