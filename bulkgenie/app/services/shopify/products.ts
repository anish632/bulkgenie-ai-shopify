const SHOPIFY_API_VERSION = "2025-01";

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
    mutation updateProduct($input: ProductInput!) {
      productUpdate(input: $input) {
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
    body: JSON.stringify({ query: productMutation, variables: { input } }),
  });

  const json = await response.json();
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

      await fetch(shopifyGqlUrl(shopDomain), {
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

      // Small delay between image updates to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return json.data?.productUpdate?.product;
}
