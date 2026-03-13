import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>BulkGenie AI - Intelligent Product Content at Scale</h1>
        <p className={styles.text}>
          Generate high-quality product descriptions, SEO titles, meta descriptions, and alt text for hundreds of products in minutes using AI.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Bulk AI Content Generation</strong>. Generate descriptions, SEO titles, meta descriptions, and image alt text for all your products at once.
          </li>
          <li>
            <strong>Brand Voice Training</strong>. Train the AI on your existing products to match your unique brand voice and style.
          </li>
          <li>
            <strong>Review & Approve</strong>. Review all AI-generated content before publishing, with easy editing and bulk approval tools.
          </li>
        </ul>
      </div>
    </div>
  );
}
