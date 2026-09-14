import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import {
  formatMoney,
  type AuthResult,
  type CartResult,
  type ProductCard,
} from "@kmart/shared";
import { api } from "../src/api";
import { useSession } from "../src/session";

type Tab = "Shop" | "Assistant" | "Cart" | "Orders" | "Account";
type Variant = {
  _id: string;
  name: string;
  price: number;
  stock: number;
  reservedStock: number;
};
type Product = ProductCard & { hasVariants?: boolean; variants?: Variant[] };
type Address = {
  _id: string;
  label: string;
  recipient: string;
  phone: string;
  province: string;
  city: string;
  area: string;
  street: string;
};
type Order = {
  _id: string;
  number: string;
  status: string;
  total: number;
  paymentMethod: string;
  items: { name: string; quantity: number; price: number }[];
};
type Reply = {
  conversationId: string;
  answer: string;
  products: Product[];
  suggestedReplies: string[];
  orders: Order[];
};
const emptyAddress = {
  label: "Home",
  recipient: "",
  phone: "",
  province: "",
  city: "",
  area: "",
  street: "",
};
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondary,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.buttonText, secondary && { color: "#174a35" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  secret = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  numeric?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        keyboardType={numeric ? "numeric" : "default"}
        autoCapitalize="none"
        style={styles.input}
      />
    </View>
  );
}
export default function Store() {
  const { user, ready, signIn, signOut } = useSession();
  const [tab, setTab] = useState<Tab>("Shop");
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [detail, setDetail] = useState<Product>();
  const [variant, setVariant] = useState<string>();
  const [cart, setCart] = useState<CartResult>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState("");
  const [address, setAddress] = useState(emptyAddress);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [notifications, setNotifications] = useState<
    { _id: string; title: string; body: string; readAt?: string }[]
  >([]);
  const [coupon, setCoupon] = useState("");
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const checkoutKey = useRef<string | undefined>(undefined);
  const [cancelId, setCancelId] = useState<string>();
  const [returnId, setReturnId] = useState<string>();
  const [returnReason, setReturnReason] = useState("");
  const [chatText, setChatText] = useState("");
  const [conversation, setConversation] = useState<string>();
  const [messages, setMessages] = useState<{ text: string; reply?: Reply }[]>(
    [],
  );
  const [register, setRegister] = useState(false);
  const [credentials, setCredentials] = useState({
    identifier: "",
    password: "",
    fullName: "",
    username: "",
    email: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const working = useRef(false);
  const loadVersion = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const version = ++loadVersion.current;
    setError("");
    setBusy(true);
    async function load() {
      if (tab === "Shop") {
        const data = await api<Product[]>("/products?limit=50");
        if (version === loadVersion.current) setProducts(data);
      } else if (user && tab === "Cart") {
        const [nextCart, nextAddresses] = await Promise.all([
          api<CartResult>("/cart"),
          api<Address[]>("/addresses"),
        ]);
        if (version === loadVersion.current) {
          setCart(nextCart);
          setAddresses(nextAddresses);
          setAddressId((id) =>
            nextAddresses.some((a) => a._id === id)
              ? id
              : (nextAddresses[0]?._id ?? ""),
          );
        }
      } else if (user && tab === "Orders") {
        const data = await api<Order[]>("/orders");
        if (version === loadVersion.current) setOrders(data);
      } else if (user && tab === "Account") {
        const [a, w, n] = await Promise.all([
          api<Address[]>("/addresses"),
          api<Product[]>("/wishlist"),
          api<typeof notifications>("/notifications"),
        ]);
        if (version === loadVersion.current) {
          setAddresses(a);
          setWishlist(w);
          setNotifications(n);
        }
      }
    }
    load()
      .catch((e) => {
        if (version === loadVersion.current) setError(errorMessage(e));
      })
      .finally(() => {
        if (version === loadVersion.current) setBusy(false);
      });
    return () => {
      loadVersion.current++;
    };
  }, [tab, user, ready, revision]);
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function navigate(next: Tab) {
    setTab(next);
    setDetail(undefined);
    setError("");
    setNotice("");
    setConfirmCheckout(false);
  }
  async function open(product: Product) {
    const data = await api<Product>(`/products/${product._id}`);
    setDetail(data);
    setVariant(undefined);
  }
  async function add(product: Product) {
    if (!user) {
      navigate("Account");
      setNotice("Sign in to add products to your cart.");
      return;
    }
    if (
      product.hasVariants &&
      (!detail || detail._id !== product._id || !variant)
    ) {
      await open(product);
      setNotice("Choose an option before adding to cart.");
      return;
    }
    const current = await api<CartResult>("/cart");
    const variantId = product.hasVariants ? variant : undefined;
    const items = current.items.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    }));
    const existing = items.find(
      (i) => i.productId === product._id && i.variantId === variantId,
    );
    if (existing) existing.quantity++;
    else items.push({ productId: product._id, variantId, quantity: 1 });
    setCart(await api<CartResult>("/cart", "PUT", { items }));
    checkoutKey.current = undefined;
    setNotice("Added to cart.");
  }
  async function changeQuantity(index: number, quantity: number) {
    if (!cart) return;
    const items = cart.items.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId,
      quantity,
    }));
    items[index].quantity = quantity;
    setCart(
      await api<CartResult>("/cart", "PUT", {
        items: items.filter((i) => i.quantity > 0),
      }),
    );
    checkoutKey.current = undefined;
    setConfirmCheckout(false);
  }
  async function send(text: string) {
    if (!text.trim()) return;
    const reply = await api<Reply>("/ai/chat", "POST", {
      message: text,
      conversationId: conversation,
    });
    setMessages((items) => [...items, { text, reply }]);
    setConversation(reply.conversationId);
    setChatText("");
  }
  const cards = (items: Product[]) =>
    items.map((product) => (
      <View key={product._id} style={styles.card}>
        <Pressable
          accessibilityRole="button"
          onPress={() => void run(() => open(product))}
        >
          <Image source={{ uri: product.thumbnail }} style={styles.image} />
          <Text style={styles.label}>
            {product.brand} · {product.category}
          </Text>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.price}>
            {formatMoney(product.salePrice ?? product.regularPrice)}
          </Text>
          <Text>{product.shortDescription}</Text>
        </Pressable>
        <Button
          title={product.hasVariants ? "Choose options" : "Add to cart"}
          disabled={
            busy ||
            (!product.hasVariants && product.stock - product.reservedStock <= 0)
          }
          onPress={() => void run(() => add(product))}
        />
      </View>
    ));
  const loginForm = (
    <View style={styles.card}>
      <Text style={styles.heading}>
        {register ? "Create your account" : "Welcome back"}
      </Text>
      {register &&
        (["fullName", "username", "email"] as const).map((key) => (
          <Field
            key={key}
            label={key}
            value={credentials[key]}
            onChange={(value) =>
              setCredentials({ ...credentials, [key]: value })
            }
          />
        ))}
      {!register && (
        <Field
          label="Email or username"
          value={credentials.identifier}
          onChange={(identifier) =>
            setCredentials({ ...credentials, identifier })
          }
        />
      )}
      <Field
        label="Password"
        secret
        value={credentials.password}
        onChange={(password) => setCredentials({ ...credentials, password })}
      />
      {register && <Text>Use at least 12 characters.</Text>}
      <Button
        title={register ? "Register" : "Sign in"}
        disabled={busy}
        onPress={() =>
          void run(async () => {
            const body = register
              ? {
                  fullName: credentials.fullName,
                  username: credentials.username,
                  email: credentials.email,
                  password: credentials.password,
                }
              : {
                  identifier: credentials.identifier,
                  password: credentials.password,
                };
            await signIn(
              await api<AuthResult>(
                register ? "/auth/register" : "/auth/login",
                "POST",
                body,
              ),
            );
            setCredentials({
              identifier: "",
              password: "",
              fullName: "",
              username: "",
              email: "",
            });
          })
        }
      />
      <Button
        title={
          register ? "Already have an account? Sign in" : "Create an account"
        }
        secondary
        onPress={() => setRegister(!register)}
      />
    </View>
  );
  if (!ready)
    return (
      <SafeAreaView style={styles.page}>
        <ActivityIndicator accessibilityLabel="Restoring session" />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.logo}>KMart</Text>
        <Text style={styles.subtitle}>Your everyday, delivered.</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {busy && <ActivityIndicator accessibilityLabel="Loading" />}
        {error !== "" && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        {notice !== "" && <Text style={styles.notice}>{notice}</Text>}
        {detail ? (
          <>
            <Button
              title="Back"
              secondary
              onPress={() => setDetail(undefined)}
            />
            <Image source={{ uri: detail.thumbnail }} style={styles.hero} />
            <Text style={styles.heading}>{detail.name}</Text>
            <Text style={styles.price}>
              {formatMoney(
                detail.variants?.find((v) => v._id === variant)?.price ??
                  detail.salePrice ??
                  detail.regularPrice,
              )}
            </Text>
            <Text>{detail.description}</Text>
            {Object.entries(detail.specifications).map(([name, value]) => (
              <Text key={name}>
                {name}: {value}
              </Text>
            ))}
            {detail.variants?.map((v) => (
              <Button
                key={v._id}
                title={`${variant === v._id ? "✓ " : ""}${v.name} — ${formatMoney(v.price)}`}
                secondary
                disabled={v.stock - v.reservedStock <= 0}
                onPress={() => setVariant(v._id)}
              />
            ))}
            <Button
              title="Add to cart"
              disabled={busy}
              onPress={() => void run(() => add(detail))}
            />
            <Button
              title="Save to wishlist"
              secondary
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  if (!user) {
                    navigate("Account");
                    return;
                  }
                  await api(`/wishlist/${detail._id}`, "PUT");
                  setNotice("Saved to wishlist.");
                })
              }
            />
          </>
        ) : tab === "Shop" ? (
          <>
            <Text style={styles.heading}>Find your next favourite.</Text>
            <Field label="Search products" value={query} onChange={setQuery} />
            <Button
              title="Search"
              disabled={busy}
              onPress={() =>
                void run(async () =>
                  setProducts(
                    await api<Product[]>(
                      `/products?q=${encodeURIComponent(query)}&limit=50`,
                    ),
                  ),
                )
              }
            />
            {!busy && !products.length && (
              <Text>No products found. Try another search.</Text>
            )}
            {cards(products)}
          </>
        ) : !user ? (
          loginForm
        ) : tab === "Cart" ? (
          <>
            <Text style={styles.heading}>Your cart</Text>
            {cart?.items.map((item, index) => (
              <View
                style={styles.card}
                key={`${item.productId}:${item.variantId ?? ""}`}
              >
                <Text style={styles.productName}>{item.name}</Text>
                <Text>
                  {formatMoney(item.price)} × {item.quantity}
                </Text>
                <View style={styles.row}>
                  <Button
                    title="−"
                    disabled={busy}
                    secondary
                    onPress={() =>
                      void run(() => changeQuantity(index, item.quantity - 1))
                    }
                  />
                  <Text>{item.quantity}</Text>
                  <Button
                    title="+"
                    disabled={
                      busy || item.quantity >= Math.min(20, item.available)
                    }
                    secondary
                    onPress={() =>
                      void run(() => changeQuantity(index, item.quantity + 1))
                    }
                  />
                  <Button
                    title="Remove"
                    secondary
                    disabled={busy}
                    onPress={() => void run(() => changeQuantity(index, 0))}
                  />
                </View>
              </View>
            ))}
            {cart?.items.length ? (
              <>
                <View style={styles.card}>
                  {(
                    [
                      "subtotal",
                      "discount",
                      "shipping",
                      "tax",
                      "total",
                    ] as const
                  ).map((key) => (
                    <View key={key} style={styles.row}>
                      <Text>{key}</Text>
                      <Text>{formatMoney(cart[key])}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.productName}>Deliver to</Text>
                {addresses.map((a) => (
                  <Button
                    key={a._id}
                    secondary
                    title={`${addressId === a._id ? "✓ " : ""}${a.label} · ${a.street}, ${a.city}`}
                    onPress={() => {
                      setAddressId(a._id);
                      checkoutKey.current = undefined;
                      setConfirmCheckout(false);
                    }}
                  />
                ))}
                {!addresses.length && (
                  <Button
                    title="Add a delivery address"
                    onPress={() => navigate("Account")}
                  />
                )}
                <Field
                  label="Coupon (optional)"
                  value={coupon}
                  onChange={(value) => {
                    setCoupon(value);
                    checkoutKey.current = undefined;
                    setConfirmCheckout(false);
                  }}
                />
                <Text>
                  Pay cash on delivery. Coupons are validated and applied by the
                  server when placing your order.
                </Text>
                {confirmCheckout ? (
                  <View style={styles.card}>
                    <Text>
                      Place this order for delivery to{" "}
                      {addresses.find((a) => a._id === addressId)?.street}?
                      Current stock and prices will be checked at checkout.
                    </Text>
                    <Button
                      title="Confirm order · cash on delivery"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          checkoutKey.current ??= Crypto.randomUUID();
                          const order = await api<Order>(
                            "/checkout",
                            "POST",
                            {
                              addressId,
                              paymentMethod: "cod",
                              ...(coupon.trim()
                                ? { coupon: coupon.trim().toUpperCase() }
                                : {}),
                            },
                            { "Idempotency-Key": checkoutKey.current },
                          );
                          checkoutKey.current = undefined;
                          setCart(undefined);
                          setCoupon("");
                          navigate("Orders");
                          setNotice(
                            `Order ${order.number} placed · ${formatMoney(order.total)}`,
                          );
                        })
                      }
                    />
                    <Button
                      title="Keep shopping"
                      secondary
                      onPress={() => setConfirmCheckout(false)}
                    />
                  </View>
                ) : (
                  <Button
                    title="Review order"
                    disabled={busy || !addressId}
                    onPress={() => setConfirmCheckout(true)}
                  />
                )}
              </>
            ) : (
              !busy && <Text>Your cart is empty.</Text>
            )}
          </>
        ) : tab === "Assistant" ? (
          <>
            <Text style={styles.heading}>Shopping assistant</Text>
            <Text>
              Tell me what you need, your budget, or ask about an order.
            </Text>
            {messages.map((m, index) => (
              <View key={index}>
                <Text style={styles.question}>{m.text}</Text>
                <Text style={styles.answer}>{m.reply?.answer}</Text>
                {cards(m.reply?.products ?? [])}
                {m.reply?.orders.map((o) => (
                  <Text key={o._id}>
                    {o.number} · {o.status} · {formatMoney(o.total)}
                  </Text>
                ))}
                {index === messages.length - 1 &&
                  m.reply?.suggestedReplies.map((text) => (
                    <Button
                      key={text}
                      title={text}
                      secondary
                      disabled={busy}
                      onPress={() => void run(() => send(text))}
                    />
                  ))}
              </View>
            ))}
            <Field
              label="Your message"
              value={chatText}
              onChange={setChatText}
            />
            <Button
              title="Send"
              disabled={busy || !chatText.trim()}
              onPress={() => void run(() => send(chatText))}
            />
            <Button
              title="Delete conversation history"
              secondary
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await api("/ai/conversations", "DELETE");
                  setMessages([]);
                  setConversation(undefined);
                })
              }
            />
          </>
        ) : tab === "Orders" ? (
          <>
            <Text style={styles.heading}>Your orders</Text>
            <Button
              title="Refresh orders"
              secondary
              disabled={busy}
              onPress={() => setRevision((n) => n + 1)}
            />
            {!busy && !orders.length && <Text>No orders yet.</Text>}
            {orders.map((order) => (
              <View key={order._id} style={styles.card}>
                <Text style={styles.productName}>{order.number}</Text>
                <Text>
                  {order.status.replaceAll("_", " ")} ·{" "}
                  {formatMoney(order.total)}
                </Text>
                {order.items.map((i, index) => (
                  <Text key={index}>
                    {i.name} × {i.quantity}
                  </Text>
                ))}
                {order.status === "confirmed" &&
                  order.paymentMethod === "cod" &&
                  (cancelId === order._id ? (
                    <>
                      <Text>Cancel this order?</Text>
                      <Button
                        title="Confirm cancellation"
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await api(`/orders/${order._id}/cancel`, "POST", {
                              confirmed: true,
                            });
                            setCancelId(undefined);
                            setRevision((n) => n + 1);
                          })
                        }
                      />
                      <Button
                        title="Keep order"
                        secondary
                        onPress={() => setCancelId(undefined)}
                      />
                    </>
                  ) : (
                    <Button
                      title="Cancel order"
                      secondary
                      onPress={() => setCancelId(order._id)}
                    />
                  ))}
                {order.status === "delivered" &&
                  (returnId === order._id ? (
                    <>
                      <Field
                        label="Reason for return (at least 10 characters)"
                        value={returnReason}
                        onChange={setReturnReason}
                      />
                      <Button
                        title="Confirm return request"
                        disabled={busy || returnReason.trim().length < 10}
                        onPress={() =>
                          void run(async () => {
                            await api(`/orders/${order._id}/return`, "POST", {
                              confirmed: true,
                              reason: returnReason,
                            });
                            setReturnId(undefined);
                            setReturnReason("");
                            setRevision((n) => n + 1);
                          })
                        }
                      />
                    </>
                  ) : (
                    <Button
                      title="Request a return"
                      secondary
                      onPress={() => setReturnId(order._id)}
                    />
                  ))}
              </View>
            ))}
          </>
        ) : (
          <>
            <Text style={styles.heading}>Hello, {user.fullName}</Text>
            <Button
              title="Sign out"
              secondary
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await signOut();
                  setCart(undefined);
                  setOrders([]);
                  setAddresses([]);
                  setWishlist([]);
                  setNotifications([]);
                  setMessages([]);
                  setConversation(undefined);
                  checkoutKey.current = undefined;
                })
              }
            />
            <Text style={styles.heading}>Delivery addresses</Text>
            {addresses.map((a) => (
              <View key={a._id} style={styles.card}>
                <Text>
                  {a.label}: {a.recipient}
                </Text>
                <Text>
                  {a.street}, {a.city}, {a.province}
                </Text>
                <Button
                  title="Remove address"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await api(`/addresses/${a._id}`, "DELETE");
                      setRevision((n) => n + 1);
                    })
                  }
                />
              </View>
            ))}
            <View style={styles.card}>
              <Text style={styles.productName}>Add an address</Text>
              {(Object.keys(emptyAddress) as (keyof typeof emptyAddress)[]).map(
                (key) => (
                  <Field
                    key={key}
                    label={key}
                    value={address[key]}
                    onChange={(value) =>
                      setAddress({ ...address, [key]: value })
                    }
                  />
                ),
              )}
              <Button
                title="Save address"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await api("/addresses", "POST", address);
                    setAddress(emptyAddress);
                    setRevision((n) => n + 1);
                  })
                }
              />
            </View>
            <Text style={styles.heading}>Wishlist</Text>
            {wishlist.map((p) => (
              <View key={p._id}>
                {cards([p])}
                <Button
                  title="Remove from wishlist"
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await api(`/wishlist/${p._id}`, "DELETE");
                      setRevision((n) => n + 1);
                    })
                  }
                />
              </View>
            ))}
            {!wishlist.length && (
              <Text>Your saved products will appear here.</Text>
            )}
            <Text style={styles.heading}>Notifications</Text>
            {notifications.map((n) => (
              <View key={n._id} style={styles.card}>
                <Text style={styles.productName}>{n.title}</Text>
                <Text>{n.body}</Text>
                {!n.readAt && (
                  <Button
                    title="Mark as read"
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await api(`/notifications/${n._id}`, "PATCH");
                        setRevision((v) => v + 1);
                      })
                    }
                  />
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <View style={styles.tabs}>
        {(["Shop", "Assistant", "Cart", "Orders", "Account"] as Tab[]).map(
          (item) => (
            <Pressable
              key={item}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item }}
              disabled={busy}
              onPress={() => navigate(item)}
              style={[styles.tab, tab === item && styles.activeTab]}
            >
              <Text
                style={{
                  color: tab === item ? "#174a35" : "#63756b",
                  fontWeight: tab === item ? "700" : "400",
                }}
              >
                {item}
              </Text>
            </Pressable>
          ),
        )}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f8f5" },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#dee7df",
  },
  logo: { fontSize: 28, fontWeight: "800", color: "#174a35" },
  subtitle: { color: "#63756b", fontSize: 12 },
  content: {
    padding: 20,
    paddingBottom: 40,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
    gap: 12,
  },
  heading: {
    fontSize: 26,
    fontWeight: "700",
    color: "#18382b",
    marginVertical: 12,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: "#e0e8e0",
    gap: 10,
  },
  label: { fontSize: 13, color: "#536c5c", marginBottom: 5 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#b6c7ba",
    borderRadius: 10,
    padding: 13,
    fontSize: 16,
    color: "#18382b",
  },
  button: {
    backgroundColor: "#174a35",
    borderRadius: 10,
    padding: 13,
    alignItems: "center",
    marginVertical: 3,
  },
  secondary: { backgroundColor: "#e8f0e9" },
  buttonText: { color: "#fff", fontWeight: "600" },
  productName: { fontSize: 18, fontWeight: "600", color: "#18382b" },
  price: {
    fontSize: 20,
    fontWeight: "700",
    color: "#174a35",
    marginVertical: 8,
  },
  image: {
    height: 170,
    width: "100%",
    resizeMode: "contain",
    marginBottom: 14,
  },
  hero: { height: 300, width: "100%", resizeMode: "contain" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#dee7df",
    backgroundColor: "#fff",
    padding: 6,
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 8 },
  activeTab: { backgroundColor: "#e8f0e9" },
  error: {
    color: "#a92a27",
    backgroundColor: "#fdecea",
    padding: 12,
    borderRadius: 8,
  },
  notice: {
    color: "#174a35",
    backgroundColor: "#e4f0e6",
    padding: 12,
    borderRadius: 8,
  },
  question: {
    backgroundColor: "#e4f0e6",
    padding: 14,
    borderRadius: 12,
    marginVertical: 12,
    alignSelf: "flex-end",
  },
  answer: { fontSize: 16, lineHeight: 24, marginBottom: 14 },
});
