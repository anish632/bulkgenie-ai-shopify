const SHOPIFY_API_VERSION = "2026-01";

function shopifyGqlUrl(shopDomain: string): string {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
}

function gqlHeaders(accessToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": accessToken,
  };
}

export async function fetchProductFromShopify(
  accessToken: string,
  shopDomain: string,
  productGid: string,
) {
  const query = `
    query getProduct($id: ID!) {
      product(id: $id) {
        id
        title
        descriptionHtml
        productType
        vendor
        tags
        seo {
          title
          description
        }
        images(first: 10) {
          edges {
            node {
              id
              url
              altText
            }
          }
        }
      }
    }
  `;

  const response = await fetch(shopifyGqlUrl(shopDomain), {
    method: "POST",
    headers: gqlHeaders(accessToken),
    body: JSON.stringify({ query, variables: { id: productGid } }),
  });

  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.product;
}

export async function fetchProductList(
  accessToken: string,
  shopDomain: string,
  cursor?: string,
  limit: number = 50,
  searchQuery?: string,
) {
  const query = `
    query getProducts($first: Int!, $after: String, $query: String) {
      products(first: $first, after: $after, query: $query) {
        edges {
          cursor
          node {
            id
            title
            productType
            vendor
            status
            totalInventory
            featuredImage {
              url
              altText
            }
            seo {
              title
              description
            }
            descriptionHtml
            images(first: 10) {
              edges {
                node {
                  id
                  altText
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const response = await fetch(shopifyGqlUrl(shopDomain), {
    method: "POST",
    headers: gqlHeaders(accessToken),
    body: JSON.stringify({
      query,
      variables: {
        first: limit,
        after: cursor || null,
        query: searchQuery || null,
      },
    }),
  });

  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.products;
}

// Fetches all products up to maxProducts for catalog scanning.
// Includes tags and image URLs (fields not included in fetchProductList).
export async function fetchAllProductsForScan(
  accessToken: string,
  shopDomain: string,
  maxProducts = 500,
): Promise<
  Array<{
    id: string;
    title: string;
    descriptionHtml: string;
    productType: string;
    vendor: string;
    tags: string[];
    seo: { title: string; description: string };
    images: Array<{ id: string; altText: string; url: string }>;
  }>
> {
  const query = `
    query scanProducts($first: Int!, $after: String) {
      products(first: $first, after: $after) {
        edges {
          cursor
          node {
            id
            title
            descriptionHtml
            productType
            vendor
            tags
            seo {
              title
              description
            }
            images(first: 10) {
              edges {
                node {
                  id
                  altText
                  url
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  type ScanProductRow = {
    id: string;
    title: string;
    descriptionHtml: string;
    productType: string;
    vendor: string;
    tags: string[];
    seo: { title: string; description: string };
    images: Array<{ id: string; altText: string; url: string }>;
  };

  const all: ScanProductRow[] = [];
  let cursor: string | null = null;

  while (all.length < maxProducts) {
    const batchSize = Math.min(50, maxProducts - all.length);
    const res = await fetch(shopifyGqlUrl(shopDomain), {
      method: "POST",
      headers: gqlHeaders(accessToken),
      body: JSON.stringify({
        query,
        variables: { first: batchSize, after: cursor },
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products = json.data.products as any;
    const edges: Array<{ node: any }> = products.edges;
    const pageInfo: { hasNextPage: boolean; endCursor: string } = products.pageInfo;

    for (const edge of edges) {
      const node = edge.node;
      all.push({
        id: String(node.id ?? ""),
        title: String(node.title ?? ""),
        descriptionHtml: String(node.descriptionHtml ?? ""),
        productType: String(node.productType ?? ""),
        vendor: String(node.vendor ?? ""),
        tags: Array.isArray(node.tags) ? (node.tags as string[]) : [],
        seo: {
          title: String(node.seo?.title ?? ""),
          description: String(node.seo?.description ?? ""),
        },
        images: Array.isArray(node.images?.edges)
          ? (node.images.edges as Array<{ node: any }>).map((e) => ({
              id: String(e.node.id ?? ""),
              altText: String(e.node.altText ?? ""),
              url: String(e.node.url ?? ""),
            }))
          : [],
      });
    }

    if (!pageInfo.hasNextPage || edges.length === 0) break;
    cursor = pageInfo.endCursor;

    // Respect Shopify rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  return all;
}

export async function updateProductInShopify(
  accessToken: string,
  shopDomain: string,
  productGid: string,
  data: {
    descriptionHtml?: string;
    seoTitle?: string;
    seoDescription?: string;
    imageAltTexts?: Array<{ imageId: string; altText: string }>;
  },
) {
  const productMutation = `
    mutation updateProduct($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const input: Record<string, unknown> = { id: productGid };
  if (data.descriptionHtml !== undefined)
    input.descriptionHtml = data.descriptionHtml;
  if (data.seoTitle !== undefined || data.seoDescription !== undefined) {
    const seo: Record<string, string> = {};
    if (data.seoTitle !== undefined) seo.title = data.seoTitle;
    if (data.seoDescription !== undefined)
      seo.description = data.seoDescription;
    input.seo = seo;
  }

  const response = await fetch(shopifyGqlUrl(shopDomain), {
    method: "POST",
    headers: gqlHeaders(accessToken),
    body: JSON.stringify({
      query: productMutation,
      variables: { product: input },
    }),
  });

  const json = await response.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  if (json.data?.productUpdate?.userErrors?.length) {
    throw new Error(JSON.stringify(json.data.productUpdate.userErrors));
  }

  // Update image alt texts separately
  if (data.imageAltTexts?.length) {
    for (const img of data.imageAltTexts) {
      const imageMutation = `
        mutation updateProductImage($productId: ID!, $image: ImageInput!) {
          productImageUpdate(productId: $productId, image: $image) {
            image {
              id
              altText
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const imageResponse = await fetch(shopifyGqlUrl(shopDomain), {
        method: "POST",
        headers: gqlHeaders(accessToken),
        body: JSON.stringify({
          query: imageMutation,
          variables: {
            productId: productGid,
            image: { id: img.imageId, altText: img.altText },
          },
        }),
      });
      const imageJson = await imageResponse.json();
      if (imageJson.errors) throw new Error(JSON.stringify(imageJson.errors));
      if (imageJson.data?.productImageUpdate?.userErrors?.length) {
        throw new Error(
          JSON.stringify(imageJson.data.productImageUpdate.userErrors),
        );
      }

      // Small delay between image updates to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return json.data?.productUpdate?.product;
}
