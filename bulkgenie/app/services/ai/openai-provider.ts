import OpenAI from "openai";
import type {
  AIProvider,
  GenerateContentInput,
  GenerateContentOutput,
} from "./provider";

export class OpenAIProvider implements AIProvider {
  name = "openai";
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(
    input: GenerateContentInput,
  ): Promise<GenerateContentOutput> {
    const systemPrompt = this.buildSystemPrompt(input);
    const userPrompt = this.buildUserPrompt(input);

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    return this.parseResponse(text, input.fieldsToGenerate);
  }

  private buildSystemPrompt(input: GenerateContentInput): string {
    let prompt =
      "You are an expert e-commerce copywriter and SEO specialist. Generate product content in JSON format only. No markdown, no explanation, just valid JSON.";

    if (input.brandVoice) {
      prompt += `\n\nBrand Voice Guidelines:\n${input.brandVoice}`;
    }

    if (input.targetLanguage && input.targetLanguage !== "en") {
      prompt += `\n\nWrite ALL content in language code: ${input.targetLanguage}. Do not mix languages.`;
    }

    return prompt;
  }

  private buildUserPrompt(input: GenerateContentInput): string {
    const fields = input.fieldsToGenerate;
    const schema: Record<string, string> = {};

    const lengthGuide =
      input.descriptionLength === "short"
        ? "50-100 words"
        : input.descriptionLength === "long"
          ? "200-300 words"
          : "100-200 words";

    if (fields.includes("description")) {
      schema.description = `Compelling product description, ${lengthGuide}, HTML paragraph tags allowed. Focus on benefits, not just features.`;
    }
    if (fields.includes("seoTitle")) {
      schema.seoTitle =
        "SEO page title, max 70 characters, include primary keyword naturally.";
    }
    if (fields.includes("seoDescription")) {
      schema.seoDescription =
        "Meta description, max 160 characters, include call to action.";
    }
    if (fields.includes("altText")) {
      schema.altTexts =
        "Object mapping image position (img_0, img_1...) to descriptive alt text, max 125 chars each.";
    }

    return `Generate content for this product. Respond with ONLY valid JSON matching the schema below.

Product Information:
- Title: ${input.productTitle}
${input.productType ? `- Type: ${input.productType}` : ""}
${input.vendor ? `- Brand/Vendor: ${input.vendor}` : ""}
${input.tags?.length ? `- Tags: ${input.tags.join(", ")}` : ""}
${input.existingDescription ? `- Current Description (for context, rewrite completely): ${input.existingDescription.substring(0, 500)}` : ""}
${input.imageUrls?.length ? `- Number of product images: ${input.imageUrls.length}` : ""}

Required JSON schema:
${JSON.stringify(schema, null, 2)}`;
  }

  private parseResponse(
    text: string,
    fields: Array<"description" | "seoTitle" | "seoDescription" | "altText">,
  ): GenerateContentOutput {
    const parsed = JSON.parse(text);

    const result: GenerateContentOutput = {};

    if (fields.includes("description") && parsed.description) {
      result.description = parsed.description;
    }
    if (fields.includes("seoTitle") && parsed.seoTitle) {
      result.seoTitle = parsed.seoTitle.substring(0, 70);
    }
    if (fields.includes("seoDescription") && parsed.seoDescription) {
      result.seoDescription = parsed.seoDescription.substring(0, 160);
    }
    if (fields.includes("altText") && parsed.altTexts) {
      result.altTexts = parsed.altTexts;
    }

    return result;
  }
}
