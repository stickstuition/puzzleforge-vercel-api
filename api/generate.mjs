import { handleGenerate } from "../src/generator.mjs";

export default function handler(request) {
  return handleGenerate(request);
}

