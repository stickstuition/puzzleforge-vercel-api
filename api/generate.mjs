import { handleGenerate } from "../src/generator.mjs";

export default {
  fetch(request) {
    return handleGenerate(request);
  },
};
