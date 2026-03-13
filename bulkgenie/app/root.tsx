import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  isRouteErrorResponse,
} from "@remix-run/react";

export default function App() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let errorMessage = "Unknown error";
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorStatus = error.status;
    errorMessage = error.statusText || error.data?.message || `Error ${error.status}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Error - BulkGenie AI</title>
        <Meta />
        <Links />
      </head>
      <body>
        <div style={{
          fontFamily: 'Inter, sans-serif',
          maxWidth: '600px',
          margin: '100px auto',
          padding: '40px',
          textAlign: 'center',
        }}>
          <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>
            {errorStatus}
          </h1>
          <h2 style={{ fontSize: '24px', marginBottom: '20px', color: '#333' }}>
            Oops! Something went wrong
          </h2>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '30px' }}>
            {errorMessage}
          </p>
          <a
            href="/app"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: '#008060',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          >
            Return to Home
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
