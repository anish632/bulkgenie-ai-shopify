export interface GenerateContentInput {
  productTitle: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  existingDescription?: string;
  imageUrls?: string[];
  brandVoice?: string;
  targetLanguage?: string;
  descriptionLength?: "short" | "medium" | "long";
  fieldsToGenerate: Array<
    "description" | "seoTitle" | "seoDescription" | "altText"
  >;
}

export interface GenerateContentOutput {
  description?: string;
  seoTitle?: string;
  seoDescription?: string;
  altTexts?: Record<string, string>;
}

export interface AIProvider {
  name: string;
  generate(input: GenerateContentInput): Promise<GenerateContentOutput>;
}
