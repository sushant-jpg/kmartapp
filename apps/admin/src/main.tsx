import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  formatMoney,
  type AuthResult,
  type ProductCard,
  type OrderStatus,
} from "@kmart/shared";
import { clearSession, login, request, restoreSession } from "./api";
import "./style.css";

type Row = Record<string, unknown> & { _id: string };
type Metrics = {
  grossRevenue: number;
  collectedRevenue: number;
  orders: number;
  customers: number;
  conversations: number;
  averageOrderValue: number;
  lowStock: {
    _id: string;
    name: string;
    stock: number;
    reservedStock: number;
  }[];
};
const sections = [
  "Overview",
  "Products",
  "Orders",
  "Customers",
  "Categories",
  "Brands",
  "Coupons",
  "Banners",
  "Reviews",
  "Returns",
  "Search-analytics",
  "Notifications",
  "Audit",
];
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "processing",
  payment_confirmed: "processing",
  processing: "packed",
  packed: "shipped",
  shipped: "out_for_delivery",
  out_for_delivery: "delivered",
};
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Request failed";
function App() {
  const [user, setUser] = useState<AuthResult["user"]>();
  const [restoring, setRestoring] = useState(true);
  const [section, setSection] = useState("Overview");
  const [rows, setRows] = useState<Row[]>([]);
  const [metrics, setMetrics] = useState<Metrics>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    restoreSession()
      .then((s) => setUser(s.user))
      .catch(() => {})
      .finally(() => setRestoring(false));
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setBusy(true);
    setError("");
    setRows([]);
    setMetrics(undefined);
    const load =
      section === "Overview"
        ? request<Metrics>("/admin/metrics").then((data) => {
            if (active) setMetrics(data);
          })
        : request<Row[]>(`/admin/${section.toLowerCase()}`).then((data) => {
            if (active) setRows(data);
          });
    load
      .catch((e) => {
        if (active) setError(message(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [user, section, revision]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setRevision((n) => n + 1);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  if (restoring)
    return (
      <main>
        <p role="status">Restoring session…</p>
      </main>
    );
  if (!user)
    return (
      <main className="login">
        <div className="eyebrow">KMART / OPERATIONS</div>
        <h1>Welcome back.</h1>
        <p>Sign in to manage your store.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void run(async () =>
              setUser(
                (
                  await login(
                    String(data.get("identifier")),
                    String(data.get("password")),
                  )
                ).user,
              ),
            );
          }}
        >
          <label>
            Email or username
            <input name="identifier" required autoComplete="username" />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button disabled={busy}>Sign in</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <h2>
          KMart<span> admin</span>
        </h2>
        <nav>
          {sections.map((item) => (
            <button
              key={item}
              className={section === item ? "selected" : ""}
              onClick={() => setSection(item)}
            >
              {item.replace("-", " ")}
            </button>
          ))}
        </nav>
        <p>{user.fullName}</p>
        <button
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await request("/auth/logout", "POST");
              clearSession();
              setUser(undefined);
            })
          }
        >
          Sign out
        </button>
      </aside>
      <main>
        <header>
          <div>
            <div className="eyebrow">STORE OPERATIONS</div>
            <h1>{section.replace("-", " ")}</h1>
          </div>
          <button disabled={busy} onClick={() => setRevision((n) => n + 1)}>
            Refresh
          </button>
        </header>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {busy && <p role="status">Loading…</p>}
        {metrics && (
          <>
            <div className="metrics">
              {[
                ["Revenue", formatMoney(metrics.grossRevenue)],
                ["Collected", formatMoney(metrics.collectedRevenue)],
                ["Orders", metrics.orders],
                ["New customers", metrics.customers],
                ["Average order", formatMoney(metrics.averageOrderValue)],
                ["AI conversations", metrics.conversations],
              ].map(([label, value]) => (
                <article key={label}>
                  <p>{label}</p>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            <p>Last 30 days</p>
            <h2>Low stock</h2>
            {metrics.lowStock.length ? (
              metrics.lowStock.map((p) => (
                <article key={p._id}>
                  {p.name} — {p.stock - p.reservedStock} available
                </article>
              ))
            ) : (
              <p>No low-stock products.</p>
            )}
          </>
        )}
        {section === "Products" && (
          <details>
            <summary>Add product</summary>
            <form
              className="product-form"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const data = new FormData(form);
                void run(async () => {
                  await request("/admin/products", "POST", {
                    name: data.get("name"),
                    slug: data.get("slug"),
                    sku: data.get("sku"),
                    brand: data.get("brand"),
                    category: data.get("category"),
                    regularPrice: Math.round(Number(data.get("price")) * 100),
                    stock: Number(data.get("stock")),
                    thumbnail: data.get("thumbnail"),
                    description: data.get("description"),
                  });
                  form.reset();
                });
              }}
            >
              {["name", "slug", "sku", "brand", "category", "thumbnail"].map(
                (name) => (
                  <label key={name}>
                    {name}
                    <input
                      name={name}
                      type={name === "thumbnail" ? "url" : "text"}
                      required
                    />
                  </label>
                ),
              )}
              <label>
                Price (NPR)
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </label>
              <label>
                Stock
                <input name="stock" type="number" min="0" step="1" required />
              </label>
              <label>
                Description
                <textarea name="description" />
              </label>
              <button disabled={busy}>Create product</button>
            </form>
          </details>
        )}
        {section !== "Overview" && !busy && rows.length === 0 && !error && (
          <p>No records found.</p>
        )}
        <div className="records">
          {rows.map((row) => (
            <article key={row._id}>
              <h3>
                {String(
                  row.name ??
                    row.number ??
                    row.fullName ??
                    row.title ??
                    row.code ??
                    row._id,
                )}
              </h3>
              {section === "Products" ? (
                <>
                  <p>
                    {formatMoney(
                      (row as unknown as ProductCard).salePrice ??
                        Number(row.regularPrice),
                    )}{" "}
                    · {Number(row.stock) - Number(row.reservedStock)} available
                    · {row.active ? "Active" : "Hidden"}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const data = new FormData(e.currentTarget);
                      void run(() =>
                        request(`/admin/inventory/${row._id}`, "POST", {
                          quantity: Number(data.get("quantity")),
                          reason: data.get("reason"),
                        }),
                      );
                    }}
                  >
                    <label>
                      Stock adjustment
                      <input name="quantity" type="number" step="1" required />
                    </label>
                    <label>
                      Reason
                      <input name="reason" minLength={5} required />
                    </label>
                    <button disabled={busy}>Adjust inventory</button>
                  </form>
                </>
              ) : section === "Orders" ? (
                <>
                  <p>
                    {String(row.status).replaceAll("_", " ")} ·{" "}
                    {formatMoney(Number(row.total))}
                  </p>
                  <p>{String(row.createdAt)}</p>
                  {nextStatus[row.status as OrderStatus] && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          request(`/admin/orders/${row._id}`, "PATCH", {
                            status: nextStatus[row.status as OrderStatus],
                          }),
                        )
                      }
                    >
                      Mark{" "}
                      {nextStatus[row.status as OrderStatus]?.replaceAll(
                        "_",
                        " ",
                      )}
                    </button>
                  )}
                </>
              ) : (
                <>
                  <pre>{JSON.stringify(row, null, 2)}</pre>
                  {section === "Customers" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          request(`/admin/customers/${row._id}`, "PATCH", {
                            status:
                              row.status === "active" ? "suspended" : "active",
                          }),
                        )
                      }
                    >
                      {row.status === "active" ? "Suspend" : "Activate"}
                    </button>
                  )}
                  {section === "Reviews" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          request(`/admin/reviews/${row._id}`, "PATCH", {
                            status:
                              row.status === "published"
                                ? "hidden"
                                : "published",
                          }),
                        )
                      }
                    >
                      {row.status === "published" ? "Hide" : "Publish"}
                    </button>
                  )}
                  {["Categories", "Brands", "Coupons", "Banners"].includes(
                    section,
                  ) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          request(
                            `/admin/${section.toLowerCase()}/${row._id}`,
                            "PATCH",
                            { active: !row.active },
                          ),
                        )
                      }
                    >
                      {row.active ? "Disable" : "Enable"}
                    </button>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
