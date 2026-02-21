import { ProductCategory } from '../dto/generate-image.dto';

// ─── Background Fallbacks ─────────────────────────────────────────────────────
// Dipakai di generate-image.service → resolveBackgroundFromProduct().
// Gemini analisis warna produk, return salah satu key ini.
// Kalau user isi background manual → ini tidak dipakai.

export const BACKGROUND_FALLBACKS = {
  plain_white: 'clean plain white background',
  wine_red: 'deep wine red solid background',
  light_blue: 'soft light blue solid background',
} as const;

export type BackgroundKey = keyof typeof BACKGROUND_FALLBACKS;

// ─── AI Model Face Templates ──────────────────────────────────────────────────
// Fallback deskripsi model kalau user tidak upload foto model.
// Setiap category punya persona yang cocok secara visual.
// Dipakai di buildPrompt() di bawah — juga bisa di-import langsung kalau perlu.

const AI_MODEL_TEMPLATES: Record<ProductCategory, string> = {
  [ProductCategory.FASHION]: [
    'A stylish young woman in her mid-20s.',
    'Clear skin, warm medium skin tone.',
    'Long dark hair neatly styled.',
    'Confident natural expression.',
    'Looks like a professional fashion model.',
  ].join(' '),

  [ProductCategory.HANDHELD]: [
    'A friendly, approachable young person in their mid-20s.',
    'Natural warm complexion, medium-length hair.',
    'Relaxed genuine smile.',
    'Lifestyle and casual vibe.',
  ].join(' '),

  [ProductCategory.FOOD_BEVERAGE]: [
    'An elegant woman in her late 20s.',
    'Radiant complexion, minimal makeup.',
    'Soft brown hair pulled back neatly.',
    'Warm inviting expression — like a food blogger or lifestyle influencer.',
  ].join(' '),
};

export function getAIModelTemplate(category: ProductCategory): string {
  return AI_MODEL_TEMPLATES[category];
}

// ─── Pose Variations (per category) ──────────────────────────────────────────
// Fallback poses kalau OpenAI prompt generation tidak dipakai atau gagal.

const POSES: Record<ProductCategory, string[]> = {
  [ProductCategory.FASHION]: [
    'front facing with confident smile',
    'slight side angle showing outfit details',
    'three-quarter view with natural expression',
    'walking pose showcasing the outfit in motion',
    'casual lean against a wall, relaxed posture',
    'dynamic runway-style stride',
  ],
  [ProductCategory.HANDHELD]: [
    'holding the product at chest level with both hands',
    'casual one-hand grip, slight side angle',
    'looking down at the product with a natural smile',
    'placing the product on a surface, hand still touching it',
    'three-quarter view, product resting in open palm',
    'lifestyle pose — sitting, product on the table nearby',
  ],
  [ProductCategory.FOOD_BEVERAGE]: [
    'product centered, overhead flat-lay composition',
    'side profile close-up showing texture and detail',
    'lifestyle — hand reaching for the product',
    'product on a wooden table, soft natural light from left',
    'steam or splash detail, dynamic action shot',
    'minimal styling, product slightly off-center, airy composition',
  ],
};

export function getPosesForCategory(category: ProductCategory): string[] {
  return POSES[category];
}

// ─── Interaction Block (per category) ────────────────────────────────────────
// Deskripsi cara model berinteraksi dengan produk — berbeda per category.

function getInteractionBlock(category: ProductCategory, productName: string): string {
  switch (category) {
    case ProductCategory.FASHION:
      return `- The model is WEARING "${productName}". The garment/accessory must be clearly visible and look natural on the body.`;
    case ProductCategory.HANDHELD:
      return `- The model is HOLDING or INTERACTING with "${productName}" naturally. The product must be prominent and clearly visible.`;
    case ProductCategory.FOOD_BEVERAGE:
      return `- "${productName}" is the HERO of the shot. If a model is present, they interact casually (reaching, holding, tasting). The product must dominate the composition.`;
  }
}

// ─── Build Prompt ─────────────────────────────────────────────────────────────
// Fallback prompt builder — dipakai kalau OpenAI step tidak ada atau gagal.
// Kalau OpenAI jalan normal, prompt datang dari OpenAI dan ini tidak dicall.

export interface BuildPromptParams {
  productName: string;
  productDescription: string;
  category: ProductCategory;
  pose: string;
  background: string;
  hasModelImage: boolean;
}

export function buildPrompt(params: BuildPromptParams): string {
  const { productName, productDescription, category, pose, background, hasModelImage } = params;

  const modelBlock = hasModelImage
    ? `- The model's face and identity MUST match the reference image EXACTLY (skin tone, features, hair).`
    : `- The model should look like: ${getAIModelTemplate(category)}`;

  const interactionBlock = getInteractionBlock(category, productName);

  const noModelNote =
    category === ProductCategory.FOOD_BEVERAGE && !hasModelImage
      ? `\n- This is a PRODUCT-ONLY shot. No person or hands in the frame unless the pose specifically calls for it.`
      : '';

  return `Professional high-end advertising photography.

PRODUCT:
- Name: ${productName}
- Description: ${productDescription}
- The product MUST match the reference product image EXACTLY in color, design, and detail.

MODEL & INTERACTION:
${modelBlock}
${interactionBlock}
${noModelNote}

COMPOSITION:
- Pose / Layout: ${pose}
- Background: ${background}
- Lighting: Soft studio lighting with subtle shadows. Clean and premium feel.
- Style: Sharp focus, photorealistic, 4K quality. High-end commercial / e-commerce aesthetic.

NEGATIVE — DO NOT include:
cartoon, illustration, blurry, distorted face, extra fingers, extra limbs, low quality, amateur, watermark, text in image.`.trim();
}